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
  logger,
  RequestContext,
  requestContextService,
  sanitizeInputForLogging,
} from "../../../utils/index.js";

export const FetchPubMedContentInputSchema = z.object({
  pmids: z
    .array(z.string().regex(/^\d+$/))
    .min(1, "At least one PMID is required")
    .max(200, "Max 200 PMIDs per call.")
    .describe("An array of PubMed Unique Identifiers (PMIDs) for which to fetch content. Requires at least one PMID, max 200 per call."),
  detailLevel: z
    .enum([
      "abstract_plus", // Server-parsed: Title, abstract, authors, journal, pub_date, keywords, DOI
      "full_xml", // Raw PubMedArticle XML
      "medline_text", // MEDLINE formatted text
      "citation_data", // Server-parsed minimal data for citation
    ])
    .optional()
    .default("abstract_plus")
    .describe("Specifies the level of detail for the fetched content. Options: 'abstract_plus' (parsed details including abstract, authors, journal, DOI, etc.), 'full_xml' (raw PubMedArticle XML), 'medline_text' (MEDLINE format), 'citation_data' (minimal parsed data for citations). Defaults to 'abstract_plus'."),
  includeMeshTerms: z
    .boolean()
    .optional()
    .default(true)
    .describe("Applies to 'abstract_plus' and 'citation_data' if parsed from XML."),
  includeGrantInfo: z
    .boolean()
    .optional()
    .default(false)
    .describe("Applies to 'abstract_plus' if parsed from XML."),
});

export type FetchPubMedContentInput = z.infer<
  typeof FetchPubMedContentInputSchema
>;

// Helper interfaces for parsing PubMedArticle XML (simplified)
interface PubMedArticleAuthor {
  lastName?: string;
  foreName?: string;
  initials?: string;
  affiliationInfo?: { affiliation: string }[];
}

interface JournalInfo {
  title?: string;
  isoAbbreviation?: string;
  volume?: string;
  issue?: string;
  pages?: string; // MedlinePgn
  publicationDate?: {
    year?: string;
    month?: string;
    day?: string;
    medlineDate?: string;
  };
}

interface MeshHeading {
  descriptorName: { _ui: string; "#text": string; _MajorTopicYN?: "Y" | "N" }; // Add _MajorTopicYN here if it can appear
  qualifierName?: { _ui: string; "#text": string; _MajorTopicYN?: "Y" | "N" }[];
  _MajorTopicYN?: "Y" | "N"; // More likely location based on typical NCBI XML
}

interface Grant {
  grantID?: string;
  agency?: string;
  country?: string;
}

interface ParsedArticle {
  pmid: string;
  title?: string;
  abstractText?: string;
  authors?: {
    lastName?: string;
    firstName?: string; // Corrected from foreName to firstName for consistency
    initials?: string;
    affiliation?: string; // Simplified
  }[];
  journalInfo?: JournalInfo;
  publicationTypes?: string[];
  keywords?: string[]; // From KeywordList or MeSH
  meshTerms?: {
    descriptorName: string;
    descriptorUi: string;
    qualifierName?: string;
    qualifierUi?: string;
    isMajorTopic: boolean;
  }[];
  grantList?: Grant[];
  doi?: string;
}

// Helper function to safely access deeply nested properties
function getNested(obj: any, path: string, defaultValue: any = undefined) {
  const value = path
    .split(".")
    .reduce((acc, part) => acc && acc[part], obj);
  return value === undefined ? defaultValue : value;
}


