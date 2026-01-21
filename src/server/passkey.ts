import {
	type GenerateAuthenticationOptionsOpts,
	type GenerateRegistrationOptionsOpts,
	generateAuthenticationOptions as swaGenerateAuthenticationOptions,
	generateRegistrationOptions as swaGenerateRegistrationOptions,
	verifyAuthenticationResponse as swaVerifyAuthenticationResponse,
	verifyRegistrationResponse as swaVerifyRegistrationResponse,
	type VerifyAuthenticationResponseOpts,
	type VerifyRegistrationResponseOpts,
} from "@simplewebauthn/server";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { passkeys, users } from "@/db/schema";
import { setAuthCookie } from "@/lib/auth";
import { getEnvConfig } from "./env";
import { signPasskeyChallengeToken, verifyPasskeyChallengeToken } from "./jwt";
import { requireUser } from "./middleware";
import {
	checkEmailRateLimit,
	checkIPRateLimit,
	hashJWT,
	markAttemptSuccessful,
	RateLimitError,
} from "./rateLimit";

/**
 * Convert userId to base64url encoded Uint8Array for WebAuthn userID
 */
function userIdToUint8Array(userId: number): Uint8Array<ArrayBuffer> {
	const userIdStr = userId.toString();
	const encoder = new TextEncoder();
	return new Uint8Array(encoder.encode(userIdStr));
}

const generateRegistrationOptionsSchema = z.object({
	userId: z.number().int().positive(),
	userName: z.string().min(1),
	userDisplayName: z.string().min(1),
});

/**
 * Server function to generate registration options for passkey registration
 * Uses requireUser middleware to ensure authentication
 */
export const generateRegistrationOptions = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.inputValidator((data: unknown) =>
		generateRegistrationOptionsSchema.parse(data),
	)
	.handler(async ({ data, context }) => {
		const user = context.user;
		if (user.id !== data.userId) {
			throw new Error("Not authorized");
		}

		// Check if user already has a passkey (single passkey constraint)
		const existingPasskey = await db
			.select()
			.from(passkeys)
			.where(eq(passkeys.userId, data.userId))
			.limit(1);

		if (existingPasskey.length > 0) {
			throw new Error("User already has a passkey registered");
		}

		const env = getEnvConfig();
		const opts: GenerateRegistrationOptionsOpts = {
			rpName: env.RP_NAME,
			rpID: env.RP_ID,
			userID: userIdToUint8Array(data.userId),
			userName: data.userName,
			userDisplayName: data.userDisplayName,
			timeout: 60000, // 60 seconds
			attestationType: "none",
			authenticatorSelection: {
				residentKey: "required",
				userVerification: "required",
				authenticatorAttachment: "platform", // Prefer platform authenticators (Touch ID, Face ID, etc.)
			},
		};

		const options = await swaGenerateRegistrationOptions(opts);

		// Create JWT token with challenge and user identity
		const token = await signPasskeyChallengeToken(
			options.challenge,
			data.userId,
			user.email,
		);

		return {
			options,
			token,
		};
	});

const verifyRegistrationResponseSchema = z.object({
	response: z.unknown(),
	userId: z.number().int().positive(),
	token: z.string().min(1),
});

/**
 * Server function to verify registration response and store passkey
 * Uses requireUser middleware to ensure authentication
 */
