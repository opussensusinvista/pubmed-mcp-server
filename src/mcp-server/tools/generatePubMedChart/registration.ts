/**
 * @fileoverview Registers the 'generate_pubmed_chart' tool with the MCP server.
 * This tool now accepts parameterized input for generating charts.
 * @module src/mcp-server/tools/generatePubMedChart/registration
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
  GeneratePubMedChartInput,
  GeneratePubMedChartInputSchema,
  generatePubMedChartLogic,
} from "./logic.js";

export async function registerGeneratePubMedChartTool(
  server: McpServer,
): Promise<void> {
  const operation = "registerGeneratePubMedChartTool";
  const toolName = "generate_pubmed_chart";
  const toolDescription =
    "Generates a customizable chart (PNG) from structured data. " +
    "Supports 'bar', 'line', and 'scatter' plots. " +
    "Requires data values and field mappings for axes. " +
    "Optional parameters allow for titles, dimensions, and color/size/series encoding. " +
    "Internally uses Vega-Lite and a canvas renderer to produce a Base64-encoded PNG image.";
  const context = requestContextService.createRequestContext({ operation });

  await ErrorHandler.tryCatch(
    async () => {
      server.tool(
        toolName,
        toolDescription,
        GeneratePubMedChartInputSchema.shape,
        async (
          input: GeneratePubMedChartInput,
          mcpProvidedContext: any,
        ): Promise<CallToolResult> => {
          const richContext: RequestContext =
            requestContextService.createRequestContext({
              parentRequestId: context.requestId,
              operation: "generatePubMedChartToolHandler",
              mcpToolContext: mcpProvidedContext,
              input,
            });

          try {
            const result = await generatePubMedChartLogic(input, richContext);
            return {
              content: [
                {
                  type: "image",
                  data: result.base64Data,
                  mimeType: "image/png",
                },
              ],
              isError: false,
            };
          } catch (error) {
            const handledError = ErrorHandler.handleError(error, {
              operation: "generatePubMedChartToolHandler",
              context: richContext,
              input,
              rethrow: false,
            });

            const mcpError =
              handledError instanceof McpError
                ? handledError
                : new McpError(
                    BaseErrorCode.INTERNAL_ERROR,
                    "An unexpected error occurred while generating the chart.",
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
