import { createFileRoute, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { z } from 'zod';
import { signLoginLinkToken } from '@/lib/jwt';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
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

// Server function to generate login link token
const generateLoginLink = createServerFn({ method: 'POST' })
	.inputValidator((data: { userId: number }) => {
		if (!data.userId || typeof data.userId !== 'number') {
			throw new Error('Invalid user ID');
		}
		return data;
	})
	.handler(async ({ data }) => {
		// Verify user exists
		const user = await db
			.select()
			.from(users)
			.where(eq(users.id, data.userId))
			.limit(1);

		if (user.length === 0) {
			throw new Error('User not found');
		}

		// Generate JWT token
		const token = await signLoginLinkToken(data.userId);

		// Build verification URL
		const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
		const loginUrl = `${baseUrl}/login-via-link/${token}`;

		// Log the URL to console (instead of sending email)
		console.log('\n=== Login Link ===');
		console.log(`Email: ${user[0].email}`);
		console.log(`Login URL: ${loginUrl}`);
		console.log('==================\n');

		return { success: true };
	});

export const Route = createFileRoute('/login-verification')({
	validateSearch: loginVerificationSearchSchema,
	loaderDeps: ({ search }) => ({ email: search.email }),
	loader: async ({ deps }) => {
		try {
			const user = await db
				.select()
				.from(users)
				.where(eq(users.email, deps.email))
				.limit(1);

			if (user.length === 0) {
				return {
					success: false,
					error: 'No account found with this email address',
				};
			}

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
						: 'An error occurred while checking your account',
			};
		}
	},
	component: LoginVerificationPage,
});

function LoginVerificationPage() {
	const router = useRouter();
	const result = Route.useLoaderData();
	const [isGenerating, setIsGenerating] = useState(false);
	const [linkSent, setLinkSent] = useState(false);

	const handleGenerateLink = async () => {
		if (!result.success || !result.user) {
			return;
		}

		setIsGenerating(true);
		try {
			await generateLoginLink({ data: { userId: result.user.id } });
			setLinkSent(true);
		} catch (error) {
			console.error('Failed to generate login link:', error);
		} finally {
			setIsGenerating(false);
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

								{linkSent ? (
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
									<div className="space-y-4">
										<Field>
											<Button
												onClick={handleGenerateLink}
												disabled={isGenerating}
												className="w-full"
											>
												{isGenerating
													? 'Generating Link...'
													: 'Login Via Email Link'}
											</Button>
										</Field>
									</div>
								)}
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
