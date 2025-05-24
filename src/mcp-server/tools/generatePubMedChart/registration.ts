/**
 * @fileoverview Registers the 'generate_pubmed_chart' tool with the MCP server.
 * This tool now accepts parameterized input for generating charts.
 * @module src/mcp-server/tools/generatePubMedChart/registration
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  ErrorHandler,
  logger,
  requestContextService,
} from "../../../utils/index.js";
import {
  GeneratePubMedChartInput,
  GeneratePubMedChartInputSchema,
  generatePubMedChartLogic,
} from "./logic.js";

export function registerGeneratePubMedChartTool(server: McpServer): void {
  const operation = "registerGeneratePubMedChartTool";
  const regContext = requestContextService.createRequestContext({ operation });

  try {
    server.tool(
      "generate_pubmed_chart",
      "Generates a chart image (SVG) from given input. " +
        "Supports different chart types like 'bar', 'line', and 'scatter'. " +
        "Provide data values and specify fields for axes and encoding. " +
        "The tool constructs a Vega-Lite specification internally and renders it as an SVG.",
      GeneratePubMedChartInputSchema.shape,
      async (
        validatedInput: GeneratePubMedChartInput,
        mcpProvidedContext: any,
      ) => {
        const handlerRequestContext =
          requestContextService.createRequestContext({
            parentRequestId: regContext.requestId,
            operation: "generatePubMedChartToolHandler",
            mcpToolContext: mcpProvidedContext,
          });
        return generatePubMedChartLogic(validatedInput, handlerRequestContext);
      },
    );
    logger.notice(
      `Tool 'generate_pubmed_chart' registered with updated schema (added scatter).`,
      regContext,
    );
  } catch (error) {
    const mcpError =
      error instanceof McpError
        ? error
        : new McpError(
            BaseErrorCode.INITIALIZATION_FAILED,
            `Failed to register 'generate_pubmed_chart': ${error instanceof Error ? error.message : String(error)}`,
            {
              originalErrorName:
                error instanceof Error ? error.name : "UnknownError",
              details:
                "Error during server.tool() call for generate_pubmed_chart.",
            },
          );

    ErrorHandler.handleError(mcpError, {
      operation,
      context: regContext,
      errorCode: BaseErrorCode.INITIALIZATION_FAILED,
      critical: true,
    });
  }
}
