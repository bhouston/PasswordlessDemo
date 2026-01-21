import { createFileRoute, useRouter } from '@tanstack/react-router';
import { verifyLoginLinkToken } from '@/lib/jwt';
import { setAuthCookie } from '@/lib/auth';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { FieldSet, FieldGroup, FieldError, Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute(
	'/login-via-link/$loginLinkToken',
)({
	loader: async ({ params }) => {
		try {
			// Verify the token
			const payload = await verifyLoginLinkToken(params.loginLinkToken);

			// Verify user exists in database
			const user = await db
				.select()
				.from(users)
				.where(eq(users.id, payload.userId))
				.limit(1);

			if (user.length === 0) {
				return {
					success: false,
					error: 'User not found',
				};
			}

			// Set authentication cookie
			setAuthCookie(payload.userId);

			return {
				success: true,
				user: user[0],
			};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: 'Login failed. The link may be invalid or expired.',
			};
		}
	},
	component: LoginViaLinkPage,
});

function LoginViaLinkPage() {
	const router = useRouter();
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
										Login Successful
									</h1>
									<p className="text-gray-400">
										You have been successfully logged in!
									</p>
									{result.user && (
										<div className="mt-4 p-4 bg-slate-700/50 rounded-lg">
											<p className="text-sm text-gray-300">
												<strong>Email:</strong>{' '}
												{result.user.email}
											</p>
										</div>
									)}
								</div>
								<Field>
									<Button
										onClick={() =>
											router.navigate({ to: '/' })
										}
										className="w-full"
									>
										Go to Home
									</Button>
								</Field>
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
										Login Failed
									</h1>
									<FieldError className="mt-4">
										{result.error ||
											'The login link is invalid or has expired. Please request a new login link.'}
									</FieldError>
								</div>
								<Field>
									<Button
										onClick={() =>
											router.navigate({ to: '/login' })
										}
										className="w-full"
									>
										Try Again
									</Button>
								</Field>
							</div>
						)}
					</FieldGroup>
				</FieldSet>
			</div>
		</div>
	);
}
