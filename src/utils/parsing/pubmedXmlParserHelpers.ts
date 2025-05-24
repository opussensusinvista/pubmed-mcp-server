/**
 * @fileoverview Helper functions for parsing PubMed XML data.
 * These utilities assist in safely extracting data from the complex XML
 * structures returned by NCBI E-utilities, particularly EFetch and ESummary.
 * @module src/utils/parsing/pubmedXmlParserHelpers
 */

import {
  XmlAbstractText,
  XmlArticle,
  XmlArticleDate,
  // XmlArticleId, // Not directly used here, but available from pubmedXml.js
  XmlAuthor,
  XmlAuthorList,
  // XmlELocationID, // Not directly used here
  XmlGrant,
  XmlGrantList,
  XmlJournal,
  XmlKeyword,
  XmlKeywordList,
  XmlMedlineCitation,
  XmlMeshHeading,
  XmlMeshHeadingList,
  // XmlPMID, // Not directly used here
  XmlPublicationType,
  XmlPublicationTypeList,
  ParsedArticleAuthor,
  ParsedJournalInfo,
  ParsedMeshTerm,
  ParsedGrant,
  ParsedArticleDate,
  ESummaryResult,
  ESummaryDocumentSummary,
  ESummaryDocSumOldXml,
  ESummaryItem,
  ESummaryAuthor as XmlESummaryAuthor,
  ParsedBriefSummary,
  ESummaryArticleId,
} from "../../types-global/pubmedXml.js";
import {
  dateParser,
  logger,
  RequestContext,
  requestContextService,
} from "../../utils/index.js"; // Added requestContextService

/**
 * Ensures that the input is an array. If it's not an array, it wraps it in one.
 * Handles undefined or null by returning an empty array.
 * @param item - The item to ensure is an array.
 * @returns An array containing the item, or an empty array if item is null/undefined.
 */
export function ensureArray<T>(item: T | T[] | undefined | null): T[] {
  if (item === undefined || item === null) {
    return [];
  }
  return Array.isArray(item) ? item : [item];
}

/**
 * Safely extracts text content from an XML element, which might be a string or an object with a "#text" property.
 * @param element - The XML element (string, object with #text, or undefined).
 * @param defaultValue - The value to return if text cannot be extracted.
 * @returns The text content or the default value.
 */
export function getText(element: any, defaultValue = ""): string {
  if (typeof element === "string") {
    return element;
  }
  if (element && element["#text"] !== undefined) {
    // Check if #text exists and convert to string if it's a number or boolean
    if (typeof element["#text"] === "string") {
      return element["#text"];
    }
    if (
      typeof element["#text"] === "number" ||
      typeof element["#text"] === "boolean"
    ) {
      return String(element["#text"]);
    }
  }
  return defaultValue;
}

/**
 * Safely extracts an attribute value from an XML element.
 * @param element - The XML element object.
 * @param attributeName - The name of the attribute (e.g., "_UI", "_MajorTopicYN").
 * @param defaultValue - The value to return if the attribute is not found.
 * @returns The attribute value or the default value.
 */
export function getAttribute(
  element: any,
  attributeName: string,
  defaultValue = "",
): string {
  if (element && typeof element[attributeName] === "string") {
    return element[attributeName];
  }
  return defaultValue;
}

/**
 * Extracts and formats author information from XML.
 * @param authorListXml - The XML AuthorList element.
 * @returns An array of formatted author objects.
 */
export function extractAuthors(
  authorListXml?: XmlAuthorList,
): ParsedArticleAuthor[] {
  if (!authorListXml) return [];
  const authors = ensureArray(authorListXml.Author);
  return authors.map((auth: XmlAuthor) => {
    let affiliation = "";
    const affiliations = ensureArray(auth.AffiliationInfo);
    if (affiliations.length > 0) {
      affiliation = getText(affiliations[0]?.Affiliation);
    }
    return {
      lastName: getText(auth.LastName),
      firstName: getText(auth.ForeName), // XML uses ForeName
      initials: getText(auth.Initials),
      affiliation: affiliation || undefined, // Ensure undefined if empty
    };
  });
}

/**
 * Extracts and formats journal information from XML.
 * @param journalXml - The XML Journal element from an Article.
 * @param medlineCitationXml - The XML MedlineCitation element (for MedlinePgn).
 * @returns Formatted journal information.
 */
export function extractJournalInfo(
  journalXml?: XmlJournal,
  medlineCitationXml?: XmlMedlineCitation,
): ParsedJournalInfo | undefined {
  if (!journalXml) return undefined;

  const pubDate = journalXml.JournalIssue?.PubDate;
  const year = getText(
    pubDate?.Year,
    getText(pubDate?.MedlineDate, "").match(/\d{4}/)?.[0],
  );

  return {
    title: getText(journalXml.Title),
    isoAbbreviation: getText(journalXml.ISOAbbreviation),
    volume: getText(journalXml.JournalIssue?.Volume),
    issue: getText(journalXml.JournalIssue?.Issue),
    pages:
      getText(medlineCitationXml?.MedlinePgn) ||
      getText(medlineCitationXml?.Article?.Pagination?.MedlinePgn),
    publicationDate: {
      year: year || undefined,
      month: getText(pubDate?.Month) || undefined,
      day: getText(pubDate?.Day) || undefined,
      medlineDate: getText(pubDate?.MedlineDate) || undefined,
    },
  };
}

