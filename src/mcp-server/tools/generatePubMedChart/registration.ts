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

export async function registerGeneratePubMedChartTool(
  server: McpServer,
): Promise<void> {
  const operation = "registerGeneratePubMedChartTool";
  const regContext = requestContextService.createRequestContext({ operation });

  await ErrorHandler.tryCatch(
    () => {
      server.tool(
        "generate_pubmed_chart",
        "Generates a customizable chart (PNG) from structured data. " +
          "Supports 'bar', 'line', and 'scatter' plots. " +
          "Requires data values and field mappings for axes. " +
          "Optional parameters allow for titles, dimensions, and color/size/series encoding. " +
          "Internally uses Vega-Lite and a canvas renderer to produce a Base64-encoded PNG image.",
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
          return generatePubMedChartLogic(
            validatedInput,
            handlerRequestContext,
          );
        },
      );
      logger.notice("Tool 'generate_pubmed_chart' registered.", regContext);
    },
    {
      operation,
      context: regContext,
      errorCode: BaseErrorCode.INITIALIZATION_FAILED,
      critical: true,
    },
  );
}
