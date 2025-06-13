/**
 * @fileoverview Logic for the fetch_pubmed_content MCP tool.
 * Handles EFetch queries for specific PMIDs and formats the results.
 * This tool can fetch various details from PubMed including abstracts, full XML,
 * MEDLINE text, and citation data.
 * @module src/mcp-server/tools/fetchPubMedContent/logic
 */

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getNcbiService } from "../../../services/NCBI/ncbiService.js";
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
  xmlData: unknown,
  input: FetchPubMedContentInput,
  parentContext: RequestContext,
): ParsedArticle[] {
  const articles: ParsedArticle[] = [];
  const operationContext = requestContextService.createRequestContext({
    parentRequestId: parentContext.requestId,
    operation: "parsePubMedArticleSet",
  });

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

  const typedXmlData = xmlData as { PubmedArticleSet?: XmlPubmedArticleSet };
  const articleSet = typedXmlData.PubmedArticleSet;

  if (!articleSet || !articleSet.PubmedArticle) {
    logger.warning(
      "PubmedArticleSet or PubmedArticle array not found in EFetch XML response.",
      {
        ...operationContext,
        xmlDataPreview: sanitizeInputForLogging(
          JSON.stringify(typedXmlData).substring(0, 200),
        ),
      },
    );
    return articles;
  }

  const pubmedArticlesXml = ensureArray(articleSet.PubmedArticle);
  const totalArticlesInXml = pubmedArticlesXml.length;

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
    if (!pmid) {
      logger.warning("Could not extract PMID from MedlineCitation, skipping.", {
        ...operationContext,
        medlineCitationPreview: sanitizeInputForLogging(
          JSON.stringify(medlineCitation).substring(0, 200),
        ),
      });
      continue;
    }

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

  logger.debug(
    `Successfully parsed ${articles.length} of ${totalArticlesInXml} articles from XML.`,
    {
      ...operationContext,
      parsedCount: articles.length,
      totalInXml: totalArticlesInXml,
    },
  );

  return articles;
}

export async function fetchPubMedContentLogic(
  input: FetchPubMedContentInput,
  parentRequestContext: RequestContext,
): Promise<CallToolResult> {
  const toolLogicContext = requestContextService.createRequestContext({
    parentRequestId: parentRequestContext.requestId,
    operation: "fetchPubMedContentLogic",
    input: sanitizeInputForLogging(input),
  });

  // Manual validation safeguard
  const validationResult = FetchPubMedContentInputSchema.safeParse(input);
  if (!validationResult.success) {
    const errorMessage =
      validationResult.error.errors[0]?.message || "Invalid input";
    logger.warning(
      `Input validation failed pre-check: ${errorMessage}`,
      toolLogicContext,
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: {
              code: BaseErrorCode.VALIDATION_ERROR,
              message: errorMessage,
              details: validationResult.error.flatten(),
            },
          }),
        },
      ],
      isError: true,
    };
  }

  const ncbiService = getNcbiService();
  logger.info("Executing fetch_pubmed_content tool", toolLogicContext);

  const eFetchParams: EFetchServiceParams = { db: "pubmed" };
  let usingHistory = false;

  if (input.queryKey && input.webEnv) {
    usingHistory = true;
    eFetchParams.query_key = input.queryKey;
    eFetchParams.WebEnv = input.webEnv;
    if (input.retstart !== undefined) {
      eFetchParams.retstart = String(input.retstart);
    }
    if (input.retmax !== undefined) {
      eFetchParams.retmax = String(input.retmax);
    }
  } else if (input.pmids && input.pmids.length > 0) {
    eFetchParams.id = input.pmids.join(",");
  }

  let serviceRetmode: "xml" | "text" = "xml";
  let rettype: string | undefined;

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
      serviceRetmode = "xml";
      break;
  }
  eFetchParams.retmode = serviceRetmode;
  if (rettype) eFetchParams.rettype = rettype;

  let eFetchUrl = "";

  try {
    const eFetchBase =
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
    const eFetchQueryString = new URLSearchParams(
      eFetchParams as Record<string, string>,
    ).toString();
    eFetchUrl = `${eFetchBase}?${eFetchQueryString}`;

    const shouldReturnRawXml =
      input.detailLevel === "full_xml" && input.outputFormat === "raw_text";

    const eFetchResponseData = await ncbiService.eFetch(
      eFetchParams,
      toolLogicContext,
      { retmode: serviceRetmode, rettype, returnRawXml: shouldReturnRawXml },
    );

    let finalOutputText: string;
    let structuredResponseData: any;
    let articlesCount = 0;

    if (input.detailLevel === "medline_text") {
      const medlineText = String(eFetchResponseData);
      const foundPmidsInMedline = new Set<string>();
      const pmidRegex = /^PMID- (\d+)/gm;
      let match;
      while ((match = pmidRegex.exec(medlineText)) !== null) {
        foundPmidsInMedline.add(match[1]);
      }
      articlesCount = foundPmidsInMedline.size;

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
      finalOutputText =
        input.outputFormat === "raw_text"
          ? medlineText
          : JSON.stringify(structuredResponseData);
    } else if (input.detailLevel === "full_xml") {
      if (input.outputFormat === "raw_text") {
        finalOutputText = String(eFetchResponseData);
        articlesCount = (finalOutputText.match(/<PubmedArticle>/g) || []).length;
      } else {
        const articlesXml = ensureArray(
          (eFetchResponseData as any)?.PubmedArticleSet?.PubmedArticle || [],
        );
        articlesCount = articlesXml.length;
        const articlesPayload: { pmid: string; fullXmlContent: any }[] = [];
        const foundPmidsInXml = new Set<string>();

        for (const articleXml of articlesXml) {
          const pmid = extractPmid(articleXml.MedlineCitation) || "unknown_pmid";
          if (pmid !== "unknown_pmid") foundPmidsInXml.add(pmid);
          articlesPayload.push({ pmid, fullXmlContent: articleXml });
        }

        const notFoundPmids =
          input.pmids && input.pmids.length > 0
            ? input.pmids.filter((pmid) => !foundPmidsInXml.has(pmid))
            : "N/A (used history query)";

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
      // abstract_plus or citation_data
      const parsedArticles = parsePubMedArticleSet(
        eFetchResponseData as XmlPubmedArticleSet,
        input,
        toolLogicContext,
      );
      articlesCount = parsedArticles.length;
      const foundPmids = new Set(parsedArticles.map((p) => p.pmid));

      const notFoundPmids =
        input.pmids && input.pmids.length > 0
          ? input.pmids.filter((pmid) => !foundPmids.has(pmid))
          : "N/A (used history query)";

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
            ...(input.includeMeshTerms && { meshTerms: article.meshTerms }),
          }),
        );
      }
      finalOutputText = JSON.stringify(structuredResponseData);
    }

    logger.notice("Successfully executed fetch_pubmed_content tool.", {
      ...toolLogicContext,
      detailLevel: input.detailLevel,
      outputFormat: input.outputFormat,
      articlesReturned: articlesCount,
      usingHistory,
    });

    return {
      content: [{ type: "text", text: finalOutputText }],
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
