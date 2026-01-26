import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "@/components/ui/input-otp";
import { InvalidLink } from "@/components/auth/InvalidLink";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { useToastMutation } from "@/hooks/useToastMutation";
import { redirectToSchema } from "@/lib/schemas";
import { verifyLoginCodeAndAuthenticate } from "@/server/auth";
import { verifyCodeVerificationToken } from "@/server/jwt";

export const Route = createFileRoute("/login-via-code/$codeVerificationToken")(
	{
		validateSearch: redirectToSchema,
		beforeLoad: async ({ params }) => {
			try {
				// Verify token exists and is valid format (but don't authenticate yet)
				await verifyCodeVerificationToken(params.codeVerificationToken);
				return { tokenValid: true };
			} catch (error) {
				const errorMessage =
					error instanceof Error
						? error.message
						: "Invalid or expired verification token.";
				return { tokenValid: false, error: errorMessage };
			}
		},
		loader: async ({ context: { tokenValid, error } }) => ({
			tokenValid,
			error,
		}),
		component: LoginViaCodePage,
	},
);

function LoginViaCodePage() {
	const { tokenValid, error } = Route.useLoaderData();
	const { codeVerificationToken } = Route.useParams();
	const { redirectTo = "/" } = Route.useSearch();
	const router = useRouter();
	const navigate = useNavigate();
	const [formError, setFormError] = useState<string>();
	const verifyCodeFn = useServerFn(verifyLoginCodeAndAuthenticate);

		const verifyCodeMutation = useToastMutation({
		action: "Verify login code",
		mutationFn: async (variables: { code: string }) => {
			const result = await verifyCodeFn({
				data: {
					token: codeVerificationToken,
					code: variables.code.toUpperCase(),
				},
			});
			return result;
		},
		onSuccess: async () => {
			// Success - session is updated by server function
			await router.invalidate();
			await navigate({
				to: redirectTo,
				reloadDocument: true,
			});
		},
		setFormError,
	});

	const form = useForm({
		defaultValues: {
			code: "",
		},
		validators: {
			onChange: z.object({
				code: z.string().length(8, "Code must be 8 characters").regex(/^[A-Z0-9]{8}$/, "Code must be alphanumeric (A-Z, 0-9)"),
			}),
		},
		onSubmit: async ({ value }) => {
			await verifyCodeMutation.mutateAsync({ code: value.code.toUpperCase() });
		},
	});

	if (!tokenValid) {
		return (
			<InvalidLink
				message={
					error ||
					"This verification token is invalid or has expired. Please request a new code."
				}
				title="Invalid Verification Token"
			/>
		);
	}

	return (
		<AuthLayout title="Enter Verification Code">
			<form
				onSubmit={async (e) => {
					e.preventDefault();
					e.stopPropagation();
					await form.handleSubmit();
				}}
			>
				<FieldGroup>
					<form.Field name="code">
						{(field) => (
							<Field data-invalid={field.state.meta.errors.length > 0}>
								<FieldLabel htmlFor={field.name}>
									Enter the 8-character code sent to your email
								</FieldLabel>
								<InputOTP
									maxLength={8}
									value={field.state.value.toUpperCase()}
									onChange={(value) => field.handleChange(value.toUpperCase())}
									disabled={verifyCodeMutation.isPending}
								>
									<InputOTPGroup>
										<InputOTPSlot index={0} />
										<InputOTPSlot index={1} />
										<InputOTPSlot index={2} />
										<InputOTPSlot index={3} />
										<InputOTPSlot index={4} />
										<InputOTPSlot index={5} />
										<InputOTPSlot index={6} />
										<InputOTPSlot index={7} />
									</InputOTPGroup>
								</InputOTP>
								{field.state.meta.errors.length > 0 && (
									<FieldError>{field.state.meta.errors[0]}</FieldError>
								)}
							</Field>
						)}
					</form.Field>

					{formError && <FieldError>{formError}</FieldError>}

					<form.Subscribe
						selector={(state) => [state.canSubmit, state.isSubmitting]}
					>
						{([canSubmit, isSubmitting]) => (
							<Field>
								<Button
									type="submit"
									disabled={!canSubmit || isSubmitting}
									className="w-full"
								>
									{isSubmitting ? "Verifying Code..." : "Verify Code"}
								</Button>
							</Field>
						)}
					</form.Subscribe>
				</FieldGroup>
			</form>
		</AuthLayout>
	);
}
