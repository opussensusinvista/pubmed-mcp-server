/**
 * @fileoverview Logic for the searchPubMedArticles MCP tool.
 * Handles constructing ESearch and ESummary queries, interacting with
 * the NcbiService, and formatting the results.
 * @module src/mcp-server/tools/searchPubMedArticles/logic
 */

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ncbiService } from "../../../services/NCBI/ncbiService.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  logger,
  RequestContext,
  sanitizeInputForLogging,
  dateParser, // Import dateParser
} from "../../../utils/index.js";
import { sanitization } from "../../../utils/security/sanitization.js";

export const SearchPubMedArticlesInputSchema = z.object({
  queryTerm: z.string().min(3, "Query term must be at least 3 characters").describe("The primary keyword or phrase to search for in PubMed. Must be at least 3 characters long."),
  maxResults: z
    .number()
    .int()
    .positive()
    .max(1000, "Max results per query. ESearch's retmax is used.")
    .optional()
    .default(20)
    .describe("Maximum number of articles to retrieve. Corresponds to ESearch's 'retmax' parameter. Default is 20, max is 1000."),
  sortBy: z
    .enum([
      "relevance", // Default, "Best Match"
      "pub_date", // Publication Date
      "author", // First Author
      "journal_name", // Journal Name
    ])
    .optional()
    .default("relevance")
    .describe(
      "Sorting criteria for results. Options: 'relevance' (default), 'pub_date', 'author', 'journal_name'. Note: Other sorting (e.g., last_author, title) may require client-side implementation or be future server enhancements.",
    ),
  dateRange: z
    .object({
      minDate: z
        .string()
        .regex(
          /^\d{4}(\/\d{2}(\/\d{2})?)?$/,
          "Date must be YYYY, YYYY/MM, or YYYY/MM/DD",
        )
        .optional()
        .describe("The start date for the search range (YYYY, YYYY/MM, or YYYY/MM/DD)."),
      maxDate: z
        .string()
        .regex(
          /^\d{4}(\/\d{2}(\/\d{2})?)?$/,
          "Date must be YYYY, YYYY/MM, or YYYY/MM/DD",
        )
        .optional()
        .describe("The end date for the search range (YYYY, YYYY/MM, or YYYY/MM/DD)."),
      dateType: z.enum(["pdat", "mdat", "edat"]).optional().default("pdat")
        .describe("The type of date to filter by: 'pdat' (Publication Date), 'mdat' (Modification Date), 'edat' (Entrez Date). Default is 'pdat'."),
    })
    .optional()
    .describe("Defines an optional date range for the search, including min/max dates and the type of date field to use."),
  filterByPublicationTypes: z
    .array(z.string())
    .optional()
    .describe(
      'An array of publication types to filter by (e.g., ["Review", "Clinical Trial"]). The server maps these to the appropriate Entrez query syntax (e.g., "Review"[Publication Type]).',
    ),
  fetchBriefSummaries: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .default(0)
    .describe(
      "Number of top PMIDs for which to fetch brief summaries using ESummary v2.0. Set to 0 to disable. Maximum is 100 for this tool. Default is 0.",
    ),
});

export type SearchPubMedArticlesInput = z.infer<
  typeof SearchPubMedArticlesInputSchema
>;

interface ESummaryDocSum {
  uid: string;
  pubdate: string;
  epubdate: string;
  source: string;
  authors: { name: string; authtype: string; clusterid: string }[];
  lastauthor: string;
  title: string;
  sorttitle: string;
  volume: string;
  issue: string;
  pages: string;
  lang: string[];
  issn: string;
  essn: string;
  pubtype: string[];
  recordstatus: string;
  pubstatus: string;
  articleids: { idtype: string; idtypen: number; value: string }[];
  history: { pubstatus: string; date: string }[];
  references: any[]; // Can be complex, define if needed
  attributes: string[];
  pmcrefcount: number;
  journalref: string;
  caption: string; // If it's from ESummary v2.0 JSON-like XML
  extra?: string; // For other potential fields
  error?: string; // If ESummary returns an error for a specific UID
}

/**
 * Simplifies author list from ESummary to a string, showing first 3 authors and "et al." if more.
 * @param authors - Array of author objects from ESummary.
 * @returns A string like "Doe J, Smith A, Brown B, et al." or empty if no authors.
 */
