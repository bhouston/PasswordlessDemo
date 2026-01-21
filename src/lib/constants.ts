/**
 * JWT configuration constants
 */

// JWT secret key - use environment variable or fallback to default for development
export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';

// Token expiration time (24 hours in seconds)
export const REGISTRATION_TOKEN_EXPIRATION = 24 * 60 * 60; // 24 hours
