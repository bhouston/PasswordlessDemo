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
import { RP_NAME, RP_ID, ORIGIN } from './constants';
import { db } from '@/db';
import { passkeys } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Challenge storage - maps userId to challenge and timestamp
 * In production, consider using Redis or session storage
 */
const challengeStore = new Map<
	number,
	{ challenge: string; timestamp: number }
>();

/**
 * Challenge expiration time (5 minutes in milliseconds)
 */
const CHALLENGE_EXPIRATION = 5 * 60 * 1000;

/**
 * Clean up expired challenges
 */
function cleanupExpiredChallenges() {
	const now = Date.now();
	for (const [userId, data] of challengeStore.entries()) {
		if (now - data.timestamp > CHALLENGE_EXPIRATION) {
			challengeStore.delete(userId);
		}
	}
}

/**
 * Store challenge for a user
 */
function storeChallenge(userId: number, challenge: string) {
	cleanupExpiredChallenges();
	challengeStore.set(userId, { challenge, timestamp: Date.now() });
}

/**
 * Get and remove challenge for a user
 */
function getAndRemoveChallenge(userId: number): string | null {
	const data = challengeStore.get(userId);
	if (!data) {
		return null;
	}

	// Check if expired
	if (Date.now() - data.timestamp > CHALLENGE_EXPIRATION) {
		challengeStore.delete(userId);
		return null;
	}

	// Remove challenge after use (one-time use)
	challengeStore.delete(userId);
	return data.challenge;
}

/**
 * Convert userId to base64url encoded Uint8Array for WebAuthn userID
 */
function userIdToUint8Array(userId: number): Uint8Array<ArrayBuffer> {
	// Convert number to string, then to bytes
	const userIdStr = userId.toString();
	const encoder = new TextEncoder();
	return new Uint8Array(encoder.encode(userIdStr));
}

/**
 * Generate registration options for passkey registration
 */
export async function generateRegistrationOptions(
	userId: number,
	userName: string,
	userDisplayName: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
	// Check if user already has a passkey (single passkey constraint)
	const existingPasskey = await db
		.select()
		.from(passkeys)
		.where(eq(passkeys.userId, userId))
		.limit(1);

	if (existingPasskey.length > 0) {
		throw new Error('User already has a passkey registered');
	}

	const opts: GenerateRegistrationOptionsOpts = {
		rpName: RP_NAME,
		rpID: RP_ID,
		userID: userIdToUint8Array(userId),
		userName: userName,
		userDisplayName: userDisplayName,
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
	storeChallenge(userId, options.challenge);

	return options;
}

/**
 * Verify registration response and store passkey
 */
export async function verifyRegistrationResponse(
	response: unknown,
	userId: number,
): Promise<{ success: boolean; error?: string }> {
	try {
		const expectedChallenge = getAndRemoveChallenge(userId);
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
			.where(eq(passkeys.userId, userId))
			.limit(1);

		if (existingPasskey.length > 0) {
			return {
				success: false,
				error: 'User already has a passkey registered',
			};
		}

		const opts: VerifyRegistrationResponseOpts = {
			response: response as any,
			expectedChallenge,
			expectedOrigin: ORIGIN,
			expectedRPID: RP_ID,
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
		// Access counter and transports from registrationInfo (may not be in types but exist at runtime)
		const counter = (registrationInfo as any).counter ?? 0;
		const transports = (registrationInfo as any).transports;

		// Convert publicKey (Uint8Array) to base64url for storage
		const publicKeyBase64 = Buffer.from(credential.publicKey).toString('base64url');

		// Store passkey in database
		await db.insert(passkeys).values({
			userId,
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
}

/**
 * Generate authentication options for passkey login
 */
export async function generateAuthenticationOptions(
	userId: number,
): Promise<PublicKeyCredentialRequestOptionsJSON | null> {
	// Fetch user's passkey
	const userPasskey = await db
		.select()
		.from(passkeys)
		.where(eq(passkeys.userId, userId))
		.limit(1);

	if (userPasskey.length === 0) {
		return null;
	}

		const passkey = userPasskey[0];
		const transports = passkey.transports
			? (JSON.parse(passkey.transports) as string[])
			: undefined;

		const opts: GenerateAuthenticationOptionsOpts = {
			rpID: RP_ID,
			timeout: 60000, // 60 seconds
			allowCredentials: [
				{
					id: passkey.credentialId,
					transports: transports as any, // Type assertion needed for transport compatibility
				},
			],
			userVerification: 'required',
		};

		const options = await swaGenerateAuthenticationOptions(opts);

	// Store challenge for verification
	storeChallenge(userId, options.challenge);

	return options;
}

/**
 * Verify authentication response and update counter
 */
export async function verifyAuthenticationResponse(
	response: unknown,
	userId: number,
): Promise<{ success: boolean; error?: string }> {
	try {
		const expectedChallenge = getAndRemoveChallenge(userId);
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
			.where(eq(passkeys.userId, userId))
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
		const publicKey = new Uint8Array(publicKeyBuffer.buffer, publicKeyBuffer.byteOffset, publicKeyBuffer.byteLength);

		const opts: VerifyAuthenticationResponseOpts = {
			response: response as any,
			expectedChallenge,
			expectedOrigin: ORIGIN,
			expectedRPID: RP_ID,
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
}

/**
 * Delete passkey for a user
 */
export async function deletePasskey(userId: number): Promise<void> {
	await db.delete(passkeys).where(eq(passkeys.userId, userId));
}