/**
 * Extracts and formats MeSH terms from XML.
 * @param meshHeadingListXml - The XML MeshHeadingList element.
 * @returns An array of formatted MeSH term objects.
 */
export function extractMeshTerms(
  meshHeadingListXml?: XmlMeshHeadingList,
): ParsedMeshTerm[] {
  if (!meshHeadingListXml) return [];
  const meshHeadings = ensureArray(meshHeadingListXml.MeshHeading);
  return meshHeadings.map((mh: XmlMeshHeading) => {
    const qualifiers = ensureArray(mh.QualifierName);
    const firstQualifier = qualifiers[0];

    const isMajorDescriptor =
      getAttribute(mh.DescriptorName, "_MajorTopicYN") === "Y";
    const isMajorQualifier =
      getAttribute(firstQualifier, "_MajorTopicYN") === "Y";
    const isMajorRoot = getAttribute(mh, "_MajorTopicYN") === "Y";

    return {
      descriptorName: getText(mh.DescriptorName),
      descriptorUi: getAttribute(mh.DescriptorName, "_UI"),
      qualifierName: firstQualifier ? getText(firstQualifier) : undefined,
      qualifierUi: firstQualifier
        ? getAttribute(firstQualifier, "_UI")
        : undefined,
      isMajorTopic: isMajorRoot || isMajorDescriptor || isMajorQualifier,
    };
  });
}

/**
 * Extracts and formats grant information from XML.
 * @param grantListXml - The XML GrantList element.
 * @returns An array of formatted grant objects.
 */
export function extractGrants(grantListXml?: XmlGrantList): ParsedGrant[] {
  if (!grantListXml) return [];
  const grants = ensureArray(grantListXml.Grant);
  return grants.map((g: XmlGrant) => ({
    grantId: getText(g.GrantID) || undefined,
    agency: getText(g.Agency) || undefined,
    country: getText(g.Country) || undefined,
  }));
}

/**
 * Extracts DOI from various possible locations in the XML.
 * @param articleXml - The XML Article element.
 * @returns The DOI string or undefined.
 */
export function extractDoi(articleXml?: XmlArticle): string | undefined {
  if (!articleXml) return undefined;

  const eLocationIDs = ensureArray(articleXml.ELocationID);
  for (const eloc of eLocationIDs) {
    if (
      getAttribute(eloc, "_EIdType") === "doi" &&
      getAttribute(eloc, "_ValidYN") === "Y"
    ) {
      const doi = getText(eloc);
      if (doi) return doi;
    }
  }
  for (const eloc of eLocationIDs) {
    if (getAttribute(eloc, "_EIdType") === "doi") {
      const doi = getText(eloc);
      if (doi) return doi;
    }
  }

  const articleIds = ensureArray(articleXml.ArticleIdList?.ArticleId);
  for (const aid of articleIds) {
    if (getAttribute(aid, "_IdType") === "doi") {
      const doi = getText(aid);
      if (doi) return doi;
    }
  }
  return undefined;
}

/**
 * Extracts publication types from XML.
 * @param publicationTypeListXml - The XML PublicationTypeList element.
 * @returns An array of publication type strings.
 */
export function extractPublicationTypes(
  publicationTypeListXml?: XmlPublicationTypeList,
): string[] {
  if (!publicationTypeListXml) return [];
  const pubTypes = ensureArray(publicationTypeListXml.PublicationType);
  return pubTypes.map((pt: XmlPublicationType) => getText(pt)).filter(Boolean);
}

/**
 * Extracts keywords from XML.
 * @param keywordListsXml - The XML KeywordList element or an array of them.
 * @returns An array of keyword strings.
 */
export function extractKeywords(
  keywordListsXml?: XmlKeywordList[] | XmlKeywordList,
): string[] {
  if (!keywordListsXml) return [];
  const lists = ensureArray(keywordListsXml);
  const allKeywords: string[] = [];
  for (const list of lists) {
    const keywords = ensureArray(list.Keyword);
    keywords.forEach((kw: XmlKeyword) => {
      const keywordText = getText(kw);
      if (keywordText) {
        allKeywords.push(keywordText);
      }
    });
  }
  return allKeywords;
}

/**
 * Extracts abstract text from XML. Handles structured abstracts.
 * @param abstractXml - The XML Abstract element.
 * @returns The abstract text string, or undefined.
 */
