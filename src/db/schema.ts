import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export const passkeys = sqliteTable("passkeys", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	credentialId: text("credential_id").notNull(),
	publicKey: text("public_key").notNull(),
	counter: integer("counter").notNull().default(0),
	transports: text("transports"), // JSON array of transport methods
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export const rateLimits = sqliteTable("rate_limits", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	identifier: text("identifier").notNull(), // IP address or email
	type: text("type").notNull(), // 'ip' or 'email'
	endpoint: text("endpoint").notNull(), // 'signup', 'login-link', 'email-lookup', 'passkey-attempt'
	jwtHash: text("jwt_hash"), // Hash of JWT token to identify the attempt (nullable for endpoints that don't use JWTs)
	status: text("status").notNull().default("failed"), // 'failed', 'success', or 'bad-email'
	count: integer("count").notNull().default(1),
	windowStart: integer("window_start", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export const userAuthAttempts = sqliteTable("user_auth_attempts", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	email: text("email").notNull(),
	name: text("name"), // nullable - only present for signup attempts
	userId: integer("user_id"), // nullable - null if account doesn't exist yet
	codeHash: text("code_hash").notNull(), // SHA-256 hash of the OTP code
	purpose: text("purpose").notNull(), // 'login' or 'signup'
	expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	used: integer("used", { mode: "boolean" }).notNull().default(false),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});
