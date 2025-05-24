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
  let responseContentType = "application/json";

  switch (input.detailLevel) {
    case "full_xml":
      retmode = "xml";
      responseContentType = "application/xml";
      break;
    case "medline_text":
      retmode = "text";
      rettype = "medline";
      responseContentType = "text/plain";
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

    let responseData: any;

    if (
      input.detailLevel === "full_xml" ||
      input.detailLevel === "medline_text"
    ) {
      // For full_xml, ncbiService.eFetch (if retmode='xml') returns parsed JSON by default.
      // If we want raw XML string, ncbiService would need an option or we re-serialize.
      // For now, assuming ncbiService returns string if retmode='text', and parsed object if retmode='xml'.
      // If ncbiService returns parsed object for full_xml, we might need to stringify it back to XML if client expects raw XML.
      // Let's assume for now the client consuming "full_xml" can handle the JSON representation of XML from fast-xml-parser.
      // If raw XML string is strictly needed, ncbiService.makeRequest would need adjustment or a new method.
      responseData = eFetchResponseXml;
      if (
        input.detailLevel === "full_xml" &&
        typeof eFetchResponseXml === "object"
      ) {
        // If the client expects a string of XML, we'd need to re-serialize.
        // This is a simplification; true XML serialization is complex.
        // For now, we'll send the JSON representation.
        // Consider adding an XMLBuilder if raw XML string output is critical.
        // responseData = JSON.stringify(eFetchResponseXml); // Or use an XML builder
      }
    } else {
      // abstract_plus or citation_data
      // Ensure eFetchResponseXml is of type XmlPubmedArticleSet for parsePubMedArticleSet
      const parsedArticles = parsePubMedArticleSet(
        eFetchResponseXml as XmlPubmedArticleSet,
        input,
        toolLogicContext,
      );
      const foundPmids = new Set(parsedArticles.map((p) => p.pmid));
      const notFoundPmids = input.pmids.filter((pmid) => !foundPmids.has(pmid));

      responseData = {
        requestedPmids: input.pmids,
        articles: parsedArticles,
        notFoundPmids,
        eFetchDetails: {
          urls: [eFetchUrl],
          requestMethod: input.pmids.length > 200 ? "POST" : "GET",
        },
      };

      if (input.detailLevel === "citation_data") {
        responseData.articles = responseData.articles.map(
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
          }),
        );
      }
    }

    return {
      content: [
        {
          type: "text",
          text:
            responseContentType === "application/json" ||
            typeof responseData === "object"
              ? JSON.stringify(responseData)
              : String(responseData),
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
