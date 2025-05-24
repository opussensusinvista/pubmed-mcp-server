/**
 * @fileoverview Registration for the searchPubMedArticles MCP tool.
 * @module src/mcp-server/tools/searchPubMedArticles/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js"; // Import McpError
import { ErrorHandler, requestContextService } from "../../../utils/index.js";
import {
  SearchPubMedArticlesInput,
  SearchPubMedArticlesInputSchema,
  searchPubMedArticlesLogic,
} from "./logic.js";

/**
 * Registers the searchPubMedArticles tool with the MCP server.
 * @param server - The McpServer instance.
 */
export function registerSearchPubMedArticlesTool(server: McpServer): void {
  const operation = "registerSearchPubMedArticlesTool";
  const context = requestContextService.createRequestContext({ operation });

  try {
    server.tool(
      "search_pubmed_articles",
      "Searches PubMed for articles using a query term and optional filters (max results, sort, date range, publication types). Uses NCBI ESearch to find PMIDs and ESummary (optional) for brief summaries. Returns a JSON object with search parameters, ESearch term, result counts, PMIDs, optional summaries (PMID, title, authors, source, dates), and E-utility URLs.",
      SearchPubMedArticlesInputSchema.shape, // Pass the .shape for ZodRawShape
      async (input: SearchPubMedArticlesInput, toolContext) => { // Explicitly type input
        const richContext = requestContextService.createRequestContext({
          parentRequestId: context.requestId,
          operation: "searchPubMedArticlesToolHandler",
          mcpToolContext: toolContext, // Include MCP-provided context if any
        });
        return searchPubMedArticlesLogic(input, richContext);
      },
    );
  } catch (error) {
    ErrorHandler.handleError(
      new McpError( // Create an McpError for consistent handling
        BaseErrorCode.INITIALIZATION_FAILED,
        "Failed to register searchPubMedArticles tool",
        { originalError: error instanceof Error ? error.message : String(error) }
      ),
      {
        operation,
        context,
        errorCode: BaseErrorCode.INITIALIZATION_FAILED, // errorCode is still useful for categorization
        critical: true,
      }
    );
  }
}
