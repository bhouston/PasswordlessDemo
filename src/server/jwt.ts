import { SignJWT, jwtVerify } from 'jose';
import { getEnvConfig } from './env';

// Token expiration times (in seconds)
const SIGNUP_TOKEN_EXPIRATION = 24 * 60 * 60; // 24 hours
const LOGIN_LINK_TOKEN_EXPIRATION = 60 * 60; // 1 hour
const PASSKEY_CHALLENGE_TOKEN_EXPIRATION = 10 * 60; // 10 minutes

/**
 * Signup token payload
 */
export interface SignupTokenPayload {
	name: string;
	email: string;
	iat: number;
	exp: number;
}

/**
 * Login link token payload
 */
export interface LoginLinkTokenPayload {
	userId: number;
	iat: number;
	exp: number;
}

/**
 * Passkey challenge token payload
 */
export interface PasskeyChallengeTokenPayload {
	challenge: string;
	userId: number;
	email: string;
	iat: number;
	exp: number;
}

/**
 * Creates a JWT token for signup verification
 * @param name - User's name
 * @param email - User's email
 * @returns Signed JWT token string
 */
export async function signSignupToken(
	name: string,
	email: string,
): Promise<string> {
	const env = getEnvConfig();
	const secret = new TextEncoder().encode(env.JWT_SECRET);
	const now = Math.floor(Date.now() / 1000);

	const token = await new SignJWT({ name, email })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt(now)
		.setExpirationTime(now + SIGNUP_TOKEN_EXPIRATION)
		.sign(secret);

	return token;
}

/**
 * Verifies and extracts payload from a signup token
 * @param token - JWT token string
 * @returns Token payload if valid, throws error if invalid/expired
 */
export async function verifySignupToken(
	token: string,
): Promise<SignupTokenPayload> {
	const env = getEnvConfig();
	const secret = new TextEncoder().encode(env.JWT_SECRET);

	try {
		const { payload } = await jwtVerify(token, secret, {
			algorithms: ['HS256'],
		});

		// Validate payload structure
		if (
			typeof payload.name !== 'string' ||
			typeof payload.email !== 'string'
		) {
			throw new Error('Invalid token payload structure');
		}

		return {
			name: payload.name,
			email: payload.email,
			iat: payload.iat as number,
			exp: payload.exp as number,
		};
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Token verification failed: ${error.message}`);
		}
		throw new Error('Token verification failed: Unknown error');
	}
}

/**
 * Creates a JWT token for login link verification
 * @param userId - User's ID
 * @returns Signed JWT token string
 */
export async function signLoginLinkToken(userId: number): Promise<string> {
	const env = getEnvConfig();
	const secret = new TextEncoder().encode(env.JWT_SECRET);
	const now = Math.floor(Date.now() / 1000);

	const token = await new SignJWT({ userId })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt(now)
		.setExpirationTime(now + LOGIN_LINK_TOKEN_EXPIRATION)
		.sign(secret);

	return token;
}

/**
 * Verifies and extracts payload from a login link token
 * @param token - JWT token string
 * @returns Token payload if valid, throws error if invalid/expired
 */
export async function verifyLoginLinkToken(
	token: string,
): Promise<LoginLinkTokenPayload> {
	const env = getEnvConfig();
	const secret = new TextEncoder().encode(env.JWT_SECRET);

	try {
		const { payload } = await jwtVerify(token, secret, {
			algorithms: ['HS256'],
		});

		// Validate payload structure
		if (typeof payload.userId !== 'number') {
			throw new Error('Invalid token payload structure');
		}

		return {
			userId: payload.userId,
			iat: payload.iat as number,
			exp: payload.exp as number,
		};
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Token verification failed: ${error.message}`);
		}
		throw new Error('Token verification failed: Unknown error');
	}
}

/**
 * Creates a JWT token for passkey challenge verification
 * @param challenge - The WebAuthn challenge string
 * @param userId - User's ID
 * @param email - User's email
 * @returns Signed JWT token string
 */
export async function signPasskeyChallengeToken(
	challenge: string,
	userId: number,
	email: string,
): Promise<string> {
	const env = getEnvConfig();
	const secret = new TextEncoder().encode(env.JWT_SECRET);
	const now = Math.floor(Date.now() / 1000);

	const token = await new SignJWT({ challenge, userId, email })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt(now)
		.setExpirationTime(now + PASSKEY_CHALLENGE_TOKEN_EXPIRATION)
		.sign(secret);

	return token;
}

/**
 * Verifies and extracts payload from a passkey challenge token
 * @param token - JWT token string
 * @returns Token payload if valid, throws error if invalid/expired
 */
export async function verifyPasskeyChallengeToken(
	token: string,
): Promise<PasskeyChallengeTokenPayload> {
	const env = getEnvConfig();
	const secret = new TextEncoder().encode(env.JWT_SECRET);

	try {
		const { payload } = await jwtVerify(token, secret, {
			algorithms: ['HS256'],
		});

		// Validate payload structure
		if (
			typeof payload.challenge !== 'string' ||
			typeof payload.userId !== 'number' ||
			typeof payload.email !== 'string'
		) {
			throw new Error('Invalid token payload structure');
		}

		return {
			challenge: payload.challenge,
			userId: payload.userId,
			email: payload.email,
			iat: payload.iat as number,
			exp: payload.exp as number,
		};
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Token verification failed: ${error.message}`);
		}
		throw new Error('Token verification failed: Unknown error');
	}
}
