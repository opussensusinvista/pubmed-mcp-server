/**
 * @fileoverview Core logic invocation for the pubmed_research_agent tool.
 * This tool generates a structured research plan outline with instructive placeholders,
 * designed to be completed by a calling LLM (the MCP Client).
 * @module pubmedResearchAgent/logic
 */

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  logger,
  RequestContext,
  requestContextService,
  sanitizeInputForLogging,
} from "../../../utils/index.js";
import {
  generateFullResearchPlanOutline, // Re-export for registration
  PubMedResearchAgentInput,
  PubMedResearchAgentInputSchema, // Re-export for registration
} from "./logic/index.js";

// Re-export schema and input type for easy access by registration.ts
export { PubMedResearchAgentInput, PubMedResearchAgentInputSchema };

export async function pubmedResearchAgentLogic(
  input: PubMedResearchAgentInput,
  parentRequestContext: RequestContext,
): Promise<CallToolResult> {
  const operationContext = requestContextService.createRequestContext({
    parentRequestId: parentRequestContext.requestId,
    operation: "pubmedResearchAgentLogicExecution",
    input: sanitizeInputForLogging(input),
  });

  logger.info(
    `Executing 'pubmed_research_agent' to generate research plan outline. Keywords: ${input.research_keywords.join(
      ", ",
    )}`,
    operationContext,
  );

  try {
    const researchPlanOutline = generateFullResearchPlanOutline(input, operationContext);

    return {
      content: [
        { type: "text", text: JSON.stringify(researchPlanOutline, null, 2) },
      ],
      isError: false,
    };
  } catch (error: any) {
    logger.error(
      "Execution failed for 'pubmed_research_agent'",
      error,
      operationContext,
    );
    const mcpError =
      error instanceof McpError
        ? error
        : new McpError(
            BaseErrorCode.INTERNAL_ERROR, // Using a generic internal error
            `'pubmed_research_agent' tool failed during plan outline generation: ${
              error.message || "Internal server error."
            }`,
            {
              originalErrorName: error.name,
              requestId: operationContext.requestId,
              inputKeywords: input.research_keywords, // Adding some input context to error
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
}
