import { z } from "zod";

/**
 * Schema for redirectTo search parameter
 * Used to redirect users after authentication
 */
export const redirectToSchema = z.object({
	redirectTo: z.string().optional().default("/"),
});

export type RedirectToSearch = z.infer<typeof redirectToSchema>;
