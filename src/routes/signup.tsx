import { useForm } from "@tanstack/react-form";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
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
import { useToastMutation } from "@/hooks/useToastMutation";
import { requestSignupOTP } from "@/server/auth";
import { getUserWithPasskey } from "@/server/user";

// Zod schema for form validation
const signupSchema = z.object({
	name: z.string().min(3, "Name is required").max(100, "Name is too long"),
	email: z.email("Please enter a valid email address"),
});

export const Route = createFileRoute("/signup")({
	beforeLoad: async () => {
		// Check if user is already logged in
		try {
			await getUserWithPasskey({});
			// User is logged in, redirect to user settings
			throw redirect({
				to: "/user-settings",
			});
		} catch (error) {
			// If it's a redirect, re-throw it
			if (error && typeof error === "object" && "to" in error) {
				throw error;
			}
			// Otherwise, user is not logged in, continue to signup page
		}
	},
	component: SignupPage,
});

function SignupPage() {
	const navigate = useNavigate();
	const requestSignupOTPFn = useServerFn(requestSignupOTP);
	const [formError, setFormError] = useState<string>();

	const signupMutation = useToastMutation({
		action: "Request signup code",
		toastSuccess: false, // Don't show toast since we're navigating
		mutationFn: async (variables: { name: string; email: string }) => {
			const result = await requestSignupOTPFn({ data: variables });
			console.log("Signup mutation result:", result);
			return result;
		},
		onSuccess: async (result) => {
			console.log("Signup onSuccess called with:", result);
			// Navigate to OTP verification page with token
			const token = result?.token;
			if (!token) {
				console.error("No token found in result:", result);
				setFormError("Failed to get verification token. Please try again.");
				return;
			}
			
			try {
				console.log("Navigating to signup token page with token:", token);
				await navigate({
					to: "/signup/$signupToken",
					params: { signupToken: token },
				});
			} catch (error) {
				console.error("Navigation error:", error);
				setFormError("Failed to navigate to verification page. Please try again.");
			}
		},
		onError: (error) => {
			console.error("Signup mutation error:", error);
		},
		setFormError,
	});

	const form = useForm({
		defaultValues: {
			name: "",
			email: "",
		},
		validators: {
			onChange: signupSchema,
		},
		onSubmit: async ({ value }) => {
			await signupMutation.mutateAsync(value);
		},
	});

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
			<div className="w-full max-w-md">
				<FieldSet className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
					<FieldGroup>
						<div className="mb-4">
							<h1 className="text-3xl font-bold text-white mb-2">
								Create Account
							</h1>
							<p className="text-gray-400">
								Enter your information to get started
							</p>
						</div>

						<form
							onSubmit={(e) => {
								e.preventDefault();
								e.stopPropagation();
								form.handleSubmit();
							}}
						>
							<FieldGroup>
								<form.Field name="name">
									{(field) => (
										<Field data-invalid={field.state.meta.errors.length > 0}>
											<FieldLabel htmlFor={field.name}>Name</FieldLabel>
											<Input
												id={field.name}
												name={field.name}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={field.state.meta.errors.length > 0}
												placeholder="John Doe"
											/>
											{field.state.meta.errors.length > 0 && (
												<FieldError>{field.state.meta.errors[0]?.message}</FieldError>
											)}
										</Field>
									)}
								</form.Field>

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
												We'll send you a verification code to this email address
											</FieldDescription>
											{field.state.meta.errors.length > 0 && (
												<FieldError>{field.state.meta.errors[0]?.message}</FieldError>
											)}
										</Field>
									)}
								</form.Field>

								{formError && <FieldError>{formError}</FieldError>}

								<Field>
									<Button
										type="submit"
										disabled={form.state.isSubmitting || signupMutation.isPending}
										className="w-full"
									>
										{form.state.isSubmitting || signupMutation.isPending ? "Sending Code..." : "Sign Up"}
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
