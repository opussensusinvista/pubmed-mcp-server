/**
 * @fileoverview Main logic handler for the 'get_pubmed_article_connections' MCP tool.
 * Orchestrates calls to ELink or citation formatting handlers.
 * @module src/mcp-server/tools/getPubMedArticleConnections/logic/index
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { BaseErrorCode, McpError } from "../../../../types-global/errors.js";
import {
  logger,
  RequestContext,
  requestContextService,
  sanitizeInputForLogging,
} from "../../../../utils/index.js";
import type { GetPubMedArticleConnectionsInput } from "../registration.js";
import { handleCitationFormats } from "./citationFormatter.js";
import { handleELinkRelationships } from "./elinkHandler.js";
import type { ToolOutputData } from "./types.js";

/**
 * Main handler for the 'get_pubmed_article_connections' tool.
 * @param {GetPubMedArticleConnectionsInput} input - Validated input parameters.
 * @param {RequestContext} context - The request context for this tool invocation.
 * @returns {Promise<CallToolResult>} The result of the tool call.
 */
export async function handleGetPubMedArticleConnections(
  input: GetPubMedArticleConnectionsInput,
  context: RequestContext,
): Promise<CallToolResult> {
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

  try {
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
          { receivedType: input.relationshipType },
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
  } catch (error: any) {
    logger.error(
      "Error in getPubMedArticleConnections main logic",
      error,
      toolLogicContext,
    );
    outputData.message =
      error instanceof McpError
        ? error.message
        : "An unexpected error occurred while processing the request.";

    const errorDetails =
      error instanceof McpError
        ? error.details
        : { originalError: error.message };

    const errorPayload = {
      ...outputData,
      error: {
        code: error.code || BaseErrorCode.INTERNAL_ERROR,
        message: outputData.message,
        details: errorDetails,
      },
    };
    const content: CallToolResult["content"] = [
      { type: "text", text: JSON.stringify(errorPayload) },
    ];
    return { content, isError: true };
  }

  logger.notice("Successfully executed get_pubmed_article_connections tool.", {
    ...toolLogicContext,
    relationshipType: input.relationshipType,
    retrievedCount: outputData.retrievedCount,
    citationsGenerated: Object.keys(outputData.citations).length,
  });

  const responseContent: CallToolResult["content"] = [
    { type: "text", text: JSON.stringify(outputData) },
  ];
  return { content: responseContent, isError: false };
}
