import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { setAuthCookie } from "@/lib/auth";
import { getEnvConfig } from "./env";
import {
	signLoginLinkToken,
	signSignupToken,
	verifyLoginLinkToken,
	verifySignupToken,
} from "./jwt";
import {
	checkEmailRateLimit,
	checkIPRateLimit,
	hashJWT,
	markAttemptSuccessful,
	markLatestAttemptSuccessful,
	RateLimitError,
} from "./rateLimit";

// Zod schemas for validation
const signupSchema = z.object({
	name: z.string().min(1, "Name is required").max(100, "Name is too long"),
	email: z.string().email("Please enter a valid email address"),
});

const checkUserExistsSchema = z.object({
	email: z.string().email("Please enter a valid email address"),
});

const generateLoginLinkSchema = z.object({
	userId: z.number().int().positive("User ID must be a positive integer"),
});

const verifySignupTokenSchema = z.object({
	token: z.string().min(1, "Token is required"),
});

const verifyLoginLinkTokenSchema = z.object({
	token: z.string().min(1, "Token is required"),
});

/**
 * Server function to handle signup
 * Checks if email already exists and generates signup token
 * Rate limited by IP and email address
 */
export const signup = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => signupSchema.parse(data))
	.handler(async ({ data }) => {
		try {
			// Check rate limits (both IP and email)
			await checkIPRateLimit("signup");
			await checkEmailRateLimit(data.email, "signup");
		} catch (error) {
			if (error instanceof RateLimitError) {
				throw new Error(error.message);
			}
			throw error;
		}

		// Check if email already exists
		const existingUser = await db
			.select()
			.from(users)
			.where(eq(users.email, data.email))
			.limit(1);

		if (existingUser.length > 0) {
			throw new Error("An account with this email already exists");
		}

		// Generate JWT token
		const token = await signSignupToken(data.name, data.email);

		// Build verification URL
		const env = getEnvConfig();
		const verificationUrl = `${env.BASE_URL}/signup/${token}`;

		// Log the URL to console (instead of sending email)
		if (env.NODE_ENV === "development") {
			console.log("\n=== Signup Verification Link ===");
			console.log(`Name: ${data.name}`);
			console.log(`Email: ${data.email}`);
			console.log(`Verification URL: ${verificationUrl}`);
			console.log("================================\n");
		}

		return { success: true };
	});

/**
 * Server function to verify signup token and create user
 * Used in beforeLoad to ensure user is created before route loads
 */
export const verifySignupTokenAndCreateUser = createServerFn({
	method: "POST",
})
	.inputValidator((data: unknown) => verifySignupTokenSchema.parse(data))
	.handler(async ({ data }) => {
		try {
			// Verify the token
			const payload = await verifySignupToken(data.token);

			// Check if user already exists
			const existingUser = await db
				.select()
				.from(users)
				.where(eq(users.email, payload.email))
				.limit(1);

			if (existingUser.length > 0) {
				return {
					success: false,
					error: "An account with this email already exists",
				};
			}

			// Create the user
			const [newUser] = await db
				.insert(users)
				.values({
					name: payload.name,
					email: payload.email,
				})
				.returning();

			// Set authentication cookie
			setAuthCookie(newUser.id);

			return {
				success: true,
				user: newUser,
			};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Signup failed. The link may be invalid or expired.",
			};
		}
	});

/**
 * Server function to check if user exists by email
 * Rate limited by IP and email address
 */
export const checkUserExists = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => checkUserExistsSchema.parse(data))
	.handler(async ({ data }) => {
		try {
			// Check rate limits (both IP and email)
			await checkIPRateLimit("email-lookup");
			await checkEmailRateLimit(data.email, "email-lookup");
		} catch (error) {
			if (error instanceof RateLimitError) {
				throw new Error(error.message);
			}
			throw error;
		}

		const existingUser = await db
			.select()
			.from(users)
			.where(eq(users.email, data.email))
			.limit(1);

		if (existingUser.length === 0) {
			// User not found - attempt remains marked as "failed" (default)
			throw new Error("No account found with this email address");
		}

		// User found - mark the attempts as successful
		// Get IP address for marking IP-based attempt as successful
		let clientIP = "unknown";
		try {
			clientIP = getRequestIP({ xForwardedFor: true }) ?? "unknown";
		} catch {
			// IP not available, use "unknown"
		}
		await markLatestAttemptSuccessful(clientIP, "ip", "email-lookup");
		await markLatestAttemptSuccessful(
			data.email.toLowerCase(),
			"email",
			"email-lookup",
		);

		return {
			exists: true,
			userId: existingUser[0].id,
		};
	});

/**
 * Server function to generate login link token
 * Rate limited by IP and email address
 */
export const generateLoginLink = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => generateLoginLinkSchema.parse(data))
	.handler(async ({ data }) => {
		// Verify user exists
		const user = await db
			.select()
			.from(users)
			.where(eq(users.id, data.userId))
			.limit(1);

		if (user.length === 0) {
			throw new Error("User not found");
		}

		// Generate JWT token first (we need it for the hash)
		const token = await signLoginLinkToken(data.userId);
		const tokenHash = hashJWT(token);

		try {
			// Check rate limits (both IP and email) with jwtHash
			await checkIPRateLimit("login-link", tokenHash);
			await checkEmailRateLimit(user[0].email, "login-link", tokenHash);
		} catch (error) {
			if (error instanceof RateLimitError) {
				throw new Error(error.message);
			}
			throw error;
		}

		// Build verification URL
		const env = getEnvConfig();
		const loginUrl = `${env.BASE_URL}/login-via-link/${token}`;

		// Log the URL to console (instead of sending email)
		if (env.NODE_ENV === "development") {
			console.log("\n=== Login Link ===");
			console.log(`Email: ${user[0].email}`);
			console.log(`Login URL: ${loginUrl}`);
			console.log("==================\n");
		}

		return { success: true };
	});

/**
 * Server function to verify login link token and authenticate user
 * Used in beforeLoad to ensure user is authenticated before route loads
 */
export const verifyLoginLinkTokenAndAuthenticate = createServerFn({
	method: "POST",
})
	.inputValidator((data: unknown) => verifyLoginLinkTokenSchema.parse(data))
	.handler(async ({ data }) => {
		try {
			// Verify the token
			const payload = await verifyLoginLinkToken(data.token);

			// Verify user exists in database
			const user = await db
				.select()
				.from(users)
				.where(eq(users.id, payload.userId))
				.limit(1);

			if (user.length === 0) {
				return {
					success: false,
					error: "User not found",
				};
			}

			// Mark rate limit attempt as successful
			const tokenHash = hashJWT(data.token);
			await markAttemptSuccessful(tokenHash, "login-link");

			// Set authentication cookie
			setAuthCookie(payload.userId);

			return {
				success: true,
				user: user[0],
			};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Login failed. The link may be invalid or expired.",
			};
		}
	});
