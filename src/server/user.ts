import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { passkeys, users } from "@/db/schema";
import { requireUser } from "./middleware";

const updateUserNameSchema = z.object({
	name: z.string().min(1, "Name is required"),
});

const getUserByIdSchema = z.object({
	userId: z.number().int().positive(),
});

const getUserByEmailSchema = z.object({
	email: z.string().email(),
});

/**
 * Server function to get user by ID
 */
export const getUserById = createServerFn({ method: "GET" })
	.inputValidator((data: unknown) => getUserByIdSchema.parse(data))
	.handler(async ({ data }) => {
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.id, data.userId))
			.limit(1);

		return user || null;
	});

/**
 * Server function to get user by email
 */
export const getUserByEmail = createServerFn({ method: "GET" })
	.inputValidator((data: unknown) => getUserByEmailSchema.parse(data))
	.handler(async ({ data }) => {
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.email, data.email))
			.limit(1);

		return user || null;
	});

/**
 * Server function to update user name
 * Uses requireUser middleware to ensure authentication
 */
export const updateUserName = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.inputValidator((data: unknown) => updateUserNameSchema.parse(data))
	.handler(async ({ data, context }) => {
		const user = context.user;

		const [updatedUser] = await db
			.update(users)
			.set({ name: data.name })
			.where(eq(users.id, user.id))
			.returning();

		if (!updatedUser) {
			throw new Error("User not found");
		}

		return {
			success: true,
			user: updatedUser,
		};
	});

/**
 * Server function to get user with passkey status
 * Uses requireUser middleware to ensure authentication
 * Note: This function doesn't require input data as it uses middleware to get the user
 */
export const getUserWithPasskey = createServerFn({ method: "GET" })
	.middleware([requireUser])
	.handler(async ({ context }) => {
		const user = context.user;

		// Check if user has a passkey
		const userPasskey = await db
			.select()
			.from(passkeys)
			.where(eq(passkeys.userId, user.id))
			.limit(1);

		return {
			user,
			hasPasskey: userPasskey.length > 0,
		};
	});

const userHasPasskeySchema = z.object({
	userId: z.number().int().positive(),
});

/**
 * Server function to check if user has a passkey by user ID
 */
export const userHasPasskey = createServerFn({ method: "GET" })
	.inputValidator((data: unknown) => userHasPasskeySchema.parse(data))
	.handler(async ({ data }) => {
		const userPasskey = await db
			.select()
			.from(passkeys)
			.where(eq(passkeys.userId, data.userId))
			.limit(1);

		return userPasskey.length > 0;
	});
