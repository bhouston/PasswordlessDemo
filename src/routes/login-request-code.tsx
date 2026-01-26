import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { useToastMutation } from "@/hooks/useToastMutation";
import { redirectToSchema } from "@/lib/schemas";
import { requestLoginCode } from "@/server/auth";

// Zod schema for form validation
const loginRequestSchema = z.object({
	email: z.string().email("Please enter a valid email address"),
});

export const Route = createFileRoute("/login-request-code")({
	validateSearch: redirectToSchema,
	component: LoginRequestCodePage,
});

function LoginRequestCodePage() {
	const router = useRouter();
	const { redirectTo } = Route.useSearch();
	const [formError, setFormError] = useState<string>();
	const requestLoginCodeFn = useServerFn(requestLoginCode);

	const requestCodeMutation = useToastMutation({
		action: "Send login code email",
		mutationFn: async (variables: { email: string }) => {
			const result = await requestLoginCodeFn({ data: variables });
			return result;
		},
		onSuccess: async (result) => {
			// Always redirect to code entry page (token always returned to prevent enumeration)
			if (result.token) {
				await router.navigate({
					to: "/login-via-code/$codeVerificationToken",
					params: { codeVerificationToken: result.token },
					search: { redirectTo },
				});
			}
		},
		setFormError,
	});

	const form = useForm({
		defaultValues: {
			email: "",
		},
		validators: {
			onChange: loginRequestSchema,
		},
		onSubmit: async ({ value }) => {
			await requestCodeMutation.mutateAsync(value);
		},
	});

	return (
		<AuthLayout title="Request Login Code">
			<form
				onSubmit={async (e) => {
					e.preventDefault();
					e.stopPropagation();
					await form.handleSubmit();
				}}
			>
				<FieldGroup>
					<form.Field name="email">
						{(field) => (
							<Field data-invalid={field.state.meta.errors.length > 0}>
								<FieldLabel htmlFor={field.name}>Email</FieldLabel>
								<Input
									id={field.name}
									name={field.name}
									type="email"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={field.state.meta.errors.length > 0}
									placeholder="john@example.com"
								/>
								<FieldDescription>
									We'll send you a login code to this email address
								</FieldDescription>
								{field.state.meta.errors.length > 0 && (
									<FieldError>{field.state.meta.errors[0]?.message}</FieldError>
								)}
							</Field>
						)}
					</form.Field>

					<form.Subscribe
						selector={(state) => [
							state.canSubmit,
							state.isSubmitting,
							state.isTouched,
						]}
					>
						{([canSubmit, isSubmitting, isTouched]) => (
							<Field>
								<Button
									type="submit"
									disabled={!canSubmit || isSubmitting || !isTouched}
									className="w-full"
								>
									{isSubmitting ? "Sending Login Code..." : "Send Login Code"}
								</Button>
							</Field>
						)}
					</form.Subscribe>

					{formError && <FieldError>{formError}</FieldError>}

					<div className="text-center text-sm">
						<Link
							className="text-blue-400 hover:text-blue-300"
							search={redirectTo ? { redirectTo } : undefined}
							to="/login"
						>
							Back to Login
						</Link>
					</div>
				</FieldGroup>
			</form>
		</AuthLayout>
	);
}
