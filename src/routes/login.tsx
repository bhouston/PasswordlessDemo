import { useForm } from "@tanstack/react-form";
import { createFileRoute, useRouter } from "@tanstack/react-router";
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
	FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { checkUserExists } from "@/server/auth";

// Zod schema for form validation
const loginSchema = z.object({
	email: z.email("Please enter a valid email address"),
});

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

function LoginPage() {
	const router = useRouter();
	const [submitError, setSubmitError] = useState<string | null>(null);
	const checkUserExistsFn = useServerFn(checkUserExists);

	const form = useForm({
		defaultValues: {
			email: "",
		},
		validators: {
			onChange: loginSchema,
		},
		onSubmit: async ({ value }) => {
			setSubmitError(null);
			try {
				await checkUserExistsFn({ data: value });
				// Navigate to verification page with email as search param
				await router.navigate({
					to: "/login-verification",
					search: { email: value.email },
				});
			} catch (error) {
				setSubmitError(
					error instanceof Error
						? error.message
						: "An error occurred. Please try again.",
				);
			}
		},
	});

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
			<div className="w-full max-w-md">
				<FieldSet className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
					<FieldGroup>
						<div className="mb-4">
							<h1 className="text-3xl font-bold text-white mb-2">Login</h1>
							<p className="text-gray-400">Enter your email to continue</p>
						</div>

						<form
							onSubmit={(e) => {
								e.preventDefault();
								e.stopPropagation();
								form.handleSubmit();
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
												We'll send you a login link to this email address
											</FieldDescription>
											{field.state.meta.errors.length > 0 && (
												<FieldError>{field.state.meta.errors[0]}</FieldError>
											)}
										</Field>
									)}
								</form.Field>

								{submitError && <FieldError>{submitError}</FieldError>}

								<Field>
									<Button
										type="submit"
										disabled={
											form.state.isSubmitting || !form.state.isFormValid
										}
										className="w-full"
									>
										{form.state.isSubmitting ? "Checking..." : "Next"}
									</Button>
								</Field>
							</FieldGroup>
						</form>
					</FieldGroup>
				</FieldSet>
			</div>
		</div>
	);
}
