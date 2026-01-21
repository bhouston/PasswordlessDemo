import { createFileRoute } from '@tanstack/react-router';
import { FieldSet, FieldGroup } from '@/components/ui/field';

export const Route = createFileRoute('/signup-check-email')({
	component: CheckEmailPage,
});

function CheckEmailPage() {
	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
			<div className="w-full max-w-md">
				<FieldSet className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
					<FieldGroup>
						<div className="text-center">
							<div className="mb-6">
								<div className="mx-auto w-16 h-16 bg-cyan-500/20 rounded-full flex items-center justify-center mb-4">
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
								<h1 className="text-3xl font-bold text-white mb-2">
									Check Your Email
								</h1>
								<p className="text-gray-400">
									We've sent a verification link to your email
									address. Please check your inbox and click
									the link to complete your registration.
								</p>
							</div>

							<div className="mt-6 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
								<p className="text-sm text-gray-300 mb-2">
									<strong>Development Mode:</strong>
								</p>
								<p className="text-xs text-gray-400">
									The verification URL has been logged to the
									console. Check your server console to see the
									registration link.
								</p>
							</div>
						</div>
					</FieldGroup>
				</FieldSet>
			</div>
		</div>
	);
}
