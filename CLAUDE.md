# pubmed-mcp-server: Developer Guide & MCP Standards

Effective Date: 2025-05-24

This document mandates development practices, configuration, and operational procedures for the `pubmed-mcp-server`. It aligns with the Model Context Protocol (MCP) Specification 2025-03-26.

## I. Server Configuration & Operation

### A. Environment Variables (Mandatory & Optional)

Server behavior is dictated by environment variables. Refer to `src/config/index.ts` for comprehensive loading logic.

**Core Transport & Server Behavior:**

- **`MCP_TRANSPORT_TYPE`**: Transport mechanism.
  - `"stdio"` (Default): Standard I/O.
  - `"http"`: Streamable HTTP SSE. **Recommended for `pubmed-mcp-server`**.
- **`MCP_HTTP_PORT`**: HTTP server port (Default: `3010`). Applies if `MCP_TRANSPORT_TYPE=http`.
- **`MCP_HTTP_HOST`**: HTTP server host (Default: `127.0.0.1`). Applies if `MCP_TRANSPORT_TYPE=http`.
- **`MCP_ALLOWED_ORIGINS`**: Comma-separated list of allowed origins for HTTP CORS (e.g., `http://localhost:3000,https://your.app.com`). Applies if `MCP_TRANSPORT_TYPE=http`.
- **`MCP_LOG_LEVEL`**: Minimum logging severity (e.g., `"debug"`, `"info"`, `"warn"`, `"error"`). Default: `"debug"`.
- **`LOGS_DIR`**: Directory for log file storage (Default: `logs/` in project root).
- **`MCP_AUTH_SECRET_KEY`**: **MANDATORY for `http` transport.** Minimum 32-character secret key for JWT signing and verification. **MUST be securely generated and set in production.**

**PubMed Specific (NCBI E-utilities Integration):**

- **`NCBI_API_KEY`**: Your NCBI API Key. Essential for higher rate limits and reliable access.
- **`NCBI_TOOL_IDENTIFIER`**: `tool` parameter value for NCBI E-utility requests (e.g., `@cyanheads/pubmed-mcp-server/1.0.13`). Defaults to `@cyanheads/pubmed-mcp-server/<package.json version>`.
- **`NCBI_ADMIN_EMAIL`**: `email` parameter value for NCBI E-utility requests (your administrative contact email).
- **`NCBI_REQUEST_DELAY_MS`**: Milliseconds to wait between NCBI requests (e.g., `100` with API key, `334` without). Governs `ncbiRequestQueueManager.ts`.
- **`NCBI_MAX_RETRIES`**: Maximum number of retries for failed NCBI requests.

**Optional LLM Provider Configuration (If server uses LLMs internally):**

- `OPENROUTER_API_KEY`, `OPENROUTER_APP_URL`, `OPENROUTER_APP_NAME`
- `LLM_DEFAULT_MODEL`, `LLM_DEFAULT_TEMPERATURE`, `LLM_DEFAULT_TOP_P`, `LLM_DEFAULT_MAX_TOKENS`, `LLM_DEFAULT_TOP_K`, `LLM_DEFAULT_MIN_P`
- `GEMINI_API_KEY`

**Optional OAuth Proxy Configuration:**

- `OAUTH_PROXY_AUTHORIZATION_URL`, `OAUTH_PROXY_TOKEN_URL`, `OAUTH_PROXY_REVOCATION_URL`, `OAUTH_PROXY_ISSUER_URL`, `OAUTH_PROXY_SERVICE_DOCUMENTATION_URL`, `OAUTH_PROXY_DEFAULT_CLIENT_REDIRECT_URIS`

### B. HTTP Transport Details (`MCP_TRANSPORT_TYPE=http`)

- **Endpoint**: A single endpoint, `/mcp`, handles all MCP communication.
  - `POST /mcp`: Client sends requests/notifications. Requires `mcp-session-id` header after initialization. Server responds with JSON or initiates an SSE stream.
  - `GET /mcp`: Client initiates an SSE stream for server-sent messages. Requires `mcp-session-id` header.
  - `DELETE /mcp`: Client signals session termination. Requires `mcp-session-id` header.
- **Session Management**: Each client connection establishes a session identified by the `mcp-session-id` HTTP header. The server maintains state per session.
- **Security**: Robust origin checking is implemented via `isOriginAllowed` in `src/mcp-server/transports/httpTransport.ts`. Configure `MCP_ALLOWED_ORIGINS` for production. JWT authentication is enforced by `src/mcp-server/transports/authentication/authMiddleware.ts` using `MCP_AUTH_SECRET_KEY`.

### C. Server Execution Commands

- **Format Code**: `npm run format`
- **Build Project**: `npm run build`
- **Run (Stdio Transport)**: `npm run start:stdio`
- **Run (HTTP Transport)**: `npm run start:http` (Ensure `MCP_AUTH_SECRET_KEY`, `NCBI_API_KEY`, `NCBI_ADMIN_EMAIL` are correctly set in the environment).

## II. Model Context Protocol (MCP) Overview (Spec: 2025-03-26)

MCP provides a standardized interface for LLMs (via host applications) to interact with external capabilities (tools, data) exposed by dedicated servers.

### A. Core Concepts & Architecture

- **Host:** Manages clients, LLM integration, security, and user consent (e.g., Claude Desktop, VS Code).
- **Client:** Resides in the host, connects 1:1 to a server, handles protocol.
- **Server:** Standalone process exposing capabilities (Resources, Tools, Prompts). Focuses on its domain, isolated from LLM/other servers.

