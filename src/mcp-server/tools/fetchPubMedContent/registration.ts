/**
 * @fileoverview Registration for the fetch_pubmed_content MCP tool.
 * @module src/mcp-server/tools/fetchPubMedContent/registration
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
  FetchPubMedContentInput,
  FetchPubMedContentInputSchema,
  fetchPubMedContentLogic,
} from "./logic.js";

/**
 * Registers the fetch_pubmed_content tool with the MCP server.
 * @param server - The McpServer instance.
 */
export async function registerFetchPubMedContentTool(
  server: McpServer,
): Promise<void> {
  const operation = "registerFetchPubMedContentTool";
  const toolName = "fetch_pubmed_content";
  const toolDescription =
    "Fetches detailed information from PubMed using NCBI EFetch. Can be used with a direct list of PMIDs or with queryKey/webEnv from an ESearch history entry. Supports pagination (retstart, retmax) when using history. Available 'detailLevel' options: 'abstract_plus' (parsed title, abstract, authors, journal, keywords, DOI, optional MeSH/grant info), 'full_xml' (JSON representation of the PubMedArticle XML structure), 'medline_text' (MEDLINE format), or 'citation_data' (minimal data for citations). Returns a JSON object containing results, any PMIDs not found (if applicable), and EFetch details.";

  const context = requestContextService.createRequestContext({ operation });

  await ErrorHandler.tryCatch(
    async () => {
      server.tool(
        toolName,
        toolDescription,
        FetchPubMedContentInputSchema._def.schema.shape,
        async (
          input: FetchPubMedContentInput,
          toolContext: any,
        ): Promise<CallToolResult> => {
          const richContext: RequestContext =
            requestContextService.createRequestContext({
              parentRequestId: context.requestId,
              operation: "fetchPubMedContentToolHandler",
              mcpToolContext: toolContext,
              input,
            });

          try {
            const result = await fetchPubMedContentLogic(input, richContext);
            return {
              content: [{ type: "text", text: result.content }],
              isError: false,
            };
          } catch (error) {
            const handledError = ErrorHandler.handleError(error, {
              operation: "fetchPubMedContentToolHandler",
              context: richContext,
              input,
              rethrow: false,
            });

            const mcpError =
              handledError instanceof McpError
                ? handledError
                : new McpError(
                    BaseErrorCode.INTERNAL_ERROR,
                    "An unexpected error occurred while fetching PubMed content.",
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
