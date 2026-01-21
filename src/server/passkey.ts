import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import {
	generateRegistrationOptions as swaGenerateRegistrationOptions,
	verifyRegistrationResponse as swaVerifyRegistrationResponse,
	generateAuthenticationOptions as swaGenerateAuthenticationOptions,
	verifyAuthenticationResponse as swaVerifyAuthenticationResponse,
	type GenerateRegistrationOptionsOpts,
	type GenerateAuthenticationOptionsOpts,
	type VerifyRegistrationResponseOpts,
	type VerifyAuthenticationResponseOpts,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import { getEnvConfig } from './env';
import { db } from '@/db';
import { users, passkeys } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireUser } from './middleware';
import { setAuthCookie } from '@/lib/auth';

/**
 * Challenge expiration time (5 minutes in milliseconds)
 */
const CHALLENGE_EXPIRATION = 5 * 60 * 1000;

/**
 * Store challenge for a user in database
 */
async function storeChallenge(userId: number, challenge: string) {
	const expiry = new Date(Date.now() + CHALLENGE_EXPIRATION);
	await db
		.update(users)
		.set({
			passcodeChallenge: challenge,
			passcodeChallengeExpiry: expiry,
		})
		.where(eq(users.id, userId));
}

/**
 * Get and remove challenge for a user from database
 */
async function getAndRemoveChallenge(userId: number): Promise<string | null> {
	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!user || !user.passcodeChallenge || !user.passcodeChallengeExpiry) {
		return null;
	}

	// Check if expired
	if (user.passcodeChallengeExpiry < new Date()) {
		// Clear expired challenge
		await db
			.update(users)
			.set({
				passcodeChallenge: null,
				passcodeChallengeExpiry: null,
			})
			.where(eq(users.id, userId));
		return null;
	}

	// Remove challenge after use (one-time use)
	await db
		.update(users)
		.set({
			passcodeChallenge: null,
			passcodeChallengeExpiry: null,
		})
		.where(eq(users.id, userId));

	return user.passcodeChallenge;
}

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
export const generateRegistrationOptions = createServerFn({ method: 'POST' })
	.middleware([requireUser])
	.inputValidator((data: unknown) => generateRegistrationOptionsSchema.parse(data))
	.handler(async ({ data, context }) => {
		const user = context.user;
		if (user.id !== data.userId) {
			throw new Error('Not authorized');
		}

		// Check if user already has a passkey (single passkey constraint)
		const existingPasskey = await db
			.select()
			.from(passkeys)
			.where(eq(passkeys.userId, data.userId))
			.limit(1);

		if (existingPasskey.length > 0) {
			throw new Error('User already has a passkey registered');
		}

		const env = getEnvConfig();
		const opts: GenerateRegistrationOptionsOpts = {
			rpName: env.RP_NAME,
			rpID: env.RP_ID,
			userID: userIdToUint8Array(data.userId),
			userName: data.userName,
			userDisplayName: data.userDisplayName,
			timeout: 60000, // 60 seconds
			attestationType: 'none',
			authenticatorSelection: {
				residentKey: 'required',
				userVerification: 'required',
				authenticatorAttachment: 'platform', // Prefer platform authenticators (Touch ID, Face ID, etc.)
			},
		};

		const options = await swaGenerateRegistrationOptions(opts);

		// Store challenge for verification
		await storeChallenge(data.userId, options.challenge);

		return options;
	});

const verifyRegistrationResponseSchema = z.object({
	response: z.unknown(),
	userId: z.number().int().positive(),
});

/**
 * Server function to verify registration response and store passkey
 * Uses requireUser middleware to ensure authentication
 */
export const verifyRegistrationResponse = createServerFn({ method: 'POST' })
	.middleware([requireUser])
	.inputValidator((data: unknown) => verifyRegistrationResponseSchema.parse(data))
	.handler(async ({ data, context }) => {
		const user = context.user;
		if (user.id !== data.userId) {
			throw new Error('Not authorized');
		}

		try {
			const expectedChallenge = await getAndRemoveChallenge(data.userId);
			if (!expectedChallenge) {
				return {
					success: false,
					error: 'Challenge not found or expired. Please try again.',
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
					error: 'User already has a passkey registered',
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
					error: 'Registration verification failed',
				};
			}

			const registrationInfo = verification.registrationInfo;
			const { credential } = registrationInfo;
			const counter = (registrationInfo as any).counter ?? 0;
			const transports = (registrationInfo as any).transports;

			// Convert publicKey (Uint8Array) to base64url for storage
			const publicKeyBase64 = Buffer.from(credential.publicKey).toString('base64url');

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
						: 'Registration verification failed',
			};
		}
	});

const generateAuthenticationOptionsSchema = z.object({
	userId: z.number().int().positive(),
});

/**
 * Server function to generate authentication options for passkey login
 */
export const generateAuthenticationOptions = createServerFn({ method: 'POST' })
	.inputValidator((data: unknown) => generateAuthenticationOptionsSchema.parse(data))
	.handler(async ({ data }) => {
		// Fetch user's passkey
		const userPasskey = await db
			.select()
			.from(passkeys)
			.where(eq(passkeys.userId, data.userId))
			.limit(1);

		if (userPasskey.length === 0) {
			return null;
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
			userVerification: 'required',
		};

		const options = await swaGenerateAuthenticationOptions(opts);

		// Store challenge for verification
		await storeChallenge(data.userId, options.challenge);

		return options;
	});

const verifyAuthenticationResponseSchema = z.object({
	response: z.unknown(),
	userId: z.number().int().positive(),
});

/**
 * Server function to verify authentication response and update counter
 * Also sets authentication cookie on success
 */
export const verifyAuthenticationResponse = createServerFn({ method: 'POST' })
	.inputValidator((data: unknown) => verifyAuthenticationResponseSchema.parse(data))
	.handler(async ({ data }) => {
		try {
			const expectedChallenge = await getAndRemoveChallenge(data.userId);
			if (!expectedChallenge) {
				return {
					success: false,
					error: 'Challenge not found or expired. Please try again.',
				};
			}

			// Fetch user's passkey
			const userPasskey = await db
				.select()
				.from(passkeys)
				.where(eq(passkeys.userId, data.userId))
				.limit(1);

			if (userPasskey.length === 0) {
				return {
					success: false,
					error: 'Passkey not found',
				};
			}

			const passkey = userPasskey[0];
			// Convert base64url back to Uint8Array
			const publicKeyBuffer = Buffer.from(passkey.publicKey, 'base64url');
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
					error: 'Authentication verification failed',
				};
			}

			// Check signature counter (must be greater than stored counter)
			if (verification.authenticationInfo) {
				const newCounter = verification.authenticationInfo.newCounter;
				if (newCounter <= passkey.counter) {
					return {
						success: false,
						error: 'Invalid signature counter. Possible cloned credential.',
					};
				}

			// Update counter in database
			await db
				.update(passkeys)
				.set({ counter: newCounter })
				.where(eq(passkeys.id, passkey.id));
		}

		// Set authentication cookie on successful verification
		setAuthCookie(data.userId);

		return { success: true };
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: 'Authentication verification failed',
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
export const deletePasskey = createServerFn({ method: 'POST' })
	.middleware([requireUser])
	.inputValidator((data: unknown) => deletePasskeySchema.parse(data))
	.handler(async ({ data, context }) => {
		const user = context.user;
		if (user.id !== data.userId) {
			throw new Error('Not authorized');
		}

		await db.delete(passkeys).where(eq(passkeys.userId, data.userId));
		return { success: true };
	});
