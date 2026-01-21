import { createFileRoute } from '@tanstack/react-router';
import { verifyRegistrationToken } from '@/lib/jwt';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { FieldSet, FieldGroup, FieldError } from '@/components/ui/field';

export const Route = createFileRoute(
	'/auth/register/$registrationToken',
)({
	loader: async ({ params }) => {
		try {
			// Verify the token
			const payload = await verifyRegistrationToken(
				params.registrationToken,
			);

			// Check if user already exists
			const existingUser = await db
				.select()
				.from(users)
				.where(eq(users.email, payload.email))
				.limit(1);

			if (existingUser.length > 0) {
				return {
					success: false,
					error: 'An account with this email already exists',
				};
			}

			// Create the user
			const [newUser] = await db
				.insert(users)
				.values({
					name: payload.name,
					email: payload.email,
				})
				.returning();

			return {
				success: true,
				user: newUser,
			};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: 'Registration failed. The link may be invalid or expired.',
			};
		}
	},
	component: RegisterPage,
});

function RegisterPage() {
	const result = Route.useLoaderData();

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
			<div className="w-full max-w-md">
				<FieldSet className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
					<FieldGroup>
						{result.success ? (
							<div className="text-center">
								<div className="mb-6">
									<div className="mx-auto w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
										<svg
											className="w-8 h-8 text-green-400"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M5 13l4 4L19 7"
											/>
										</svg>
									</div>
									<h1 className="text-3xl font-bold text-white mb-2">
										Registration Confirmed
									</h1>
									<p className="text-gray-400">
										Your account has been successfully
										created!
									</p>
									{result.user && (
										<div className="mt-4 p-4 bg-slate-700/50 rounded-lg">
											<p className="text-sm text-gray-300">
												<strong>Name:</strong>{' '}
												{result.user.name}
											</p>
											<p className="text-sm text-gray-300">
												<strong>Email:</strong>{' '}
												{result.user.email}
											</p>
										</div>
									)}
								</div>
							</div>
						) : (
							<div className="text-center">
								<div className="mb-6">
									<div className="mx-auto w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
										<svg
											className="w-8 h-8 text-red-400"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M6 18L18 6M6 6l12 12"
											/>
										</svg>
									</div>
									<h1 className="text-3xl font-bold text-white mb-2">
										Registration Failed
									</h1>
									<FieldError className="mt-4">
										{result.error ||
											'The registration link is invalid or has expired. Please request a new verification email.'}
									</FieldError>
								</div>
							</div>
						)}
					</FieldGroup>
				</FieldSet>
			</div>
		</div>
	);
}
