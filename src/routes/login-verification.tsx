import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { z } from 'zod';
import { getUserByEmail, userHasPasskey } from '@/server/user';
import { initiatePasskeyLogin } from '@/server/passkey';
import {
	FieldSet,
	FieldGroup,
	FieldError,
	Field,
} from '@/components/ui/field';
import { Button } from '@/components/ui/button';

// Zod schema for search params validation
const loginVerificationSearchSchema = z.object({
	email: z.string().email('Please provide a valid email address'),
});

export const Route = createFileRoute('/login-verification')({
	validateSearch: loginVerificationSearchSchema,
	loaderDeps: ({ search }) => ({ email: search.email }),
	loader: async ({ deps }) => {
		try {
			const user = await getUserByEmail({ data: { email: deps.email } });

			if (!user) {
				return {
					success: false,
					error: 'No account found with this email address',
				};
			}

			// Check if user has a passkey
			const hasPasskey = await userHasPasskey({ data: { userId: user.id } });

			return {
				success: true,
				user,
				hasPasskey,
			};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: 'An error occurred while checking your account',
			};
		}
	},
	component: LoginVerificationPage,
});

function LoginVerificationPage() {
	const router = useRouter();
	const result = Route.useLoaderData();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const initiatePasskeyLoginFn = useServerFn(initiatePasskeyLogin);

	const handlePasskeyLogin = async () => {
		if (!result.success || !result.user) {
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			const response = await initiatePasskeyLoginFn({
				data: { email: result.user.email },
			});

			if (!response.success) {
				throw new Error(response.error || 'Failed to initiate passkey login');
			}

			// Redirect to token-based route
			router.navigate({
				to: '/login-passkey/$passkeyToken',
				params: { passkeyToken: response.token },
			});
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: 'Failed to initiate passkey login. Please try again.',
			);
			setIsLoading(false);
		}
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
			<div className="w-full max-w-md">
				<FieldSet className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
					<FieldGroup>
						{result.success ? (
							<div className="text-center">
								<div className="mb-6">
									<h1 className="text-3xl font-bold text-white mb-2">
										Choose Verification Method
									</h1>
									<p className="text-gray-400 mb-4">
										Select how you'd like to verify your
										account
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

								{error && (
									<FieldError className="mb-4">{error}</FieldError>
								)}

								<div className="space-y-4">
									{result.hasPasskey && (
										<Field>
											<Button
												onClick={handlePasskeyLogin}
												disabled={isLoading}
												className="w-full"
											>
												{isLoading
													? 'Preparing passkey login...'
													: 'Login with Passkey'}
											</Button>
										</Field>
									)}
									{result.hasPasskey && (
										<div className="flex items-center gap-4 my-4">
											<div className="flex-1 border-t border-slate-600"></div>
											<span className="text-sm text-gray-400">or</span>
											<div className="flex-1 border-t border-slate-600"></div>
										</div>
									)}
									<Field>
										<Button
											onClick={() =>
												router.navigate({
													to: '/login-check-email',
													search: { email: result.user?.email || '' },
												})
											}
											className="w-full"
											variant={result.hasPasskey ? 'outline' : 'default'}
										>
											Login Via Email Link
										</Button>
									</Field>
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
										Account Not Found
									</h1>
									<FieldError className="mt-4">
										{result.error ||
											'No account found with this email address. Please check your email or sign up for a new account.'}
									</FieldError>
									<Field className="mt-6">
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
							</div>
						)}
					</FieldGroup>
				</FieldSet>
			</div>
		</div>
	);
}
