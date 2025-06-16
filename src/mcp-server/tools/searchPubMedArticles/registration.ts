/**
 * @fileoverview Registration for the searchPubMedArticles MCP tool.
 * @module src/mcp-server/tools/searchPubMedArticles/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  ErrorHandler,
  logger,
  RequestContext,
  requestContextService,
} from "../../../utils/index.js";
import {
  SearchPubMedArticlesInput,
  SearchPubMedArticlesInputSchema,
  searchPubMedArticlesLogic,
} from "./logic.js";

/**
 * Registers the searchPubMedArticles tool with the MCP server.
 * @param server - The McpServer instance.
 */
export async function registerSearchPubMedArticlesTool(
  server: McpServer,
): Promise<void> {
  const operation = "registerSearchPubMedArticlesTool";
  const toolName = "search_pubmed_articles";
  const toolDescription =
    "Searches PubMed for articles using a query term and optional filters (max results, sort, date range, publication types). Uses NCBI ESearch to find PMIDs and ESummary (optional) for brief summaries. Returns a JSON object with search parameters, ESearch term, result counts, PMIDs, optional summaries (PMID, title, authors, source, dates), and E-utility URLs.";
  const context = requestContextService.createRequestContext({ operation });

  await ErrorHandler.tryCatch(
    async () => {
      server.tool(
        toolName,
        toolDescription,
        SearchPubMedArticlesInputSchema.shape,
        async (
          input: SearchPubMedArticlesInput,
          mcpProvidedContext: any,
        ): Promise<CallToolResult> => {
          const richContext: RequestContext =
            requestContextService.createRequestContext({
              parentRequestId: context.requestId,
              operation: "searchPubMedArticlesToolHandler",
              mcpToolContext: mcpProvidedContext,
              input,
            });

          try {
            const result = await searchPubMedArticlesLogic(input, richContext);
            return {
              content: [
                { type: "text", text: JSON.stringify(result, null, 2) },
              ],
              isError: false,
            };
          } catch (error) {
            const handledError = ErrorHandler.handleError(error, {
              operation: "searchPubMedArticlesToolHandler",
              context: richContext,
              input,
              rethrow: false,
            });

            const mcpError =
              handledError instanceof McpError
                ? handledError
                : new McpError(
                    BaseErrorCode.INTERNAL_ERROR,
                    "An unexpected error occurred while searching PubMed articles.",
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
