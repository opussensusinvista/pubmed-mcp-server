/**
 * @fileoverview Handles ELink requests and enriches results with ESummary data
 * for the getPubMedArticleConnections tool.
 * @module src/mcp-server/tools/getPubMedArticleConnections/logic/elinkHandler
 */

import { ncbiService } from "../../../../services/NCBI/ncbiService.js";
import type {
  ESummaryResult,
  ParsedBriefSummary,
  // XmlAuthor as ESummaryAuthor, // Not needed directly here if using extractBriefSummaries
  // ESummaryDocumentSummary, // Not needed directly here
} from "../../../../types-global/pubmedXml.js";
import {
  logger,
  RequestContext,
  // requestContextService, // Not used directly in this snippet, but available
  // sanitizeInputForLogging, // Not used directly in this snippet
} from "../../../../utils/index.js";
import { extractBriefSummaries } from "../../../../utils/parsing/ncbi-parsing/index.js";
import type { GetPubMedArticleConnectionsInput } from "../registration.js";
import type { ToolOutputData } from "./types.js";

// Local interface for the structure of an ELink 'Link' item
interface XmlELinkItem {
  Id: string | { "#text"?: string };
  Score?: string | { "#text"?: string };
}

export async function handleELinkRelationships(
  input: GetPubMedArticleConnectionsInput,
  outputData: ToolOutputData,
  context: RequestContext,
): Promise<void> {
  const eLinkParams: any = {
    dbfrom: "pubmed",
    db: "pubmed",
    cmd: "neighbor_score",
    id: input.sourcePmid,
    retmode: "xml",
  };

  if (input.relationshipType === "pubmed_citedin") {
    eLinkParams.linkname = "pubmed_pubmed_citedin";
  } else if (input.relationshipType === "pubmed_references") {
    eLinkParams.linkname = "pubmed_pubmed_refs";
  }

  const tempUrl = new URL(
    "https://dummy.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi",
  );
  Object.keys(eLinkParams).forEach((key) =>
    tempUrl.searchParams.append(key, String(eLinkParams[key])),
  );
  outputData.eUtilityUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi?${tempUrl.search.substring(1)}`;

  const eLinkResult: any = await ncbiService.eLink(eLinkParams, context);

  const firstELinkResult =
    eLinkResult?.eLinkResult?.[0] || eLinkResult?.eLinkResult;
  const linkSet = firstELinkResult?.LinkSet?.[0] || firstELinkResult?.LinkSet;
  const linkSetDb = linkSet?.LinkSetDb?.[0] || linkSet?.LinkSetDb;

  if (firstELinkResult?.ERROR || !linkSetDb?.Link?.length) {
    const errorMsg =
      firstELinkResult?.ERROR || "No related articles found or ELink error.";
    logger.warning(errorMsg, context);
    outputData.message =
      typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg);
    outputData.retrievedCount = 0;
    return;
  }

  let foundPmids: { pmid: string; score?: number }[] = [];

  if (linkSetDb.Link) {
    const links = Array.isArray(linkSetDb.Link)
      ? linkSetDb.Link
      : [linkSetDb.Link];
    foundPmids = links
      .map((link: XmlELinkItem) => {
        const pmidValue =
          typeof link.Id === "string" ? link.Id : link.Id?.["#text"];
        const scoreValue =
          typeof link.Score === "string" ? link.Score : link.Score?.["#text"];
        return {
          pmid: String(pmidValue || ""),
          score: scoreValue !== undefined ? Number(scoreValue) : undefined,
        };
      })
      .filter(
        (item: { pmid: string; score?: number }) =>
          item.pmid && item.pmid !== input.sourcePmid,
      );
  }

  if (foundPmids.every((p) => p.score !== undefined)) {
    foundPmids.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  const pmidsToEnrich = foundPmids
    .slice(0, input.maxRelatedResults)
    .map((p) => p.pmid);

  if (pmidsToEnrich.length > 0) {
    try {
      const summaryParams = {
        db: "pubmed",
        id: pmidsToEnrich.join(","),
        version: "2.0",
        retmode: "xml",
      };
      const summaryResultContainer: any = await ncbiService.eSummary(
        summaryParams,
        context,
      );
      const summaryResult: ESummaryResult | undefined =
        summaryResultContainer?.eSummaryResult ||
        summaryResultContainer?.result ||
        summaryResultContainer;

      if (summaryResult) {
        const briefSummaries: ParsedBriefSummary[] =
          await extractBriefSummaries(summaryResult, context);
        const pmidDetailsMap = new Map<string, ParsedBriefSummary>();
        briefSummaries.forEach((bs) => pmidDetailsMap.set(bs.pmid, bs));

        outputData.relatedArticles = foundPmids
          .filter((p) => pmidsToEnrich.includes(p.pmid))
          .map((p) => {
            const details = pmidDetailsMap.get(p.pmid);
            return {
              pmid: p.pmid,
              title: details?.title,
              authors: details?.authors,
              score: p.score,
              linkUrl: `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`,
            };
          })
          .slice(0, input.maxRelatedResults);
      } else {
        logger.warning(
          "ESummary did not return usable data for enrichment.",
          context,
        );
        outputData.relatedArticles = foundPmids
          .slice(0, input.maxRelatedResults)
          .map((p) => ({
            pmid: p.pmid,
            score: p.score,
            linkUrl: `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`,
          }));
      }
    } catch (summaryError: any) {
      logger.error(
        "Failed to enrich related articles with summaries",
        summaryError instanceof Error
          ? summaryError
          : new Error(String(summaryError)),
        context,
      );
      outputData.relatedArticles = foundPmids
        .slice(0, input.maxRelatedResults)
        .map((p) => ({
          pmid: p.pmid,
          score: p.score,
          linkUrl: `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`,
        }));
    }
  }
  outputData.retrievedCount = outputData.relatedArticles.length;
}