```mermaid
graph LR
    subgraph "Host Application Process"
        H[Host]
        C1[Client 1]
        C2[Client 2]
        H --> C1
        H --> C2
    end
    subgraph "Server Process 1"
        S1["MCP Server A<br>(e.g., Filesystem)"]
        R1["Local Resource<br>e.g., Files"]
        S1 <--> R1
    end
    subgraph "Server Process 2"
        S2["MCP Server B<br>(e.g., API Wrapper)"]
        R2["Remote Resource<br>e.g., Web API"]
        S2 <--> R2
    end
    C1 <-->|MCP Protocol| S1
    C2 <-->|MCP Protocol| S2
```

- **Key Principles:** Simplicity, Composability, Isolation, Progressive Features.

### B. Protocol Basics

- **Communication:** JSON-RPC 2.0 over a transport (Stdio, Streamable HTTP).
- **Messages:** Requests (with `id`), Responses (`id` + `result`/`error`), Notifications (no `id`). Batches MUST be supported for receiving.
- **Lifecycle:**
  1.  **Initialization:** Client sends `initialize` (version, capabilities, clientInfo). Server responds (`initialize` response: agreed version, capabilities, serverInfo, instructions?). Client sends `initialized` notification.
  2.  **Operation:** Message exchange based on negotiated capabilities.
  3.  **Shutdown:** Transport disconnect.

### C. Server Capabilities

Servers expose functionality via:

1.  **Resources:**

    - **Purpose:** Expose data/content (files, DB records) as context. Application-controlled.
    - **ID:** Unique URI (e.g., `file:///path/to/doc.txt`).
    - **Discovery:** `resources/list` (paginated), `resources/templates/list` (paginated).
    - **Reading:** `resources/read` -> `ResourceContent` array (`text` or `blob`).
    - **Updates (Optional):** `listChanged: true` -> `notifications/resources/list_changed`. `subscribe: true` -> `resources/subscribe`, `notifications/resources/updated`. **MUST handle `resources/unsubscribe` request.**

2.  **Tools:**

    - **Purpose:** Expose executable functions for LLM invocation (via client). Model-controlled.
    - **Definition:** `Tool` object (`name`, `description`, `inputSchema` (JSON Schema), `annotations?`). Annotations are untrusted hints.
    - **Discovery:** `tools/list` (paginated).
    - **Invocation:** `tools/call` (`name`, `arguments`) -> `CallToolResult` (`content` array, `isError: boolean`). Execution errors reported via `isError: true`. **Rich, well-described schemas are CRUCIAL.**
    - **Updates (Optional):** `listChanged: true` -> `notifications/tools/list_changed` (MUST send after dynamic changes).

3.  **Prompts:**
    - **Purpose:** Reusable prompt templates/workflows. User-controlled.
    - **Definition:** `Prompt` object (`name`, `description?`, `arguments?`).
    - **Discovery:** `prompts/list` (paginated).
    - **Usage:** `prompts/get` (`name`, `arguments`) -> `GetPromptResult` (`messages` array).
    - **Updates (Optional):** `listChanged: true` -> `notifications/prompts/list_changed`.

### D. Interacting with Client Capabilities

- **Roots:** Client may provide filesystem roots (`file://`). Server receives list on init, updates via `notifications/roots/list_changed`. Servers SHOULD respect roots.
- **Sampling:** Server can request LLM completion via `sampling/createMessage`. Client SHOULD implement human-in-the-loop.

### E. Server Utilities (Selected)

- **Logging:** `logging` capability -> `notifications/message` (RFC 5424 levels). Client can send `logging/setLevel`.
- **Pagination:** List operations use `cursor`/`nextCursor`.
- **Cancellation:** `notifications/cancelled` (best-effort).
- **Ping:** `ping` request -> `{}` response.

## III. MCP Tool Development: Authoritative Workflow (TypeScript SDK)

This section mandates the process for creating MCP tools. Adherence ensures consistency, reliability, and leverages SDK benefits.

### A. Foundational Structure

1.  **Directory Organization**: Each tool resides in `src/mcp-server/tools/yourToolName/`.
    - `index.ts`: Barrel export for the registration function.
    - `logic.ts`: Contains the Zod schema for input, the core tool logic (handler function), and related type definitions.
    - `registration.ts`: Implements the tool registration using `server.tool()`.

### B. Step 1: Define Input Schema and Types (`logic.ts`)

Utilize Zod for robust schema definition and input validation. The SDK uses this to generate the JSON Schema for client discovery and to validate arguments at runtime.

```typescript
// src/mcp-server/tools/yourToolName/logic.ts
import { z } from "zod";

// Define Zod schema for tool input
export const YourToolInputSchema = z.object({
  query: z.string().min(3).describe("The search query, minimum 3 characters."),
  maxResults: z
    .number()
    .int()
    .positive()
    .optional()
    .default(10)
    .describe("Maximum results to return."),
  filterActive: z
    .boolean()
    .optional()
    .default(true)
    .describe("Filter by active status."),
});

// Infer TypeScript type from Zod schema
export type YourToolInput = z.infer<typeof YourToolInputSchema>;
```

**Note:** Descriptions in Zod schemas are critical as they inform LLM tool selection.

### C. Step 2: Implement Core Tool Logic (`logic.ts`)

The handler function encapsulates the tool's execution.

- **Signature**: `async (validatedInput: YourInputType, context: RequestContext): Promise<CallToolResult>`
- **`validatedInput`**: SDK-provided, schema-validated input.
- **`context`**: `RequestContext` for logging, error propagation, and correlation.
- **Return**: A `CallToolResult` object.
  - Success: `{ content: [{ type: "text", text: JSON.stringify(output) }], isError: false }`
  - Failure: `{ content: [{ type: "text", text: JSON.stringify(errorOutput) }], isError: true }` (Use `McpError` for `errorOutput`).

