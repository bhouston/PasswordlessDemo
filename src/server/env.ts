import { z } from "zod";

/**
 * Environment configuration schema
 * All fields are required with no defaults - application will fail fast if missing
 */
const envConfigSchema = z.object({
	JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
	SITE_URL: z.string().url("SITE_URL must be a valid URL"),
	SITE_NAME: z.string().min(1, "SITE_NAME is required"),
	RP_ID: z.string().min(1, "RP_ID is required"),
	DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
	NODE_ENV: z.enum(["development", "production", "test"]).optional(),
});

type EnvConfig = z.infer<typeof envConfigSchema> & {
	BASE_URL: string; // Alias for SITE_URL (backward compatibility)
	ORIGIN: string; // Alias for SITE_URL (backward compatibility)
	RP_NAME: string; // Alias for SITE_NAME (backward compatibility)
};

let envConfig: EnvConfig | null = null;

/**
 * Extract hostname from URL for RP_ID
 */
function extractHostname(url: string): string {
	try {
		const urlObj = new URL(url);
		return urlObj.hostname;
	} catch {
		throw new Error(`Invalid URL format: ${url}`);
	}
}

/**
 * Get validated environment configuration
 * Parses and validates process.env on first call, caches result
 * Throws error if any required environment variable is missing or invalid
 */
export function getEnvConfig(): EnvConfig {
	if (!envConfig) {
		const parsed = envConfigSchema.parse(process.env);

		// Derive RP_ID from SITE_URL if not explicitly set
		const rpId = parsed.RP_ID || extractHostname(parsed.SITE_URL);

		// Create config with aliases for backward compatibility
		envConfig = {
			...parsed,
			RP_ID: rpId,
			BASE_URL: parsed.SITE_URL,
			ORIGIN: parsed.SITE_URL,
			RP_NAME: parsed.SITE_NAME,
		};
	}
	return envConfig;
}