export function extractAbstractText(
  abstractXml?: XmlArticle["Abstract"],
): string | undefined {
  if (!abstractXml || !abstractXml.AbstractText) return undefined;
  const abstractTexts = ensureArray(abstractXml.AbstractText);
  if (abstractTexts.length === 0) return undefined;

  return (
    abstractTexts
      .map((at: XmlAbstractText) => {
        let sectionText = getText(at);
        const label = getAttribute(at, "Label");
        if (label && sectionText) {
          return `${label}: ${sectionText}`;
        }
        return sectionText;
      })
      .join("\n")
      .trim() || undefined
  );
}

/**
 * Extracts PMID from MedlineCitation.
 * @param medlineCitationXml - The XML MedlineCitation element.
 * @returns The PMID string or undefined.
 */
export function extractPmid(
  medlineCitationXml?: XmlMedlineCitation,
): string | undefined {
  if (!medlineCitationXml || !medlineCitationXml.PMID) return undefined;
  return getText(medlineCitationXml.PMID);
}

/**
 * Extracts article dates from XML.
 * @param articleXml - The XML Article element.
 * @returns An array of parsed article dates.
 */
export function extractArticleDates(
  articleXml?: XmlArticle,
): ParsedArticleDate[] {
  if (!articleXml || !articleXml.ArticleDate) return [];
  const articleDatesXml = ensureArray(articleXml.ArticleDate);
  return articleDatesXml.map((ad: XmlArticleDate) => ({
    dateType: getAttribute(ad, "_DateType"),
    year: getText(ad.Year),
    month: getText(ad.Month),
    day: getText(ad.Day),
  }));
}

// --- ESummary Specific Parsers ---

/**
 * Formats an array of ESummary authors into a string.
 * @param authors - Array of ESummary author objects.
 * @returns A string like "Doe J, Smith A, Brown B, et al." or empty if no authors.
 */
export function formatESummaryAuthors(authors?: XmlESummaryAuthor[]): string {
  if (!authors || authors.length === 0) return "";
  return (
    authors
      .slice(0, 3)
      .map((author) => author.name)
      .join(", ") + (authors.length > 3 ? ", et al." : "")
  );
}

/**
 * Standardizes date strings from ESummary to "YYYY-MM-DD" format.
 * @param dateStr - Date string from ESummary.
 * @param parentContext - Optional parent request context for logging.
 * @returns A promise resolving to a standardized date string or undefined.
 */
export async function standardizeESummaryDate(
  dateStr?: string,
  parentContext?: RequestContext,
): Promise<string | undefined> {
  if (!dateStr) return undefined;
  // Ensure a context is always passed to dateParser.parseDate
  const currentContext =
    parentContext ||
    requestContextService.createRequestContext({
      operation: "standardizeESummaryDateInternal",
    });
  try {
    const parsedDate = await dateParser.parseDate(dateStr, currentContext);
    if (parsedDate) {
      return parsedDate.toISOString().split("T")[0];
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
  return dateStr;
}

function parseESummaryAuthorsFromDocumentSummary(
  docSummary: ESummaryDocumentSummary,
): XmlESummaryAuthor[] {
  const authorsProp = docSummary.Authors;
  if (!authorsProp) return [];

  if (Array.isArray(authorsProp)) {
    // Assuming elements are XmlESummaryAuthor or can be cast
    return authorsProp.map((auth) =>
      typeof auth === "string" ? { name: auth } : (auth as XmlESummaryAuthor),
    );
  }

  if (
    typeof authorsProp === "object" &&
    "Author" in authorsProp &&
    authorsProp.Author
  ) {
    // Type guard for authorsProp.Author
    return ensureArray(
      authorsProp.Author as XmlESummaryAuthor | XmlESummaryAuthor[],
    );
  }

  if (typeof authorsProp === "string") {
    try {
      // Heuristic for JSON string array
      if (authorsProp.startsWith("[") && authorsProp.endsWith("]")) {
        const parsed = JSON.parse(authorsProp);
        if (Array.isArray(parsed)) {
          return parsed.map((auth: any) =>
            typeof auth === "string"
              ? { name: auth }
              : (auth as XmlESummaryAuthor),
          );
        }
      }
    } catch (e) {
      /* Ignore parsing error, fallback to simple split */
    }
    // Fallback for simple string, potentially comma or semicolon separated
    return authorsProp
      .split(/[,;]/)
      .map((name: string) => ({ name: name.trim() }));
  }
  return [];
}

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
      if (item && item["#text"] !== undefined) return item["#text"];
      if (item && (typeof item === "string" || typeof item === "number"))
        return String(item);
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
      // Ensure 'id' is treated as ESummaryItem for attribute access
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
 * Handles both DocumentSummarySet and older DocSum structures.
 * @param eSummaryResult - The parsed XML object from ESummary (eSummaryResult part).
 * @param context - Request context for logging.
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
    // Pass opContext to standardizeESummaryDate
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
