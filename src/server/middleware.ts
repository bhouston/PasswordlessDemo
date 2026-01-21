import { createMiddleware } from '@tanstack/react-start';
import { getAuthCookie } from '@/lib/auth';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Authentication middleware that ensures a user is logged in
 * Reads the authentication cookie, verifies the user exists in the database,
 * and attaches the user object to context for use in server functions
 */
export const requireUser = createMiddleware({ type: 'function' })
	.server(async ({ next }) => {
		const userIdStr = getAuthCookie();
		if (!userIdStr) {
			throw new Error('Not authenticated');
		}

		const userId = parseInt(userIdStr, 10);
		if (isNaN(userId)) {
			throw new Error('Invalid user ID');
		}

		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (!user) {
			throw new Error('User not found');
		}

		// Attach user to context for use in server functions
		return next({
			context: {
				user,
			},
		});
	});
