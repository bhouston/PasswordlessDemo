import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { useToastMutation } from "@/hooks/useToastMutation";
import { useSessionUser } from "@/hooks/useSessionUser";
import { logout } from "@/server/auth";

export const Route = createFileRoute("/logout")({
	beforeLoad: async () => {
		// Check if user is logged in by trying to get session
		// If not logged in, redirect to login
		try {
			const { getUserWithPasskey } = await import("@/server/user");
			await getUserWithPasskey({});
		} catch {
			// User is not authenticated, redirect to login
			throw redirect({
				to: "/login",
			});
		}
	},
	component: LogoutPage,
});

function LogoutPage() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { sessionUser } = useSessionUser();
	const logoutFn = useServerFn(logout);

	const logoutMutation = useToastMutation({
		action: "Logout",
		toastSuccess: false, // Don't show toast, we'll redirect immediately
		mutationFn: async () => {
			await logoutFn({});
		},
		onSuccess: async () => {
			// Clear all queries and invalidate router
			await queryClient.clear();
			await router.invalidate();
			// Redirect to login page
			await router.navigate({
				to: "/login",
				reloadDocument: true,
			});
		},
	});

	return (
		<AuthLayout title="Logout">
			<div className="space-y-4">
				{sessionUser && (
					<p className="text-center text-gray-400">
						You are currently logged in as{" "}
						<span className="font-semibold text-white">
							{sessionUser.name || sessionUser.email}
						</span>
					</p>
				)}
				<div className="flex flex-col gap-2">
					<Button
						onClick={() => logoutMutation.mutate()}
						disabled={logoutMutation.isPending}
						className="w-full"
						variant="destructive"
					>
						{logoutMutation.isPending ? "Logging out..." : "Log Out"}
					</Button>
					<Button
						onClick={() => router.navigate({ to: "/user-settings" })}
						className="w-full"
						variant="outline"
					>
						Cancel
					</Button>
				</div>
			</div>
		</AuthLayout>
	);
}