export const verifyRegistrationResponse = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.inputValidator((data: unknown) =>
		verifyRegistrationResponseSchema.parse(data),
	)
	.handler(async ({ data, context }) => {
		const user = context.user;
		if (user.id !== data.userId) {
			throw new Error("Not authorized");
		}

		try {
			// Verify token and extract challenge
			const tokenPayload = await verifyPasskeyChallengeToken(data.token);
			const expectedChallenge = tokenPayload.challenge;

			// Verify the userId matches
			if (tokenPayload.userId !== data.userId) {
				return {
					success: false,
					error: "Token user ID does not match",
				};
			}

			// Check if user already has a passkey
			const existingPasskey = await db
				.select()
				.from(passkeys)
				.where(eq(passkeys.userId, data.userId))
				.limit(1);

			if (existingPasskey.length > 0) {
				return {
					success: false,
					error: "User already has a passkey registered",
				};
			}

			const env = getEnvConfig();
			const opts: VerifyRegistrationResponseOpts = {
				response: data.response as any,
				expectedChallenge,
				expectedOrigin: env.ORIGIN,
				expectedRPID: env.RP_ID,
				requireUserVerification: true,
			};

			const verification = await swaVerifyRegistrationResponse(opts);

			if (!verification.verified || !verification.registrationInfo) {
				return {
					success: false,
					error: "Registration verification failed",
				};
			}

			const registrationInfo = verification.registrationInfo;
			const { credential } = registrationInfo;
			const counter = (registrationInfo as any).counter ?? 0;
			const transports = (registrationInfo as any).transports;

			// Convert publicKey (Uint8Array) to base64url for storage
			const publicKeyBase64 = Buffer.from(credential.publicKey).toString(
				"base64url",
			);

			// Store passkey in database
			await db.insert(passkeys).values({
				userId: data.userId,
				credentialId: credential.id,
				publicKey: publicKeyBase64,
				counter,
				transports: transports ? JSON.stringify(transports) : null,
			});

			return { success: true };
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Registration verification failed",
			};
		}
	});

const initiatePasskeyLoginSchema = z.object({
	email: z.string().email(),
});

/**
 * Server function to initiate passkey login by generating authentication options and JWT token
 * This replaces the old flow that stored challenges in the database
 */
export const initiatePasskeyLogin = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => initiatePasskeyLoginSchema.parse(data))
	.handler(async ({ data }) => {
		// Fetch user by email
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.email, data.email))
			.limit(1);

		if (!user) {
			return {
				success: false,
				error: "User not found",
			};
		}

		// Check if user has a passkey
		const userPasskey = await db
			.select()
			.from(passkeys)
			.where(eq(passkeys.userId, user.id))
			.limit(1);

		if (userPasskey.length === 0) {
			return {
				success: false,
				error: "No passkey found for this user",
			};
		}

		const passkey = userPasskey[0];
		const transports = passkey.transports
			? (JSON.parse(passkey.transports) as string[])
			: undefined;

		const env = getEnvConfig();
		const opts: GenerateAuthenticationOptionsOpts = {
			rpID: env.RP_ID,
			timeout: 60000, // 60 seconds
			allowCredentials: [
				{
					id: passkey.credentialId,
					transports: transports as any,
				},
			],
			userVerification: "required",
		};

		const options = await swaGenerateAuthenticationOptions(opts);

		// Create JWT token with challenge and user identity
		const token = await signPasskeyChallengeToken(
			options.challenge,
			user.id,
			user.email,
		);

		// Hash token for rate limiting
		const tokenHash = hashJWT(token);

		try {
			// Check rate limits (both IP and email) with jwtHash
			await checkIPRateLimit("passkey-attempt", tokenHash);
			await checkEmailRateLimit(data.email, "passkey-attempt", tokenHash);
		} catch (error) {
			if (error instanceof RateLimitError) {
				return {
					success: false,
					error: error.message,
				};
			}
			throw error;
		}

		return {
			success: true,
			options,
			token,
		};
	});

const getPasskeyAssertionOptionsSchema = z.object({
	token: z.string().min(1),
});

/**
 * Server function to verify passkey challenge token and generate authentication options
 * Used in route loaders to prepare passkey authentication
 */
