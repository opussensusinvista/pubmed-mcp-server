/**
 * @fileoverview Logic for the searchPubMedArticles MCP tool.
 * Handles constructing ESearch and ESummary queries, interacting with
 * the NcbiService, and formatting the results.
 * @module src/mcp-server/tools/searchPubMedArticles/logic
 */

import { z } from "zod";
import { getNcbiService } from "../../../services/NCBI/ncbiService.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  ESearchResult,
  ESummaryResponseContainer,
  ParsedBriefSummary,
} from "../../../types-global/pubmedXml.js";
import {
  logger,
  RequestContext,
  requestContextService,
  sanitizeInputForLogging,
} from "../../../utils/index.js";
import { extractBriefSummaries } from "../../../utils/parsing/ncbi-parsing/index.js";
import { sanitization } from "../../../utils/security/sanitization.js";

export const SearchPubMedArticlesInputSchema = z.object({
  queryTerm: z
    .string()
    .min(3, "Query term must be at least 3 characters")
    .describe(
      "The primary keyword or phrase to search for in PubMed. Must be at least 3 characters long.",
    ),
  maxResults: z
    .number()
    .int()
    .positive()
    .max(1000, "Max results per query. ESearch's retmax is used.")
    .optional()
    .default(20)
    .describe(
      "Maximum number of articles to retrieve. Corresponds to ESearch's 'retmax' parameter. Default is 20, max is 1000.",
    ),
  sortBy: z
    .enum(["relevance", "pub_date", "author", "journal_name"])
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
        .describe(
          "The start date for the search range (YYYY, YYYY/MM, or YYYY/MM/DD).",
        ),
      maxDate: z
        .string()
        .regex(
          /^\d{4}(\/\d{2}(\/\d{2})?)?$/,
          "Date must be YYYY, YYYY/MM, or YYYY/MM/DD",
        )
        .optional()
        .describe(
          "The end date for the search range (YYYY, YYYY/MM, or YYYY/MM/DD).",
        ),
      dateType: z
        .enum(["pdat", "mdat", "edat"])
        .optional()
        .default("pdat")
        .describe(
          "The type of date to filter by: 'pdat' (Publication Date), 'mdat' (Modification Date), 'edat' (Entrez Date). Default is 'pdat'.",
        ),
    })
    .optional()
    .describe(
      "Defines an optional date range for the search, including min/max dates and the type of date field to use.",
    ),
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
    .max(50)
    .optional()
    .default(0)
    .describe(
      "Number of top PMIDs for which to fetch brief summaries using ESummary v2.0. Set to 0 to disable. Maximum is 50 for this tool. Default is 0.",
    ),
});

export type SearchPubMedArticlesInput = z.infer<
  typeof SearchPubMedArticlesInputSchema
>;

export type SearchPubMedArticlesOutput = {
  searchParameters: SearchPubMedArticlesInput;
  effectiveESearchTerm: string;
  totalFound: number;
  retrievedPmidCount: number;
  pmids: string[];
  briefSummaries: ParsedBriefSummary[];
  eSearchUrl: string;
  eSummaryUrl?: string;
};

interface ESearchServiceParams {
  db: string;
  term?: string;
  retmax?: number;
  sort?: string;
  usehistory?: "y" | "n";
  WebEnv?: string;
  query_key?: string;
  id?: string;
  version?: string;
  retmode?: string;
  [key: string]: string | number | undefined;
}

