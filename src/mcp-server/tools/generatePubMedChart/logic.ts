/**
 * @fileoverview Core logic for the generate_pubmed_chart tool.
 * Generates charts from parameterized input by creating Chart.js configurations
 * and rendering them on the server using chartjs-node-canvas.
 * @module src/mcp-server/tools/generatePubMedChart/logic
 */
import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import { ChartConfiguration } from "chart.js";
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
    .enum([
      "bar",
      "line",
      "scatter",
      "pie",
      "doughnut",
      "bubble",
      "radar",
      "polarArea",
    ])
    .describe(
      "Required. Specifies the type of chart to generate. Options: 'bar', 'line', 'scatter', 'pie', 'doughnut', 'bubble', 'radar', 'polarArea'.",
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
    .default(800)
    .describe(
      "Optional. The width of the chart canvas in pixels. Must be a positive integer. Default: 800.",
    ),
  height: z
    .number()
    .int()
    .positive()
    .optional()
    .default(600)
    .describe(
      "Optional. The height of the chart canvas in pixels. Must be a positive integer. Default: 600.",
    ),
  dataValues: z
    .array(z.record(z.string(), z.any()))
    .min(1)
    .describe(
      "Required. An array of data objects used to plot the chart. Each object represents a data point or bar, structured as key-value pairs (e.g., [{ 'year': '2020', 'articles': 150 }, { 'year': '2021', 'articles': 180 }]). Must contain at least one data object.",
    ),
  outputFormat: z
    .enum(["png"])
    .default("png")
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
  seriesField: z
    .string()
    .optional()
    .describe(
      "Optional. The name of the field in `dataValues` used to create multiple distinct lines or bar groups (series) on the same chart. Each unique value in this field will correspond to a separate dataset.",
    ),
  sizeField: z
    .string()
    .optional()
    .describe(
        "Optional. For bubble charts. The name of the field in `dataValues` to use for encoding the size of the bubbles. Larger values in this field will result in larger bubbles (e.g., 'sampleSize', 'effectMagnitude').",
    ),
});

export type GeneratePubMedChartInput = z.infer<
  typeof GeneratePubMedChartInputSchema
>;

export type GeneratePubMedChartOutput = {
  base64Data: string;
  chartType: string;
  dataPoints: number;
};

// Helper to group data by a series field
function groupDataBySeries(
  data: any[],
  xField: string,
  yField: string,
  seriesField: string,
) {
  const series = new Map<string, { x: any; y: any }[]>();
  for (const item of data) {
    const seriesName = item[seriesField];
    if (!series.has(seriesName)) {
      series.set(seriesName, []);
    }
    series.get(seriesName)!.push({ x: item[xField], y: item[yField] });
  }
  return series;
}

export async function generatePubMedChartLogic(
  input: GeneratePubMedChartInput,
  parentRequestContext: RequestContext,
): Promise<GeneratePubMedChartOutput> {
  const operationContext = requestContextService.createRequestContext({
    parentRequestId: parentRequestContext.requestId,
    operation: "generatePubMedChartLogicExecution",
    input: sanitizeInputForLogging(input),
  });

  logger.info(
    `Executing 'generate_pubmed_chart' with Chart.js. Chart type: ${input.chartType}`,
    operationContext,
  );

  const {
    width,
    height,
    chartType,
    dataValues,
    xField,
    yField,
    title,
    seriesField,
    sizeField,
  } = input;

  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width,
    height,
    chartCallback: (ChartJS) => {
      ChartJS.defaults.responsive = false;
      ChartJS.defaults.maintainAspectRatio = false;
    },
  });

  const labels = [...new Set(dataValues.map((item) => item[xField]))];
  let datasets: any[];

  if (seriesField) {
    const groupedData = groupDataBySeries(dataValues, xField, yField, seriesField);
    datasets = Array.from(groupedData.entries()).map(([seriesName, data]) => ({
      label: seriesName,
      data: labels.map(label => {
        const point = data.find(p => p.x === label);
        return point ? point.y : null;
      }),
      // You can add backgroundColor, borderColor etc. here for styling
    }));
  } else {
    datasets = [
      {
        label: yField,
        data: labels.map(label => {
            const item = dataValues.find(d => d[xField] === label);
            return item ? item[yField] : null;
        }),
      },
    ];
  }
  
  // For scatter and bubble charts, the data format is different
  if (chartType === 'scatter' || chartType === 'bubble') {
      if (seriesField) {
          const groupedData = groupDataBySeries(dataValues, xField, yField, seriesField);
          datasets = Array.from(groupedData.entries()).map(([seriesName, data]) => ({
              label: seriesName,
              data: data.map(point => ({
                  x: point.x,
                  y: point.y,
                  r: chartType === 'bubble' && sizeField ? dataValues.find(d => d[xField] === point.x)![sizeField] : undefined
              })),
          }));
      } else {
          datasets = [{
              label: yField,
              data: dataValues.map(item => ({
                  x: item[xField],
                  y: item[yField],
                  r: chartType === 'bubble' && sizeField ? item[sizeField] : undefined
              })),
          }];
      }
  }


  const configuration: ChartConfiguration = {
    type: chartType,
    data: {
      labels: (chartType !== 'scatter' && chartType !== 'bubble') ? labels : undefined,
      datasets: datasets,
    },
    options: {
      plugins: {
        title: {
          display: !!title,
          text: title,
        },
      },
      scales:
        chartType === "pie" || chartType === "doughnut" || chartType === "polarArea"
          ? undefined
          : {
              x: {
                title: {
                  display: true,
                  text: xField,
                },
              },
              y: {
                title: {
                  display: true,
                  text: yField,
                },
              },
            },
    },
  };

  try {
    const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);
    const base64Data = imageBuffer.toString("base64");

    logger.notice("Successfully generated chart with Chart.js.", {
      ...operationContext,
      chartType: input.chartType,
      dataPoints: input.dataValues.length,
    });

    return {
      base64Data,
      chartType: input.chartType,
      dataPoints: input.dataValues.length,
    };
  } catch (error: any) {
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Chart generation failed: ${error.message || "Internal server error during chart generation."}`,
      {
        ...operationContext,
        originalErrorName: error.name,
        originalErrorMessage: error.message,
      },
    );
  }
}
