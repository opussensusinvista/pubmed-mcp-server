/**
 * @fileoverview Registers the 'get_pubmed_article_connections' tool with the MCP server.
 * This tool finds articles related to a source PMID or retrieves citation formats.
 * @module src/mcp-server/tools/getPubMedArticleConnections/registration
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  ErrorHandler,
  logger,
  RequestContext,
  requestContextService,
} from "../../../utils/index.js";
import {
  GetPubMedArticleConnectionsInput,
  GetPubMedArticleConnectionsInputSchema,
  handleGetPubMedArticleConnections,
} from "./logic/index.js";

/**
 * Registers the 'get_pubmed_article_connections' tool with the given MCP server instance.
 * @param {McpServer} server - The MCP server instance.
 */
export async function registerGetPubMedArticleConnectionsTool(
  server: McpServer,
): Promise<void> {
  const operation = "registerGetPubMedArticleConnectionsTool";
  const toolName = "get_pubmed_article_connections";
  const toolDescription =
    "Finds articles related to a source PubMed ID (PMID) or retrieves formatted citations for it. Supports finding similar articles, articles that cite the source, articles referenced by the source (via NCBI ELink), or fetching data to generate citations in various styles (RIS, BibTeX, APA, MLA via NCBI EFetch and server-side formatting). Returns a JSON object detailing the connections or formatted citations.";
  const context = requestContextService.createRequestContext({ operation });

  await ErrorHandler.tryCatch(
    async () => {
      server.tool(
        toolName,
        toolDescription,
        GetPubMedArticleConnectionsInputSchema.shape,
        async (
          input: GetPubMedArticleConnectionsInput,
          mcpProvidedContext: any,
        ): Promise<CallToolResult> => {
          const richContext: RequestContext =
            requestContextService.createRequestContext({
              parentRequestId: context.requestId,
              operation: "getPubMedArticleConnectionsToolHandler",
              mcpToolContext: mcpProvidedContext,
              input,
            });

          try {
            const result = await handleGetPubMedArticleConnections(
              input,
              richContext,
            );
            return {
              content: [
                { type: "text", text: JSON.stringify(result, null, 2) },
              ],
              isError: false,
            };
          } catch (error) {
            const handledError = ErrorHandler.handleError(error, {
              operation: "getPubMedArticleConnectionsToolHandler",
              context: richContext,
              input,
              rethrow: false,
            });

            const mcpError =
              handledError instanceof McpError
                ? handledError
                : new McpError(
                    BaseErrorCode.INTERNAL_ERROR,
                    "An unexpected error occurred while getting PubMed article connections.",
                    {
                      originalErrorName: handledError.name,
                      originalErrorMessage: handledError.message,
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
        },
      );
      logger.notice(`Tool '${toolName}' registered.`, context);
    },
    {
      operation,
      context,
      errorCode: BaseErrorCode.INITIALIZATION_FAILED,
      critical: true,
    },
  );
}
