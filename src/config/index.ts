/**
 * @fileoverview Loads, validates, and exports application configuration.
 * This module centralizes configuration management, sourcing values from
 * environment variables and `package.json`. It uses Zod for schema validation
 * to ensure type safety and correctness of configuration parameters.
 *
 * Key responsibilities:
 * - Load environment variables from a `.env` file.
 * - Read `package.json` for default server name and version.
 * - Define a Zod schema for all expected environment variables.
 * - Validate environment variables against the schema.
 * - Construct and export a comprehensive `config` object.
 * - Export individual configuration values like `logLevel` and `environment` for convenience.
 *
 * @module src/config/index
 */

import dotenv from "dotenv";
import { existsSync, mkdirSync, readFileSync, statSync } from "fs";
import path, { dirname, join } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

dotenv.config();

// --- Determine Project Root ---
/**
 * Finds the project root directory by searching upwards for package.json.
 * @param startDir The directory to start searching from.
 * @returns The absolute path to the project root, or throws an error if not found.
 */
const findProjectRoot = (startDir: string): string => {
  let currentDir = startDir;
  while (true) {
    const packageJsonPath = join(currentDir, "package.json");
    if (existsSync(packageJsonPath)) {
      return currentDir;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached the root of the filesystem without finding package.json
      throw new Error(
        `Could not find project root (package.json) starting from ${startDir}`,
      );
    }
    currentDir = parentDir;
  }
};

let projectRoot: string;
try {
  // For ESM, __dirname is not available directly.
  // import.meta.url gives the URL of the current module.
  const currentModuleDir = dirname(fileURLToPath(import.meta.url));
  projectRoot = findProjectRoot(currentModuleDir);
} catch (error: any) {
  console.error(`FATAL: Error determining project root: ${error.message}`);
  // Fallback to process.cwd() if project root cannot be determined.
  // This might happen in unusual execution environments.
  projectRoot = process.cwd();
  console.warn(
    `Warning: Using process.cwd() (${projectRoot}) as fallback project root.`,
  );
}
// --- End Determine Project Root ---

const pkgPath = join(projectRoot, "package.json"); // Use determined projectRoot
let pkg = { name: "mcp-ts-template", version: "0.0.0" };

try {
  pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
} catch (error) {
  if (process.stdout.isTTY) {
    console.error(
      "Warning: Could not read package.json for default config values. Using hardcoded defaults.",
      error,
    );
  }
}

/**
 * Zod schema for validating environment variables.
 * Provides type safety, validation, defaults, and clear error messages.
 * @private
 */
