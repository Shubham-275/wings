// ===========================================
// Wing Scout - Environment Variable Validation
// ===========================================

/**
 * Required environment variables for the application
 */
const requiredServerEnvVars = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'AGENTQL_API_KEY',
] as const;

const requiredClientEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_MAPBOX_TOKEN',
] as const;

const optionalEnvVars = [
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'OCR_SPACE_API_KEY',
    'AGENTQL_API_URL',
] as const;

/**
 * Validates environment variables at runtime
 * Call this at server startup to catch missing env vars early
 */
export function validateEnv(): {
    valid: boolean;
    missing: string[];
    warnings: string[];
} {
    const missing: string[] = [];
    const warnings: string[] = [];

    // Check required server-side env vars
    for (const envVar of requiredServerEnvVars) {
        if (!process.env[envVar]) {
            missing.push(envVar);
        }
    }

    // Check required client-side env vars
    for (const envVar of requiredClientEnvVars) {
        if (!process.env[envVar]) {
            missing.push(envVar);
        }
    }

    // Check optional env vars and warn if missing
    for (const envVar of optionalEnvVars) {
        if (!process.env[envVar]) {
            warnings.push(`Optional: ${envVar} not set`);
        }
    }

    // Redis requires both URL and token
    const hasRedisUrl = !!process.env.UPSTASH_REDIS_REST_URL;
    const hasRedisToken = !!process.env.UPSTASH_REDIS_REST_TOKEN;
    if (hasRedisUrl !== hasRedisToken) {
        warnings.push('Redis: Both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set together');
    }

    return {
        valid: missing.length === 0,
        missing,
        warnings,
    };
}

/**
 * Get environment variable with type safety
 */
export function getEnv(key: string, defaultValue?: string): string {
    const value = process.env[key];
    if (value === undefined) {
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        throw new Error(`Environment variable ${key} is not set`);
    }
    return value;
}

/**
 * Get optional environment variable
 */
export function getOptionalEnv(key: string): string | undefined {
    return process.env[key];
}

/**
 * Log environment validation results
 */
export function logEnvValidation(): void {
    const result = validateEnv();

    if (!result.valid) {
        console.error('='.repeat(50));
        console.error('MISSING REQUIRED ENVIRONMENT VARIABLES:');
        result.missing.forEach(v => console.error(`  - ${v}`));
        console.error('='.repeat(50));
        console.error('Please check your .env file or environment configuration.');
    }

    if (result.warnings.length > 0) {
        console.warn('Environment warnings:');
        result.warnings.forEach(w => console.warn(`  - ${w}`));
    }
}
