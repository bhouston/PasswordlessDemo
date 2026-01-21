/**
 * JWT configuration constants
 */

// JWT secret key - use environment variable or fallback to default for development
export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';

// Token expiration time (24 hours in seconds)
export const SIGNUP_TOKEN_EXPIRATION = 24 * 60 * 60; // 24 hours

// Login link token expiration (1 hour in seconds)
export const LOGIN_LINK_TOKEN_EXPIRATION = 60 * 60; // 1 hour

/**
 * Passkey/WebAuthn configuration constants
 */

// Relying Party name - displayed to users during passkey registration
export const RP_NAME =
	process.env.RP_NAME || 'Passwordless Demo';

// Relying Party ID - domain without protocol (e.g., "localhost" for dev, "yourdomain.com" for prod)
// Must match the domain where the app is hosted
export const RP_ID =
	process.env.RP_ID || 'localhost';

// Expected origin for WebAuthn verification (e.g., "http://localhost:3000" for dev)
export const ORIGIN =
	process.env.ORIGIN || 'http://localhost:3000';
