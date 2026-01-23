import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { signSessionToken, verifySessionToken } from "@/server/jwt";

/**
 * Cookie name for user authentication
 */
export const AUTH_COOKIE_NAME = "user_id";

/**
 * Cookie options for authentication cookie
 */
const AUTH_COOKIE_OPTIONS = {
	httpOnly: true,
	secure: process.env.NODE_ENV === "production",
	sameSite: "lax" as const,
	path: "/",
	maxAge: 60 * 60 * 24 * 30, // 30 days
};

/**
 * Sets the authentication cookie with a signed session token
 * @param userId - User's ID to store in the cookie
 */
export async function setAuthCookie(userId: number): Promise<void> {
	const token = await signSessionToken(userId);
	setCookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
}

/**
 * Gets the authentication cookie and verifies the signed session token
 * @returns User ID as string if cookie exists and token is valid, undefined otherwise
 */
export async function getAuthCookie(): Promise<string | undefined> {
	const token = getCookie(AUTH_COOKIE_NAME);
	if (!token) {
		return undefined;
	}

	try {
		const payload = await verifySessionToken(token);
		return payload.userId.toString();
	} catch {
		// Invalid, expired, or tampered token - return undefined
		return undefined;
	}
}

/**
 * Clears the authentication cookie
 */
export function clearAuthCookie(): void {
	deleteCookie(AUTH_COOKIE_NAME, {
		path: "/",
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
	});
}
