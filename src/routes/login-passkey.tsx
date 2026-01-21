import { createFileRoute, useRouter, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { z } from 'zod';
import { startAuthentication } from '@simplewebauthn/browser';
import {
	generateAuthenticationOptions,
	verifyAuthenticationResponse,
} from '@/lib/passkey';
import { setAuthCookie } from '@/lib/auth';
import { db } from '@/db';
import { users, passkeys } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
	FieldSet,
	FieldGroup,
	FieldError,
	Field,
} from '@/components/ui/field';
import { Button } from '@/components/ui/button';

// Zod schema for search params validation
const loginPasskeySearchSchema = z.object({
	email: z.string().email('Please provide a valid email address'),
});

// Server function to initiate passkey login
const initiatePasskeyLogin = createServerFn({ method: 'POST' })
	.inputValidator((data: { userId: number }) => {
		if (!data.userId || typeof data.userId !== 'number') {
			throw new Error('Invalid user ID');
		}
		return data;
	})
	.handler(async ({ data }) => {
		const options = await generateAuthenticationOptions(data.userId);
		if (!options) {
			throw new Error('No passkey found for this user');
		}
		return options;
	});

// Server function to verify passkey login
const verifyPasskeyLogin = createServerFn({ method: 'POST' })
	.inputValidator((data: { response: unknown; userId: number }) => {
		if (!data.userId || typeof data.userId !== 'number') {
			throw new Error('Invalid user ID');
		}
		if (!data.response) {
			throw new Error('Invalid response');
		}
		return data;
	})
	.handler(async ({ data }) => {
		const verification = await verifyAuthenticationResponse(
			data.response,
			data.userId,
		);

		if (!verification.success) {
			throw new Error(verification.error || 'Authentication failed');
		}

		// Set authentication cookie
		setAuthCookie(data.userId);

		return { success: true };
	});

export const Route = createFileRoute('/login-passkey')({
	validateSearch: loginPasskeySearchSchema,
	loaderDeps: ({ search }) => ({ email: search.email }),
	loader: async ({ deps }) => {
		try {
			const user = await db
				.select()
				.from(users)
				.where(eq(users.email, deps.email))
				.limit(1);

			if (user.length === 0) {
				throw redirect({
					to: '/login-verification',
					search: { email: deps.email },
				});
			}

			// Check if user has a passkey
			const userPasskey = await db
				.select()
				.from(passkeys)
				.where(eq(passkeys.userId, user[0].id))
				.limit(1);

			if (userPasskey.length === 0) {
				// Redirect back to verification page if no passkey
				throw redirect({
					to: '/login-verification',
					search: { email: deps.email },
				});
			}

			return {
				success: true,
				user: user[0],
			};
		} catch (error) {
			// Re-throw redirects
			if (error && typeof error === 'object' && 'to' in error) {
				throw error;
			}
			throw redirect({
				to: '/login-verification',
				search: { email: deps.email },
			});
		}
	},
	component: LoginPasskeyPage,
});

function LoginPasskeyPage() {
	const router = useRouter();
	const result = Route.useLoaderData();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handlePasskeyLogin = async () => {
		if (!result.success || !result.user) {
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			// Get authentication options from server
			const options = await initiatePasskeyLogin({
				data: { userId: result.user.id },
			});

			// Start authentication on client
			const authenticationResponse = await startAuthentication({
				optionsJSON: options,
			});

			// Verify authentication on server
			await verifyPasskeyLogin({
				data: {
					response: authenticationResponse,
					userId: result.user.id,
				},
			});

			// Redirect to user settings on success
			router.navigate({ to: '/user-settings' });
		} catch (err) {
			if (err instanceof Error) {
				// Handle user cancellation gracefully
				if (
					err.message.includes('cancelled') ||
					err.message.includes('abort') ||
					err.message.includes('NotAllowedError')
				) {
					setError('Authentication cancelled');
				} else if (err.message.includes('NotSupportedError')) {
					setError('Passkeys are not supported on this device or browser');
				} else {
					setError(err.message || 'Failed to authenticate with passkey');
				}
			} else {
				setError('Failed to authenticate with passkey. Please try again.');
			}
		} finally {
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
									<div className="mx-auto w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mb-4">
										<svg
											className="w-8 h-8 text-blue-400"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M12 15v2m-6 4h12a2 2 2 0 002-2v-6a2 2 2 0 00-2-2H6a2 2 2 0 00-2 2v6a2 2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
											/>
										</svg>
									</div>
									<h1 className="text-3xl font-bold text-white mb-2">
										Login with Passkey
									</h1>
									<p className="text-gray-400 mb-4">
										Use your passkey to securely log in
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
									<Field>
										<Button
											onClick={handlePasskeyLogin}
											disabled={isLoading}
											className="w-full"
										>
											{isLoading
												? 'Authenticating...'
												: 'Authenticate with Passkey'}
										</Button>
									</Field>

									<div className="flex items-center gap-4 my-4">
										<div className="flex-1 border-t border-slate-600"></div>
										<span className="text-sm text-gray-400">or</span>
										<div className="flex-1 border-t border-slate-600"></div>
									</div>

									<Field>
										<Button
											onClick={() =>
												router.navigate({
													to: '/login-verification',
													search: { email: result.user?.email || '' },
												})
											}
											className="w-full"
											variant="outline"
										>
											Use Email Link Instead
										</Button>
									</Field>
								</div>
							</div>
						) : (
							<div className="text-center">
								<FieldError>
									Unable to load passkey login. Please try again.
								</FieldError>
								<Field className="mt-6">
									<Button
										onClick={() =>
											router.navigate({ to: '/login' })
										}
										className="w-full"
									>
										Back to Login
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
