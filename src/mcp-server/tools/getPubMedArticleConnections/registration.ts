/**
 * @fileoverview Registers the 'get_pubmed_article_connections' tool with the MCP server.
 * This tool finds articles related to a source PMID or retrieves citation formats.
 * @module src/mcp-server/tools/getPubMedArticleConnections/registration
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js"; // Import McpError
import {
  ErrorHandler,
  RequestContext,
  requestContextService,
} from "../../../utils/index.js"; // Import requestContextService
import { handleGetPubMedArticleConnections } from "./logic.js";

/**
 * Zod schema for the input parameters of the 'get_pubmed_article_connections' tool.
 */
export const GetPubMedArticleConnectionsInputSchema = z.object({
  sourcePmid: z
    .string()
    .regex(/^\d+$/)
    .describe(
      "The PubMed Unique Identifier (PMID) of the source article for which to find connections or format citations. This PMID must be a valid number string.",
    ),
  relationshipType: z
    .enum([
      "pubmed_similar_articles",
      "pubmed_citedin",
      "pubmed_references",
      "citation_formats",
    ])
    .default("pubmed_similar_articles")
    .describe(
      "Specifies the type of connection or action: \n- 'pubmed_similar_articles': Finds articles similar to the source PMID (uses ELink `cmd=neighbor`). \n- 'pubmed_citedin': Finds articles in PubMed that cite the source PMID (uses ELink `linkname=pubmed_pubmed_citedin`). \n- 'pubmed_references': Finds articles in PubMed referenced by the source PMID (uses ELink `linkname=pubmed_pubmed_refs`). \n- 'citation_formats': Retrieves data for the source PMID and formats it into specified citation styles (uses EFetch).",
    ),
  maxRelatedResults: z
    .number()
    .int()
    .positive()
    .max(50, "Maximum 50 related results can be requested.")
    .optional()
    .default(5)
    .describe(
      "Maximum number of related articles to retrieve when 'relationshipType' is 'pubmed_similar_articles', 'pubmed_citedin', or 'pubmed_references'. ELink results from NCBI will be truncated by the server if they exceed this number. Default is 5, maximum is 50.",
    ),
  citationStyles: z
    .array(z.enum(["ris", "bibtex", "apa_string", "mla_string"]))
    .optional()
    .default(["ris"])
    .describe(
      "An array of citation styles to format the source article into when 'relationshipType' is 'citation_formats'. Supported styles: 'ris', 'bibtex', 'apa_string', 'mla_string'. Default is ['ris']. Formatting is performed server-side based on data fetched via EFetch.",
    ),
});

/**
 * Type alias for the validated input of the 'get_pubmed_article_connections' tool.
 */
export type GetPubMedArticleConnectionsInput = z.infer<
  typeof GetPubMedArticleConnectionsInputSchema
>;

/**
 * Registers the 'get_pubmed_article_connections' tool with the given MCP server instance.
 * @param {McpServer} server - The MCP server instance.
 * @param {RequestContext} registrationContext - The context for this registration operation.
 */
export function registerGetPubMedArticleConnectionsTool(
  server: McpServer,
  registrationContext: RequestContext, // This context is for the registration itself
): void {
  const operation = "registerGetPubMedArticleConnectionsTool";
  // Use the passed-in registrationContext or create one if it's more appropriate
  // For consistency with other tools, let's assume registrationContext is the primary context for this operation.

  try {
    server.tool(
      "get_pubmed_article_connections",
      "Finds articles related to a source PubMed ID (PMID) or retrieves formatted citations for it. Supports finding similar articles, articles that cite the source, articles referenced by the source (via NCBI ELink), or fetching data to generate citations in various styles (RIS, BibTeX, APA, MLA via NCBI EFetch and server-side formatting). Returns a JSON object detailing the connections or formatted citations.",
      GetPubMedArticleConnectionsInputSchema.shape, // Pass .shape
      async (
        validatedInput: GetPubMedArticleConnectionsInput,
        toolContext: any, // Let TypeScript infer this, similar to other tools
      ) => {
        // Create a new rich context for the logic handler
        const richLogicContext = requestContextService.createRequestContext({
          parentRequestId: registrationContext.requestId, // Link to registration context
          operation: "getPubMedArticleConnectionsToolHandler",
          mcpToolContext: toolContext, // Include MCP-provided context
        });
        return await handleGetPubMedArticleConnections(
          validatedInput,
          richLogicContext, // Pass the newly created rich context
        );
      },
    );
    // Consistent with other tools, explicit success logging here might be omitted,
    // relying on ErrorHandler for issues or higher-level logging.
  } catch (error) {
    ErrorHandler.handleError(
      new McpError( // Create an McpError for consistent handling
        BaseErrorCode.INITIALIZATION_FAILED,
        "Failed to register 'get_pubmed_article_connections' tool.",
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      ),
      {
        operation,
        context: registrationContext, // Use the context of the registration operation
        errorCode: BaseErrorCode.INITIALIZATION_FAILED,
        critical: true, // Registration failure is critical
      },
    );
  }
}
