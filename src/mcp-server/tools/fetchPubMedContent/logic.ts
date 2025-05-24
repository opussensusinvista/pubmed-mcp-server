/**
 * @fileoverview Logic for the fetch_pubmed_content MCP tool.
 * Handles EFetch queries for specific PMIDs and formats the results.
 * This tool can fetch various details from PubMed including abstracts, full XML,
 * MEDLINE text, and citation data.
 * @module src/mcp-server/tools/fetchPubMedContent/logic
 */

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ncbiService } from "../../../services/NCBI/ncbiService.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  ParsedArticle,
  XmlMedlineCitation,
  XmlPubmedArticleSet,
} from "../../../types-global/pubmedXml.js";
import {
  logger,
  RequestContext,
  requestContextService,
  sanitizeInputForLogging,
} from "../../../utils/index.js";
import {
  ensureArray,
  extractAbstractText,
  extractArticleDates,
  extractAuthors,
  extractDoi,
  extractGrants,
  extractJournalInfo,
  extractKeywords,
  extractMeshTerms,
  extractPmid,
  extractPublicationTypes,
  getText,
} from "../../../utils/parsing/ncbi-parsing/index.js";

export const FetchPubMedContentInputSchema = z
  .object({
    pmids: z
      .array(z.string().regex(/^\d+$/))
      .max(200, "Max 200 PMIDs per call if not using history.")
      .optional()
      .describe(
        "An array of PubMed Unique Identifiers (PMIDs) for which to fetch content. Use this OR queryKey/webEnv.",
      ),
    queryKey: z
      .string()
      .optional()
      .describe(
        "Query key from ESearch history server. If used, webEnv must also be provided. Use this OR pmids.",
      ),
    webEnv: z
      .string()
      .optional()
      .describe(
        "Web environment from ESearch history server. If used, queryKey must also be provided. Use this OR pmids.",
      ),
    retstart: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Sequential index of the first record to retrieve (0-based). Used with queryKey/webEnv.",
      ),
    retmax: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "Maximum number of records to retrieve. Used with queryKey/webEnv.",
      ),
    detailLevel: z
      .enum(["abstract_plus", "full_xml", "medline_text", "citation_data"])
      .optional()
      .default("abstract_plus")
      .describe(
        "Specifies the level of detail for the fetched content. Options: 'abstract_plus' (parsed details including abstract, authors, journal, DOI, etc.), 'full_xml' (raw PubMedArticle XML), 'medline_text' (MEDLINE format), 'citation_data' (minimal parsed data for citations). Defaults to 'abstract_plus'.",
      ),
    includeMeshTerms: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "Applies to 'abstract_plus' and 'citation_data' if parsed from XML.",
      ),
    includeGrantInfo: z
      .boolean()
      .optional()
      .default(false)
      .describe("Applies to 'abstract_plus' if parsed from XML."),
    outputFormat: z
      .enum(["json", "raw_text"])
      .optional()
      .default("json")
      .describe(
        "Specifies the final output format of the tool. \n- 'json' (default): Wraps the data in a standard JSON object. \n- 'raw_text': Returns raw text for 'medline_text' or 'full_xml' detailLevels. For other detailLevels, 'outputFormat' defaults to 'json'.",
      ),
  })
  .superRefine((data, ctx) => {
    if (data.queryKey && !data.webEnv) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "webEnv is required if queryKey is provided.",
        path: ["webEnv"],
      });
    }
    if (!data.queryKey && data.webEnv) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "queryKey is required if webEnv is provided.",
        path: ["queryKey"],
      });
    }
    if (
      (!data.pmids || data.pmids.length === 0) &&
      !(data.queryKey && data.webEnv)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Either pmids (non-empty array) or both queryKey and webEnv must be provided.",
        path: ["pmids"],
      });
    }
    if (data.pmids && data.pmids.length > 0 && (data.queryKey || data.webEnv)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Cannot use pmids and queryKey/webEnv simultaneously. Please choose one method.",
        path: ["pmids"],
      });
    }
    if (
      (data.retstart !== undefined || data.retmax !== undefined) &&
      !(data.queryKey && data.webEnv)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "retstart/retmax can only be used with queryKey and webEnv.",
        path: ["retstart"],
      });
    }
  });

