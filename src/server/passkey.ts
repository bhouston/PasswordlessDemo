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
import {
	signPasskeyChallengeToken,
	signPasskeyDiscoveryToken,
	verifyPasskeyChallengeToken,
	verifyPasskeyDiscoveryToken,
} from "./jwt";
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

/**
 * Server function to initiate passkey discovery (no email/userId required)
 * Uses WebAuthn discovery flow where user selects their passkey
 */
export const initiatePasskeyDiscovery = createServerFn({ method: "POST" })
	.handler(async () => {
		const env = getEnvConfig();
		const opts: GenerateAuthenticationOptionsOpts = {
			rpID: env.RP_ID,
			timeout: 60000, // 60 seconds
			// No allowCredentials array = discovery mode
			userVerification: "required",
		};

		const options = await swaGenerateAuthenticationOptions(opts);

		// Create discovery token (challenge only, no userId)
		const token = await signPasskeyDiscoveryToken(options.challenge);

		// Hash token for rate limiting
		const tokenHash = hashJWT(token);

		try {
			// Check rate limits (IP only, no email)
			await checkIPRateLimit("passkey-attempt", tokenHash);
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

const verifyAuthenticationResponseSchema = z.object({
	response: z.unknown(),
	token: z.string().min(1),
});

/**
 * Server function to verify authentication response and update counter
 * Also sets authentication cookie on success
 * Supports both discovery mode (no userId in token) and regular mode (userId in token)
 */
export const verifyAuthenticationResponse = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) =>
		verifyAuthenticationResponseSchema.parse(data),
	)
	.handler(async ({ data }) => {
		try {
			// Try to verify as discovery token first (challenge only)
			let isDiscovery = false;
			let expectedChallenge: string;
			let userId: number | undefined;

			try {
				const discoveryPayload = await verifyPasskeyDiscoveryToken(data.token);
				isDiscovery = true;
				expectedChallenge = discoveryPayload.challenge;
			} catch {
				// Not a discovery token, try regular token
				const tokenPayload = await verifyPasskeyChallengeToken(data.token);
				expectedChallenge = tokenPayload.challenge;
				userId = tokenPayload.userId;
			}

			let passkey;
			if (isDiscovery) {
				// Discovery mode: extract credentialId from response and look up user
				const response = data.response as any;
				const credentialId = response.id;

				// Find passkey by credentialId
				const passkeysFound = await db
					.select()
					.from(passkeys)
					.where(eq(passkeys.credentialId, credentialId))
					.limit(1);

				if (passkeysFound.length === 0) {
					return {
						success: false,
						error: "Passkey not found",
					};
				}

				passkey = passkeysFound[0];
				userId = passkey.userId;
			} else {
				// Regular mode: use userId from token
				if (!userId) {
					return {
						success: false,
						error: "Invalid token",
					};
				}

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

				passkey = userPasskey[0];
			}

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
			if (!userId) {
				return {
					success: false,
					error: "User ID not found",
				};
			}

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
