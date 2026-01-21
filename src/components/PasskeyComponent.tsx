import { startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldSet } from "@/components/ui/field";
import {
	deletePasskey,
	generateRegistrationOptions,
	verifyRegistrationResponse,
} from "@/server/passkey";

interface PasskeyComponentProps {
	userId: number;
	hasPasskey: boolean;
	userName: string;
	userDisplayName: string;
}

export function PasskeyComponent({
	userId,
	hasPasskey,
	userName,
	userDisplayName,
}: PasskeyComponentProps) {
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);
	const generateRegistrationOptionsFn = useServerFn(
		generateRegistrationOptions,
	);
	const verifyRegistrationResponseFn = useServerFn(verifyRegistrationResponse);
	const deletePasskeyFn = useServerFn(deletePasskey);

	const handleAddPasskey = async () => {
		setIsLoading(true);
		setError(null);
		setSuccessMessage(null);

		try {
			// Generate registration options from server
			const result = await generateRegistrationOptionsFn({
				data: {
					userId,
					userName,
					userDisplayName,
				},
			});

			if (!result.options || !result.token) {
				throw new Error("Failed to generate registration options");
			}

			// Start registration on client
			const registrationResponse = await startRegistration({
				optionsJSON: result.options,
			});

			// Verify registration on server
			const verification = await verifyRegistrationResponseFn({
				data: {
					response: registrationResponse,
					userId,
					token: result.token,
				},
			});

			if (verification.success) {
				setSuccessMessage("Passkey registered successfully!");
				// Invalidate router to refresh data
				router.invalidate();
			} else {
				setError(verification.error || "Failed to register passkey");
			}
		} catch (err) {
			if (err instanceof Error) {
				// Handle user cancellation gracefully
				if (
					err.message.includes("cancelled") ||
					err.message.includes("abort") ||
					err.message.includes("NotAllowedError")
				) {
					setError("Registration cancelled");
				} else if (err.message.includes("NotSupportedError")) {
					setError("Passkeys are not supported on this device or browser");
				} else {
					setError(err.message || "Failed to register passkey");
				}
			} else {
				setError("Failed to register passkey. Please try again.");
			}
		} finally {
			setIsLoading(false);
		}
	};

	const handleDeletePasskey = async () => {
		if (
			!confirm(
				"Are you sure you want to delete your passkey? You will need to register a new one to use passkey login.",
			)
		) {
			return;
		}

		setIsLoading(true);
		setError(null);
		setSuccessMessage(null);

		try {
			await deletePasskeyFn({ data: { userId } });
			setSuccessMessage("Passkey deleted successfully!");
			// Invalidate router to refresh data
			router.invalidate();
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Failed to delete passkey. Please try again.",
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
			<div className="mb-6">
				<h2 className="text-2xl font-semibold text-white mb-2">
					Passkey Management
				</h2>
				<p className="text-gray-400 text-sm">
					Manage your passkey for secure, passwordless authentication
				</p>
			</div>

			<FieldSet>
				<FieldGroup>
					<div className="mb-4">
						<div className="p-4 bg-slate-700/50 rounded-lg">
							<p className="text-sm text-gray-300">
								<strong>Status:</strong>{" "}
								{hasPasskey ? (
									<span className="text-green-400">Passkey registered</span>
								) : (
									<span className="text-yellow-400">No passkey registered</span>
								)}
							</p>
							{hasPasskey && (
								<p className="text-xs text-gray-400 mt-2">
									You can use your passkey to log in securely without a
									password.
								</p>
							)}
						</div>
					</div>

					{error && <FieldError className="mb-4">{error}</FieldError>}

					{successMessage && (
						<div className="p-4 bg-green-500/20 border border-green-500/50 rounded-lg mb-4">
							<p className="text-green-400 text-sm">{successMessage}</p>
						</div>
					)}

					<Field>
						{hasPasskey ? (
							<Button
								onClick={handleDeletePasskey}
								disabled={isLoading}
								variant="destructive"
							>
								{isLoading ? "Deleting..." : "Delete Passkey"}
							</Button>
						) : (
							<Button onClick={handleAddPasskey} disabled={isLoading}>
								{isLoading ? "Registering..." : "Add Passkey"}
							</Button>
						)}
					</Field>
				</FieldGroup>
			</FieldSet>
		</div>
	);
}