export type FetchPubMedContentInput = z.infer<
  typeof FetchPubMedContentInputSchema
>;

/**
 * Interface for parameters passed to the ncbiService.eFetch method.
 * Adjusted to reflect that 'id' is not used when query_key and WebEnv are present.
 */
interface EFetchServiceParams {
  db: string;
  id?: string; // Optional if using history
  query_key?: string; // NCBI uses query_key
  WebEnv?: string; // NCBI uses WebEnv (capital E)
  retmode?: "xml" | "text";
  rettype?: string;
  retstart?: string;
  retmax?: string;
  // Allow other E-utility specific parameters, typically strings
  [key: string]: string | undefined;
}

function parsePubMedArticleSet(
  xmlData: unknown, // Changed from { PubmedArticleSet?: XmlPubmedArticleSet } | any
  input: FetchPubMedContentInput,
  parentContext: RequestContext,
): ParsedArticle[] {
  const articles: ParsedArticle[] = [];
  const operationContext = requestContextService.createRequestContext({
    parentRequestId: parentContext.requestId,
    operation: "parsePubMedArticleSet",
  });

  // Type guard for xmlData
  if (
    !xmlData ||
    typeof xmlData !== "object" ||
    !("PubmedArticleSet" in xmlData)
  ) {
    logger.warning(
      "Invalid or unexpected structure for xmlData in parsePubMedArticleSet.",
      {
        ...operationContext,
        xmlDataType: typeof xmlData,
        xmlDataPreview: sanitizeInputForLogging(
          JSON.stringify(xmlData).substring(0, 200),
        ),
      },
    );
    return articles;
  }

  const typedXmlData = xmlData as { PubmedArticleSet?: XmlPubmedArticleSet }; // Cast after check
  const articleSet = typedXmlData.PubmedArticleSet;

  if (!articleSet || !articleSet.PubmedArticle) {
    logger.warning(
      "PubmedArticleSet or PubmedArticle array not found in EFetch XML response.",
      requestContextService.createRequestContext({
        ...operationContext,
        xmlDataPreview: sanitizeInputForLogging(
          JSON.stringify(typedXmlData).substring(0, 200),
        ),
      }),
    );
    return articles;
  }

  const pubmedArticlesXml = ensureArray(articleSet.PubmedArticle);

  logger.debug("Result of ensureArray(articleSet.PubmedArticle):", {
    ...operationContext,
    pubmedArticlesXmlPreview: sanitizeInputForLogging(
      JSON.stringify(pubmedArticlesXml).substring(0, 500),
    ),
    isPubmedArticlesXmlArray: Array.isArray(pubmedArticlesXml),
    pubmedArticlesXmlLength: Array.isArray(pubmedArticlesXml)
      ? pubmedArticlesXml.length
      : undefined,
  });

  if (Array.isArray(pubmedArticlesXml) && pubmedArticlesXml.length > 0) {
    logger.debug("First item of pubmedArticlesXml:", {
      ...operationContext,
      firstItemPreview: sanitizeInputForLogging(
        JSON.stringify(pubmedArticlesXml[0]).substring(0, 500),
      ),
    });
  }

  for (const articleXml of pubmedArticlesXml) {
    if (!articleXml || typeof articleXml !== "object") {
      logger.warning(
        "Skipping invalid articleXml item in pubmedArticlesXml array",
        {
          ...operationContext,
          articleXmlItem: sanitizeInputForLogging(articleXml),
        },
      );
      continue;
    }
    const medlineCitation: XmlMedlineCitation | undefined =
      articleXml.MedlineCitation;
    if (!medlineCitation) {
      logger.warning("MedlineCitation not found in articleXml, skipping.", {
        ...operationContext,
        articleXmlPreview: sanitizeInputForLogging(
          JSON.stringify(articleXml).substring(0, 200),
        ),
      });
      continue;
    }

    const pmid = extractPmid(medlineCitation);
    logger.debug("Extracted PMID from MedlineCitation:", {
      ...operationContext,
      extractedPmid: pmid,
      medlineCitationPreview: sanitizeInputForLogging(
        JSON.stringify(medlineCitation).substring(0, 200),
      ),
    });
    if (!pmid) continue;

    const articleNode = medlineCitation.Article;
    const parsedArticle: ParsedArticle = {
      pmid: pmid,
      title: articleNode?.ArticleTitle
        ? getText(articleNode.ArticleTitle)
        : undefined,
      abstractText: articleNode?.Abstract
        ? extractAbstractText(articleNode.Abstract)
        : undefined,
      authors: articleNode?.AuthorList
        ? extractAuthors(articleNode.AuthorList)
        : undefined,
      journalInfo: articleNode?.Journal
        ? extractJournalInfo(articleNode.Journal, medlineCitation)
        : undefined,
      publicationTypes: articleNode?.PublicationTypeList
        ? extractPublicationTypes(articleNode.PublicationTypeList)
        : undefined,
      keywords: articleNode?.KeywordList
        ? extractKeywords(articleNode.KeywordList)
        : undefined,
      doi: articleNode ? extractDoi(articleNode) : undefined,
      articleDates: articleNode?.ArticleDate
        ? extractArticleDates(articleNode)
        : undefined,
    };

    if (input.includeMeshTerms) {
      parsedArticle.meshTerms = medlineCitation.MeshHeadingList
        ? extractMeshTerms(medlineCitation.MeshHeadingList)
        : undefined;
    }

    if (input.includeGrantInfo) {
      parsedArticle.grantList = articleNode?.GrantList
        ? extractGrants(articleNode.GrantList)
        : undefined;
    }

    articles.push(parsedArticle);
  }
  return articles;
}

