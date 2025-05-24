/**
 * @fileoverview Core logic for the generate_pubmed_chart tool.
 * Generates charts from parameterized input by creating Vega-Lite specifications.
 * @module src/mcp-server/tools/generatePubMedChart/logic
 */
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as vega from "vega";
import * as vegaLite from "vega-lite";
import { z } from "zod";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  logger,
  RequestContext,
  requestContextService,
  sanitizeInputForLogging,
} from "../../../utils/index.js";

export const GeneratePubMedChartInputSchema = z.object({
  chartType: z
    .enum(["bar", "line", "scatter"])
    .describe("Type of chart to generate (e.g., 'bar', 'line', 'scatter')."),
  title: z.string().optional().describe("Title for the chart."),
  width: z
    .number()
    .int()
    .positive()
    .optional()
    .default(400)
    .describe("Width of the chart in pixels."),
  height: z
    .number()
    .int()
    .positive()
    .optional()
    .default(300)
    .describe("Height of the chart in pixels."),
  dataValues: z
    .array(z.record(z.string(), z.any()))
    .min(1)
    .describe(
      "Array of data objects to plot. Each object is a record (e.g., { category: 'A', amount: 28 }).",
    ),
  outputFormat: z
    .enum(["svg"])
    .default("svg")
    .describe(
      "Specifies the desired output format for the generated chart. " +
        "Currently, only 'svg' (Scalable Vector Graphics) is supported.",
    ),

  xField: z
    .string()
    .describe(
      "Field name for the X-axis (e.g., 'category', 'date', 'metric1').",
    ),
  yField: z
    .string()
    .describe(
      "Field name for the Y-axis (e.g., 'amount', 'value', 'metric2').",
    ),

  xFieldType: z
    .enum(["nominal", "ordinal", "quantitative", "temporal"])
    .optional()
    .describe(
      "Type of the X-axis field. Defaults appropriately for chart type if omitted (e.g., 'nominal' for bar, 'temporal' for line, 'quantitative' for scatter).",
    ),
  yFieldType: z
    .enum(["nominal", "ordinal", "quantitative", "temporal"])
    .optional()
    .describe(
      "Type of the Y-axis field. Defaults to 'quantitative' if omitted.",
    ),

  // Optional fields for various chart types
  colorField: z
    .string()
    .optional()
    .describe("Optional field name for color encoding."),
  colorFieldType: z
    .enum(["nominal", "ordinal", "quantitative", "temporal"])
    .optional()
    .describe("Type of the color field if provided. Defaults to 'nominal'."),

  seriesField: z
    .string()
    .optional()
    .describe(
      "Optional field name for creating multiple lines/series (typically for line charts).",
    ),
  seriesFieldType: z
    .enum(["nominal", "ordinal", "quantitative", "temporal"])
    .optional()
    .describe("Type of the series field if provided. Defaults to 'nominal'."),

  // Scatter plot specific optional fields (can be expanded)
  sizeField: z
    .string()
    .optional()
    .describe("Optional field for encoding point size in scatter plots."),
  sizeFieldType: z
    .enum(["quantitative", "ordinal"])
    .optional()
    .describe("Type of the size field. Defaults to 'quantitative'."),
  // shapeField: z.string().optional().describe("Optional field for encoding point shape in scatter plots."), // Future enhancement
  // shapeFieldType: z.enum(["nominal", "ordinal"]).optional().describe("Type of the shape field."), // Future enhancement
});

export type GeneratePubMedChartInput = z.infer<
  typeof GeneratePubMedChartInputSchema
>;

