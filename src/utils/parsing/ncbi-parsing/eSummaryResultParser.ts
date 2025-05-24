/**
 * @fileoverview Helper functions for parsing ESummary results from NCBI.
 * Handles different ESummary XML structures and formats the data into
 * consistent ParsedBriefSummary objects.
 * @module src/utils/parsing/ncbi-parsing/eSummaryResultParser
 */

import {
  ESummaryResult,
  ESummaryDocumentSummary,
  ESummaryDocSumOldXml,
  ESummaryItem,
  ESummaryAuthor as XmlESummaryAuthor,
  ParsedBriefSummary,
  ESummaryArticleId,
} from "../../../types-global/pubmedXml.js";
import {
  dateParser,
  logger,
  RequestContext,
  requestContextService,
} from "../../../utils/index.js"; // Note: utils/index.js is the barrel file
import { ensureArray, getText, getAttribute } from "./xmlGenericHelpers.js";

/**
 * Formats an array of ESummary authors into a string.
 * Limits to the first 3 authors and adds "et al." if more exist.
 * @param authors - Array of ESummary author objects.
 * @returns A string like "Doe J, Smith A, Brown B, et al." or empty if no authors.
 */
export function formatESummaryAuthors(authors?: XmlESummaryAuthor[]): string {
  if (!authors || authors.length === 0) return "";
  return (
    authors
      .slice(0, 3)
      .map((author) => author.name) // Assumes author.name is the string representation
      .join(", ") + (authors.length > 3 ? ", et al." : "")
  );
}

/**
 * Standardizes date strings from ESummary to "YYYY-MM-DD" format.
 * Uses the dateParser utility.
 * @param dateStr - Date string from ESummary (e.g., "2023/01/15", "2023 Jan 15", "2023").
 * @param parentContext - Optional parent request context for logging.
 * @returns A promise resolving to a standardized date string ("YYYY-MM-DD") or undefined if parsing fails.
 */
export async function standardizeESummaryDate(
  dateStr?: string,
  parentContext?: RequestContext,
): Promise<string | undefined> {
  if (!dateStr) return undefined;
  const currentContext =
    parentContext ||
    requestContextService.createRequestContext({
      operation: "standardizeESummaryDateInternal",
      inputDate: dateStr,
    });
  try {
    const parsedDate = await dateParser.parseDate(dateStr, currentContext);
    if (parsedDate) {
      return parsedDate.toISOString().split("T")[0]; // Format as YYYY-MM-DD
    }
    logger.debug(
      `standardizeESummaryDate: dateParser could not parse "${dateStr}", returning original.`,
      currentContext,
    );
  } catch (e) {
    logger.warning(
      `standardizeESummaryDate: Error during dateParser.parseDate for "${dateStr}", returning original.`,
      {
        ...currentContext,
        error: e instanceof Error ? e.message : String(e),
      },
    );
  }
  return dateStr; // Return original string if parsing fails
}

/**
 * Parses authors from an ESummary DocumentSummary structure.
 * Handles various ways authors might be represented.
 * Internal helper function.
 */
