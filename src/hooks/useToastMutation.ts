import {
	type MutationFunction,
	type QueryKey,
	type UseMutationOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";
import { useToast } from "./useToast";

type BaseMutationOptions<TData, TError, TVariables, TContext> = Omit<
	UseMutationOptions<TData, TError, TVariables, TContext>,
	"onSuccess" | "onError" | "mutationFn"
> & {
	mutationFn: MutationFunction<TData, TVariables>;
	queryKey?: QueryKey;
	setFormError?: Dispatch<SetStateAction<string | undefined>>;
	toastSuccess?: boolean;
	onSuccess?: (
		data: TData,
		variables: TVariables,
		context: TContext | undefined,
	) => void | Promise<void>;
	onError?: (
		error: TError,
		variables: TVariables,
		context: TContext | undefined,
	) => void | Promise<void>;
	action: string;
	description?: string;
};

export function useToastMutation<
	TData = unknown,
	TError = unknown,
	TVariables = void,
	TContext = unknown,
>(options: BaseMutationOptions<TData, TError, TVariables, TContext>) {
	const {
		action,
		description,
		onSuccess,
		onError,
		mutationFn,
		queryKey,
		setFormError,
		toastSuccess = true,
		...rest
	} = options;
	const queryClient = useQueryClient();
	const { toast, toastError } = useToast();

	return useMutation<TData, TError, TVariables, TContext>({
		...rest,
		mutationFn,
		onSuccess: async (data, variables, context) => {
			try {
				if (queryKey) {
					await queryClient.invalidateQueries({ queryKey });
				}
				if (onSuccess) {
					await onSuccess(data, variables, context);
				}
			} finally {
				if (setFormError) {
					setFormError(undefined);
				}
				if (toastSuccess) {
					toast({ title: `${action} succeeded!`, description, variant: "success" });
				}
			}
		},
		onError: async (error, variables, context) => {
			try {
				if (onError) {
					await onError(error, variables, context);
				}
			} finally {
				if (setFormError) {
					const message =
						error instanceof Error
							? error.message
							: `An error occurred ${action}.`;
					setFormError(message);
				}
				toastError(error, `${action} failed`);
			}
		},
	});
}
