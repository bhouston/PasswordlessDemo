import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldSet } from "@/components/ui/field";
import { initiatePasskeyLogin } from "@/server/passkey";
import { getUserByEmail, userHasPasskey } from "@/server/user";

// Zod schema for search params validation
const loginVerificationSearchSchema = z.object({
	email: z.string().email("Please provide a valid email address"),
});

export const Route = createFileRoute("/login-verification")({
	validateSearch: loginVerificationSearchSchema,
	loaderDeps: ({ search }) => ({ email: search.email }),
	loader: async ({ deps }) => {
		try {
			const user = await getUserByEmail({ data: { email: deps.email } });

			if (!user) {
				return {
					success: false,
					error: "No account found with this email address",
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
						: "An error occurred while checking your account",
			};
		}
	},
	component: LoginVerificationPage,
});

function LoginVerificationPage() {
	const router = useRouter();
	const result = Route.useLoaderData();
	const initiatePasskeyLoginFn = useServerFn(initiatePasskeyLogin);

	// Mutation for initiating passkey login
	const passkeyLoginMutation = useMutation({
		mutationFn: async (email: string) => {
			const response = await initiatePasskeyLoginFn({
				data: { email },
			});

			if (!response.success) {
				throw new Error(response.error || "Failed to initiate passkey login");
			}

			return response;
		},
		onSuccess: async (response) => {
			// Redirect to token-based route
			await router.navigate({
				to: "/login-passkey/$passkeyToken",
				params: { passkeyToken: response.token },
			});
		},
	});

	const handlePasskeyLogin = () => {
		if (!result.success || !result.user) {
			return;
		}

		passkeyLoginMutation.mutate(result.user.email);
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
										Select how you'd like to verify your account
									</p>
									{result.user && (
										<div className="mt-4 p-4 bg-slate-700/50 rounded-lg">
											<p className="text-sm text-gray-300">
												<strong>Email:</strong> {result.user.email}
											</p>
										</div>
									)}
								</div>

								{passkeyLoginMutation.isError && (
									<FieldError className="mb-4">
										{passkeyLoginMutation.error instanceof Error
											? passkeyLoginMutation.error.message
											: "Failed to initiate passkey login. Please try again."}
									</FieldError>
								)}

								<div className="space-y-4">
									{result.hasPasskey && (
										<Field>
											<Button
												onClick={handlePasskeyLogin}
												disabled={passkeyLoginMutation.isPending}
												className="w-full"
											>
												{passkeyLoginMutation.isPending
													? "Preparing passkey login..."
													: "Login with Passkey"}
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
											onClick={async () =>
												await router.navigate({
													to: "/login-check-email",
													search: { email: result.user?.email || "" },
												})
											}
											className="w-full"
											variant={result.hasPasskey ? "outline" : "default"}
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
											"No account found with this email address. Please check your email or sign up for a new account."}
									</FieldError>
									<Field className="mt-6">
										<Button
											onClick={async () =>
												await router.navigate({ to: "/login" })
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
