/**
 * @fileoverview Loads, validates, and exports application configuration.
 * This module centralizes configuration management, sourcing values from
 * environment variables and `package.json`. It uses Zod for schema validation
 * to ensure type safety and correctness of configuration parameters.
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
const findProjectRoot = (startDir: string): string => {
  let currentDir = startDir;
  while (true) {
    const packageJsonPath = join(currentDir, "package.json");
    if (existsSync(packageJsonPath)) {
      return currentDir;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(
        `Could not find project root (package.json) starting from ${startDir}`,
      );
    }
    currentDir = parentDir;
  }
};

let projectRoot: string;
try {
  const currentModuleDir = dirname(fileURLToPath(import.meta.url));
  projectRoot = findProjectRoot(currentModuleDir);
} catch (error: any) {
  console.error(`FATAL: Error determining project root: ${error.message}`);
  projectRoot = process.cwd();
  console.warn(
    `Warning: Using process.cwd() (${projectRoot}) as fallback project root.`,
  );
}
// --- End Determine Project Root ---

const pkgPath = join(projectRoot, "package.json");
let pkg = { name: "pubmed-mcp-server", version: "0.0.0" };

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

const EnvSchema = z
  .object({
    // Core Server Config
    MCP_SERVER_NAME: z.string().optional(),
    MCP_SERVER_VERSION: z.string().optional(),
    NODE_ENV: z.string().default("development"),

    // Logging
    MCP_LOG_LEVEL: z.string().default("debug"),
    LOGS_DIR: z.string().default(path.join(projectRoot, "logs")),

    // Transport
    MCP_TRANSPORT_TYPE: z.enum(["stdio", "http"]).default("stdio"),
    MCP_SESSION_MODE: z.enum(["stateless", "stateful", "auto"]).default("auto"),
    MCP_HTTP_PORT: z.coerce.number().int().positive().default(3010),
    MCP_HTTP_HOST: z.string().default("127.0.0.1"),
    MCP_HTTP_ENDPOINT_PATH: z.string().default("/mcp"),
    MCP_HTTP_MAX_PORT_RETRIES: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(15),
    MCP_HTTP_PORT_RETRY_DELAY_MS: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(50),
    MCP_STATEFUL_SESSION_STALE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(1_800_000),
    MCP_ALLOWED_ORIGINS: z.string().optional(),

    // Authentication
    MCP_AUTH_MODE: z.enum(["jwt", "oauth", "none"]).default("none"),
    MCP_AUTH_SECRET_KEY: z
      .string()
      .min(32, "MCP_AUTH_SECRET_KEY must be at least 32 characters long.")
      .optional(),
    OAUTH_ISSUER_URL: z.string().url().optional(),
    OAUTH_JWKS_URI: z.string().url().optional(),
    OAUTH_AUDIENCE: z.string().optional(),

    // Dev mode JWT
    DEV_MCP_CLIENT_ID: z.string().optional(),
    DEV_MCP_SCOPES: z.string().optional(),

    // NCBI E-utilities
    NCBI_API_KEY: z.string().optional(),
    NCBI_TOOL_IDENTIFIER: z.string().optional(),
    NCBI_ADMIN_EMAIL: z.string().email().optional(),
    NCBI_REQUEST_DELAY_MS: z.coerce.number().int().positive().optional(),
    NCBI_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  })
  .superRefine((data, ctx) => {
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
          "MCP_AUTH_SECRET_KEY is required for 'jwt' auth in production with 'http' transport.",
      });
    }
    if (data.MCP_AUTH_MODE === "oauth") {
      if (!data.OAUTH_ISSUER_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["OAUTH_ISSUER_URL"],
          message: "OAUTH_ISSUER_URL is required for 'oauth' mode.",
        });
      }
      if (!data.OAUTH_AUDIENCE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["OAUTH_AUDIENCE"],
          message: "OAUTH_AUDIENCE is required for 'oauth' mode.",
        });
      }
    }
  });

const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  if (process.stdout.isTTY) {
    console.error(
      "❌ Invalid environment variables:",
      parsedEnv.error.flatten().fieldErrors,
    );
  }
}

const env = parsedEnv.success ? parsedEnv.data : EnvSchema.parse({});

const ensureDirectory = (
  dirPath: string,
  rootDir: string,
  dirName: string,
): string | null => {
  const resolvedDirPath = path.isAbsolute(dirPath)
    ? dirPath
    : path.resolve(rootDir, dirPath);

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
    } catch (statError: unknown) {
      const errorMessage =
        statError instanceof Error
          ? statError.message
          : "An unknown error occurred";
      if (process.stdout.isTTY) {
        console.error(
          `Error accessing ${dirName} path ${resolvedDirPath}: ${errorMessage}`,
        );
      }
      return null;
    }
  }
  return resolvedDirPath;
};

let validatedLogsPath: string | null = ensureDirectory(
  env.LOGS_DIR,
  projectRoot,
  "logs",
);

if (!validatedLogsPath) {
  if (process.stdout.isTTY) {
    console.warn(
      `Warning: Custom logs directory ('${env.LOGS_DIR}') is invalid or outside the project boundary. Falling back to default.`,
    );
  }
  const defaultLogsDir = path.join(projectRoot, "logs");
  validatedLogsPath = ensureDirectory(defaultLogsDir, projectRoot, "logs");

  if (!validatedLogsPath) {
    if (process.stdout.isTTY) {
      console.warn(
        "Warning: Default logs directory could not be created. File logging will be disabled.",
      );
    }
  }
}

export const config = {
  pkg,
  mcpServerName: env.MCP_SERVER_NAME || pkg.name,
  mcpServerVersion: env.MCP_SERVER_VERSION || pkg.version,
  logLevel: env.MCP_LOG_LEVEL,
  logsPath: validatedLogsPath,
  environment: env.NODE_ENV,
  mcpTransportType: env.MCP_TRANSPORT_TYPE,
  mcpSessionMode: env.MCP_SESSION_MODE,
  mcpHttpPort: env.MCP_HTTP_PORT,
  mcpHttpHost: env.MCP_HTTP_HOST,
  mcpHttpEndpointPath: env.MCP_HTTP_ENDPOINT_PATH,
  mcpHttpMaxPortRetries: env.MCP_HTTP_MAX_PORT_RETRIES,
  mcpHttpPortRetryDelayMs: env.MCP_HTTP_PORT_RETRY_DELAY_MS,
  mcpStatefulSessionStaleTimeoutMs: env.MCP_STATEFUL_SESSION_STALE_TIMEOUT_MS,
  mcpAllowedOrigins: env.MCP_ALLOWED_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  mcpAuthMode: env.MCP_AUTH_MODE,
  mcpAuthSecretKey: env.MCP_AUTH_SECRET_KEY,
  oauthIssuerUrl: env.OAUTH_ISSUER_URL,
  oauthJwksUri: env.OAUTH_JWKS_URI,
  oauthAudience: env.OAUTH_AUDIENCE,
  devMcpClientId: env.DEV_MCP_CLIENT_ID,
  devMcpScopes: env.DEV_MCP_SCOPES?.split(",").map((s) => s.trim()),
  ncbiApiKey: env.NCBI_API_KEY,
  ncbiToolIdentifier:
    env.NCBI_TOOL_IDENTIFIER ||
    `${env.MCP_SERVER_NAME || pkg.name}/${env.MCP_SERVER_VERSION || pkg.version}`,
  ncbiAdminEmail: env.NCBI_ADMIN_EMAIL,
  ncbiRequestDelayMs:
    env.NCBI_REQUEST_DELAY_MS ?? (env.NCBI_API_KEY ? 100 : 334),
  ncbiMaxRetries: env.NCBI_MAX_RETRIES,
};

export const logLevel: string = config.logLevel;
export const environment: string = config.environment;
