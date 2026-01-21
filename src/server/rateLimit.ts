import { createHash } from "node:crypto";
import { getRequestIP } from "@tanstack/react-start/server";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";

/**
 * Rate limit configuration
 */
const RATE_LIMIT_CONFIG = {
	signup: {
		maxRequests: 5,
		windowMs: 60 * 60 * 1000, // 1 hour
	},
	"login-link": {
		maxRequests: 5,
		windowMs: 60 * 60 * 1000, // 1 hour
	},
	"email-lookup": {
		maxRequests: 10,
		windowMs: 60 * 60 * 1000, // 1 hour
	},
	"passkey-attempt": {
		maxRequests: 10,
		windowMs: 60 * 60 * 1000, // 1 hour
	},
} as const;

type EndpointType = keyof typeof RATE_LIMIT_CONFIG;

/**
 * Hash a JWT token for storage
 */
function hashJWT(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

/**
 * Rate limit error
 */
export class RateLimitError extends Error {
	constructor(
		public readonly retryAfter: number,
		message: string,
	) {
		super(message);
		this.name = "RateLimitError";
	}
}

/**
 * Get client IP address from request
 * Falls back to 'unknown' if IP cannot be determined
 */
function getClientIP(): string {
	try {
		const ip = getRequestIP({ ipHeader: "x-forwarded-for" });
		return ip || "unknown";
	} catch {
		return "unknown";
	}
}

/**
 * Clean up old rate limit records (older than the window)
 */
async function cleanupOldRecords(endpoint: EndpointType) {
	const config = RATE_LIMIT_CONFIG[endpoint];
	const cutoffTime = Date.now() - config.windowMs;

	await db.delete(rateLimits).where(
		and(
			eq(rateLimits.endpoint, endpoint),
			// Delete records older than the window
			// SQLite stores timestamps as integers (milliseconds)
			lt(rateLimits.windowStart, new Date(cutoffTime)),
		),
	);
}

/**
 * Check rate limit for an identifier (IP or email) and endpoint
 * Tracks attempts as "failed" by default - they can be marked as successful later
 * @param identifier - IP address or email
 * @param type - 'ip' or 'email'
 * @param endpoint - endpoint type
 * @param jwtHash - Optional hash of JWT token to identify this attempt
 * @throws RateLimitError if rate limit exceeded
 */
export async function checkRateLimit(
	identifier: string,
	type: "ip" | "email",
	endpoint: EndpointType,
	jwtHash?: string,
): Promise<void> {
	const config = RATE_LIMIT_CONFIG[endpoint];
	const now = new Date();
	const windowStart = new Date(now.getTime() - config.windowMs);

	// Clean up old records periodically (simple approach - could be optimized)
	// In production, you might want to run this as a background job
	await cleanupOldRecords(endpoint);

	// Count all attempts (failed + successful) for this identifier
	// We count all attempts, not just successful ones
	const allAttempts = await db
		.select()
		.from(rateLimits)
		.where(
			and(
				eq(rateLimits.identifier, identifier),
				eq(rateLimits.type, type),
				eq(rateLimits.endpoint, endpoint),
				gte(rateLimits.windowStart, windowStart),
			),
		);

	// Count total attempts (failed + successful) within the window
	const totalAttempts = allAttempts.length;

	if (totalAttempts >= config.maxRequests) {
		// Calculate retry after time based on oldest attempt in window
		if (allAttempts.length > 0) {
			const oldestAttempt = allAttempts.reduce((oldest, current) => {
				const oldestTime = new Date(oldest.windowStart).getTime();
				const currentTime = new Date(current.windowStart).getTime();
				return currentTime < oldestTime ? current : oldest;
			}, allAttempts[0]);

			const oldestTime = new Date(oldestAttempt.windowStart).getTime();
			const retryAfter = Math.ceil(
				(config.windowMs - (now.getTime() - oldestTime)) / 1000,
			);
			throw new RateLimitError(
				retryAfter,
				`Rate limit exceeded. Please try again in ${Math.ceil(retryAfter / 60)} minutes.`,
			);
		}
	}

	// Create new attempt record (marked as failed by default)
	await db.insert(rateLimits).values({
		identifier,
		type,
		endpoint,
		jwtHash: jwtHash || null,
		status: "failed",
		count: 1,
		windowStart: now,
	});
}

/**
 * Mark a rate limit attempt as successful by jwtHash
 * @param jwtHash - Hash of the JWT token
 * @param endpoint - endpoint type
 */
export async function markAttemptSuccessful(
	jwtHash: string,
	endpoint: EndpointType,
): Promise<void> {
	await db
		.update(rateLimits)
		.set({ status: "success" })
		.where(
			and(eq(rateLimits.jwtHash, jwtHash), eq(rateLimits.endpoint, endpoint)),
		);
}

/**
 * Mark the most recent rate limit attempt as successful for an identifier
 * Used for endpoints that don't use JWT tokens (like email lookup)
 * @param identifier - IP address or email
 * @param type - 'ip' or 'email'
 * @param endpoint - endpoint type
 */
export async function markLatestAttemptSuccessful(
	identifier: string,
	type: "ip" | "email",
	endpoint: EndpointType,
): Promise<void> {
	const now = new Date();
	const config = RATE_LIMIT_CONFIG[endpoint];
	const windowStart = new Date(now.getTime() - config.windowMs);

	// Find the most recent failed attempt for this identifier
	const recentAttempts = await db
		.select()
		.from(rateLimits)
		.where(
			and(
				eq(rateLimits.identifier, identifier),
				eq(rateLimits.type, type),
				eq(rateLimits.endpoint, endpoint),
				gte(rateLimits.windowStart, windowStart),
				eq(rateLimits.status, "failed"),
			),
		)
		.orderBy(desc(rateLimits.createdAt))
		.limit(1);

	if (recentAttempts.length > 0) {
		await db
			.update(rateLimits)
			.set({ status: "success" })
			.where(eq(rateLimits.id, recentAttempts[0].id));
	}
}

/**
 * Check rate limit for IP address
 * @param endpoint - endpoint type
 * @param jwtHash - Optional hash of JWT token
 * @throws RateLimitError if rate limit exceeded
 */
export async function checkIPRateLimit(
	endpoint: EndpointType,
	jwtHash?: string,
): Promise<void> {
	const ip = getClientIP();
	await checkRateLimit(ip, "ip", endpoint, jwtHash);
}

/**
 * Check rate limit for email address
 * @param email - Email address
 * @param endpoint - endpoint type
 * @param jwtHash - Optional hash of JWT token
 * @throws RateLimitError if rate limit exceeded
 */
export async function checkEmailRateLimit(
	email: string,
	endpoint: EndpointType,
	jwtHash?: string,
): Promise<void> {
	await checkRateLimit(email.toLowerCase(), "email", endpoint, jwtHash);
}

/**
 * Export hashJWT for use in other modules
 */
export { hashJWT };
