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

export const FetchPubMedContentInputSchema = z.object({
  pmids: z
    .array(z.string().regex(/^\d+$/))
    .min(1, "At least one PMID is required")
    .max(200, "Max 200 PMIDs per call.")
    .describe(
      "An array of PubMed Unique Identifiers (PMIDs) for which to fetch content. Requires at least one PMID, max 200 per call.",
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
      "Specifies the final output format of the tool. 'json' (default) wraps the data in a standard JSON object. 'raw_text' attempts to return raw text for 'medline_text' or a JSON string of the XML structure for 'full_xml'. For other detailLevels, 'raw_text' defaults to 'json'.",
    ),
});

export type FetchPubMedContentInput = z.infer<
  typeof FetchPubMedContentInputSchema
>;

function parsePubMedArticleSet(
  // xmlData is the root of the parsed XML document from EFetch
  xmlData: { PubmedArticleSet?: XmlPubmedArticleSet } | any,
  input: FetchPubMedContentInput,
  parentContext: RequestContext,
): ParsedArticle[] {
  const articles: ParsedArticle[] = [];
  const operationContext = requestContextService.createRequestContext({
    parentRequestId: parentContext.requestId,
    operation: "parsePubMedArticleSet",
  });

  const articleSet = xmlData?.PubmedArticleSet;

  if (!articleSet || !articleSet.PubmedArticle) {
    logger.warning(
      "PubmedArticleSet or PubmedArticle array not found in EFetch XML response.",
      requestContextService.createRequestContext({
        ...operationContext,
        xmlDataPreview: sanitizeInputForLogging(
          JSON.stringify(xmlData).substring(0, 200), // Log the root for context
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
  const toolLogicContext = requestContextService.createRequestContext({
    parentRequestId: parentRequestContext.requestId,
    operation: "fetchPubMedContentLogic",
    input: sanitizeInputForLogging(input),
  });

  logger.info("Executing fetch_pubmed_content tool", toolLogicContext);

  const eFetchParams: {
    db: string;
    id: string;
    retmode?: string;
    rettype?: string;
    [key: string]: any;
  } = {
    db: "pubmed",
    id: input.pmids.join(","),
  };

  let retmode: "xml" | "text" = "xml";
  let rettype: string | undefined;
  // responseContentType is determined by input.outputFormat at the end

  switch (input.detailLevel) {
    case "full_xml":
      retmode = "xml";
      break;
    case "medline_text":
      retmode = "text";
      rettype = "medline";
      break;
    case "abstract_plus":
    case "citation_data":
      retmode = "xml"; // Parsed by server, so fetch XML
      break;
  }
  eFetchParams.retmode = retmode;
  if (rettype) eFetchParams.rettype = rettype;

  let eFetchUrl = "";

  try {
    const eFetchBase =
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
    const eFetchQueryString = new URLSearchParams(
      eFetchParams as Record<string, string>,
    ).toString();
    eFetchUrl = `${eFetchBase}?${eFetchQueryString}`;

    const eFetchResponseXml = await ncbiService.eFetch(
      // Assuming eFetch returns the parsed XML object or raw text
      eFetchParams,
      toolLogicContext,
      { retmode, rettype },
    );

    let finalOutputText: string;
    let structuredResponseData: any; // Used for building the JSON response

    if (input.detailLevel === "medline_text") {
      structuredResponseData = {
        requestedPmids: input.pmids,
        articles: [
          {
            pmids: input.pmids,
            medlineText: String(eFetchResponseXml),
          },
        ],
        notFoundPmids: [], // Simplification
        eFetchDetails: {
          urls: [eFetchUrl],
          requestMethod: input.pmids.length > 200 ? "POST" : "GET",
        },
      };
      if (input.outputFormat === "raw_text") {
        finalOutputText = String(eFetchResponseXml);
      } else {
        finalOutputText = JSON.stringify(structuredResponseData);
      }
    } else if (input.detailLevel === "full_xml") {
      const articlesXml = ensureArray(
        (eFetchResponseXml as any)?.PubmedArticleSet?.PubmedArticle || [],
      );
      const articlesPayload: { pmid: string; fullXmlContent: any }[] = [];
      const foundPmidsInXml = new Set<string>();

      for (const articleXml of articlesXml) {
        let pmid = "unknown_pmid";
        if (articleXml?.MedlineCitation) {
          // Use the robust extractPmid utility
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
          fullXmlContent: articleXml, // articleXml here is the <PubmedArticle> element
        });
      }
      const notFoundPmids = input.pmids.filter(
        (pmid) => !foundPmidsInXml.has(pmid),
      );
      structuredResponseData = {
        requestedPmids: input.pmids,
        articles: articlesPayload,
        notFoundPmids,
        eFetchDetails: {
          urls: [eFetchUrl],
          requestMethod: input.pmids.length > 200 ? "POST" : "GET",
        },
      };
      if (input.outputFormat === "raw_text") {
        // NOTE: This returns the JSON string representation of the parsed XML,
        // not the raw XML string itself. True raw XML output would require
        // ncbiService to return raw string or use an XML builder here.
        logger.warning(
          "outputFormat 'raw_text' for 'full_xml' detailLevel currently returns a JSON string of the parsed XML, not a raw XML string.",
          toolLogicContext,
        );
        finalOutputText = JSON.stringify(eFetchResponseXml); // This is the parsed XML object from ncbiService
      } else {
        finalOutputText = JSON.stringify(structuredResponseData);
      }
    } else {
      // abstract_plus or citation_data
      const parsedArticles = parsePubMedArticleSet(
        eFetchResponseXml as XmlPubmedArticleSet,
        input,
        toolLogicContext,
      );
      const foundPmids = new Set(parsedArticles.map((p) => p.pmid));
      const notFoundPmids = input.pmids.filter((pmid) => !foundPmids.has(pmid));

      structuredResponseData = {
        requestedPmids: input.pmids,
        articles: parsedArticles,
        notFoundPmids,
        eFetchDetails: {
          urls: [eFetchUrl],
          requestMethod: input.pmids.length > 200 ? "POST" : "GET",
        },
      };

      if (input.detailLevel === "citation_data") {
        structuredResponseData.articles =
          structuredResponseData.articles.map((article: ParsedArticle) => ({
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
          }));
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
            requestedPmids: input.pmids,
            eFetchUrl,
          }),
        },
      ],
      isError: true,
    };
  }
}
