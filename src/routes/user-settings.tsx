import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { z } from 'zod';
import { getAuthCookie } from '@/lib/auth';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
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

// Server function to update user name
const updateUserName = createServerFn({ method: 'POST' })
	.inputValidator((data: UserDetailsFormData) => {
		return userDetailsSchema.parse(data);
	})
	.handler(async ({ data }) => {
		const userId = getAuthCookie();
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const userIdNum = parseInt(userId, 10);
		if (isNaN(userIdNum)) {
			throw new Error('Invalid user ID');
		}

		const [updatedUser] = await db
			.update(users)
			.set({ name: data.name })
			.where(eq(users.id, userIdNum))
			.returning();

		if (!updatedUser) {
			throw new Error('User not found');
		}

		return {
			success: true,
			user: updatedUser,
		};
	});

export const Route = createFileRoute('/user-settings')({
	beforeLoad: async () => {
		const userId = getAuthCookie();
		if (!userId) {
			throw redirect({
				to: '/login',
			});
		}
	},
	loader: async () => {
		const userId = getAuthCookie();
		if (!userId) {
			throw redirect({
				to: '/login',
			});
		}

		const userIdNum = parseInt(userId, 10);
		if (isNaN(userIdNum)) {
			throw redirect({
				to: '/login',
			});
		}

		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.id, userIdNum))
			.limit(1);

		if (!user) {
			throw redirect({
				to: '/login',
			});
		}

		return {
			user,
		};
	},
	component: UserSettingsPage,
});

function UserSettingsPage() {
	const { user } = Route.useLoaderData();
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
				const result = await updateUserName({ data: value });
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
				</div>
			</div>
		</div>
	);
}