export async function searchPubMedArticlesLogic(
  input: SearchPubMedArticlesInput,
  parentRequestContext: RequestContext,
): Promise<SearchPubMedArticlesOutput> {
  const ncbiService = getNcbiService();
  const toolLogicContext = requestContextService.createRequestContext({
    parentRequestId: parentRequestContext.requestId,
    operation: "searchPubMedArticlesLogic",
    input: sanitizeInputForLogging(input),
  });

  logger.info("Executing searchPubMedArticles tool", toolLogicContext);

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

  if (
    input.filterByPublicationTypes &&
    input.filterByPublicationTypes.length > 0
  ) {
    const ptQuery = input.filterByPublicationTypes
      .map(
        (pt: string) =>
          `"${sanitization.sanitizeString(pt, { context: "text" })}"[Publication Type]`,
      )
      .join(" OR ");
    effectiveQuery += ` AND (${ptQuery})`;
  }

  const currentFetchBriefSummaries = input.fetchBriefSummaries ?? 0;

  const eSearchParams: ESearchServiceParams = {
    db: "pubmed",
    term: effectiveQuery,
    retmax: input.maxResults,
    sort: input.sortBy,
    usehistory: currentFetchBriefSummaries > 0 ? "y" : "n",
  };

  const esResult: ESearchResult = await ncbiService.eSearch(
    eSearchParams,
    toolLogicContext,
  );

  const eSearchBase =
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
  const eSearchQueryStringParams: Record<string, string> = {};
  for (const key in eSearchParams) {
    if (eSearchParams[key] !== undefined) {
      eSearchQueryStringParams[key] = String(eSearchParams[key]);
    }
  }
  const eSearchQueryString = new URLSearchParams(
    eSearchQueryStringParams,
  ).toString();
  const eSearchUrl = `${eSearchBase}?${eSearchQueryString}`;

  if (!esResult) {
    throw new McpError(
      BaseErrorCode.NCBI_PARSING_ERROR,
      "Invalid or empty ESearch response from NCBI.",
      {
        ...toolLogicContext,
        responsePreview: sanitizeInputForLogging(
          JSON.stringify(esResult).substring(0, 200),
        ),
      },
    );
  }

  const pmids: string[] = esResult.idList || [];
  const totalFound = esResult.count || 0;
  const retrievedPmidCount = pmids.length;

  let briefSummaries: ParsedBriefSummary[] = [];
  let eSummaryUrl: string | undefined;

  if (currentFetchBriefSummaries > 0 && pmids.length > 0) {
    const eSummaryParams: ESearchServiceParams = {
      db: "pubmed",
      version: "2.0",
      retmode: "xml",
    };

    if (esResult.webEnv && esResult.queryKey) {
      eSummaryParams.WebEnv = esResult.webEnv;
      eSummaryParams.query_key = esResult.queryKey;
      eSummaryParams.retmax = currentFetchBriefSummaries;
    } else {
      const pmidsForSummary = pmids
        .slice(0, currentFetchBriefSummaries)
        .join(",");
      eSummaryParams.id = pmidsForSummary;
    }

    const eSummaryBase =
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";
    const eSummaryQueryStringParams: Record<string, string> = {};
    for (const key in eSummaryParams) {
      if (eSummaryParams[key] !== undefined) {
        eSummaryQueryStringParams[key] = String(eSummaryParams[key]);
      }
    }
    const eSummaryQueryString = new URLSearchParams(
      eSummaryQueryStringParams,
    ).toString();
    eSummaryUrl = `${eSummaryBase}?${eSummaryQueryString}`;

    const eSummaryResponseXml: ESummaryResponseContainer =
      await ncbiService.eSummary(eSummaryParams, toolLogicContext);

    if (eSummaryResponseXml && eSummaryResponseXml.eSummaryResult) {
      briefSummaries = await extractBriefSummaries(
        eSummaryResponseXml.eSummaryResult,
        toolLogicContext,
      );
    } else if (eSummaryResponseXml && (eSummaryResponseXml as any).ERROR) {
      logger.warning("ESummary returned a top-level error", {
        ...toolLogicContext,
        errorDetails: (eSummaryResponseXml as any).ERROR,
      });
    }
  }

  logger.notice("Successfully executed searchPubMedArticles tool.", {
    ...toolLogicContext,
    totalFound,
    retrievedPmidCount,
    summariesFetched: briefSummaries.length,
  });

  return {
    searchParameters: input,
    effectiveESearchTerm: effectiveQuery,
    totalFound,
    retrievedPmidCount,
    pmids,
    briefSummaries,
    eSearchUrl,
    eSummaryUrl,
  };
}
