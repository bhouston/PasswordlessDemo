import { SignJWT, jwtVerify } from 'jose';
import {
	JWT_SECRET,
	REGISTRATION_TOKEN_EXPIRATION,
	LOGIN_LINK_TOKEN_EXPIRATION,
} from './constants';

/**
 * Registration token payload
 */
export interface RegistrationTokenPayload {
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
 * Creates a JWT token for registration verification
 * @param name - User's name
 * @param email - User's email
 * @returns Signed JWT token string
 */
export async function signRegistrationToken(
	name: string,
	email: string,
): Promise<string> {
	const secret = new TextEncoder().encode(JWT_SECRET);
	const now = Math.floor(Date.now() / 1000);

	const token = await new SignJWT({ name, email })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt(now)
		.setExpirationTime(now + REGISTRATION_TOKEN_EXPIRATION)
		.sign(secret);

	return token;
}

/**
 * Verifies and extracts payload from a registration token
 * @param token - JWT token string
 * @returns Token payload if valid, throws error if invalid/expired
 */
export async function verifyRegistrationToken(
	token: string,
): Promise<RegistrationTokenPayload> {
	const secret = new TextEncoder().encode(JWT_SECRET);

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
	const secret = new TextEncoder().encode(JWT_SECRET);
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
	const secret = new TextEncoder().encode(JWT_SECRET);

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
