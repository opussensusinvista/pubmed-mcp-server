/**
 * @fileoverview Registration for the searchPubMedArticles MCP tool.
 * @module src/mcp-server/tools/searchPubMedArticles/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  ErrorHandler,
  logger,
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
  const context = requestContextService.createRequestContext({ operation });

  await ErrorHandler.tryCatch(
    () => {
      server.tool(
        "search_pubmed_articles",
        "Searches PubMed for articles using a query term and optional filters (max results, sort, date range, publication types). Uses NCBI ESearch to find PMIDs and ESummary (optional) for brief summaries. Returns a JSON object with search parameters, ESearch term, result counts, PMIDs, optional summaries (PMID, title, authors, source, dates), and E-utility URLs.",
        SearchPubMedArticlesInputSchema.shape,
        async (input: SearchPubMedArticlesInput, toolContext) => {
          const richContext = requestContextService.createRequestContext({
            parentRequestId: context.requestId,
            operation: "searchPubMedArticlesToolHandler",
            mcpToolContext: toolContext,
          });
          return searchPubMedArticlesLogic(input, richContext);
        },
      );
      logger.notice("Tool 'search_pubmed_articles' registered.", context);
    },
    {
      operation,
      context,
      errorCode: BaseErrorCode.INITIALIZATION_FAILED,
      critical: true,
    },
  );
}