const EnvSchema = z
  .object({
    /** Optional. The desired name for the MCP server. Defaults to `package.json` name. */
    MCP_SERVER_NAME: z.string().optional(),
    /** Optional. The version of the MCP server. Defaults to `package.json` version. */
    MCP_SERVER_VERSION: z.string().optional(),
    /** Minimum logging level. See `McpLogLevel` in logger utility. Default: "debug". */
    MCP_LOG_LEVEL: z.string().default("debug"),
    /** Directory for log files. Defaults to "logs" in project root. */
    LOGS_DIR: z.string().default(path.join(projectRoot, "logs")),
    /** Defines the logging output mode. "file" for logs in LOGS_DIR, "stdout" for console logging. */
    LOG_OUTPUT_MODE: z.enum(["file", "stdout"]).default("file"),
    /** Runtime environment (e.g., "development", "production"). Default: "development". */
    NODE_ENV: z.string().default("development"),
    /** MCP communication transport ("stdio" or "http"). Default: "stdio". */
    MCP_TRANSPORT_TYPE: z.enum(["stdio", "http"]).default("stdio"),
    /** HTTP server port (if MCP_TRANSPORT_TYPE is "http"). Default: 3010. */
    MCP_HTTP_PORT: z.coerce.number().int().positive().default(3010),
    /** HTTP server host (if MCP_TRANSPORT_TYPE is "http"). Default: "127.0.0.1". */
    MCP_HTTP_HOST: z.string().default("127.0.0.1"),
    /** Optional. Comma-separated allowed origins for CORS (HTTP transport). */
    MCP_ALLOWED_ORIGINS: z.string().optional(),
    /** Optional. Secret key (min 32 chars) for auth tokens (HTTP transport). CRITICAL for production. */
    MCP_AUTH_SECRET_KEY: z
      .string()
      .min(
        32,
        "MCP_AUTH_SECRET_KEY must be at least 32 characters long for security reasons.",
      )
      .optional(),
    /** Authentication mode ('jwt' or 'oauth'). Default: 'jwt'. */
    MCP_AUTH_MODE: z.enum(["jwt", "oauth"]).default("jwt"),

    /** OAuth: The expected issuer of the JWT. */
    OAUTH_ISSUER_URL: z.string().url().optional(),
    /** OAuth: The expected audience of the JWT. */
    OAUTH_AUDIENCE: z.string().optional(),
    /** OAuth: The URI of the JWKS endpoint. */
    OAUTH_JWKS_URI: z.string().url().optional(),

    /** Optional. OAuth provider authorization endpoint URL. */
    OAUTH_PROXY_AUTHORIZATION_URL: z
      .string()
      .url("OAUTH_PROXY_AUTHORIZATION_URL must be a valid URL.")
      .optional(),
    /** Optional. OAuth provider token endpoint URL. */
    OAUTH_PROXY_TOKEN_URL: z
      .string()
      .url("OAUTH_PROXY_TOKEN_URL must be a valid URL.")
      .optional(),
    /** Optional. OAuth provider revocation endpoint URL. */
    OAUTH_PROXY_REVOCATION_URL: z
      .string()
      .url("OAUTH_PROXY_REVOCATION_URL must be a valid URL.")
      .optional(),
    /** Optional. OAuth provider issuer URL. */
    OAUTH_PROXY_ISSUER_URL: z
      .string()
      .url("OAUTH_PROXY_ISSUER_URL must be a valid URL.")
      .optional(),
    /** Optional. OAuth service documentation URL. */
    OAUTH_PROXY_SERVICE_DOCUMENTATION_URL: z
      .string()
      .url("OAUTH_PROXY_SERVICE_DOCUMENTATION_URL must be a valid URL.")
      .optional(),
    /** Optional. Comma-separated default OAuth client redirect URIs. */
    OAUTH_PROXY_DEFAULT_CLIENT_REDIRECT_URIS: z.string().optional(),

    // NCBI E-utilities Configuration
    /** NCBI API Key. Optional, but highly recommended for higher rate limits. */
    NCBI_API_KEY: z.string().optional(),
    /** Tool identifier sent to NCBI. Defaults to MCP_SERVER_NAME/MCP_SERVER_VERSION. */
    NCBI_TOOL_IDENTIFIER: z.string().optional(),
    /** Administrator's email for NCBI contact. Optional, but recommended if using an API key. */
    NCBI_ADMIN_EMAIL: z
      .string()
      .email("NCBI_ADMIN_EMAIL must be a valid email address.")
      .optional(),
    /** Milliseconds to wait between NCBI requests. Default: 100 (for API key), 334 (without API key). */
    NCBI_REQUEST_DELAY_MS: z.coerce.number().int().positive().optional(), // Default will be set conditionally
    /** Maximum number of retries for failed NCBI requests. Default: 3. */
    NCBI_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  })
  .superRefine((data, ctx) => {
    // Rule 1: MCP_AUTH_SECRET_KEY is required for http transport in production with jwt auth
    if (
      data.NODE_ENV === "production" &&
      data.MCP_TRANSPORT_TYPE === "http" &&
      data.MCP_AUTH_MODE === "jwt" &&
      !data.MCP_AUTH_SECRET_KEY
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MCP_AUTH_SECRET_KEY"],
        message:
          "MCP_AUTH_SECRET_KEY is required for 'jwt' auth with 'http' transport in a 'production' environment.",
      });
    }

    // Rule 2: Core OAuth variables are required when MCP_AUTH_MODE is 'oauth'
    if (data.MCP_AUTH_MODE === "oauth") {
      if (!data.OAUTH_ISSUER_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["OAUTH_ISSUER_URL"],
          message:
            "OAUTH_ISSUER_URL is required when MCP_AUTH_MODE is 'oauth'.",
        });
      }
      if (!data.OAUTH_AUDIENCE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["OAUTH_AUDIENCE"],
          message: "OAUTH_AUDIENCE is required when MCP_AUTH_MODE is 'oauth'.",
        });
      }
      if (!data.OAUTH_JWKS_URI) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["OAUTH_JWKS_URI"],
          message: "OAUTH_JWKS_URI is required when MCP_AUTH_MODE is 'oauth'.",
        });
      }
    }
  });

