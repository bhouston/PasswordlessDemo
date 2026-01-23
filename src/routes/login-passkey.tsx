import { startAuthentication } from "@simplewebauthn/browser";
import { useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { useToastMutation } from "@/hooks/useToastMutation";
import { useSessionUser } from "@/hooks/useSessionUser";
import { redirectToSchema } from "@/lib/schemas";
import {
	initiatePasskeyDiscovery,
	verifyAuthenticationResponse,
} from "@/server/passkey";

export const Route = createFileRoute("/login-passkey")({
	validateSearch: redirectToSchema,
	component: LoginPasskeyPage,
});

function LoginPasskeyPage() {
	const { redirectTo = "/" } = Route.useSearch();
	const router = useRouter();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { sessionUser } = useSessionUser();
	const generateAuthOptions = useServerFn(initiatePasskeyDiscovery);
	const verifyAuthResponseFn = useServerFn(verifyAuthenticationResponse);
	const [error, setError] = useState<string>();
	const [isAuthenticating, setIsAuthenticating] = useState(false);
	const hasAttemptedRef = useRef(false);

	// Check if WebAuthn is supported
	const isWebAuthnSupported =
		typeof window !== "undefined" && "PublicKeyCredential" in window;

	const passkeyLoginMutation = useToastMutation({
		action: "Passkey Login",
		toastSuccess: false, // Don't show toast, we'll redirect immediately
		mutationFn: async () => {
			try {
				setIsAuthenticating(true);
				// Generate authentication options (discovery mode)
				const result = await generateAuthOptions({});

				if (!result.success || !result.options || !result.token) {
					throw new Error(result.error || "Failed to generate authentication options");
				}

				// Start WebAuthn authentication
				const authenticationResponse = await startAuthentication({
					optionsJSON: result.options,
				});

				// Verify authentication on server
				const verification = await verifyAuthResponseFn({
					data: {
						response: authenticationResponse,
						token: result.token,
					},
				});

				if (!verification.success) {
					throw new Error(verification.error || "Authentication failed");
				}

				return verification;
			} catch (err) {
				setIsAuthenticating(false);
				// Transform WebAuthn-specific errors to user-friendly messages
				if (err instanceof Error) {
					if (err.name === "NotAllowedError") {
						throw new Error(
							"Authentication was cancelled or not allowed by your device.",
						);
					}
					if (err.name === "InvalidStateError") {
						throw new Error("No passkey found. Please use email link to log in.");
					}
					if (err.name === "NotSupportedError") {
						throw new Error(
							"Passkeys are not supported in this browser. Please use a modern browser.",
						);
					}
					// Handle user cancellation gracefully
					if (
						err.message.includes("cancelled") ||
						err.message.includes("abort")
					) {
						throw new Error("Authentication cancelled");
					}
				}
				// Re-throw other errors as-is
				throw err;
			}
		},
		onSuccess: async () => {
			// Success - session is updated by server function
			await queryClient.invalidateQueries();
			await router.invalidate();
			await navigate({
				to: redirectTo,
				reloadDocument: true,
			});
		},
		onError: (err) => {
			setIsAuthenticating(false);
			setError(
				err instanceof Error
					? err.message
					: "An error occurred during passkey authentication.",
			);
		},
	});

	// Automatically trigger passkey login on mount
	useEffect(() => {
		// Prevent multiple attempts
		if (hasAttemptedRef.current) return;

		// If user is already logged in, redirect
		if (sessionUser) {
			void navigate({ to: redirectTo });
			return;
		}

		// Check WebAuthn support
		if (!isWebAuthnSupported) {
			setError(
				"Passkeys are not supported in this browser. Please use a modern browser.",
			);
			hasAttemptedRef.current = true;
			return;
		}

		// Trigger passkey authentication
		hasAttemptedRef.current = true;
		void passkeyLoginMutation.mutateAsync();
	}, [sessionUser, isWebAuthnSupported, redirectTo, navigate, passkeyLoginMutation]);

	// Redirect if already logged in
	if (sessionUser) {
		return null; // Will redirect in useEffect
	}

	// Show error if WebAuthn not supported
	if (!isWebAuthnSupported) {
		return (
			<AuthLayout title="Passkey Not Supported">
				<div className="space-y-4">
					<p className="text-center text-gray-400">
						Passkeys are not supported in this browser. Please use a modern browser
						or sign in with email link.
					</p>
					<div className="flex flex-col gap-2">
						<Button asChild={true} className="w-full">
							<Link search={{ redirectTo }} to="/login">
								Back to Login
							</Link>
						</Button>
					</div>
				</div>
			</AuthLayout>
		);
	}

	// Show error state
	if (error) {
		return (
			<AuthLayout title="Passkey Login Failed">
				<div className="space-y-4">
					<p className="text-center text-gray-400">{error}</p>
					<div className="flex flex-col gap-2">
						<Button asChild={true} className="w-full" variant="outline">
							<Link search={{ redirectTo }} to="/login">
								Back to Login
							</Link>
						</Button>
					</div>
				</div>
			</AuthLayout>
		);
	}

	// Show loading state
	return (
		<AuthLayout title="Signing In...">
			<div className="space-y-4">
				<p className="text-center text-gray-400">
					{isAuthenticating
						? "Please use your passkey to sign in..."
						: "Preparing passkey authentication..."}
				</p>
			</div>
		</AuthLayout>
	);
}
