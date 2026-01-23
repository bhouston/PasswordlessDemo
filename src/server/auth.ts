import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { clearAuthCookie, setAuthCookie } from "@/lib/auth";
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
	markAttemptAsBadEmail,
	markAttemptSuccessful,
	RateLimitError,
} from "./rateLimit";

// Zod schemas for validation
const signupSchema = z.object({
	name: z.string().min(1, "Name is required").max(100, "Name is too long"),
	email: z.string().email("Please enter a valid email address"),
});

const requestLoginLinkSchema = z.object({
	email: z.string().email("Please enter a valid email address"),
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
 * Server function to request login link by email
 * Handles both existing and non-existing accounts to prevent enumeration
 * Rate limited by IP and email address
 */
export const requestLoginLink = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => requestLoginLinkSchema.parse(data))
	.handler(async ({ data }) => {
		try {
			// Check rate limits (both IP and email)
			await checkIPRateLimit("login-link");
			await checkEmailRateLimit(data.email, "login-link");
		} catch (error) {
			if (error instanceof RateLimitError) {
				throw new Error(error.message);
			}
			throw error;
		}

		// Look up user by email
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.email, data.email))
			.limit(1);

		const env = getEnvConfig();

		if (user) {
			// User exists - send login link email
			const token = await signLoginLinkToken(user.id);
			const tokenHash = hashJWT(token);
			const loginUrl = `${env.BASE_URL}/login-via-link/${token}`;

			// Mark attempt as successful
			await markAttemptSuccessful(tokenHash, "login-link");

			// Log the URL to console (instead of sending email)
			if (env.NODE_ENV === "development") {
				console.log("\n=== Login Link ===");
				console.log(`Email: ${user.email}`);
				console.log(`Login URL: ${loginUrl}`);
				console.log("==================\n");
			}
		} else {
			// User doesn't exist - send "account doesn't exist" email
			const signupUrl = `${env.BASE_URL}/signup`;

			// Mark attempt as bad-email
			await markAttemptAsBadEmail(
				getRequestIP({ xForwardedFor: true }) ?? "unknown",
				"ip",
				"login-link",
			);
			await markAttemptAsBadEmail(
				data.email.toLowerCase(),
				"email",
				"login-link",
			);

			// Log the message to console (instead of sending email)
			if (env.NODE_ENV === "development") {
				console.log("\n=== Login Attempt - Account Not Found ===");
				console.log(`Email: ${data.email}`);
				console.log(
					`Message: Someone tried to login to our platform using this email address, but this email isn't registered.`,
				);
				console.log(`If you want to create an account, please visit: ${signupUrl}`);
				console.log("==========================================\n");
			}
		}

		// Always return success (don't reveal account existence)
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

/**
 * Server function to logout the current user
 * Clears the authentication cookie
 */
export const logout = createServerFn({ method: "POST" }).handler(async () => {
	clearAuthCookie();
	return { success: true };
});