export const getPasskeyAssertionOptions = createServerFn({ method: "GET" })
	.inputValidator((data: unknown) =>
		getPasskeyAssertionOptionsSchema.parse(data),
	)
	.handler(async ({ data }) => {
		try {
			// Verify token and extract challenge/user info
			const tokenPayload = await verifyPasskeyChallengeToken(data.token);

			// Fetch user by userId from token
			const [user] = await db
				.select()
				.from(users)
				.where(eq(users.id, tokenPayload.userId))
				.limit(1);

			if (!user) {
				return {
					success: false,
					error: "User not found",
					email: tokenPayload.email,
				};
			}

			// Check if user has a passkey
			const userPasskey = await db
				.select()
				.from(passkeys)
				.where(eq(passkeys.userId, user.id))
				.limit(1);

			if (userPasskey.length === 0) {
				return {
					success: false,
					error: "No passkey found for this user",
					email: tokenPayload.email,
				};
			}

			const passkey = userPasskey[0];
			const transports = passkey.transports
				? (JSON.parse(passkey.transports) as string[])
				: undefined;

			// Generate authentication options
			const env = getEnvConfig();
			const opts: GenerateAuthenticationOptionsOpts = {
				rpID: env.RP_ID,
				timeout: 60000, // 60 seconds
				allowCredentials: [
					{
						id: passkey.credentialId,
						transports: transports as any,
					},
				],
				userVerification: "required",
			};

			// Generate options (this will create a new challenge, but we'll replace it)
			const options = await swaGenerateAuthenticationOptions(opts);

			// Replace challenge with the one from token
			const optionsWithTokenChallenge = {
				...options,
				challenge: tokenPayload.challenge,
			};

			return {
				success: true,
				user,
				options: optionsWithTokenChallenge,
				token: data.token,
			};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Token verification failed",
			};
		}
	});

const verifyAuthenticationResponseSchema = z.object({
	response: z.unknown(),
	token: z.string().min(1),
});

/**
 * Server function to verify authentication response and update counter
 * Also sets authentication cookie on success
 * Now uses JWT token to extract challenge instead of database
 */
export const verifyAuthenticationResponse = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) =>
		verifyAuthenticationResponseSchema.parse(data),
	)
	.handler(async ({ data }) => {
		try {
			// Verify token and extract challenge
			const tokenPayload = await verifyPasskeyChallengeToken(data.token);
			const expectedChallenge = tokenPayload.challenge;
			const userId = tokenPayload.userId;

			// Fetch user's passkey
			const userPasskey = await db
				.select()
				.from(passkeys)
				.where(eq(passkeys.userId, userId))
				.limit(1);

			if (userPasskey.length === 0) {
				return {
					success: false,
					error: "Passkey not found",
				};
			}

			const passkey = userPasskey[0];
			// Convert base64url back to Uint8Array
			const publicKeyBuffer = Buffer.from(passkey.publicKey, "base64url");
			const publicKey = new Uint8Array(
				publicKeyBuffer.buffer,
				publicKeyBuffer.byteOffset,
				publicKeyBuffer.byteLength,
			);

			const env = getEnvConfig();
			const opts: VerifyAuthenticationResponseOpts = {
				response: data.response as any,
				expectedChallenge,
				expectedOrigin: env.ORIGIN,
				expectedRPID: env.RP_ID,
				credential: {
					id: passkey.credentialId,
					publicKey,
					counter: passkey.counter,
				},
				requireUserVerification: true,
			};

			const verification = await swaVerifyAuthenticationResponse(opts);

			if (!verification.verified) {
				return {
					success: false,
					error: "Authentication verification failed",
				};
			}

			// Check signature counter (must be greater than stored counter)
			if (verification.authenticationInfo) {
				const newCounter = verification.authenticationInfo.newCounter;
				if (newCounter <= passkey.counter) {
					return {
						success: false,
						error: "Invalid signature counter. Possible cloned credential.",
					};
				}

				// Update counter in database
				await db
					.update(passkeys)
					.set({ counter: newCounter })
					.where(eq(passkeys.id, passkey.id));
			}

			// Mark rate limit attempt as successful
			const tokenHash = hashJWT(data.token);
			await markAttemptSuccessful(tokenHash, "passkey-attempt");

			// Set authentication cookie on successful verification
			setAuthCookie(userId);

			return { success: true };
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Authentication verification failed",
			};
		}
	});

const deletePasskeySchema = z.object({
	userId: z.number().int().positive(),
});

/**
 * Server function to delete passkey for a user
 * Uses requireUser middleware to ensure authentication
 */
export const deletePasskey = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.inputValidator((data: unknown) => deletePasskeySchema.parse(data))
	.handler(async ({ data, context }) => {
		const user = context.user;
		if (user.id !== data.userId) {
			throw new Error("Not authorized");
		}

		await db.delete(passkeys).where(eq(passkeys.userId, data.userId));
		return { success: true };
	});
