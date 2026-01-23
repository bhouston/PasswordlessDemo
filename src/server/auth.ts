import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { clearAuthCookie, setAuthCookie } from "@/lib/auth";
import { getEnvConfig } from "./env";
import {
	signCodeVerificationToken,
	signSignupToken,
	verifyCodeVerificationToken,
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

const requestLoginCodeSchema = z.object({
	email: z.string().email("Please enter a valid email address"),
});

const verifySignupTokenSchema = z.object({
	token: z.string().min(1, "Token is required"),
});

const verifyLoginCodeSchema = z.object({
	token: z.string().min(1, "Token is required"),
	code: z.string().length(6, "Code must be 6 digits"),
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
 * Generate a 6-digit OTP code
 * @returns 6-digit numeric code as string
 */
function generateOTPCode(): string {
	return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Hash an OTP code using SHA-256
 * @param code - OTP code to hash
 * @returns Hashed code as hex string
 */
function hashOTPCode(code: string): string {
	return createHash("sha256").update(code).digest("hex");
}

/**
 * Generate a random code hash for non-existent accounts (to prevent information leak)
 * @returns Random hash string
 */
function generateRandomCodeHash(): string {
	return createHash("sha256").update(randomBytes(32)).digest("hex");
}

/**
 * Server function to request login code by email
 * Handles both existing and non-existing accounts to prevent enumeration
 * Rate limited by IP and email address
 */
export const requestLoginCode = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => requestLoginCodeSchema.parse(data))
	.handler(async ({ data }) => {
		try {
			// Check rate limits (both IP and email)
			await checkIPRateLimit("login-code");
			await checkEmailRateLimit(data.email, "login-code");
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
			// User exists - generate OTP and send code email
			const code = generateOTPCode();
			const codeHash = hashOTPCode(code);
			const token = await signCodeVerificationToken(user.id, data.email, codeHash);
			const tokenHash = hashJWT(token);

			// Mark attempt as successful
			await markAttemptSuccessful(tokenHash, "login-code");

			// Log the code to console (instead of sending email)
			if (env.NODE_ENV === "development") {
				console.log("\n=== Login Code ===");
				console.log(`Email: ${user.email}`);
				console.log(`Code: ${code}`);
				console.log("==================\n");
			}

			// Always return token to prevent enumeration
			return { success: true, token };
		} else {
			// User doesn't exist - generate random codeHash and send "account doesn't exist" email
			const randomCodeHash = generateRandomCodeHash();
			const token = await signCodeVerificationToken(null, data.email, randomCodeHash);
			const signupUrl = `${env.BASE_URL}/signup`;

			// Mark attempt as bad-email
			await markAttemptAsBadEmail(
				getRequestIP({ xForwardedFor: true }) ?? "unknown",
				"ip",
				"login-code",
			);
			await markAttemptAsBadEmail(
				data.email.toLowerCase(),
				"email",
				"login-code",
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

			// Always return token to prevent enumeration
			return { success: true, token };
		}
	});

/**
 * Server function to verify login code and authenticate user
 * Used to verify the OTP code entered by the user
 */
export const verifyLoginCodeAndAuthenticate = createServerFn({
	method: "POST",
})
	.inputValidator((data: unknown) => verifyLoginCodeSchema.parse(data))
	.handler(async ({ data }) => {
		try {
			// Verify the token
			const payload = await verifyCodeVerificationToken(data.token);

			// Hash the submitted code
			const submittedCodeHash = hashOTPCode(data.code);

			// Compare hashes
			if (payload.codeHash !== submittedCodeHash) {
				// Generic error - don't reveal if account exists or code was wrong
				return {
					success: false,
					error: "Invalid code. Please check your email and try again.",
				};
			}

			// If userId exists and code matches, authenticate user
			if (payload.userId) {
				// Verify user exists in database
				const user = await db
					.select()
					.from(users)
					.where(eq(users.id, payload.userId))
					.limit(1);

				if (user.length === 0) {
					return {
						success: false,
						error: "Invalid code. Please check your email and try again.",
					};
				}

				// Mark rate limit attempt as successful
				const tokenHash = hashJWT(data.token);
				await markAttemptSuccessful(tokenHash, "login-code");

				// Set authentication cookie
				setAuthCookie(payload.userId);

				return {
					success: true,
					user: user[0],
				};
			}

			// If email exists (no userId), code verification will always fail
			// Return generic error to prevent enumeration
			return {
				success: false,
				error: "Invalid code. Please check your email and try again.",
			};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Invalid code. Please check your email and try again.",
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