function parseESummaryAuthorsFromDocumentSummary(
  docSummary: ESummaryDocumentSummary,
): XmlESummaryAuthor[] {
  const authorsProp = docSummary.Authors;
  if (!authorsProp) return [];

  if (Array.isArray(authorsProp)) {
    return authorsProp.map((auth) =>
      typeof auth === "string" ? { name: auth } : (auth as XmlESummaryAuthor),
    );
  }

  if (
    typeof authorsProp === "object" &&
    "Author" in authorsProp &&
    authorsProp.Author
  ) {
    return ensureArray(
      authorsProp.Author as XmlESummaryAuthor | XmlESummaryAuthor[],
    );
  }

  if (typeof authorsProp === "string") {
    try {
      if (authorsProp.startsWith("[") && authorsProp.endsWith("]")) {
        const parsed = JSON.parse(authorsProp);
        if (Array.isArray(parsed)) {
          return parsed.map((authName: any) =>
            typeof authName === "string"
              ? { name: authName }
              : (authName as XmlESummaryAuthor),
          );
        }
      }
    } catch (e) {
      logger.debug(
        `Failed to parse Authors string as JSON: ${authorsProp}`,
        requestContextService.createRequestContext({
          operation: "parseESummaryAuthors",
          input: authorsProp,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
    return authorsProp
      .split(/[,;]/)
      .map((name: string) => ({ name: name.trim() }))
      .filter((author) => author.name);
  }
  return [];
}

/**
 * Parses a single ESummary DocumentSummary (newer XML format) into a raw summary object.
 * Internal helper function.
 */
function parseSingleDocumentSummary(docSummary: ESummaryDocumentSummary): Omit<
  ParsedBriefSummary,
  "pubDate" | "epubDate"
> & {
  rawPubDate?: string;
  rawEPubDate?: string;
} {
  const pmid = docSummary["@_uid"];
  const authorsArray = parseESummaryAuthorsFromDocumentSummary(docSummary);

  let doiValue: string | undefined = docSummary.DOI;
  if (!doiValue) {
    const articleIdsProp = docSummary.ArticleIds;
    if (articleIdsProp) {
      const idsArray = Array.isArray(articleIdsProp)
        ? articleIdsProp
        : ensureArray(
            (
              articleIdsProp as {
                ArticleId: ESummaryArticleId[] | ESummaryArticleId;
              }
            ).ArticleId,
          );

      const doiEntry = idsArray.find(
        (id) => (id as ESummaryArticleId).idtype === "doi",
      );
      if (doiEntry) {
        doiValue = (doiEntry as ESummaryArticleId).value;
      }
    }
  }

  return {
    pmid: String(pmid),
    title: docSummary.Title || undefined,
    authors: formatESummaryAuthors(authorsArray),
    source:
      docSummary.Source ||
      docSummary.FullJournalName ||
      docSummary.SO ||
      undefined,
    doi: doiValue,
    rawPubDate: docSummary.PubDate || undefined,
    rawEPubDate: docSummary.EPubDate || undefined,
  };
}

/**
 * Parses a single ESummary DocSum (older XML item-based format) into a raw summary object.
 * Internal helper function.
 */
function parseSingleDocSumOldXml(docSum: ESummaryDocSumOldXml): Omit<
  ParsedBriefSummary,
  "pubDate" | "epubDate"
> & {
  rawPubDate?: string;
  rawEPubDate?: string;
} {
  const pmid = docSum.Id;
  const items = ensureArray(docSum.Item);

  const getItemValue = (
    name: string | string[],
    type?: ESummaryItem["_Type"],
  ): string | undefined => {
    const namesToTry = ensureArray(name);
    for (const n of namesToTry) {
      const item = items.find(
        (i) =>
          i._Name === n &&
          (type ? i._Type === type : true) &&
          i._Type !== "ERROR",
      );
      if (item) {
        if (item["#text"] !== undefined) return String(item["#text"]);
        // fast-xml-parser might parse simple elements directly to string/number
        if (typeof item === "string" || typeof item === "number")
          return String(item);
      }
    }
    return undefined;
  };

  const getAuthorList = (): XmlESummaryAuthor[] => {
    const authorListItem = items.find(
      (i) => i._Name === "AuthorList" && i._Type === "List",
    );
    if (authorListItem && authorListItem.Item) {
      return ensureArray(authorListItem.Item)
        .filter((a) => a._Name === "Author" && a._Type === "String")
        .map((a) => ({ name: getText(a, "") }));
    }
    return items
      .filter((i) => i._Name === "Author" && i._Type === "String")
      .map((a) => ({ name: getText(a, "") }));
  };

  const authorsArray = getAuthorList();

  let doiFromItems: string | undefined = getItemValue("DOI", "String");
  if (!doiFromItems) {
    const articleIdsItem = items.find(
      (i) => i._Name === "ArticleIds" && i._Type === "List",
    );
    if (articleIdsItem && articleIdsItem.Item) {
      const ids = ensureArray(articleIdsItem.Item);
      const doiIdItem = ids.find(
        (id) =>
          getAttribute(id as ESummaryItem, "idtype") === "doi" ||
          (id as ESummaryItem)._Name === "doi",
      );
      if (doiIdItem) {
        doiFromItems = getText(doiIdItem);
      }
    }
  }

  return {
    pmid: String(pmid),
    title: getItemValue("Title", "String"),
    authors: formatESummaryAuthors(authorsArray),
    source: getItemValue(["Source", "FullJournalName", "SO"], "String"),
    doi: doiFromItems,
    rawPubDate: getItemValue(["PubDate", "ArticleDate"], "Date"),
    rawEPubDate: getItemValue("EPubDate", "Date"),
  };
}

/**
 * Extracts and formats brief summaries from ESummary XML result.
 * Handles both DocumentSummarySet (newer) and older DocSum structures.
 * Asynchronously standardizes dates.
 * @param eSummaryResult - The parsed XML object from ESummary (eSummaryResult part).
 * @param context - Request context for logging and passing to date standardization.
 * @returns A promise resolving to an array of parsed brief summary objects.
 */
export async function extractBriefSummaries(
  eSummaryResult?: ESummaryResult,
  context?: RequestContext,
): Promise<ParsedBriefSummary[]> {
  if (!eSummaryResult) return [];
  const opContext =
    context ||
    requestContextService.createRequestContext({
      operation: "extractBriefSummariesInternal",
    });

  if (eSummaryResult.ERROR) {
    logger.warning("ESummary result contains an error", {
      ...opContext,
      errorDetails: eSummaryResult.ERROR,
    });
    return [];
  }

  let rawSummaries: (Omit<ParsedBriefSummary, "pubDate" | "epubDate"> & {
    rawPubDate?: string;
    rawEPubDate?: string;
  })[] = [];

  if (eSummaryResult.DocumentSummarySet?.DocumentSummary) {
    const docSummaries = ensureArray(
      eSummaryResult.DocumentSummarySet.DocumentSummary,
    );
    rawSummaries = docSummaries
      .map(parseSingleDocumentSummary)
      .filter((s) => s.pmid);
  } else if (eSummaryResult.DocSum) {
    const docSums = ensureArray(eSummaryResult.DocSum);
    rawSummaries = docSums.map(parseSingleDocSumOldXml).filter((s) => s.pmid);
  }

  const processedSummaries: ParsedBriefSummary[] = [];
  for (const rawSummary of rawSummaries) {
    const pubDate = await standardizeESummaryDate(
      rawSummary.rawPubDate,
      opContext,
    );
    const epubDate = await standardizeESummaryDate(
      rawSummary.rawEPubDate,
      opContext,
    );
    processedSummaries.push({
      pmid: rawSummary.pmid,
      title: rawSummary.title,
      authors: rawSummary.authors,
      source: rawSummary.source,
      doi: rawSummary.doi,
      pubDate,
      epubDate,
    });
  }

  return processedSummaries;
}