```typescript
// src/mcp-server/tools/yourToolName/logic.ts
// ... (Zod schema from above)
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  logger,
  RequestContext,
  requestContextService,
  sanitizeInputForLogging,
} from "../../../utils/index.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
// import { yourExternalService } from "../../../services/yourService.js"; // Example service import

export async function yourToolLogic(
  input: YourToolInput,
  parentRequestContext: RequestContext,
): Promise<CallToolResult> {
  const operationContext = requestContextService.createRequestContext({
    parentRequestId: parentRequestContext.requestId,
    operation: "yourToolLogicExecution",
    input: sanitizeInputForLogging(input),
  });

  logger.info(
    `Executing 'yourToolName'. Query: ${input.query}`,
    operationContext,
  );

  try {
    // const serviceResult = await yourExternalService.fetchData(input.query, input.maxResults);
    // Simulate service call for example
    const serviceResult = Array.from(
      { length: Math.min(input.maxResults, 5) },
      (_, i) => ({
        id: `item-${i + 1}`,
        title: `Result for ${input.query} #${i + 1}`,
        isActive: input.filterActive,
      }),
    );

    const output = {
      toolName: "yourToolName",
      queryEcho: input.query,
      results: serviceResult,
      timestamp: new Date().toISOString(),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      isError: false,
    };
  } catch (error: any) {
    logger.error(
      "Execution failed for 'yourToolName'",
      error,
      operationContext,
    );
    const mcpError =
      error instanceof McpError
        ? error
        : new McpError(
            BaseErrorCode.TOOL_EXECUTION_ERROR,
            `'yourToolName' failed: ${error.message || "Internal server error."}`,
            {
              originalErrorName: error.name,
              requestId: operationContext.requestId,
            },
          );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: {
              code: mcpError.code,
              message: mcpError.message,
              details: mcpError.details,
            },
          }),
        },
      ],
      isError: true,
    };
  }
}
```

### D. Step 3: Register the Tool (`registration.ts`)

Use `server.tool()` to register the defined logic with the MCP server.

- **Parameters for `server.tool()`**:
  1.  `name: string`: Public, unique tool name (e.g., `"your_tool_name"`).
  2.  `description: string`: Detailed explanation for LLM discovery.
  3.  `zodSchemaShape`: **The `.shape` property of the Zod schema object** (e.g., `YourToolInputSchema.shape`).
  4.  `handler: async (validatedInput, mcpToolContext) => Promise<CallToolResult>`: The SDK wraps your logic function.

```typescript
// src/mcp-server/tools/yourToolName/registration.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  ErrorHandler,
  requestContextService,
  RequestContext,
} from "../../../utils/index.js";
import { YourToolInputSchema, yourToolLogic, YourToolInput } from "./logic.js";