export async function fetchPubMedContentLogic(
  input: FetchPubMedContentInput,
  parentRequestContext: RequestContext,
): Promise<CallToolResult> {
  // Manual validation for conditions superRefine should catch,
  // as SDK might call handler even with refinement issues.
  if (input.queryKey && !input.webEnv) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: {
              code: BaseErrorCode.VALIDATION_ERROR,
              message: "webEnv is required if queryKey is provided.",
            },
          }),
        },
      ],
      isError: true,
    };
  }
  if (!input.queryKey && input.webEnv) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: {
              code: BaseErrorCode.VALIDATION_ERROR,
              message: "queryKey is required if webEnv is provided.",
            },
          }),
        },
      ],
      isError: true,
    };
  }
  if (
    input.pmids &&
    input.pmids.length > 0 &&
    (input.queryKey || input.webEnv)
  ) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: {
              code: BaseErrorCode.VALIDATION_ERROR,
              message:
                "Cannot use pmids and queryKey/webEnv simultaneously. Please choose one method.",
            },
          }),
        },
      ],
      isError: true,
    };
  }
  if (
    (input.retstart !== undefined || input.retmax !== undefined) &&
    !(input.queryKey && input.webEnv)
  ) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: {
              code: BaseErrorCode.VALIDATION_ERROR,
              message:
                "retstart/retmax can only be used with queryKey and webEnv.",
            },
          }),
        },
      ],
      isError: true,
    };
  }
  // SuperRefine also checks: if ((!data.pmids || data.pmids.length === 0) && !(data.queryKey && data.webEnv))
  // This should ideally be caught before handler, but as a safeguard:
  if (
    (!input.pmids || input.pmids.length === 0) &&
    !(input.queryKey && input.webEnv)
  ) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: {
              code: BaseErrorCode.VALIDATION_ERROR,
              message:
                "Either pmids (non-empty array) or both queryKey and webEnv must be provided.",
            },
          }),
        },
      ],
      isError: true,
    };
  }

  const toolLogicContext = requestContextService.createRequestContext({
    parentRequestId: parentRequestContext.requestId,
    operation: "fetchPubMedContentLogic",
    input: sanitizeInputForLogging(input),
  });

  logger.info("Executing fetch_pubmed_content tool", toolLogicContext);

  const eFetchParams: EFetchServiceParams = { db: "pubmed" };
  let usingHistory = false;

  if (input.queryKey && input.webEnv) {
    usingHistory = true;
    eFetchParams.query_key = input.queryKey;
    eFetchParams.WebEnv = input.webEnv; // NCBI uses WebEnv with capital E
    if (input.retstart !== undefined) {
      eFetchParams.retstart = String(input.retstart);
    }
    if (input.retmax !== undefined) {
      eFetchParams.retmax = String(input.retmax);
    }
  } else if (input.pmids && input.pmids.length > 0) {
    eFetchParams.id = input.pmids.join(",");
  }
  // The superRefine ensures that either pmids or (queryKey & webEnv) is provided.

  let serviceRetmode: "xml" | "text" = "xml"; // Renamed to avoid conflict with local retmode variable if any
  let rettype: string | undefined;
  // responseContentType is determined by input.outputFormat at the end

  switch (input.detailLevel) {
    case "full_xml":
      serviceRetmode = "xml";
      break;
    case "medline_text":
      serviceRetmode = "text";
      rettype = "medline";
      break;
    case "abstract_plus":
    case "citation_data":
      serviceRetmode = "xml"; // Parsed by server, so fetch XML
      break;
  }
  eFetchParams.retmode = serviceRetmode;
  if (rettype) eFetchParams.rettype = rettype;

  let eFetchUrl = "";

  try {
    const eFetchBase =
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
    const eFetchQueryString = new URLSearchParams(
      eFetchParams as Record<string, string>, // Cast to Record<string, string> for URLSearchParams
    ).toString();
    eFetchUrl = `${eFetchBase}?${eFetchQueryString}`;

    // Determine if raw XML should be fetched
    const shouldReturnRawXml =
      input.detailLevel === "full_xml" && input.outputFormat === "raw_text";

    const eFetchResponseData = await ncbiService.eFetch(
      eFetchParams,
      toolLogicContext,
      { retmode: serviceRetmode, rettype, returnRawXml: shouldReturnRawXml },
    );

    let finalOutputText: string;
    let structuredResponseData: any; // Used for building the JSON response

    if (input.detailLevel === "medline_text") {
      const medlineText = String(eFetchResponseData);
      const foundPmidsInMedline = new Set<string>();
      const pmidRegex = /^PMID- (\d+)/gm;
      let match;
      while ((match = pmidRegex.exec(medlineText)) !== null) {
        foundPmidsInMedline.add(match[1]);
      }

      let notFoundPmids: string[] = [];
      if (input.pmids && input.pmids.length > 0) {
        notFoundPmids = input.pmids.filter(
          (pmid) => !foundPmidsInMedline.has(pmid),
        );
      }

      structuredResponseData = {
        requestedPmids: input.pmids || "N/A (used history query)",
        articles: [
          {
            pmids: input.pmids || "N/A (used history query)",
            medlineText: medlineText,
          },
        ],
        notFoundPmids: usingHistory
          ? "N/A (used history query)"
          : notFoundPmids,
        eFetchDetails: {
          urls: [eFetchUrl],
          requestMethod:
            input.pmids && input.pmids.length > 200 && !usingHistory
              ? "POST"
              : "GET",
        },
      };
      if (input.outputFormat === "raw_text") {
        finalOutputText = String(eFetchResponseData);
      } else {
        finalOutputText = JSON.stringify(structuredResponseData);
      }
    } else if (input.detailLevel === "full_xml") {
      if (input.outputFormat === "raw_text") {
        // eFetchResponseData is already the raw XML string due to returnRawXml: true
        finalOutputText = String(eFetchResponseData);
        // Optionally, wrap it in a minimal JSON structure if that's preferred for raw_text output consistency
        // For now, returning the direct XML string as per user expectation for "raw_text"
      } else {
        // outputFormat is 'json', so eFetchResponseData is the parsed XML object
        const articlesXml = ensureArray(
          (eFetchResponseData as any)?.PubmedArticleSet?.PubmedArticle || [],
        );
        const articlesPayload: { pmid: string; fullXmlContent: any }[] = [];
        const foundPmidsInXml = new Set<string>();

        for (const articleXml of articlesXml) {
          let pmid = "unknown_pmid";
          if (articleXml?.MedlineCitation) {
            const extracted = extractPmid(articleXml.MedlineCitation);
            if (extracted) {
              pmid = extracted;
            }
          }
          if (pmid !== "unknown_pmid") {
            foundPmidsInXml.add(pmid);
          }
          articlesPayload.push({
            pmid: pmid,
            fullXmlContent: articleXml,
          });
        }

        let notFoundPmids: string[] | string = [];
        if (input.pmids && input.pmids.length > 0) {
          notFoundPmids = input.pmids.filter(
            (pmid) => !foundPmidsInXml.has(pmid),
          );
        } else if (usingHistory) {
          notFoundPmids = "N/A (used history query)";
        }

        structuredResponseData = {
          requestedPmids: input.pmids || "N/A (used history query)",
          articles: articlesPayload,
          notFoundPmids,
          eFetchDetails: {
            urls: [eFetchUrl],
            requestMethod:
              input.pmids && input.pmids.length > 200 && !usingHistory
                ? "POST"
                : "GET",
          },
        };
        finalOutputText = JSON.stringify(structuredResponseData);
      }
    } else {
      // abstract_plus or citation_data (outputFormat is always 'json' effectively)
      // eFetchResponseData is the parsed XML object
      const parsedArticles = parsePubMedArticleSet(
        eFetchResponseData as XmlPubmedArticleSet,
        input,
        toolLogicContext,
      );
      const foundPmids = new Set(parsedArticles.map((p) => p.pmid));

      let notFoundPmids: string[] | string = [];
      if (input.pmids && input.pmids.length > 0) {
        notFoundPmids = input.pmids.filter((pmid) => !foundPmids.has(pmid));
      } else if (usingHistory) {
        notFoundPmids = "N/A (used history query)";
      }

      structuredResponseData = {
        requestedPmids: input.pmids || "N/A (used history query)",
        articles: parsedArticles,
        notFoundPmids,
        eFetchDetails: {
          urls: [eFetchUrl],
          requestMethod:
            input.pmids && input.pmids.length > 200 && !usingHistory
              ? "POST"
              : "GET",
        },
      };

      if (input.detailLevel === "citation_data") {
        structuredResponseData.articles = structuredResponseData.articles.map(
          (article: ParsedArticle) => ({
            pmid: article.pmid,
            title: article.title,
            authors: article.authors?.map((a) => ({
              lastName: a.lastName,
              initials: a.initials,
            })),
            journalInfo: {
              title: article.journalInfo?.title,
              isoAbbreviation: article.journalInfo?.isoAbbreviation,
              volume: article.journalInfo?.volume,
              issue: article.journalInfo?.issue,
              pages: article.journalInfo?.pages,
              year: article.journalInfo?.publicationDate?.year,
            },
            doi: article.doi,
            // Conditionally include meshTerms if the input flag was set (it defaults to true)
            ...(input.includeMeshTerms && { meshTerms: article.meshTerms }),
          }),
        );
      }
      // For abstract_plus and citation_data, outputFormat 'raw_text' doesn't make sense,
      // as the data is inherently structured. So, always output JSON.
      finalOutputText = JSON.stringify(structuredResponseData);
    }

    return {
      content: [
        {
          type: "text",
          text: finalOutputText,
        },
      ],
      isError: false,
    };
  } catch (error: any) {
    logger.error(
      "Error in fetch_pubmed_content logic",
      error,
      toolLogicContext,
    );
    const mcpError =
      error instanceof McpError
        ? error
        : new McpError(
            BaseErrorCode.INTERNAL_ERROR,
            "Failed to fetch PubMed content.",
            {
              originalErrorName: error.name,
              originalErrorMessage: error.message,
              requestId: toolLogicContext.requestId,
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
            requestedPmids: input.pmids || "N/A (used history query)",
            eFetchUrl,
          }),
        },
      ],
      isError: true,
    };
  }
}
