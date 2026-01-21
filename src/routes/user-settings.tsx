import { createFileRoute, redirect } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { z } from 'zod';
import { getUserWithPasskey, updateUserName } from '@/server/user';
import { PasskeyComponent } from '@/components/PasskeyComponent';
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

// Zod schema for form validation
const userDetailsSchema = z.object({
	name: z.string().min(1, 'Name is required'),
});

type UserDetailsFormData = z.infer<typeof userDetailsSchema>;

export const Route = createFileRoute('/user-settings')({
	loader: async () => {
		try {
			// Call server function directly - it can be invoked from loaders
			// Server functions are called with an object, even if empty
			const result = await getUserWithPasskey({});
			return result;
		} catch (error) {
			// If user is not authenticated, redirect to login
			throw redirect({
				to: '/login',
			});
		}
	},
	component: UserSettingsPage,
});

function UserSettingsPage() {
	const { user, hasPasskey } = Route.useLoaderData();
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);
	const updateUserNameFn = useServerFn(updateUserName);

	const form = useForm<UserDetailsFormData>({
		defaultValues: {
			name: user.name,
		},
		validators: {
			onChange: userDetailsSchema,
		},
		onSubmit: async ({ value }) => {
			setSubmitError(null);
			setSuccessMessage(null);
			try {
				const result = await updateUserNameFn({ data: value });
				if (result.success) {
					setSuccessMessage('User details saved successfully!');
					// Update form default values to reflect the saved state
					form.setFieldValue('name', result.user.name);
				}
			} catch (error) {
				setSubmitError(
					error instanceof Error
						? error.message
						: 'An error occurred. Please try again.',
				);
			}
		},
	});

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
			<div className="max-w-4xl mx-auto py-8">
				<div className="mb-8">
					<h1 className="text-4xl font-bold text-white mb-2">
						User Settings
					</h1>
					<p className="text-gray-400">
						Manage your account settings and preferences
					</p>
				</div>

				<div className="space-y-6">
					{/* User Details Card */}
					<div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
						<div className="mb-6">
							<h2 className="text-2xl font-semibold text-white mb-2">
								User Details
							</h2>
							<p className="text-gray-400 text-sm">
								Update your personal information
							</p>
						</div>

						<FieldSet>
							<FieldGroup>
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
														field.state.meta.errors.length >
														0
													}
												>
													<FieldLabel htmlFor={field.name}>
														Name
													</FieldLabel>
													<Input
														id={field.name}
														name={field.name}
														type="text"
														value={field.state.value}
														onBlur={field.handleBlur}
														onChange={(e) =>
															field.handleChange(
																e.target.value,
															)
														}
														aria-invalid={
															field.state.meta
																.errors.length >
															0
														}
														placeholder="Your name"
													/>
													<FieldDescription>
														Your display name
													</FieldDescription>
													{field.state.meta.errors.length >
														0 && (
														<FieldError>
															{
																field.state.meta
																	.errors[0]
															}
														</FieldError>
													)}
												</Field>
											)}
										</form.Field>

										{submitError && (
											<FieldError>{submitError}</FieldError>
										)}

										{successMessage && (
											<div className="p-4 bg-green-500/20 border border-green-500/50 rounded-lg">
												<p className="text-green-400 text-sm">
													{successMessage}
												</p>
											</div>
										)}

										<Field>
											<Button
												type="submit"
												disabled={
													form.state.isSubmitting ||
													!form.state.isFormValid
												}
											>
												{form.state.isSubmitting
													? 'Saving...'
													: 'Save'}
											</Button>
										</Field>
									</FieldGroup>
								</form>
							</FieldGroup>
						</FieldSet>
					</div>

					{/* Passkey Management Card */}
					<PasskeyComponent
						userId={user.id}
						hasPasskey={hasPasskey}
						userName={user.email}
						userDisplayName={user.name}
					/>
				</div>
			</div>
		</div>
	);
}
