/**
 * @fileoverview Registration for the pubmed_research_agent tool.
 * @module pubmedResearchAgent/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  ErrorHandler,
  logger,
  requestContextService,
} from "../../../utils/index.js";
import {
  PubMedResearchAgentInput,
  PubMedResearchAgentInputSchema,
  pubmedResearchAgentLogic,
} from "./logic.js";

/**
 * Registers the pubmed_research_agent tool with the MCP server.
 * @param server - The McpServer instance.
 */
export function registerPubMedResearchAgentTool(server: McpServer): void {
  const operation = "registerPubMedResearchAgentTool";
  const context = requestContextService.createRequestContext({ operation });

  try {
    server.tool(
      "pubmed_research_agent",
      "Generates a standardized JSON research plan outline from component details you provide. It accepts granular inputs for all research phases (conception, data collection, analysis, dissemination, cross-cutting concerns). If `include_detailed_prompts_for_agent` is true, the output plan will embed instructive prompts and detailed guidance notes to aid the research agent. The tool's primary function is to organize and structure your rough ideas into a formal, machine-readable plan. This plan is intended for further processing; as the research agent, you should then utilize your full suite of tools (e.g., file manipulation, `get_pubmed_article_connections` for literature/data search via PMID) to execute the outlined research, tailored to the user's request.",
      PubMedResearchAgentInputSchema.shape,
      async (
        validatedInput: PubMedResearchAgentInput,
        mcpProvidedContext: any,
      ) => {
        const handlerRequestContext =
          requestContextService.createRequestContext({
            parentRequestId: context.requestId,
            operation: "pubmedResearchAgentHandler",
            mcpToolContext: mcpProvidedContext,
          });
        return pubmedResearchAgentLogic(validatedInput, handlerRequestContext);
      },
    );
    logger.notice(`Tool 'pubmed_research_agent' registered.`, context);
  } catch (error) {
    ErrorHandler.handleError(
      new McpError(
        BaseErrorCode.INITIALIZATION_FAILED,
        "Failed to register pubmed_research_agent tool",
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      ),
      {
        operation,
        context,
        errorCode: BaseErrorCode.INITIALIZATION_FAILED,
        critical: true,
      },
    );
  }
}
