import { Hono, Context, Next } from "hono";
import { cors } from "hono/cors";
import { stream } from "hono/streaming";
import { config } from "./config/index.js";
import {
  logger,
  rateLimiter,
  requestContextService,
  RequestContext,
} from "./utils/index.js";
import {
  createMcpServerInstance,
  ServerInstanceInfo,
} from "./mcp-server/server.js";
import { createAuthMiddleware, createAuthStrategy } from "./mcp-server/transports/auth/index.js";
import { mcpTransportMiddleware } from "./mcp-server/transports/http/mcpTransportMiddleware.js";
import { httpErrorHandler } from "./mcp-server/transports/http/httpErrorHandler.js";
import { TransportManager } from "./mcp-server/transports/core/transportTypes.js";
import { StatefulTransportManager } from "./mcp-server/transports/core/statefulTransportManager.js";
import { StatelessTransportManager } from "./mcp-server/transports/core/statelessTransportManager.js";

function getClientIp(c: Context): string {
  const forwardedFor = c.req.header("x-forwarded-for");
  return (
    (forwardedFor?.split(",")[0] ?? "").trim() ||
    c.req.header("cf-connecting-ip") ||
    "unknown_ip"
  );
}

function createTransportManager(
  createServerInstanceFn: () => Promise<ServerInstanceInfo>,
  sessionMode: string,
  context: RequestContext,
): TransportManager {
  const opContext = { ...context, operation: "createTransportManager", sessionMode };
  logger.info(
    `Creating transport manager for session mode: ${sessionMode}`,
    opContext,
  );

  const statefulOptions = {
    staleSessionTimeoutMs: config.mcpStatefulSessionStaleTimeoutMs,
    mcpHttpEndpointPath: config.mcpHttpEndpointPath,
  };

  const getMcpServer = async () => (await createServerInstanceFn()).server;

  switch (sessionMode) {
    case "stateless":
      return new StatelessTransportManager(getMcpServer);
    case "stateful":
      return new StatefulTransportManager(getMcpServer, statefulOptions);
    case "auto":
    default:
      logger.info(
        "Defaulting to 'auto' mode (stateful with stateless fallback).",
        opContext,
      );
      return new StatefulTransportManager(getMcpServer, statefulOptions);
  }
}

export function createWorkerApp(
  transportManager: TransportManager,
  createServerInstanceFn: () => Promise<ServerInstanceInfo>,
  parentContext: RequestContext,
): Hono {
  const app = new Hono();
  const transportContext = { ...parentContext, component: "HttpTransportSetup" };
  logger.info("Creating Hono HTTP application.", transportContext);

  app.use(
    "*",
    cors({
      origin: config.mcpAllowedOrigins || [],
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "Mcp-Session-Id",
        "Last-Event-ID",
        "Authorization",
      ],
      credentials: true,
    }),
  );

  app.use(
    config.mcpHttpEndpointPath,
    async (c: Context, next: Next) => {
      const clientIp = getClientIp(c);
      const context = requestContextService.createRequestContext({
        operation: "httpRateLimitCheck",
        ipAddress: clientIp,
      });
      try {
        rateLimiter.check(clientIp, context);
        logger.debug("Rate limit check passed.", context);
      } catch (error) {
        logger.warning("Rate limit check failed.", {
          ...context,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      await next();
    },
  );

  const authStrategy = createAuthStrategy();
  if (authStrategy) {
    logger.info(
      "Authentication strategy found, enabling auth middleware.",
      transportContext,
    );
    app.use(config.mcpHttpEndpointPath, createAuthMiddleware(authStrategy));
  } else {
    logger.info(
      "No authentication strategy found, auth middleware disabled.",
      transportContext,
    );
  }

  app.onError(httpErrorHandler);

  app.get("/healthz", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get(config.mcpHttpEndpointPath, async (c) => {
    const sessionId = c.req.header("mcp-session-id");
    if (sessionId) {
      return c.text("GET requests to existing sessions are not supported.", 405);
    }

    const { tools, identity, options } = await createServerInstanceFn();
    const effectiveSessionMode =
      transportManager instanceof StatefulTransportManager
        ? "stateful"
        : "stateless";

    return c.json({
      status: "ok",
      server: {
        name: identity.name,
        version: identity.version,
        description: identity.description || "No description provided.",
        nodeVersion: process.version,
        environment: config.environment,
        capabilities: options.capabilities,
      },
      sessionMode: {
        configured: config.mcpSessionMode,
        effective: effectiveSessionMode,
      },
      tools,
      message:
        "Server is running. POST to this endpoint to execute a tool call.",
    });
  });

  app.post(
    config.mcpHttpEndpointPath,
    mcpTransportMiddleware(transportManager, createServerInstanceFn),
    (c) => {
      const response = c.get("mcpResponse");

      if (response.sessionId) {
        c.header("Mcp-Session-Id", response.sessionId);
      }
      response.headers.forEach((value, key) => {
        c.header(key, value);
      });

      c.status(response.statusCode);

      if (response.type === "stream") {
        return stream(c, async (s) => {
          await s.pipe(response.stream);
        });
      } else {
        const body =
          typeof response.body === "object" && response.body !== null
            ? response.body
            : { body: response.body };
        return c.json(body);
      }
    },
  );

  app.delete(config.mcpHttpEndpointPath, async (c) => {
    const sessionId = c.req.header("mcp-session-id");
    const context = requestContextService.createRequestContext({
      ...transportContext,
      operation: "handleDeleteRequest",
      sessionId,
    });

    if (sessionId) {
      if (transportManager instanceof StatefulTransportManager) {
        const response = await transportManager.handleDeleteRequest(
          sessionId,
          context,
        );
        if (response.type === "buffered") {
          const body =
            typeof response.body === "object" && response.body !== null
              ? response.body
              : { body: response.body };
          return c.json(body, response.statusCode);
        }
        return c.body(null, response.statusCode);
      } else {
        return c.json(
          {
            error: "Method Not Allowed",
            message: "DELETE operations are not supported in this mode.",
          },
          405,
        );
      }
    } else {
      return c.json({
        status: "stateless_mode",
        message: "No sessions to delete in stateless mode",
      });
    }
  });

  logger.info("Hono application setup complete.", transportContext);
  return app;
}

const workerContext = requestContextService.createRequestContext({
  operation: "workerStartup",
});
const transportManager = createTransportManager(
  createMcpServerInstance,
  config.mcpSessionMode,
  workerContext,
);
const app = createWorkerApp(
  transportManager,
  createMcpServerInstance,
  workerContext,
);

export default {
  fetch: app.fetch,
};

