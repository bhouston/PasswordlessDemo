import { useState, useCallback } from "react";

export type Toast = {
	id: string;
	title: string;
	description?: string;
	variant?: "default" | "success" | "error";
};

let toastId = 0;

export function useToast() {
	const [toasts, setToasts] = useState<Toast[]>([]);

	const toast = useCallback(
		({ title, description, variant = "default" }: Omit<Toast, "id">) => {
			const id = `toast-${++toastId}`;
			const newToast: Toast = { id, title, description, variant };

			setToasts((prev) => [...prev, newToast]);

			// Auto-remove after 5 seconds
			setTimeout(() => {
				setToasts((prev) => prev.filter((t) => t.id !== id));
			}, 5000);

			return id;
		},
		[],
	);

	const toastError = useCallback(
		(error: unknown, title: string) => {
			const message =
				error instanceof Error ? error.message : "An error occurred";
			toast({ title, description: message, variant: "error" });
		},
		[toast],
	);

	const removeToast = useCallback((id: string) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	return { toasts, toast, toastError, removeToast };
}
