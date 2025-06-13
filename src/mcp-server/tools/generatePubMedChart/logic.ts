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
    .describe(
      "Required. Specifies the type of chart to generate. Options: 'bar', 'line', 'scatter'.",
    ),
  title: z
    .string()
    .optional()
    .describe(
      "Optional. The main title displayed above the chart. If omitted, no title is shown.",
    ),
  width: z
    .number()
    .int()
    .positive()
    .optional()
    .default(400)
    .describe(
      "Optional. The width of the chart canvas in pixels. Must be a positive integer. Default: 400.",
    ),
  height: z
    .number()
    .int()
    .positive()
    .optional()
    .default(300)
    .describe(
      "Optional. The height of the chart canvas in pixels. Must be a positive integer. Default: 300.",
    ),
  dataValues: z
    .array(z.record(z.string(), z.any()))
    .min(1)
    .describe(
      "Required. An array of data objects used to plot the chart. Each object represents a data point or bar, structured as key-value pairs (e.g., [{ 'year': '2020', 'articles': 150 }, { 'year': '2021', 'articles': 180 }]). Must contain at least one data object.",
    ),
  outputFormat: z
    .enum(["png"]) // Changed from svg to png
    .default("png") // Changed default to png
    .describe(
      "Specifies the output format for the chart. Currently, only 'png' (Portable Network Graphics) is supported and is the default.",
    ),

  xField: z
    .string()
    .describe(
      "Required. The name of the field in `dataValues` to be used for the X-axis (horizontal). This field determines the categories or values along the bottom of the chart (e.g., 'year', 'geneName', 'publicationCount').",
    ),
  yField: z
    .string()
    .describe(
      "Required. The name of the field in `dataValues` to be used for the Y-axis (vertical). This field determines the values plotted upwards on the chart (e.g., 'articles', 'expressionLevel', 'citationCount').",
    ),

  xFieldType: z
    .enum(["nominal", "ordinal", "quantitative", "temporal"])
    .optional()
    .describe(
      "Optional. Specifies the data type of the X-axis field. Options: 'nominal' (categories), 'ordinal' (ordered categories), 'quantitative' (numerical), 'temporal' (dates/times). If omitted, a suitable default is chosen based on `chartType` (e.g., 'nominal' for bar charts, 'temporal' for line charts, 'quantitative' for scatter plots).",
    ),
  yFieldType: z
    .enum(["nominal", "ordinal", "quantitative", "temporal"])
    .optional()
    .describe(
      "Optional. Specifies the data type of the Y-axis field. Options: 'nominal', 'ordinal', 'quantitative', 'temporal'. Defaults to 'quantitative' if omitted.",
    ),

  // Optional fields for various chart types
  colorField: z
    .string()
    .optional()
    .describe(
      "Optional. The name of the field in `dataValues` to use for color encoding. This can differentiate bars, lines, or points by color based on the values in this field (e.g., 'studyType', 'country').",
    ),
  colorFieldType: z
    .enum(["nominal", "ordinal", "quantitative", "temporal"])
    .optional()
    .describe(
      "Optional. Specifies the data type of the `colorField`. Options: 'nominal', 'ordinal', 'quantitative', 'temporal'. Defaults to 'nominal' if `colorField` is provided and this is omitted.",
    ),

  seriesField: z
    .string()
    .optional()
    .describe(
      "Optional. Primarily for line charts. The name of the field in `dataValues` used to create multiple distinct lines (series) on the same chart. Each unique value in this field will correspond to a separate line (e.g., 'drugName' to plot different drug efficacy trends). Often used with `colorField` implicitly or explicitly.",
    ),
  seriesFieldType: z
    .enum(["nominal", "ordinal", "quantitative", "temporal"])
    .optional()
    .describe(
      "Optional. Specifies the data type of the `seriesField`. Options: 'nominal', 'ordinal', 'quantitative', 'temporal'. Defaults to 'nominal' if `seriesField` is provided and this is omitted.",
    ),

  // Scatter plot specific optional fields (can be expanded)
  sizeField: z
    .string()
    .optional()
    .describe(
      "Optional. For scatter plots. The name of the field in `dataValues` to use for encoding the size of the points. Larger values in this field will result in larger points on the scatter plot (e.g., 'sampleSize', 'effectMagnitude').",
    ),
  sizeFieldType: z
    .enum(["quantitative", "ordinal"])
    .optional()
    .describe(
      "Optional. Specifies the data type of the `sizeField`. Options: 'quantitative', 'ordinal'. Defaults to 'quantitative' if `sizeField` is provided and this is omitted.",
    ),
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

  if (input.outputFormat !== "png") {
    // Changed from svg to png
    const unsupportedFormatError = new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      `Unsupported output format: ${input.outputFormat}. Currently, only 'png' is supported.`, // Changed message
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
      renderer: "canvas", // Explicitly set renderer to 'canvas'
    });
    // const svgString = await view.toSVG(); // Old SVG method

    // New PNG method
    // Initialize the view to ensure canvas is ready
    await view.runAsync(); // Initialize and run the view
    const canvas = await view.toCanvas(); // Render to canvas

    // Cast to 'any' to access toBuffer, assuming it's a Node Canvas instance at runtime
    const imageBuffer = await (canvas as any).toBuffer("image/png"); // Get PNG buffer from canvas
    const base64Data = imageBuffer.toString("base64");

    return {
      content: [
        {
          type: "image" as const,
          data: base64Data,
          mimeType: "image/png" as const, // Changed MIME type to image/png
        },
      ],
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