export function registerYourTool(server: McpServer): void {
  const operation = "registerYourTool";
  const regContext = requestContextService.createRequestContext({ operation });

  try {
    server.tool(
      "your_tool_name",
      "Processes a query with optional filters and returns structured results. Demonstrates tool registration.",
      YourToolInputSchema.shape, // CRITICAL: Pass the .shape
      async (validatedInput: YourToolInput, mcpProvidedContext: any) => {
        const handlerRequestContext =
          requestContextService.createRequestContext({
            parentRequestId: regContext.requestId, // Optional: link to registration context
            operation: "yourToolNameHandler",
            mcpToolContext: mcpProvidedContext, // Context from MCP SDK during call
          });
        return yourToolLogic(validatedInput, handlerRequestContext);
      },
    );
    logger.notice(`Tool 'your_tool_name' registered.`, regContext);
  } catch (error) {
    ErrorHandler.handleError(
      new McpError(
        BaseErrorCode.INITIALIZATION_FAILED,
        `Failed to register 'your_tool_name'`,
        {
          /* details */
        },
      ),
      {
        operation,
        context: regContext,
        errorCode: BaseErrorCode.INITIALIZATION_FAILED,
        critical: true,
      },
    );
  }
}
```

### E. Step 4: Export Registration (`index.ts`)

```typescript
// src/mcp-server/tools/yourToolName/index.ts
export * from "./registration.js";
```

### F. Step 5: Integrate into Server Initialization (`src/mcp-server/server.ts`)

```typescript
// src/mcp-server/server.ts
// ... other imports ...
import { registerYourTool } from "./tools/yourToolName/index.js"; // Import new tool registration
// ...
export async function createMcpServerInstance(
  options: McpServerOptions,
  serverInitContext: RequestContext,
): Promise<McpServer> {
  // ...
  const server = new McpServer(options);
  // ... register other tools ...
  registerYourTool(server); // Register the new tool
  // ...
  return server;
}
```

### G. SDK Usage (TypeScript) - IMPORTANT Adherence Required

- **High-Level SDK Abstractions (MANDATORY):**
  - **Use `server.tool(name, description, zodSchemaShape, handler)`:** This is the **sole authorized method** for defining tools. It handles registration, schema generation, validation, routing, and `CallToolResult` formatting.
  - **Use `server.resource(regName, template, metadata, handler)`:** Similarly, this is the authorized method for resources.
- **Low-Level SDK Handlers (PROHIBITED for Tools/Resources):**
  - Direct use of `server.setRequestHandler(SchemaObject, handler)` for capabilities like tools or resources that have high-level SDK abstractions is **strictly prohibited**.
  - **CRITICAL WARNING:** Mixing high-level (`server.tool`, `server.resource`) and low-level (`server.setRequestHandler`) approaches for the _same capability type_ (e.g., tools) WILL lead to SDK internal state corruption, unpredictable errors, and non-compliant behavior. **No exceptions.**

## IV. Security Mandates

- **Input Validation**: Enforce strictly via Zod schemas. Sanitize all external inputs (paths, HTML, SQL queries) using `src/utils/security/sanitization.ts`.
- **Access Control**: Adhere to the principle of least privilege. Respect client-provided filesystem roots.
- **Transport Security**:
  - **HTTP**: JWT authentication is MANDATORY (`MCP_AUTH_SECRET_KEY`). Validate `Origin` header (`isOriginAllowed`). Deploy HTTPS in production. Bind to `127.0.0.1` for local-only servers.
  - **Stdio**: Authentication is typically managed by the host. Do not implement separate auth for stdio MCP server processes.
- **Secrets Management**: Use environment variables (`NCBI_API_KEY`, `MCP_AUTH_SECRET_KEY`) or a dedicated secrets manager. NEVER hardcode secrets.
- **Dependency Audits**: Regularly run `npm audit` and update dependencies.
- **Rate Limiting**: Implement server-side queuing and delays for external services like NCBI E-utilities (`NCBI_REQUEST_DELAY_MS`).

## V. JSDoc and Code Documentation Standards

- **Purpose**: JSDoc complements TypeScript, explaining purpose, behavior, and non-obvious considerations.
- **Standard Tags**: Use tags defined in `tsdoc.json` (e.g., `@fileoverview`, `@module`, `@param`, `@returns`, `@throws`, `@example`).
- **File Overview**: Start each file with a `@fileoverview` and `@module` JSDoc block.
- **Focus**: Explain the "why" and "how." Rely on TypeScript for type details; use JSDoc `@param`/`@returns` for additional clarification beyond types.
- **Conciseness**: Be brief and direct.
- **Formatting**: Adhere to Prettier (`npm run format`).

## VI. Core Project Utilities (Refer to `src/utils/`)

Integrate these utilities consistently:

1.  **Logging (`src/utils/internal/logger.ts`)**: Structured, RFC 5424 compliant.

    Here's the full logger file content so you can understand the overall expected code style, JSDocs, etc:

    ```typescript
    /**
     * @fileoverview Provides a singleton Logger class that wraps Winston for file logging
     * and supports sending MCP (Model Context Protocol) `notifications/message`.
     * It handles different log levels compliant with RFC 5424 and MCP specifications.
     * @module src/utils/internal/logger
     */
    import path from "path";
    import winston from "winston";
    import TransportStream from "winston-transport";
    import { config } from "../../config/index.js";
    import { RequestContext } from "./requestContext.js";

    /**
     * Defines the supported logging levels based on RFC 5424 Syslog severity levels,
     * as used by the Model Context Protocol (MCP).
     * Levels are: 'debug'(7), 'info'(6), 'notice'(5), 'warning'(4), 'error'(3), 'crit'(2), 'alert'(1), 'emerg'(0).
     * Lower numeric values indicate higher severity.
     */
    export type McpLogLevel =
      | "debug"
      | "info"
      | "notice"
      | "warning"
      | "error"
      | "crit"
      | "alert"
      | "emerg";

    /**
     * Numeric severity mapping for MCP log levels (lower is more severe).
     * @private
     */
    const mcpLevelSeverity: Record<McpLogLevel, number> = {
      emerg: 0,
      alert: 1,
      crit: 2,
      error: 3,
      warning: 4,
      notice: 5,
      info: 6,
      debug: 7,
    };

    /**
     * Maps MCP log levels to Winston's core levels for file logging.
     * @private
     */
    const mcpToWinstonLevel: Record<
      McpLogLevel,
      "debug" | "info" | "warn" | "error"
    > = {
      debug: "debug",
      info: "info",
      notice: "info",
      warning: "warn",
      error: "error",
      crit: "error",
      alert: "error",
      emerg: "error",
    };

    /**
     * Interface for a more structured error object, primarily for formatting console logs.
     * @private
     */
    interface ErrorWithMessageAndStack {
      message?: string;
      stack?: string;
      [key: string]: any;
    }

    /**
     * Interface for the payload of an MCP log notification.
     * This structure is used when sending log data via MCP `notifications/message`.
     */
    export interface McpLogPayload {
      message: string;
      context?: RequestContext;
      error?: {
        message: string;
        stack?: string;
      };
      [key: string]: any;
    }

    /**
     * Type for the `data` parameter of the `McpNotificationSender` function.
     */
    export type McpNotificationData = McpLogPayload | Record<string, unknown>;

    /**
     * Defines the signature for a function that can send MCP log notifications.
     * This function is typically provided by the MCP server instance.
     * @param level - The severity level of the log message.
     * @param data - The payload of the log notification.
     * @param loggerName - An optional name or identifier for the logger/server.
     */
    export type McpNotificationSender = (
      level: McpLogLevel,
      data: McpNotificationData,
      loggerName?: string,
    ) => void;

    // The logsPath from config is already resolved and validated by src/config/index.ts
    const resolvedLogsDir = config.logsPath;
    const isLogsDirSafe = !!resolvedLogsDir; // If logsPath is set, it's considered safe by config logic.

    /**
     * Creates the Winston console log format.
     * @returns The Winston log format for console output.
     * @private
     */
    function createWinstonConsoleFormat(): winston.Logform.Format {
      return winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          let metaString = "";
          const metaCopy = { ...meta };
          if (metaCopy.error && typeof metaCopy.error === "object") {
            const errorObj = metaCopy.error as ErrorWithMessageAndStack;
            if (errorObj.message)
              metaString += `\n  Error: ${errorObj.message}`;
            if (errorObj.stack)
              metaString += `\n  Stack: ${String(errorObj.stack)
                .split("\n")
                .map((l: string) => `    ${l}`)
                .join("\n")}`;
            delete metaCopy.error;
          }
          if (Object.keys(metaCopy).length > 0) {
            try {
              const replacer = (_key: string, value: unknown) =>
                typeof value === "bigint" ? value.toString() : value;
              const remainingMetaJson = JSON.stringify(metaCopy, replacer, 2);
              if (remainingMetaJson !== "{}")
                metaString += `\n  Meta: ${remainingMetaJson}`;
            } catch (stringifyError: unknown) {
              const errorMessage =
                stringifyError instanceof Error
                  ? stringifyError.message
                  : String(stringifyError);
              metaString += `\n  Meta: [Error stringifying metadata: ${errorMessage}]`;
            }
          }
          return `${timestamp} ${level}: ${message}${metaString}`;
        }),
      );
    }

    /**
     * Singleton Logger class that wraps Winston for robust logging.
     * Supports file logging, conditional console logging, and MCP notifications.
     */
    export class Logger {
      private static instance: Logger;
      private winstonLogger?: winston.Logger;
      private initialized = false;
      private mcpNotificationSender?: McpNotificationSender;
      private currentMcpLevel: McpLogLevel = "info";
      private currentWinstonLevel: "debug" | "info" | "warn" | "error" = "info";

      private readonly MCP_NOTIFICATION_STACK_TRACE_MAX_LENGTH = 1024;
      private readonly LOG_FILE_MAX_SIZE = 5 * 1024 * 1024; // 5MB
      private readonly LOG_MAX_FILES = 5;

      /** @private */
      private constructor() {}

      /**
       * Initializes the Winston logger instance.
       * Should be called once at application startup.
       * @param level - The initial minimum MCP log level.
       */
      public async initialize(level: McpLogLevel = "info"): Promise<void> {
        if (this.initialized) {
          this.warning("Logger already initialized.", {
            loggerSetup: true,
            requestId: "logger-init",
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // Set initialized to true at the beginning of the initialization process.
        this.initialized = true;

        this.currentMcpLevel = level;
        this.currentWinstonLevel = mcpToWinstonLevel[level];

        // The logs directory (config.logsPath / resolvedLogsDir) is expected to be created and validated
        // by the configuration module (src/config/index.ts) before logger initialization.
        // If isLogsDirSafe is true, we assume resolvedLogsDir exists and is usable.
        // No redundant directory creation logic here.

        const fileFormat = winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json(),
        );

        const transports: TransportStream[] = [];
        const fileTransportOptions = {
          format: fileFormat,
          maxsize: this.LOG_FILE_MAX_SIZE,
          maxFiles: this.LOG_MAX_FILES,
          tailable: true,
        };

        if (isLogsDirSafe) {
          transports.push(
            new winston.transports.File({
              filename: path.join(resolvedLogsDir, "error.log"),
              level: "error",
              ...fileTransportOptions,
            }),
            new winston.transports.File({
              filename: path.join(resolvedLogsDir, "warn.log"),
              level: "warn",
              ...fileTransportOptions,
            }),
            new winston.transports.File({
              filename: path.join(resolvedLogsDir, "info.log"),
              level: "info",
              ...fileTransportOptions,
            }),
            new winston.transports.File({
              filename: path.join(resolvedLogsDir, "debug.log"),
              level: "debug",
              ...fileTransportOptions,
            }),
            new winston.transports.File({
              filename: path.join(resolvedLogsDir, "combined.log"),
              ...fileTransportOptions,
            }),
          );
        } else {
          if (process.stdout.isTTY) {
            console.warn(
              "File logging disabled as logsPath is not configured or invalid.",
            );
          }
        }

        this.winstonLogger = winston.createLogger({
          level: this.currentWinstonLevel,
          transports,
          exitOnError: false,
        });

        // Configure console transport after Winston logger is created
        const consoleStatus = this._configureConsoleTransport();

        const initialContext: RequestContext = {
          loggerSetup: true,
          requestId: "logger-init-deferred",
          timestamp: new Date().toISOString(),
        };
        // Removed logging of logsDirCreatedMessage as it's no longer set
        if (consoleStatus.message) {
          this.info(consoleStatus.message, initialContext);
        }

        this.initialized = true; // Ensure this is set after successful setup
        this.info(
          `Logger initialized. File logging level: ${this.currentWinstonLevel}. MCP logging level: ${this.currentMcpLevel}. Console logging: ${consoleStatus.enabled ? "enabled" : "disabled"}`,
          {
            loggerSetup: true,
            requestId: "logger-post-init",
            timestamp: new Date().toISOString(),
            logsPathUsed: resolvedLogsDir,
          },
        );
      }

      /**
       * Sets the function used to send MCP 'notifications/message'.
       * @param sender - The function to call for sending notifications, or undefined to disable.
       */
      public setMcpNotificationSender(
        sender: McpNotificationSender | undefined,
      ): void {
        this.mcpNotificationSender = sender;
        const status = sender ? "enabled" : "disabled";
        this.info(`MCP notification sending ${status}.`, {
          loggerSetup: true,
          requestId: "logger-set-sender",
          timestamp: new Date().toISOString(),
        });
      }

      /**
       * Dynamically sets the minimum logging level.
       * @param newLevel - The new minimum MCP log level to set.
       */
      public setLevel(newLevel: McpLogLevel): void {
        const setLevelContext: RequestContext = {
          loggerSetup: true,
          requestId: "logger-set-level",
          timestamp: new Date().toISOString(),
        };
        if (!this.ensureInitialized()) {
          if (process.stdout.isTTY) {
            console.error("Cannot set level: Logger not initialized.");
          }
          return;
        }
        if (!(newLevel in mcpLevelSeverity)) {
          this.warning(
            `Invalid MCP log level provided: ${newLevel}. Level not changed.`,
            setLevelContext,
          );
          return;
        }

        const oldLevel = this.currentMcpLevel;
        this.currentMcpLevel = newLevel;
        this.currentWinstonLevel = mcpToWinstonLevel[newLevel];
        if (this.winstonLogger) {
          // Ensure winstonLogger is defined
          this.winstonLogger.level = this.currentWinstonLevel;
        }

        const consoleStatus = this._configureConsoleTransport();

        if (oldLevel !== newLevel) {
          this.info(
            `Log level changed. File logging level: ${this.currentWinstonLevel}. MCP logging level: ${this.currentMcpLevel}. Console logging: ${consoleStatus.enabled ? "enabled" : "disabled"}`,
            setLevelContext,
          );
          if (
            consoleStatus.message &&
            consoleStatus.message !== "Console logging status unchanged."
          ) {
            this.info(consoleStatus.message, setLevelContext);
          }
        }
      }

      /**
       * Configures the console transport based on the current log level and TTY status.
       * Adds or removes the console transport as needed.
       * @returns {{ enabled: boolean, message: string | null }} Status of console logging.
       * @private
       */
      private _configureConsoleTransport(): {
        enabled: boolean;
        message: string | null;
      } {
        if (!this.winstonLogger) {
          return {
            enabled: false,
            message:
              "Cannot configure console: Winston logger not initialized.",
          };
        }

        const consoleTransport = this.winstonLogger.transports.find(
          (t) => t instanceof winston.transports.Console,
        );
        const shouldHaveConsole =
          this.currentMcpLevel === "debug" && process.stdout.isTTY;
        let message: string | null = null;

        if (shouldHaveConsole && !consoleTransport) {
          const consoleFormat = createWinstonConsoleFormat();
          this.winstonLogger.add(
            new winston.transports.Console({
              level: "debug", // Console always logs debug if enabled
              format: consoleFormat,
            }),
          );
          message = "Console logging enabled (level: debug, stdout is TTY).";
        } else if (!shouldHaveConsole && consoleTransport) {
          this.winstonLogger.remove(consoleTransport);
          message =
            "Console logging disabled (level not debug or stdout not TTY).";
        } else {
          message = "Console logging status unchanged.";
        }
        return { enabled: shouldHaveConsole, message };
      }

      /**
       * Gets the singleton instance of the Logger.
       * @returns The singleton Logger instance.
       */
      public static getInstance(): Logger {
        if (!Logger.instance) {
          Logger.instance = new Logger();
        }
        return Logger.instance;
      }

      /**
       * Ensures the logger has been initialized.
       * @returns True if initialized, false otherwise.
       * @private
       */
      private ensureInitialized(): boolean {
        if (!this.initialized || !this.winstonLogger) {
          if (process.stdout.isTTY) {
            console.warn("Logger not initialized; message dropped.");
          }
          return false;
        }
        return true;
      }

      /**
       * Centralized log processing method.
       * @param level - The MCP severity level of the message.
       * @param msg - The main log message.
       * @param context - Optional request context for the log.
       * @param error - Optional error object associated with the log.
       * @private
       */
      private log(
        level: McpLogLevel,
        msg: string,
        context?: RequestContext,
        error?: Error,
      ): void {
        if (!this.ensureInitialized()) return;
        if (mcpLevelSeverity[level] > mcpLevelSeverity[this.currentMcpLevel]) {
          return; // Do not log if message level is less severe than currentMcpLevel
        }

        const logData: Record<string, unknown> = { ...context };
        const winstonLevel = mcpToWinstonLevel[level];

        if (error) {
          this.winstonLogger!.log(winstonLevel, msg, { ...logData, error });
        } else {
          this.winstonLogger!.log(winstonLevel, msg, logData);
        }

        if (this.mcpNotificationSender) {
          const mcpDataPayload: McpLogPayload = { message: msg };
          if (context && Object.keys(context).length > 0)
            mcpDataPayload.context = context;
          if (error) {
            mcpDataPayload.error = { message: error.message };
            // Include stack trace in debug mode for MCP notifications, truncated for brevity
            if (this.currentMcpLevel === "debug" && error.stack) {
              mcpDataPayload.error.stack = error.stack.substring(
                0,
                this.MCP_NOTIFICATION_STACK_TRACE_MAX_LENGTH,
              );
            }
          }
          try {
            const serverName =
              config?.mcpServerName ?? "MCP_SERVER_NAME_NOT_CONFIGURED";
            this.mcpNotificationSender(level, mcpDataPayload, serverName);
          } catch (sendError: unknown) {
            const errorMessage =
              sendError instanceof Error
                ? sendError.message
                : String(sendError);
            const internalErrorContext: RequestContext = {
              requestId: context?.requestId || "logger-internal-error",
              timestamp: new Date().toISOString(),
              originalLevel: level,
              originalMessage: msg,
              sendError: errorMessage,
              mcpPayload: JSON.stringify(mcpDataPayload).substring(0, 500), // Log a preview
            };
            this.winstonLogger!.error(
              "Failed to send MCP log notification",
              internalErrorContext,
            );
          }
        }
      }

      /** Logs a message at the 'debug' level. */
      public debug(msg: string, context?: RequestContext): void {
        this.log("debug", msg, context);
      }

      /** Logs a message at the 'info' level. */
      public info(msg: string, context?: RequestContext): void {
        this.log("info", msg, context);
      }

      /** Logs a message at the 'notice' level. */
      public notice(msg: string, context?: RequestContext): void {
        this.log("notice", msg, context);
      }

      /** Logs a message at the 'warning' level. */
      public warning(msg: string, context?: RequestContext): void {
        this.log("warning", msg, context);
      }

      /**
       * Logs a message at the 'error' level.
       * @param msg - The main log message.
       * @param err - Optional. Error object or RequestContext.
       * @param context - Optional. RequestContext if `err` is an Error.
       */
      public error(
        msg: string,
        err?: Error | RequestContext,
        context?: RequestContext,
      ): void {
        const errorObj = err instanceof Error ? err : undefined;
        const actualContext = err instanceof Error ? context : err;
        this.log("error", msg, actualContext, errorObj);
      }

      /**
       * Logs a message at the 'crit' (critical) level.
       * @param msg - The main log message.
       * @param err - Optional. Error object or RequestContext.
       * @param context - Optional. RequestContext if `err` is an Error.
       */
      public crit(
        msg: string,
        err?: Error | RequestContext,
        context?: RequestContext,
      ): void {
        const errorObj = err instanceof Error ? err : undefined;
        const actualContext = err instanceof Error ? context : err;
        this.log("crit", msg, actualContext, errorObj);
      }

      /**
       * Logs a message at the 'alert' level.
       * @param msg - The main log message.
       * @param err - Optional. Error object or RequestContext.
       * @param context - Optional. RequestContext if `err` is an Error.
       */
      public alert(
        msg: string,
        err?: Error | RequestContext,
        context?: RequestContext,
      ): void {
        const errorObj = err instanceof Error ? err : undefined;
        const actualContext = err instanceof Error ? context : err;
        this.log("alert", msg, actualContext, errorObj);
      }

      /**
       * Logs a message at the 'emerg' (emergency) level.
       * @param msg - The main log message.
       * @param err - Optional. Error object or RequestContext.
       * @param context - Optional. RequestContext if `err` is an Error.
       */
      public emerg(
        msg: string,
        err?: Error | RequestContext,
        context?: RequestContext,
      ): void {
        const errorObj = err instanceof Error ? err : undefined;
        const actualContext = err instanceof Error ? context : err;
        this.log("emerg", msg, actualContext, errorObj);
      }

      /**
       * Logs a message at the 'emerg' (emergency) level, typically for fatal errors.
       * @param msg - The main log message.
       * @param err - Optional. Error object or RequestContext.
       * @param context - Optional. RequestContext if `err` is an Error.
       */
      public fatal(
        msg: string,
        err?: Error | RequestContext,
        context?: RequestContext,
      ): void {
        const errorObj = err instanceof Error ? err : undefined;
        const actualContext = err instanceof Error ? context : err;
        this.log("emerg", msg, actualContext, errorObj);
      }
    }

    /**
     * The singleton instance of the Logger.
     * Use this instance for all logging operations.
     */
    export const logger = Logger.getInstance();
    ```

2.  **Error Handling (`src/types-global/errors.ts`, `src/utils/internal/errorHandler.ts`)**: `McpError`, `ErrorHandler.tryCatch`.
3.  **Request Context (`src/utils/internal/requestContext.ts`)**: `requestContextService.createRequestContext()`.
4.  **ID Generation (`src/utils/security/idGenerator.ts`)**: `idGenerator.generateForEntity()`, `generateUUID()`.
5.  **Sanitization (`src/utils/security/sanitization.ts`)**: `sanitization.sanitizeHtml()`, etc., `sanitizeInputForLogging()`.
6.  **JSON Parsing (`src/utils/parsing/jsonParser.ts`)**: `jsonParser.parse()` for potentially partial JSON.
7.  **Rate Limiting (`src/utils/security/rateLimiter.ts`)**: `rateLimiter.check()`, `rateLimiter.configure()`.
8.  **Token Counting (`src/utils/metrics/tokenCounter.ts`)**: `countTokens()`, `countChatTokens()`.

## VII. Utility Scripts (`scripts/`)

- **`clean.ts`**: `npm run rebuild` (removes `dist/`, `logs/`).
- **`make-executable.ts`**: `npm run build` (`chmod +x dist/index.js`).
- **`tree.ts`**: `npm run tree` (generates `docs/tree.md`).
- **`fetch-openapi-spec.ts`**: `npm run fetch-spec <url> <output-path>`.

## VIII. Project Specifics: PubMed Integration

### A. Implemented PubMed Tools & Resources

Refer to `src/mcp-server/tools/` and `src/mcp-server/resources/` for implementations.

- **Tools:**
  - **`search_pubmed_articles`**: (`src/mcp-server/tools/searchPubMedArticles/`) Uses ESearch, ESummary.
  - **`fetch_pubmed_content`**: (`src/mcp-server/tools/fetchPubMedContent/`) Uses EFetch.
  - **`get_pubmed_article_connections`**: (`src/mcp-server/tools/getPubMedArticleConnections/`) Uses ELink, EFetch.
  - **`pubmed_research_agent`**: (`src/mcp-server/tools/pubmedResearchAgent/`) Generates a standardized JSON research plan.
  - **`generate_pubmed_chart`**: (`src/mcp-server/tools/generatePubMedChart/`) Generates SVG charts.
- **Resources:**
  - **`echoResource`**: (`src/mcp-server/resources/echoResource/`) Example, not PubMed specific.

### B. PubMed Resources To Be Implemented

- **`serverInfo`**:
  - **Description:** Provides comprehensive information about the `pubmed-mcp-server`, configuration, NCBI compliance, and status.
  - **URI Example:** `pubmed-connect://info`
- **`getPubMedStats`**:
  - **Description:** Retrieves general statistics about the PubMed database using `EInfo`.
  - **URI Example:** `pubmed-connect://stats/pubmed`
  - **Underlying E-utility:** `EInfo`.

### C. Important NCBI E-utility Considerations

- **Error Handling:** NCBI E-utilities return errors in XML format. The NCBI interaction service (`src/services/NCBI/ncbiService.ts`) MUST parse these and translate them into appropriate `McpError` instances with specific error codes (e.g., `NCBI_API_ERROR`, `NCBI_PARSING_ERROR`).
- **Rate Limiting:** Strictly adhere to NCBI's rate limits (3 requests/second without API key, 10 requests/second with API key). Robust queuing and delay mechanisms are implemented in `src/services/NCBI/ncbiService.ts` via `NCBI_REQUEST_DELAY_MS`.
- **XML Parsing:** PubMed XML is complex. `fast-xml-parser` is utilized in `src/services/NCBI/ncbiService.ts`. Dedicated parsing functions for different E-utility responses and common XML data structures (e.g., AuthorList, MeshHeadingList) are implemented within tool logic files (e.g., `src/mcp-server/tools/fetchPubMedContent/logic.ts`) and helper utilities (`src/utils/parsing/ncbi-parsing/`).
- **Data Transformation:** Transform parsed XML data into the structured JSON formats defined in the project specification for tool outputs. This is a key responsibility of each tool's logic.

## IX. Key File Locations (for `pubmed-mcp-server`)

- **Main Entry**: `src/index.ts`
- **Server Setup**: `src/mcp-server/server.ts`
- **HTTP Auth Middleware**: `src/mcp-server/transports/authentication/authMiddleware.ts`
- **Configuration**: `src/config/index.ts` (Loads env vars, package info, initializes logger)
- **Global Types**: `src/types-global/errors.ts`, `src/types-global/pubmedXml.ts`
- **Utilities (Barrel)**: `src/utils/index.ts`
  - **PubMed XML Helpers**: `src/utils/parsing/ncbi-parsing/`
- **NCBI Interaction Service**: `src/services/NCBI/ncbiService.ts`
- **Tool Implementations**: `src/mcp-server/tools/`
- **Resource Implementations**: `src/mcp-server/resources/`

# pubmed-mcp-server - Directory Structure

Generated on: 2025-06-13 08:53:02

```
pubmed-mcp-server
├── .github
│   ├── workflows
│   │   └── publish.yml
│   └── FUNDING.yml
├── docs
│   ├── api-references
│   │   ├── jsdoc-standard-tags.md
│   │   └── typedoc-reference.md
│   ├── project-spec.md
│   └── tree.md
├── examples
│   ├── fetch_pubmed_content_example.md
│   ├── generate_pubmed_chart_example_bar.svg
│   ├── generate_pubmed_chart_example_line.svg
│   ├── generate_pubmed_chart_example_scatter.svg
│   ├── get_pubmed_article_connections_1.md
│   ├── get_pubmed_article_connections_2.md
│   ├── pubmed_research_agent_example.md
│   └── search_pubmed_articles_example.md
├── scripts
│   ├── clean.ts
│   ├── fetch-openapi-spec.ts
│   ├── make-executable.ts
│   └── tree.ts
├── src
│   ├── config
│   │   └── index.ts
│   ├── mcp-server
│   │   ├── resources
│   │   │   └── echoResource
│   │   │       ├── echoResourceLogic.ts
│   │   │       ├── index.ts
│   │   │       └── registration.ts
│   │   ├── tools
│   │   │   ├── fetchPubMedContent
│   │   │   │   ├── index.ts
│   │   │   │   ├── logic.ts
│   │   │   │   └── registration.ts
│   │   │   ├── generatePubMedChart
│   │   │   │   ├── index.ts
│   │   │   │   ├── logic.ts
│   │   │   │   └── registration.ts
│   │   │   ├── getPubMedArticleConnections
│   │   │   │   ├── logic
│   │   │   │   │   ├── citationFormatter.ts
│   │   │   │   │   ├── elinkHandler.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   └── types.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── logic.ts
│   │   │   │   └── registration.ts
│   │   │   ├── pubmedResearchAgent
│   │   │   │   ├── logic
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── inputSchema.ts
│   │   │   │   │   ├── outputTypes.ts
│   │   │   │   │   └── planOrchestrator.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── logic.ts
│   │   │   │   └── registration.ts
│   │   │   └── searchPubMedArticles
│   │   │       ├── index.ts
│   │   │       ├── logic.ts
│   │   │       └── registration.ts
│   │   ├── transports
│   │   │   ├── authentication
│   │   │   │   ├── authContext.ts
│   │   │   │   ├── authMiddleware.ts
│   │   │   │   ├── authUtils.ts
│   │   │   │   ├── oauthMiddleware.ts
│   │   │   │   └── types.ts
│   │   │   ├── httpTransport.ts
│   │   │   └── stdioTransport.ts
│   │   └── server.ts
│   ├── services
│   │   └── NCBI
│   │       ├── ncbiConstants.ts
│   │       ├── ncbiCoreApiClient.ts
│   │       ├── ncbiRequestQueueManager.ts
│   │       ├── ncbiResponseHandler.ts
│   │       └── ncbiService.ts
│   ├── types-global
│   │   ├── errors.ts
│   │   └── pubmedXml.ts
│   ├── utils
│   │   ├── internal
│   │   │   ├── errorHandler.ts
│   │   │   ├── index.ts
│   │   │   ├── logger.ts
│   │   │   └── requestContext.ts
│   │   ├── metrics
│   │   │   ├── index.ts
│   │   │   └── tokenCounter.ts
│   │   ├── parsing
│   │   │   ├── ncbi-parsing
│   │   │   │   ├── eSummaryResultParser.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── pubmedArticleStructureParser.ts
│   │   │   │   └── xmlGenericHelpers.ts
│   │   │   ├── dateParser.ts
│   │   │   ├── index.ts
│   │   │   └── jsonParser.ts
│   │   ├── security
│   │   │   ├── idGenerator.ts
│   │   │   ├── index.ts
│   │   │   ├── rateLimiter.ts
│   │   │   └── sanitization.ts
│   │   └── index.ts
│   └── index.ts
├── .clinerules
├── .dockerignore
├── .gitignore
├── CHANGELOG.md
├── CLAUDE.md
├── Dockerfile
├── LICENSE
├── mcp.json
├── NOTICE
├── package-lock.json
├── package.json
├── README.md
├── repomix.config.json
├── smithery.yaml
├── tsconfig.json
├── tsconfig.typedoc.json
├── tsdoc.json
└── typedoc.json
```

_Note: This tree excludes files and directories matched by .gitignore and default patterns._

This guide is authoritative. Deviations require explicit approval. Keep this document synchronized with code evolution.
