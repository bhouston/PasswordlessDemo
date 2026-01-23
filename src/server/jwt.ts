import { jwtVerify, SignJWT } from "jose";
import { getEnvConfig } from "./env";

// Token expiration times (in seconds)
const SIGNUP_TOKEN_EXPIRATION = 24 * 60 * 60; // 24 hours
const CODE_VERIFICATION_TOKEN_EXPIRATION = 15 * 60; // 15 minutes
const PASSKEY_CHALLENGE_TOKEN_EXPIRATION = 10 * 60; // 10 minutes
const SESSION_TOKEN_EXPIRATION = 60 * 60 * 24 * 30; // 30 days

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
 * Code verification token payload
 */
export interface CodeVerificationTokenPayload {
	userId?: number; // Present if account exists
	email?: string; // Present if account doesn't exist
	codeHash: string; // Always present
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
 * Passkey discovery token payload (for discovery flow without userId)
 */
export interface PasskeyDiscoveryTokenPayload {
	challenge: string;
	iat: number;
	exp: number;
}

/**
 * Session token payload (for authenticated sessions)
 */
export interface SessionTokenPayload {
	userId: number;
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
		.setProtectedHeader({ alg: "HS256" })
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
			algorithms: ["HS256"],
		});

		// Validate payload structure
		if (typeof payload.name !== "string" || typeof payload.email !== "string") {
			throw new Error("Invalid token payload structure");
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
		throw new Error("Token verification failed: Unknown error");
	}
}

/**
 * Creates a JWT token for code verification
 * @param userId - User's ID (null if account doesn't exist)
 * @param email - User's email (always required)
 * @param codeHash - Hashed OTP code
 * @returns Signed JWT token string
 */
export async function signCodeVerificationToken(
	userId: number | null,
	email: string,
	codeHash: string,
): Promise<string> {
	const env = getEnvConfig();
	const secret = new TextEncoder().encode(env.JWT_SECRET);
	const now = Math.floor(Date.now() / 1000);

	const payload: Record<string, unknown> = { codeHash };
	if (userId !== null) {
		payload.userId = userId;
	} else {
		payload.email = email;
	}

	const token = await new SignJWT(payload)
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt(now)
		.setExpirationTime(now + CODE_VERIFICATION_TOKEN_EXPIRATION)
		.sign(secret);

	return token;
}

/**
 * Verifies and extracts payload from a code verification token
 * @param token - JWT token string
 * @returns Token payload if valid, throws error if invalid/expired
 */
export async function verifyCodeVerificationToken(
	token: string,
): Promise<CodeVerificationTokenPayload> {
	const env = getEnvConfig();
	const secret = new TextEncoder().encode(env.JWT_SECRET);

	try {
		const { payload } = await jwtVerify(token, secret, {
			algorithms: ["HS256"],
		});

		// Validate payload structure
		if (typeof payload.codeHash !== "string") {
			throw new Error("Invalid token payload structure");
		}

		// Either userId or email must be present, but not both
		const hasUserId = typeof payload.userId === "number";
		const hasEmail = typeof payload.email === "string";

		if (!hasUserId && !hasEmail) {
			throw new Error("Invalid token payload structure: missing userId or email");
		}

		if (hasUserId && hasEmail) {
			throw new Error("Invalid token payload structure: cannot have both userId and email");
		}

		return {
			userId: hasUserId ? payload.userId as number : undefined,
			email: hasEmail ? payload.email as string : undefined,
			codeHash: payload.codeHash,
			iat: payload.iat as number,
			exp: payload.exp as number,
		};
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Token verification failed: ${error.message}`);
		}
		throw new Error("Token verification failed: Unknown error");
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
		.setProtectedHeader({ alg: "HS256" })
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
			algorithms: ["HS256"],
		});

		// Validate payload structure
		if (
			typeof payload.challenge !== "string" ||
			typeof payload.userId !== "number" ||
			typeof payload.email !== "string"
		) {
			throw new Error("Invalid token payload structure");
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
		throw new Error("Token verification failed: Unknown error");
	}
}

/**
 * Creates a JWT token for passkey discovery (challenge only, no userId)
 * @param challenge - The WebAuthn challenge string
 * @returns Signed JWT token string
 */
export async function signPasskeyDiscoveryToken(
	challenge: string,
): Promise<string> {
	const env = getEnvConfig();
	const secret = new TextEncoder().encode(env.JWT_SECRET);
	const now = Math.floor(Date.now() / 1000);

	const token = await new SignJWT({ challenge })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt(now)
		.setExpirationTime(now + PASSKEY_CHALLENGE_TOKEN_EXPIRATION)
		.sign(secret);

	return token;
}

/**
 * Verifies and extracts payload from a passkey discovery token
 * @param token - JWT token string
 * @returns Token payload if valid, throws error if invalid/expired
 */
export async function verifyPasskeyDiscoveryToken(
	token: string,
): Promise<PasskeyDiscoveryTokenPayload> {
	const env = getEnvConfig();
	const secret = new TextEncoder().encode(env.JWT_SECRET);

	try {
		const { payload } = await jwtVerify(token, secret, {
			algorithms: ["HS256"],
		});

		// Validate payload structure (discovery token only has challenge)
		if (typeof payload.challenge !== "string") {
			throw new Error("Invalid token payload structure");
		}

		return {
			challenge: payload.challenge,
			iat: payload.iat as number,
			exp: payload.exp as number,
		};
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Token verification failed: ${error.message}`);
		}
		throw new Error("Token verification failed: Unknown error");
	}
}

/**
 * Creates a JWT token for authenticated user sessions
 * @param userId - User's ID
 * @returns Signed JWT token string
 */
export async function signSessionToken(userId: number): Promise<string> {
	const env = getEnvConfig();
	const secret = new TextEncoder().encode(env.JWT_SECRET);
	const now = Math.floor(Date.now() / 1000);

	const token = await new SignJWT({ userId })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt(now)
		.setExpirationTime(now + SESSION_TOKEN_EXPIRATION)
		.sign(secret);

	return token;
}

/**
 * Verifies and extracts payload from a session token
 * @param token - JWT token string
 * @returns Token payload if valid, throws error if invalid/expired
 */
export async function verifySessionToken(
	token: string,
): Promise<SessionTokenPayload> {
	const env = getEnvConfig();
	const secret = new TextEncoder().encode(env.JWT_SECRET);

	try {
		const { payload } = await jwtVerify(token, secret, {
			algorithms: ["HS256"],
		});

		// Validate payload structure
		if (typeof payload.userId !== "number") {
			throw new Error("Invalid token payload structure");
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
		throw new Error("Token verification failed: Unknown error");
	}
}
