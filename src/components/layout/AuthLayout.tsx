import type { FC, ReactNode } from "react";

export type AuthLayoutProps = {
	title: string;
	subTitle?: string;
	children?: ReactNode;
};

export const AuthLayout: FC<AuthLayoutProps> = ({
	title,
	subTitle,
	children,
}) => (
	<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
		<div className="w-full max-w-md">
			<div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
				<div className="text-center mb-6">
					<h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
					{subTitle && <p className="text-gray-400">{subTitle}</p>}
				</div>
				{children}
			</div>
		</div>
	</div>
);
