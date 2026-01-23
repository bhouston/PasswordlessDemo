import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getUserWithPasskey } from "@/server/user";

type SessionUser = {
	id: number;
	name: string;
	email: string;
};

type UseSessionUserProps = {
	required?: boolean;
};

export function useSessionUser(props?: { required?: false }): {
	sessionUser?: SessionUser;
	hasPasskey?: boolean;
};

export function useSessionUser(props: { required: true }): {
	sessionUser: SessionUser;
	hasPasskey: boolean;
};

export function useSessionUser(props?: UseSessionUserProps): {
	sessionUser?: SessionUser;
	hasPasskey?: boolean;
} {
	const required = props?.required ?? false;
	const getUserFn = useServerFn(getUserWithPasskey);

	const result = useSuspenseQuery({
		queryKey: ["SESSION"],
		queryFn: async () => {
			try {
				const data = await getUserFn({});
				return {
					sessionUser: data.user,
					hasPasskey: data.hasPasskey,
				};
			} catch {
				// User is not authenticated
				return {
					sessionUser: undefined,
					hasPasskey: false,
				};
			}
		},
	});

	if (required && !result.data.sessionUser) {
		throw new Error("Session user not found");
	}

	return result.data;
}
