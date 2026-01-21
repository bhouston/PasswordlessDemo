import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useForm } from '@tanstack/react-form';
import { z } from 'zod';
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { signup } from '@/server/auth';

// Zod schema for form validation
const signupSchema = z.object({
	name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
	email: z.string().email('Please enter a valid email address'),
});

type SignupFormData = z.infer<typeof signupSchema>;

export const Route = createFileRoute('/signup')({
	component: SignupPage,
});

function SignupPage() {
	const router = useRouter();
	const signupFn = useServerFn(signup);

	const form = useForm<SignupFormData>({
		defaultValues: {
			name: '',
			email: '',
		},
		validators: {
			onChange: signupSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				await signupFn({ data: value });
				// Navigate to check-email page on success
				router.navigate({ to: '/signup-check-email' });
			} catch (error) {
				// Error will be handled by form state
				throw error;
			}
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
										<Field
											data-invalid={
												field.state.meta.errors.length > 0
											}
										>
											<FieldLabel htmlFor={field.name}>
												Name
											</FieldLabel>
											<Input
												id={field.name}
												name={field.name}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) =>
													field.handleChange(
														e.target.value,
													)
												}
												aria-invalid={
													field.state.meta.errors.length >
													0
												}
												placeholder="John Doe"
											/>
											{field.state.meta.errors.length >
												0 && (
												<FieldError>
													{
														field.state.meta.errors[0]
													}
												</FieldError>
											)}
										</Field>
									)}
								</form.Field>

								<form.Field name="email">
									{(field) => (
										<Field
											data-invalid={
												field.state.meta.errors.length > 0
											}
										>
											<FieldLabel htmlFor={field.name}>
												Email
											</FieldLabel>
											<Input
												id={field.name}
												name={field.name}
												type="email"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) =>
													field.handleChange(
														e.target.value,
													)
												}
												aria-invalid={
													field.state.meta.errors.length >
													0
												}
												placeholder="john@example.com"
											/>
											<FieldDescription>
												We'll send you a verification link
												to this email address
											</FieldDescription>
											{field.state.meta.errors.length >
												0 && (
												<FieldError>
													{
														field.state.meta.errors[0]
													}
												</FieldError>
											)}
										</Field>
									)}
								</form.Field>

								{form.state.submissionAttempts > 0 &&
									form.state.submissionStatus ===
										'error' && (
										<FieldError>
											{form.state.submissionError?.message ||
												'An error occurred. Please try again.'}
										</FieldError>
									)}

								<Field>
									<Button
										type="submit"
										disabled={form.state.isSubmitting}
										className="w-full"
									>
										{form.state.isSubmitting
											? 'Signing up...'
											: 'Sign Up'}
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
