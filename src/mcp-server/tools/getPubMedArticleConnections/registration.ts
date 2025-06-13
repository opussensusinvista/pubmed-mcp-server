/**
 * @fileoverview Registers the 'get_pubmed_article_connections' tool with the MCP server.
 * This tool finds articles related to a source PMID or retrieves citation formats.
 * @module src/mcp-server/tools/getPubMedArticleConnections/registration
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  ErrorHandler,
  logger,
  requestContextService,
} from "../../../utils/index.js";
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
      "Specifies the type of connection or action: \n- 'pubmed_similar_articles': Finds articles similar to the source PMID (uses ELink `cmd=neighbor`). \n- 'pubmed_citedin': Finds articles in PubMed that cite the source PMID (uses ELink `linkname=pubmed_pubmed_citedin`). \n- 'pubmed_references': Finds articles in PubMed referenced by the source PMID (uses ELink `linkname=pubmed_pubmed_refs`). \n- 'citation_formats': Retrieves data for the source PMID and formats it into specified citation styles (RIS, BibTeX, APA, MLA via NCBI EFetch and server-side formatting).",
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
 */
export async function registerGetPubMedArticleConnectionsTool(
  server: McpServer,
): Promise<void> {
  const operation = "registerGetPubMedArticleConnectionsTool";
  const registrationContext = requestContextService.createRequestContext({
    operation,
  });

  await ErrorHandler.tryCatch(
    () => {
      server.tool(
        "get_pubmed_article_connections",
        "Finds articles related to a source PubMed ID (PMID) or retrieves formatted citations for it. Supports finding similar articles, articles that cite the source, articles referenced by the source (via NCBI ELink), or fetching data to generate citations in various styles (RIS, BibTeX, APA, MLA via NCBI EFetch and server-side formatting). Returns a JSON object detailing the connections or formatted citations.",
        GetPubMedArticleConnectionsInputSchema.shape,
        async (
          validatedInput: GetPubMedArticleConnectionsInput,
          toolContext: any,
        ) => {
          const richLogicContext = requestContextService.createRequestContext({
            parentRequestId: registrationContext.requestId,
            operation: "getPubMedArticleConnectionsToolHandler",
            mcpToolContext: toolContext,
          });
          return handleGetPubMedArticleConnections(
            validatedInput,
            richLogicContext,
          );
        },
      );
      logger.notice(
        "Tool 'get_pubmed_article_connections' registered.",
        registrationContext,
      );
    },
    {
      operation,
      context: registrationContext,
      errorCode: BaseErrorCode.INITIALIZATION_FAILED,
      critical: true,
    },
  );
}
