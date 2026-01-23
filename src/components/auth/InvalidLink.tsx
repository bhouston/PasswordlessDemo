import type { FC } from "react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup } from "@/components/ui/field";
import { useRouter } from "@tanstack/react-router";

type InvalidLinkProps = {
	title: string;
	message: string;
};

export const InvalidLink: FC<InvalidLinkProps> = ({ title, message }) => {
	const router = useRouter();

	return (
		<AuthLayout title={title}>
			<FieldGroup>
				<div className="text-center mb-6">
					<div className="mx-auto w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
						<svg
							className="w-8 h-8 text-red-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</div>
					<FieldError className="mt-4">{message}</FieldError>
				</div>
				<Field>
					<Button
						onClick={async () => await router.navigate({ to: "/login" })}
						className="w-full"
					>
						Back to Login
					</Button>
				</Field>
			</FieldGroup>
		</AuthLayout>
	);
};
