/**
 * @fileoverview Registration for the fetch_pubmed_content MCP tool.
 * @module src/mcp-server/tools/fetchPubMedContent/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { ErrorHandler, requestContextService } from "../../../utils/index.js";
import {
  FetchPubMedContentInputSchema,
  fetchPubMedContentLogic,
  FetchPubMedContentInput,
} from "./logic.js";

/**
 * Registers the fetch_pubmed_content tool with the MCP server.
 * @param server - The McpServer instance.
 */
export function registerFetchPubMedContentTool(server: McpServer): void {
  const operation = "registerFetchPubMedContentTool";
  const context = requestContextService.createRequestContext({ operation });

  try {
    server.tool(
      "fetch_pubmed_content",
      "Fetches detailed information for a list of PubMed PMIDs using NCBI EFetch. Supports various 'detailLevel' options: 'abstract_plus' (parsed title, abstract, authors, journal, keywords, DOI, optional MeSH/grant info), 'full_xml' (raw PubMedArticle XML), 'medline_text' (MEDLINE format), or 'citation_data' (minimal data for citations). Returns a JSON object containing requested PMIDs, an array of article data (parsed or raw based on detailLevel), any PMIDs not found, and the EFetch URL.",
      FetchPubMedContentInputSchema.shape,
      async (input: FetchPubMedContentInput, toolContext) => {
        const richContext = requestContextService.createRequestContext({
          parentRequestId: context.requestId,
          operation: "fetchPubMedContentToolHandler",
          mcpToolContext: toolContext,
        });
        return fetchPubMedContentLogic(input, richContext);
      },
    );
  } catch (error) {
    ErrorHandler.handleError(
      new McpError(
        BaseErrorCode.INITIALIZATION_FAILED,
        "Failed to register fetch_pubmed_content tool",
        { originalError: error instanceof Error ? error.message : String(error) }
      ),
      {
        operation,
        context,
        errorCode: BaseErrorCode.INITIALIZATION_FAILED,
        critical: true,
      }
    );
  }
}