const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  if (process.stdout.isTTY) {
    console.error(
      "❌ Invalid environment variables found:",
      parsedEnv.error.flatten().fieldErrors,
    );
  }
  // Consider throwing an error in production for critical misconfigurations.
}

const env = parsedEnv.success ? parsedEnv.data : EnvSchema.parse({});

// --- Directory Ensurance Function ---
/**
 * Ensures a directory exists and is within the project root.
 * @param dirPath The desired path for the directory (can be relative or absolute).
 * @param rootDir The root directory of the project to contain the directory.
 * @param dirName The name of the directory type for logging (e.g., "logs").
 * @returns The validated, absolute path to the directory, or null if invalid.
 */
const ensureDirectory = (
  dirPath: string,
  rootDir: string,
  dirName: string,
): string | null => {
  const resolvedDirPath = path.isAbsolute(dirPath)
    ? dirPath
    : path.resolve(rootDir, dirPath);

  // Ensure the resolved path is within the project root boundary
  if (
    !resolvedDirPath.startsWith(rootDir + path.sep) &&
    resolvedDirPath !== rootDir
  ) {
    if (process.stdout.isTTY) {
      console.error(
        `Error: ${dirName} path "${dirPath}" resolves to "${resolvedDirPath}", which is outside the project boundary "${rootDir}".`,
      );
    }
    return null;
  }

  if (!existsSync(resolvedDirPath)) {
    try {
      mkdirSync(resolvedDirPath, { recursive: true });
      if (process.stdout.isTTY) {
        console.log(`Created ${dirName} directory: ${resolvedDirPath}`);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (process.stdout.isTTY) {
        console.error(
          `Error creating ${dirName} directory at ${resolvedDirPath}: ${errorMessage}`,
        );
      }
      return null;
    }
  } else {
    try {
      const stats = statSync(resolvedDirPath);
      if (!stats.isDirectory()) {
        if (process.stdout.isTTY) {
          console.error(
            `Error: ${dirName} path ${resolvedDirPath} exists but is not a directory.`,
          );
        }
        return null;
      }
    } catch (statError: any) {
      if (process.stdout.isTTY) {
        console.error(
          `Error accessing ${dirName} path ${resolvedDirPath}: ${statError.message}`,
        );
      }
      return null;
    }
  }
  return resolvedDirPath;
};
// --- End Directory Ensurance Function ---

// --- Logs Directory Handling ---
let validatedLogsPath: string | null = null;
if (env.LOG_OUTPUT_MODE === "file") {
  validatedLogsPath = ensureDirectory(env.LOGS_DIR, projectRoot, "logs");

  if (!validatedLogsPath) {
    if (process.stdout.isTTY) {
      console.error(
        "FATAL: Log mode is 'file' but logs directory is invalid or could not be created. Please check LOGS_DIR, permissions, and path. Exiting.",
      );
    }
    process.exit(1); // Exit if file logging is configured but directory is not usable
  }
}
// --- End Logs Directory Handling ---

/**
 * Main application configuration object.
 * Aggregates settings from validated environment variables and `package.json`.
 */
export const config = {
  /** MCP server name. Env `MCP_SERVER_NAME` > `package.json` name > "mcp-ts-template". */
  mcpServerName: env.MCP_SERVER_NAME || pkg.name,
  /** MCP server version. Env `MCP_SERVER_VERSION` > `package.json` version > "0.0.0". */
  mcpServerVersion: env.MCP_SERVER_VERSION || pkg.version,
  /** Logging level. From `MCP_LOG_LEVEL` env var. Default: "debug". */
  logLevel: env.MCP_LOG_LEVEL,
  /** Defines the logging output mode ('file' or 'stdout'). From `LOG_OUTPUT_MODE`. */
  logOutputMode: env.LOG_OUTPUT_MODE,
  /** Absolute path to the logs directory (if logOutputMode is 'file'). From `LOGS_DIR`. */
  logsPath: validatedLogsPath,
  /** Runtime environment. From `NODE_ENV` env var. Default: "development". */
  environment: env.NODE_ENV,
  /** MCP transport type ('stdio' or 'http'). From `MCP_TRANSPORT_TYPE` env var. Default: "stdio". */
  mcpTransportType: env.MCP_TRANSPORT_TYPE,
  /** HTTP server port (if http transport). From `MCP_HTTP_PORT` env var. Default: 3010. */
  mcpHttpPort: env.MCP_HTTP_PORT,
  /** HTTP server host (if http transport). From `MCP_HTTP_HOST` env var. Default: "127.0.0.1". */
  mcpHttpHost: env.MCP_HTTP_HOST,
  /** Array of allowed CORS origins (http transport). From `MCP_ALLOWED_ORIGINS` (comma-separated). */
  mcpAllowedOrigins: env.MCP_ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  /** Auth secret key (JWTs, http transport). From `MCP_AUTH_SECRET_KEY`. CRITICAL. */
  mcpAuthSecretKey: env.MCP_AUTH_SECRET_KEY,
  /** Auth mode ('jwt' or 'oauth'). From `MCP_AUTH_MODE`. */
  mcpAuthMode: env.MCP_AUTH_MODE,
  /** OAuth Issuer URL. From `OAUTH_ISSUER_URL`. */
  oauthIssuerUrl: env.OAUTH_ISSUER_URL,
  /** OAuth Audience. From `OAUTH_AUDIENCE`. */
  oauthAudience: env.OAUTH_AUDIENCE,
  /** OAuth JWKS URI. From `OAUTH_JWKS_URI`. */
  oauthJwksUri: env.OAUTH_JWKS_URI,

  // NCBI Configuration
  /** NCBI API Key. From `NCBI_API_KEY`. */
  ncbiApiKey: env.NCBI_API_KEY,
  /** NCBI Tool Identifier. From `NCBI_TOOL_IDENTIFIER`. Defaults to server name/version. */
  ncbiToolIdentifier:
    env.NCBI_TOOL_IDENTIFIER ||
    `${env.MCP_SERVER_NAME || pkg.name}/${env.MCP_SERVER_VERSION || pkg.version}`,
  /** NCBI Admin Email. From `NCBI_ADMIN_EMAIL`. */
  ncbiAdminEmail: env.NCBI_ADMIN_EMAIL,
  /** NCBI Request Delay in MS. From `NCBI_REQUEST_DELAY_MS`. Dynamically set based on API key presence. */
  ncbiRequestDelayMs:
    env.NCBI_REQUEST_DELAY_MS ?? (env.NCBI_API_KEY ? 100 : 334),
  /** NCBI Max Retries. From `NCBI_MAX_RETRIES`. */
  ncbiMaxRetries: env.NCBI_MAX_RETRIES,

  /** OAuth Proxy configurations. Undefined if no related env vars are set. */
  oauthProxy:
    env.OAUTH_PROXY_AUTHORIZATION_URL ||
    env.OAUTH_PROXY_TOKEN_URL ||
    env.OAUTH_PROXY_REVOCATION_URL ||
    env.OAUTH_PROXY_ISSUER_URL ||
    env.OAUTH_PROXY_SERVICE_DOCUMENTATION_URL ||
    env.OAUTH_PROXY_DEFAULT_CLIENT_REDIRECT_URIS
      ? {
          authorizationUrl: env.OAUTH_PROXY_AUTHORIZATION_URL,
          tokenUrl: env.OAUTH_PROXY_TOKEN_URL,
          revocationUrl: env.OAUTH_PROXY_REVOCATION_URL,
          issuerUrl: env.OAUTH_PROXY_ISSUER_URL,
          serviceDocumentationUrl: env.OAUTH_PROXY_SERVICE_DOCUMENTATION_URL,
          defaultClientRedirectUris:
            env.OAUTH_PROXY_DEFAULT_CLIENT_REDIRECT_URIS?.split(",")
              .map((uri) => uri.trim())
              .filter(Boolean),
        }
      : undefined,
};

/**
 * Configured logging level for the application.
 * Exported for convenience.
 */
export const logLevel: string = config.logLevel;

/**
 * Configured runtime environment ("development", "production", etc.).
 * Exported for convenience.
 */
export const environment: string = config.environment;