function formatAuthors(
  authors: { name: string; authtype: string; clusterid: string }[] | undefined,
): string {
  if (!authors || authors.length === 0) return "";
  return authors
    .slice(0, 3) // Limit to first 3 authors for brevity
    .map((author) => author.name)
    .join(", ") + (authors.length > 3 ? ", et al." : "");
}

/**
 * Standardizes date strings from ESummary to "YYYY-MM-DD" format using the dateParser utility.
 * @param dateStr - Date string from ESummary (e.g., "2023 Mar 15", "2023", "2023 Mar").
 * @param context - The request context for logging.
 * @returns A promise resolving to a standardized date string (YYYY-MM-DD), or the original string if parsing fails.
 */
async function standardizeDate(
  dateStr: string | undefined,
  context: RequestContext,
): Promise<string | undefined> {
  if (!dateStr) return undefined;
  try {
    // Use the dateParser utility for more robust parsing
    const parsedDate = await dateParser.parseDate(dateStr, context);
    if (parsedDate) {
      return parsedDate.toISOString().split("T")[0];
    }
    // If chrono-node couldn't parse it, log and return original
    logger.debug(`standardizeDate: dateParser could not parse "${dateStr}", returning original.`, context);
  } catch (e) {
    // Errors from dateParser are already handled by its ErrorHandler,
    // but we log here if we want to specifically note the fallback.
    logger.warning(`standardizeDate: Error during dateParser.parseDate for "${dateStr}", returning original.`, {
      ...context,
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return dateStr; // Return original if parsing failed or dateParser threw
}

/**
 * Logic for the searchPubMedArticles tool.
 * Constructs and executes ESearch and optionally ESummary queries via NcbiService,
 * then formats the results into a CallToolResult.
 * @param input - Validated input arguments for the tool.
 * @param requestContext - The request context for logging and correlation.
 * @returns A promise resolving to a CallToolResult.
 */
export async function searchPubMedArticlesLogic(
  input: SearchPubMedArticlesInput,
  requestContext: RequestContext,
): Promise<CallToolResult> {
  logger.info("Executing searchPubMedArticles tool", {
    ...requestContext,
    input: sanitizeInputForLogging(input),
  });

  let effectiveQuery = sanitization.sanitizeString(input.queryTerm, {
    context: "text",
  });

  if (input.dateRange) {
    const { minDate, maxDate, dateType } = input.dateRange;
    if (minDate && maxDate) {
      effectiveQuery += ` AND (${minDate}[${dateType}] : ${maxDate}[${dateType}])`;
    } else if (minDate) {
      effectiveQuery += ` AND ${minDate}[${dateType}]`;
    } else if (maxDate) {
      effectiveQuery += ` AND ${maxDate}[${dateType}]`;
    }
  }

  if (input.filterByPublicationTypes && input.filterByPublicationTypes.length > 0) {
    const ptQuery = input.filterByPublicationTypes
      .map(
        (pt: string) =>
          `"${sanitization.sanitizeString(pt, { context: "text" })}"[Publication Type]`,
      )
      .join(" OR ");
    effectiveQuery += ` AND (${ptQuery})`;
  }

  // Explicitly define type for NCBI service compatibility
  const eSearchParams: { db: string; term: string; retmax?: number; sort?: string; usehistory?: "y" | "n"; [key: string]: any } = {
    db: "pubmed",
    term: effectiveQuery,
    retmax: input.maxResults,
    sort: input.sortBy,
    usehistory: (input.fetchBriefSummaries ?? 0) > 0 ? "y" : "n",
  };

  let eSearchUrl = "";
  let eSummaryUrl = "";

  try {
    const eSearchResponse = await ncbiService.eSearch(
      eSearchParams,
      requestContext,
    );
    
    const eSearchBase = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
    // Ensure all params are strings for URLSearchParams
    const eSearchQueryStringParams: Record<string, string> = {};
    for (const key in eSearchParams) {
        if (eSearchParams[key] !== undefined) {
            eSearchQueryStringParams[key] = String(eSearchParams[key]);
        }
    }
    const eSearchQueryString = new URLSearchParams(eSearchQueryStringParams).toString();
    eSearchUrl = `${eSearchBase}?${eSearchQueryString}`;


    if (!eSearchResponse || !eSearchResponse.eSearchResult) {
      throw new McpError(
        BaseErrorCode.NCBI_PARSING_ERROR,
        "Invalid or empty ESearch response from NCBI.",
        { responsePreview: sanitizeInputForLogging(JSON.stringify(eSearchResponse).substring(0, 200)), requestId: requestContext.requestId },
      );
    }

    const esResult = eSearchResponse.eSearchResult;
    const pmids: string[] = esResult.IdList?.Id || [];
    const totalFound = parseInt(esResult.Count || "0", 10);
    const retrievedPmidCount = pmids.length;

    let briefSummaries: any[] = [];
    const currentFetchBriefSummaries = input.fetchBriefSummaries ?? 0;

    if (currentFetchBriefSummaries > 0 && pmids.length > 0) {
      const pmidsForSummary = pmids.slice(0, currentFetchBriefSummaries).join(",");
      // Explicitly define type for NCBI service compatibility
      const eSummaryParams: { db: string; id: string; version: string; retmode: string; WebEnv?: string; query_key?: string; [key: string]: any } = {
        db: "pubmed",
        id: pmidsForSummary,
        version: "2.0",
        retmode: "xml",
      };
      if (esResult.WebEnv && esResult.QueryKey) {
        eSummaryParams.WebEnv = esResult.WebEnv;
        eSummaryParams.query_key = esResult.QueryKey;
      }

      const eSummaryBase = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";
      const eSummaryQueryStringParams: Record<string, string> = {};
        for (const key in eSummaryParams) {
            if (eSummaryParams[key] !== undefined) {
                eSummaryQueryStringParams[key] = String(eSummaryParams[key]);
            }
        }
      const eSummaryQueryString = new URLSearchParams(eSummaryQueryStringParams).toString();
      eSummaryUrl = `${eSummaryBase}?${eSummaryQueryString}`;

      const eSummaryResponse = await ncbiService.eSummary(
        eSummaryParams,
        requestContext,
      );

      if (
        eSummaryResponse &&
        eSummaryResponse.eSummaryResult &&
        eSummaryResponse.eSummaryResult.DocSum
      ) {
        const docSums: ESummaryDocSum[] = Array.isArray(eSummaryResponse.eSummaryResult.DocSum)
          ? eSummaryResponse.eSummaryResult.DocSum
          : [eSummaryResponse.eSummaryResult.DocSum];

        briefSummaries = await Promise.all(
          docSums
            .filter(docsum => !docsum.error) 
            .map(async (docsum) => ({ 
              pmid: docsum.uid,
              title: docsum.title,
              authors: formatAuthors(docsum.authors),
              source: docsum.source,
              pubDate: await standardizeDate(docsum.pubdate, requestContext), 
              epubDate: await standardizeDate(docsum.epubdate, requestContext), 
            })),
        );
      } else if (eSummaryResponse && eSummaryResponse.eSummaryResult && eSummaryResponse.eSummaryResult.ERROR) {
        logger.warning("ESummary returned an error for some PMIDs", {
          ...requestContext,
          errorDetails: eSummaryResponse.eSummaryResult.ERROR,
        });
      }
    }

    const resultPayload = {
      searchParameters: {
        queryTerm: input.queryTerm,
        maxResults: input.maxResults,
        sortBy: input.sortBy,
        dateRange: input.dateRange,
        filterByPublicationTypes: input.filterByPublicationTypes,
        fetchBriefSummaries: currentFetchBriefSummaries,
      },
      effectiveESearchTerm: effectiveQuery,
      totalFound,
      retrievedPmidCount,
      pmids,
      briefSummaries,
      eSearchUrl,
      eSummaryUrl: currentFetchBriefSummaries > 0 && pmids.length > 0 ? eSummaryUrl : undefined,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(resultPayload) }],
      isError: false,
    };
  } catch (error: any) {
    logger.error("Error in searchPubMedArticlesLogic", error, requestContext);
    const mcpError =
      error instanceof McpError
        ? error
        : new McpError(
            BaseErrorCode.INTERNAL_ERROR,
            "Failed to search PubMed articles due to an unexpected error.",
            { originalErrorName: error.name, originalErrorMessage: error.message, requestId: requestContext.requestId },
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
            searchParameters: sanitizeInputForLogging(input), // Log sanitized input on error
            eSearchUrl, // Include URL even on error for debugging
            eSummaryUrl: (input.fetchBriefSummaries ?? 0) > 0 && eSummaryUrl ? eSummaryUrl : undefined,
          }),
        },
      ],
      isError: true,
    };
  }
}
