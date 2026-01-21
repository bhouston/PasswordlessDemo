import { z } from "zod";

/**
 * Environment configuration schema
 * All fields are required with no defaults - application will fail fast if missing
 */
const envConfigSchema = z.object({
	JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
	BASE_URL: z.string().url("BASE_URL must be a valid URL"),
	RP_NAME: z.string().min(1, "RP_NAME is required"),
	RP_ID: z.string().min(1, "RP_ID is required"),
	ORIGIN: z.string().url("ORIGIN must be a valid URL"),
	DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
	NODE_ENV: z.enum(["development", "production", "test"]).optional(),
});

type EnvConfig = z.infer<typeof envConfigSchema>;

let envConfig: EnvConfig | null = null;

/**
 * Get validated environment configuration
 * Parses and validates process.env on first call, caches result
 * Throws error if any required environment variable is missing or invalid
 */
export function getEnvConfig(): EnvConfig {
	if (!envConfig) {
		envConfig = envConfigSchema.parse(process.env);
	}
	return envConfig;
}
