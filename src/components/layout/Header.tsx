import { Link } from "@tanstack/react-router";
import { useSessionUser } from "@/hooks/useSessionUser";

export function Header() {
	const { sessionUser } = useSessionUser();

	return (
		<header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700">
			<nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex items-center justify-between h-16">
					<div className="flex items-center">
						<Link
							to="/"
							className="text-xl font-bold text-white hover:text-blue-400 transition-colors"
						>
							Passwordless Demo
						</Link>
					</div>
					<div className="flex items-center gap-4">
						<Link
							to="/signup"
							className="text-gray-300 hover:text-white transition-colors"
						>
							Sign Up
						</Link>
						<Link
							to="/login"
							className="text-gray-300 hover:text-white transition-colors"
						>
							Login
						</Link>
						{sessionUser && (
							<>
								<Link
									to="/user-settings"
									className="text-gray-300 hover:text-white transition-colors"
								>
									User Settings
								</Link>
								<Link
									to="/logout"
									className="text-gray-300 hover:text-white transition-colors"
								>
									Log Out
								</Link>
							</>
						)}
					</div>
				</div>
			</nav>
		</header>
	);
}
