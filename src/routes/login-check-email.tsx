import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { getUserByEmail } from '@/server/user';
import { generateLoginLink } from '@/server/auth';
import { FieldSet, FieldGroup, Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';

// Zod schema for search params validation
const loginCheckEmailSearchSchema = z.object({
	email: z.string().email('Please provide a valid email address'),
});

export const Route = createFileRoute('/login-check-email')({
	validateSearch: loginCheckEmailSearchSchema,
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

			return {
				success: true,
				user,
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
	component: LoginCheckEmailPage,
});

function LoginCheckEmailPage() {
	const router = useRouter();
	const result = Route.useLoaderData();
	const generateLoginLinkFn = useServerFn(generateLoginLink);
	const hasAttemptedSend = useRef(false);

	// Auto-send login link on page load using useMutation
	const sendLoginLinkMutation = useMutation({
		mutationFn: async (userId: number) => {
			return await generateLoginLinkFn({ data: { userId } });
		},
	});

	// Auto-trigger mutation when component mounts and conditions are met
	useEffect(() => {
		if (
			result.success &&
			result.user &&
			!hasAttemptedSend.current &&
			!sendLoginLinkMutation.isPending
		) {
			hasAttemptedSend.current = true;
			sendLoginLinkMutation.mutate(result.user.id);
		}
	}, [result.success, result.user, sendLoginLinkMutation]);

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
			<div className="w-full max-w-md">
				<FieldSet className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
					<FieldGroup>
						{result.success ? (
							<div className="text-center">
								<div className="mb-6">
									<div className="mx-auto w-16 h-16 bg-cyan-500/20 rounded-full flex items-center justify-center mb-4">
										<svg
											className="w-8 h-8 text-cyan-400"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
											/>
										</svg>
									</div>
									<h1 className="text-3xl font-bold text-white mb-2">
										Check Your Email
									</h1>
									<p className="text-gray-400 mb-4">
										We've sent a login link to your email
										address. Please check your inbox and click
										the link to log in.
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

								{sendLoginLinkMutation.isSuccess && (
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
										<p className="text-gray-300 mb-4">
											Login link has been generated! Check
											the console for the URL.
										</p>
									</div>
								)}

								<div className="mt-6 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
									<p className="text-sm text-gray-300 mb-2">
										<strong>Development Mode:</strong>
									</p>
									<p className="text-xs text-gray-400">
										The login URL has been logged to the
										console. Check your server console to see the
										login link.
									</p>
								</div>

								<Field className="mt-6">
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
										Account Not Found
									</h1>
									<p className="text-gray-400 mt-4">
										{result.error ||
											'No account found with this email address. Please check your email or sign up for a new account.'}
									</p>
								</div>
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
						)}
					</FieldGroup>
				</FieldSet>
			</div>
		</div>
	);
}