export async function generatePubMedChartLogic(
  input: GeneratePubMedChartInput,
  parentRequestContext: RequestContext,
): Promise<CallToolResult> {
  const operationContext = requestContextService.createRequestContext({
    parentRequestId: parentRequestContext.requestId,
    operation: "generatePubMedChartLogicExecution",
    input: sanitizeInputForLogging(input),
  });

  logger.info(
    `Executing 'generate_pubmed_chart'. Chart type: ${input.chartType}, Output format: ${input.outputFormat}`,
    operationContext,
  );

  if (input.outputFormat !== "svg") {
    const unsupportedFormatError = new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      `Unsupported output format: ${input.outputFormat}. Currently, only 'svg' is supported.`,
      { requestedFormat: input.outputFormat },
    );
    logger.warning(unsupportedFormatError.message, operationContext);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: {
              code: unsupportedFormatError.code,
              message: unsupportedFormatError.message,
              details: unsupportedFormatError.details,
            },
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    let vegaLiteSpec: any = {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      title: input.title,
      width: input.width,
      height: input.height,
      data: { values: input.dataValues },
      encoding: {}, // To be populated by chart type specific logic
    };

    // Default field types if not provided
    const yEncType = input.yFieldType || "quantitative";
    const colorEncType = input.colorFieldType || "nominal";
    const seriesEncType = input.seriesFieldType || "nominal";
    const sizeEncType = input.sizeFieldType || "quantitative";

    let xEncType: string;

    switch (input.chartType) {
      case "bar":
        xEncType = input.xFieldType || "nominal";
        vegaLiteSpec.mark = "bar";
        vegaLiteSpec.encoding = {
          x: {
            field: input.xField,
            type: xEncType,
            axis: { title: input.xField },
          },
          y: {
            field: input.yField,
            type: yEncType,
            axis: { title: input.yField },
          },
        };
        if (input.colorField) {
          vegaLiteSpec.encoding.color = {
            field: input.colorField,
            type: colorEncType,
          };
        }
        break;
      case "line":
        xEncType = input.xFieldType || "temporal";
        vegaLiteSpec.mark = "line";
        vegaLiteSpec.encoding = {
          x: {
            field: input.xField,
            type: xEncType,
            axis: { title: input.xField },
          },
          y: {
            field: input.yField,
            type: yEncType,
            axis: { title: input.yField },
          },
        };
        if (input.seriesField) {
          // For line charts, seriesField is typically used for color
          vegaLiteSpec.encoding.color = {
            field: input.seriesField,
            type: seriesEncType,
          };
        } else if (input.colorField) {
          // Allow direct colorField as well
          vegaLiteSpec.encoding.color = {
            field: input.colorField,
            type: colorEncType,
          };
        }
        break;
      case "scatter":
        xEncType = input.xFieldType || "quantitative";
        vegaLiteSpec.mark = "point"; // "circle" is also an option
        vegaLiteSpec.encoding = {
          x: {
            field: input.xField,
            type: xEncType,
            axis: { title: input.xField },
          },
          y: {
            field: input.yField,
            type: yEncType,
            axis: { title: input.yField },
          },
        };
        if (input.colorField) {
          vegaLiteSpec.encoding.color = {
            field: input.colorField,
            type: colorEncType,
          };
        }
        if (input.sizeField) {
          vegaLiteSpec.encoding.size = {
            field: input.sizeField,
            type: sizeEncType,
          };
        }
        // Add shape encoding here if shapeField is implemented
        break;
      // No default case needed as chartType is an enum and Zod validates it.
    }

    const compiledVegaSpec = vegaLite.compile(vegaLiteSpec).spec;
    const view = new vega.View(vega.parse(compiledVegaSpec), {
      renderer: "none",
    });
    const svgString = await view.toSVG();

    const imageBuffer = Buffer.from(svgString, "utf-8");
    const base64Data = imageBuffer.toString("base64");
    const dataUriSvg = `data:image/svg+xml;base64,${base64Data}`;

    return {
      content: [{ type: "text" as const, text: dataUriSvg }],
      isError: false,
    };
  } catch (error: any) {
    logger.error(
      "Execution failed for 'generate_pubmed_chart'",
      error,
      operationContext,
    );
    const mcpError =
      error instanceof McpError
        ? error
        : new McpError(
            BaseErrorCode.INTERNAL_ERROR,
            `'generate_pubmed_chart' failed: ${error.message || "Internal server error during chart generation."}`,
            {
              originalErrorName: error.name,
              originalErrorMessage: error.message,
              requestId: operationContext.requestId,
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
