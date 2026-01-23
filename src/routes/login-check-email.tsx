import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { redirectToSchema } from "@/lib/schemas";

// Zod schema for search params validation
const checkEmailSearchSchema = z.object({
	reason: z
		.enum(["signup_link_sent"])
		.optional()
		.default("signup_link_sent"),
	email: z.string().email().optional(),
});

const reasonToText: Record<string, string> = {
	signup_link_sent:
		"A signup link has been sent to your email. Please check your inbox and click the link to complete your registration.",
};

export const Route = createFileRoute("/login-check-email")({
	validateSearch: (search) => ({
		...checkEmailSearchSchema.parse(search),
		...redirectToSchema.parse(search),
	}),
	component: LoginCheckEmailPage,
});

function LoginCheckEmailPage() {
	const { reason = "signup_link_sent", email, redirectTo } = Route.useSearch();

	const text = reasonToText[reason] || reasonToText.signup_link_sent;

	return (
		<AuthLayout title="Check Your Email">
			<div className="space-y-4 text-center">
				<div className="mx-auto w-16 h-16 bg-cyan-500/20 rounded-full flex items-center justify-center mb-4" aria-hidden="true">
					<svg
						className="w-8 h-8 text-cyan-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
						/>
					</svg>
				</div>

				<output aria-live="polite" className="block text-gray-400">
					{text}
				</output>

				{email && (
					<div className="mt-4 p-4 bg-slate-700/50 rounded-lg">
						<p className="text-sm text-gray-300">
							<strong>Email:</strong> {email}
						</p>
					</div>
				)}

				<div className="mt-6 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
					<p className="text-sm text-gray-300 mb-2">
						<strong>Development Mode:</strong>
					</p>
					<p className="text-xs text-gray-400">
						The verification link has been logged to the console. Check your server
						console to see the link.
					</p>
				</div>

				<div className="text-center text-sm">
					<Link
						className="text-blue-400 hover:text-blue-300"
						search={redirectTo ? { redirectTo } : undefined}
						to="/login"
					>
						Back to Login
					</Link>
				</div>
			</div>
		</AuthLayout>
	);
}