function parsePubMedArticleSet(
  xmlData: any,
  input: FetchPubMedContentInput, // Renamed type
  parentContext: RequestContext, // Renamed for clarity
): ParsedArticle[] {
  const articles: ParsedArticle[] = [];
  const operationContext = requestContextService.createRequestContext({
    parentRequestId: parentContext.requestId,
    operation: "parsePubMedArticleSet",
  });

  if (!xmlData || !xmlData.PubmedArticleSet || !xmlData.PubmedArticleSet.PubmedArticle) {
    logger.warning(
      "PubmedArticleSet or PubmedArticle not found in EFetch XML",
      requestContextService.createRequestContext({ // Create new context for this specific log
        ...operationContext,
        xmlDataPreview: sanitizeInputForLogging(JSON.stringify(xmlData).substring(0, 200)),
      }),
    );
    return articles;
  }

  const pubmedArticles = Array.isArray(xmlData.PubmedArticleSet.PubmedArticle)
    ? xmlData.PubmedArticleSet.PubmedArticle
    : [xmlData.PubmedArticleSet.PubmedArticle];

  for (const articleXml of pubmedArticles) {
    if (!articleXml || !articleXml.MedlineCitation) continue;

    const medlineCitation = articleXml.MedlineCitation;
    const pmid = getNested(medlineCitation, "PMID.#text", "");
    if (!pmid) continue;

    const article: ParsedArticle = { pmid };
    const articleData = getNested(medlineCitation, "Article", {});

    article.title = getNested(articleData, "ArticleTitle.#text", "");
    const abstractTexts = getNested(articleData, "Abstract.AbstractText");
    if (abstractTexts) {
      if (Array.isArray(abstractTexts)) {
        article.abstractText = abstractTexts
          .map((at: any) => (typeof at === "string" ? at : getNested(at, "#text", "")))
          .join("\n");
      } else if (typeof abstractTexts === "object") {
        article.abstractText = getNested(abstractTexts, "#text", "");
      } else if (typeof abstractTexts === "string") {
        article.abstractText = abstractTexts;
      }
    }


    const authorsXml: PubMedArticleAuthor[] = getNested(articleData, "AuthorList.Author", []);
    if (authorsXml) {
      article.authors = (Array.isArray(authorsXml) ? authorsXml : [authorsXml]).map((auth: PubMedArticleAuthor) => ({
        lastName: auth.lastName,
        firstName: auth.foreName, // XML uses ForeName
        initials: auth.initials,
        affiliation: getNested(auth, "affiliationInfo.0.affiliation", undefined), // Take first affiliation
      }));
    }
    
    const journalXml = getNested(articleData, "Journal", {});
    article.journalInfo = {
      title: getNested(journalXml, "Title.#text", ""),
      isoAbbreviation: getNested(journalXml, "ISOAbbreviation.#text", ""),
      volume: getNested(journalXml, "JournalIssue.Volume.#text", ""),
      issue: getNested(journalXml, "JournalIssue.Issue.#text", ""),
      pages: getNested(medlineCitation, "MedlinePgn", getNested(articleData, "Pagination.MedlinePgn", "")), // Check both locations
      publicationDate: {
        year: getNested(journalXml, "JournalIssue.PubDate.Year.#text", getNested(journalXml, "JournalIssue.PubDate.MedlineDate", "").match(/\d{4}/)?.[0]),
        month: getNested(journalXml, "JournalIssue.PubDate.Month.#text", ""),
        day: getNested(journalXml, "JournalIssue.PubDate.Day.#text", ""),
        medlineDate: getNested(journalXml, "JournalIssue.PubDate.MedlineDate", ""),
      },
    };
    
    const pubTypesXml = getNested(articleData, "PublicationTypeList.PublicationType", []);
     if (pubTypesXml) {
      article.publicationTypes = (Array.isArray(pubTypesXml) ? pubTypesXml : [pubTypesXml]).map((pt: any) => pt["#text"] || pt);
    }

    const keywordsXml = getNested(medlineCitation, "KeywordList.Keyword", []);
    if (keywordsXml) {
        article.keywords = (Array.isArray(keywordsXml) ? keywordsXml : [keywordsXml]).map((kw: any) => kw["#text"] || kw);
    }

    if (input.includeMeshTerms) {
      const meshHeadingsXml: MeshHeading[] = getNested(medlineCitation, "MeshHeadingList.MeshHeading", []);
      if (meshHeadingsXml) {
        article.meshTerms = (Array.isArray(meshHeadingsXml) ? meshHeadingsXml : [meshHeadingsXml]).map((mh: MeshHeading) => ({
          descriptorName: mh.descriptorName["#text"],
          descriptorUi: mh.descriptorName._ui,
          qualifierName: mh.qualifierName?.[0]?.["#text"], // Take first qualifier if exists
          qualifierUi: mh.qualifierName?.[0]?._ui,
          isMajorTopic: mh._MajorTopicYN === "Y" || mh.descriptorName._MajorTopicYN === "Y" || mh.qualifierName?.[0]?._MajorTopicYN === "Y", // Check multiple locations
        }));
      }
    }

    if (input.includeGrantInfo) {
      const grantsXml: Grant[] = getNested(medlineCitation, "GrantList.Grant", []);
      if (grantsXml) {
        article.grantList = (Array.isArray(grantsXml) ? grantsXml : [grantsXml]).map((g: Grant) => ({
          grantId: g.grantID,
          agency: g.agency,
          country: g.country,
        }));
      }
    }
    
    const articleIds = getNested(articleData, "ELocationID", getNested(medlineCitation, "Article.ELocationID", []));
    const doiEntry = (Array.isArray(articleIds) ? articleIds : [articleIds]).find((id: any) => id._EIdType === "doi");
    article.doi = doiEntry ? doiEntry["#text"] : undefined;
    if (!article.doi) { // Fallback for older structures or different locations
        const piiObjects = getNested(medlineCitation, "Article.ArticleIdList.ArticleId", []);
        const doiFromList = (Array.isArray(piiObjects) ? piiObjects : [piiObjects]).find((id: any) => id._IdType === "doi");
        if (doiFromList) article.doi = doiFromList["#text"];
    }


    articles.push(article);
  }
  return articles;
}


