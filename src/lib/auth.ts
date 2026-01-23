import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

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
 * Sets the authentication cookie with the user ID
 * @param userId - User's ID to store in the cookie
 */
export function setAuthCookie(userId: number): void {
	setCookie(AUTH_COOKIE_NAME, userId.toString(), AUTH_COOKIE_OPTIONS);
}

/**
 * Gets the authentication cookie (user ID)
 * @returns User ID as string if cookie exists, undefined otherwise
 */
export function getAuthCookie(): string | undefined {
	return getCookie(AUTH_COOKIE_NAME);
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
