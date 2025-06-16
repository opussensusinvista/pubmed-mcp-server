/**
 * @fileoverview Main logic handler for the 'get_pubmed_article_connections' MCP tool.
 * Orchestrates calls to ELink or citation formatting handlers.
 * @module src/mcp-server/tools/getPubMedArticleConnections/logic/index
 */

import { z } from "zod";
import { BaseErrorCode, McpError } from "../../../../types-global/errors.js";
import {
  logger,
  RequestContext,
  requestContextService,
  sanitizeInputForLogging,
} from "../../../../utils/index.js";
import { handleCitationFormats } from "./citationFormatter.js";
import { handleELinkRelationships } from "./elinkHandler.js";
import type { ToolOutputData } from "./types.js";

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
 * Main handler for the 'get_pubmed_article_connections' tool.
 * @param {GetPubMedArticleConnectionsInput} input - Validated input parameters.
 * @param {RequestContext} context - The request context for this tool invocation.
 * @returns {Promise<ToolOutputData>} The result of the tool call.
 */
export async function handleGetPubMedArticleConnections(
  input: GetPubMedArticleConnectionsInput,
  context: RequestContext,
): Promise<ToolOutputData> {
  const toolLogicContext = requestContextService.createRequestContext({
    parentRequestId: context.requestId,
    operation: "handleGetPubMedArticleConnections",
    toolName: "get_pubmed_article_connections",
    input: sanitizeInputForLogging(input),
  });

  logger.info(
    "Executing get_pubmed_article_connections tool",
    toolLogicContext,
  );

  const outputData: ToolOutputData = {
    sourcePmid: input.sourcePmid,
    relationshipType: input.relationshipType,
    relatedArticles: [],
    citations: {},
    retrievedCount: 0,
    eUtilityUrl: undefined,
    message: undefined,
  };

  switch (input.relationshipType) {
    case "pubmed_similar_articles":
    case "pubmed_citedin":
    case "pubmed_references":
      await handleELinkRelationships(input, outputData, toolLogicContext);
      break;
    case "citation_formats":
      await handleCitationFormats(input, outputData, toolLogicContext);
      break;
    default:
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `Unsupported relationshipType: ${input.relationshipType}`,
        { ...toolLogicContext, receivedType: input.relationshipType },
      );
  }

  if (
    outputData.retrievedCount === 0 &&
    !outputData.message &&
    (input.relationshipType !== "citation_formats" ||
      Object.keys(outputData.citations).length === 0)
  ) {
    outputData.message = "No results found for the given parameters.";
  }

  logger.notice("Successfully executed get_pubmed_article_connections tool.", {
    ...toolLogicContext,
    relationshipType: input.relationshipType,
    retrievedCount: outputData.retrievedCount,
    citationsGenerated: Object.keys(outputData.citations).length,
  });

  return outputData;
}