export async function fetchPubMedContentLogic( // Renamed function
  input: FetchPubMedContentInput, // Renamed type
  parentRequestContext: RequestContext, // Renamed for clarity
): Promise<CallToolResult> {
  const toolLogicContext = requestContextService.createRequestContext({
    parentRequestId: parentRequestContext.requestId,
    operation: "fetchPubMedContentLogic",
    input: sanitizeInputForLogging(input),
  });

  logger.info("Executing fetch_pubmed_content tool", toolLogicContext);

  // Explicitly define type for NCBI service compatibility
  const eFetchParams: { db: string; id: string; retmode?: string; rettype?: string; [key: string]: any } = {
    db: "pubmed",
    id: input.pmids.join(","),
  };

  let retmode: "xml" | "text" = "xml";
  let rettype: string | undefined;
  let responseContentType = "application/json"; // Default for parsed data

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
      retmode = "xml";
      break;
  }
  eFetchParams.retmode = retmode;
  if (rettype) eFetchParams.rettype = rettype;

  let eFetchUrl = "";

  try {
    const eFetchBase = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
    const eFetchQueryString = new URLSearchParams(eFetchParams as Record<string,string>).toString();
    eFetchUrl = `${eFetchBase}?${eFetchQueryString}`; // Construct URL for logging/output

    const eFetchResponse = await ncbiService.eFetch(
      eFetchParams,
      toolLogicContext, // Pass the new context
      { retmode, rettype }
    );

    let responseData: any;

    if (input.detailLevel === "full_xml" || input.detailLevel === "medline_text") {
      responseData = eFetchResponse; // Raw XML or text
    } else {
      // abstract_plus or citation_data
      const parsedArticles = parsePubMedArticleSet(eFetchResponse, input, toolLogicContext); // Pass the new context
      const foundPmids = new Set(parsedArticles.map(p => p.pmid));
      const notFoundPmids = input.pmids.filter(pmid => !foundPmids.has(pmid));
      
      responseData = {
        requestedPmids: input.pmids,
        articles: parsedArticles,
        notFoundPmids,
        eFetchDetails: {
            urls: [eFetchUrl], // Potentially multiple if POST was used by ncbiService
            requestMethod: input.pmids.length > 200 ? "POST" : "GET" // Heuristic
        }
      };
       if (input.detailLevel === "citation_data") {
        // Further trim for citation_data if needed, e.g., only keep authors, title, journal, year
        responseData.articles = responseData.articles.map((article: ParsedArticle) => ({
            pmid: article.pmid,
            title: article.title,
            authors: article.authors?.map(a => ({lastName: a.lastName, initials: a.initials})),
            journalInfo: {
                title: article.journalInfo?.title,
                isoAbbreviation: article.journalInfo?.isoAbbreviation,
                volume: article.journalInfo?.volume,
                issue: article.journalInfo?.issue,
                pages: article.journalInfo?.pages,
                year: article.journalInfo?.publicationDate?.year
            },
            doi: article.doi
        }));
      }
    }

    return {
      content: [
        {
          type: "text", // Always return as text, stringify JSON or pass XML string
          text: responseContentType === "application/json" ? JSON.stringify(responseData) : String(responseData),
        },
      ],
      isError: false,
    };
  } catch (error: any) {
    logger.error("Error in fetch_pubmed_content logic", error, toolLogicContext); // Use toolLogicContext
    const mcpError =
      error instanceof McpError
        ? error
        : new McpError(
            BaseErrorCode.INTERNAL_ERROR,
            "Failed to fetch PubMed content.", // Updated error message
            { originalErrorName: error.name, originalErrorMessage: error.message, requestId: toolLogicContext.requestId },
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
