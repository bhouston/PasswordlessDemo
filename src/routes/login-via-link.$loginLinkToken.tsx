import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { InvalidLink } from "@/components/auth/InvalidLink";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { redirectToSchema } from "@/lib/schemas";
import { verifyLoginLinkTokenAndAuthenticate } from "@/server/auth";

export const Route = createFileRoute("/login-via-link/$loginLinkToken")({
	validateSearch: redirectToSchema,
	beforeLoad: async ({ params }) => {
		try {
			// Call the server function to validate token and perform login
			// This will set the session cookie if successful
			const result = await verifyLoginLinkTokenAndAuthenticate({
				data: { token: params.loginLinkToken },
			});

			if (!result.success) {
				return { loginSuccess: false, error: result.error };
			}

			return { loginSuccess: true };
		} catch (error) {
			// Login failed - return failure status
			const errorMessage =
				error instanceof Error
					? error.message
					: "Login failed. The link may be invalid or expired.";
			return { loginSuccess: false, error: errorMessage };
		}
	},
	loader: async ({ context: { loginSuccess, error } }) => ({
		loginSuccess,
		error,
	}),
	component: LoginViaLinkPage,
});

function LoginViaLinkPage() {
	const { loginSuccess, error } = Route.useLoaderData();
	const { redirectTo = "/" } = Route.useSearch();
	const router = useRouter();
	const navigate = useNavigate();

	// Redirect to redirectTo (or home) if login was successful
	useEffect(() => {
		if (loginSuccess) {
			let cancelled = false;
			void (async () => {
				await router.invalidate();
				if (!cancelled) {
					await navigate({ to: redirectTo, reloadDocument: true });
				}
			})();
			return () => {
				cancelled = true;
			};
		}
	}, [loginSuccess, router, navigate, redirectTo]);

	if (!loginSuccess) {
		return (
			<InvalidLink
				message={
					error ||
					"This login link is invalid, has already been used, or has expired. Please request a new link."
				}
				title="Invalid Login Link"
			/>
		);
	}

	return (
		<AuthLayout title="Signing In...">
			<div className="space-y-4">
				<p className="text-center text-gray-400">
					Please wait while we sign you in...
				</p>
			</div>
		</AuthLayout>
	);
}
