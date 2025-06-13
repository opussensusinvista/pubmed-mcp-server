/**
 * @fileoverview Handles citation formatting for the getPubMedArticleConnections tool.
 * Fetches article details using EFetch and formats them into various citation styles.
 * @module src/mcp-server/tools/getPubMedArticleConnections/logic/citationFormatter
 */

import { getNcbiService } from "../../../../services/NCBI/ncbiService.js";
import type { XmlPubmedArticle } from "../../../../types-global/pubmedXml.js";
import {
  logger,
  RequestContext,
  requestContextService,
} from "../../../../utils/index.js";
import {
  extractAuthors,
  extractDoi,
  extractJournalInfo,
  extractPmid,
  getText,
} from "../../../../utils/parsing/ncbi-parsing/index.js";
import type { GetPubMedArticleConnectionsInput } from "../registration.js";
import type { ToolOutputData } from "./types.js";

// Main handler for citation formats
export async function handleCitationFormats(
  input: GetPubMedArticleConnectionsInput,
  outputData: ToolOutputData,
  context: RequestContext,
): Promise<void> {
  const eFetchParams: {
    db: string;
    id: string;
    retmode: "xml";
    rettype?: string;
  } = {
    db: "pubmed",
    id: input.sourcePmid,
    retmode: "xml",
    // Omitting rettype to hopefully get the fullest XML record by default
  };

  const eFetchBaseUrl =
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
  const searchParamsString = new URLSearchParams(
    eFetchParams as Record<string, string>, // Cast to Record<string, string> for URLSearchParams
  ).toString();
  outputData.eUtilityUrl = `${eFetchBaseUrl}?${searchParamsString}`;

  const ncbiService = getNcbiService();
  const eFetchResult: any = await ncbiService.eFetch(eFetchParams, context);

  if (!eFetchResult?.PubmedArticleSet?.PubmedArticle?.[0]) {
    outputData.message =
      "Could not retrieve article details for citation formatting.";
    logger.warning(outputData.message, context);
    return;
  }

  const article: XmlPubmedArticle =
    eFetchResult.PubmedArticleSet.PubmedArticle[0];

  if (input.citationStyles?.includes("ris")) {
    outputData.citations.ris = formatAsRIS(article, context);
  }
  if (input.citationStyles?.includes("bibtex")) {
    outputData.citations.bibtex = formatAsBibTeX(article, context);
  }
  if (input.citationStyles?.includes("apa_string")) {
    outputData.citations.apa_string = formatAsAPA(article, context);
  }
  if (input.citationStyles?.includes("mla_string")) {
    outputData.citations.mla_string = formatAsMLA(article, context);
  }
  outputData.retrievedCount = 1;
}

// --- Citation Formatting Helper Functions ---

function formatAsRIS(
  article: XmlPubmedArticle,
  context: RequestContext,
): string {
  const medlineCitation = article.MedlineCitation;
  const articleDetails = medlineCitation?.Article;
  const pmid = extractPmid(medlineCitation);

  logger.debug(
    "Formatting RIS for article",
    requestContextService.createRequestContext({ ...context, pmid }),
  );

  if (!articleDetails)
    return "TY  - ERROR\nTI  - Article details not found\nER  - \n";

  const authors = extractAuthors(articleDetails.AuthorList);
  const journalInfo = extractJournalInfo(
    articleDetails.Journal,
    medlineCitation,
  );
  const title = getText(articleDetails.ArticleTitle);
  const doi = extractDoi(articleDetails);

  let risString = "TY  - JOUR\n";
  authors.forEach((author) => {
    if (author.lastName && author.firstName) {
      risString += `AU  - ${author.lastName}, ${author.firstName}\n`;
    } else if (author.lastName) {
      // Handle collective name or incomplete author
      risString += `AU  - ${author.lastName}\n`;
    }
  });

  risString += `TI  - ${title || "N/A"}\n`;
  risString += `JO  - ${journalInfo?.title || "N/A"}\n`;
  risString += `VL  - ${journalInfo?.volume || ""}\n`;
  risString += `IS  - ${journalInfo?.issue || ""}\n`;

  if (journalInfo?.pages) {
    const pages = journalInfo.pages.split("-");
    risString += `SP  - ${pages[0] || ""}\n`;
    if (pages.length > 1) risString += `EP  - ${pages[1] || ""}\n`;
  }
  risString += `PY  - ${journalInfo?.publicationDate?.year || ""}\n`;
  if (doi) risString += `DO  - ${doi}\n`;
  if (pmid) risString += `UR  - https://pubmed.ncbi.nlm.nih.gov/${pmid}\n`;
  risString += "ER  - \n";
  return risString;
}

function formatAsBibTeX(
  article: XmlPubmedArticle,
  context: RequestContext,
): string {
  const medlineCitation = article.MedlineCitation;
  const articleDetails = medlineCitation?.Article;
  const pmid = extractPmid(medlineCitation);

  logger.debug(
    "Formatting BibTeX for article",
    requestContextService.createRequestContext({ ...context, pmid }),
  );

  if (!articleDetails)
    return `@article{ERROR_ArticleNotFound${pmid || ""},\n  title = {Article details not found}\n}\n`;

  const parsedAuthors = extractAuthors(articleDetails.AuthorList);
  const journalInfo = extractJournalInfo(
    articleDetails.Journal,
    medlineCitation,
  );
  const title = getText(articleDetails.ArticleTitle) || "N/A";
  const doi = extractDoi(articleDetails);

  const authorsBibtex = parsedAuthors
    .map((author) => {
      if (author.lastName && author.firstName)
        return `${author.lastName}, ${author.firstName}`;
      if (author.lastName) return `{${author.lastName}}`; // For collective names or single names
      return "";
    })
    .filter(Boolean)
    .join(" and ");

  const year = journalInfo?.publicationDate?.year || "ND";
  const firstAuthorLastName =
    parsedAuthors[0]?.lastName?.replace(/\s+/g, "") || "Unknown";
  const bibKey = `${firstAuthorLastName}${year}`;

  let bibtexString = `@article{${bibKey},\n`;
  if (authorsBibtex) bibtexString += `  author    = {${authorsBibtex}},\n`;
  bibtexString += `  title     = {${title}},\n`;
  bibtexString += `  journal   = {${journalInfo?.title || "N/A"}},\n`;
  if (journalInfo?.publicationDate?.year)
    bibtexString += `  year      = {${journalInfo.publicationDate.year}},\n`;
  if (journalInfo?.volume)
    bibtexString += `  volume    = {${journalInfo.volume}},\n`;
  if (journalInfo?.issue)
    bibtexString += `  number    = {${journalInfo.issue}},\n`;
  if (journalInfo?.pages)
    bibtexString += `  pages     = {${journalInfo.pages.replace("-", "--")}},\n`;
  if (journalInfo?.publicationDate?.month)
    bibtexString += `  month     = {${journalInfo.publicationDate.month.toLowerCase()}},\n`;
  if (doi) bibtexString += `  doi       = {${doi}},\n`;
  if (pmid) bibtexString += `  pmid      = {${pmid}}\n`;
  bibtexString += `}\n`;

  return bibtexString;
}

function formatAsAPA(
  article: XmlPubmedArticle,
  context: RequestContext,
): string {
  const medlineCitation = article.MedlineCitation;
  const articleDetails = medlineCitation?.Article;
  const pmid = extractPmid(medlineCitation);

  logger.debug(
    "Formatting APA for article",
    requestContextService.createRequestContext({ ...context, pmid }),
  );

  if (!articleDetails) return "Article details not found.";

  const parsedAuthors = extractAuthors(articleDetails.AuthorList);
  const journalInfo = extractJournalInfo(
    articleDetails.Journal,
    medlineCitation,
  );
  const titleText = getText(articleDetails.ArticleTitle) || "N/A";
  const doi = extractDoi(articleDetails);

  let authorsString = "N/A";
  if (parsedAuthors.length > 0) {
    if (parsedAuthors.length <= 20) {
      authorsString = parsedAuthors
        .map((author) => {
          if (author.lastName && author.firstName) {
            const initials = author.firstName
              .split(/\s+|-/)
              .map((namePart) => namePart.charAt(0).toUpperCase() + ".")
              .join("");
            return `${author.lastName}, ${initials}`;
          }
          if (author.lastName) return author.lastName; // Collective name
          return "";
        })
        .filter(Boolean)
        .join(", ");
      if (parsedAuthors.length > 1) {
        const lastCommaIndex = authorsString.lastIndexOf(", ");
        if (lastCommaIndex !== -1) {
          authorsString =
            authorsString.substring(0, lastCommaIndex) +
            " & " +
            authorsString.substring(lastCommaIndex + 2);
        }
      }
    } else {
      const first19 = parsedAuthors
        .slice(0, 19)
        .map((author) => {
          if (author.lastName && author.firstName) {
            const initials = author.firstName
              .split(/\s+|-/)
              .map((namePart) => namePart.charAt(0).toUpperCase() + ".")
              .join("");
            return `${author.lastName}, ${initials}`;
          }
          if (author.lastName) return author.lastName;
          return "";
        })
        .filter(Boolean)
        .join(", ");
      const lastAuthor = parsedAuthors[parsedAuthors.length - 1];
      let lastAuthorString = "";
      if (lastAuthor.lastName && lastAuthor.firstName) {
        const initials = lastAuthor.firstName
          .split(/\s+|-/)
          .map((namePart) => namePart.charAt(0).toUpperCase() + ".")
          .join("");
        lastAuthorString = `${lastAuthor.lastName}, ${initials}`;
      } else if (lastAuthor.lastName) {
        lastAuthorString = lastAuthor.lastName;
      }
      authorsString = `${first19}, ..., ${lastAuthorString}`;
    }
  }

  const year = journalInfo?.publicationDate?.year || "n.d.";
  const apaTitle = titleText.charAt(0).toUpperCase() + titleText.slice(1); // APA typically sentence case for article titles.

  const journal = journalInfo?.title ? `<em>${journalInfo.title}</em>` : "N/A";
  const volume = journalInfo?.volume ? `<em>${journalInfo.volume}</em>` : "";
  const issue = journalInfo?.issue ? `(${journalInfo.issue})` : "";
  const pages = journalInfo?.pages || "";
  const doiLink = doi ? ` https://doi.org/${doi}` : "";

  let apaString = `${authorsString}. (${year}). ${apaTitle}. ${journal}`;
  if (volume) apaString += `, ${volume}`;
  if (issue) apaString += issue;
  if (pages) apaString += `, ${pages}`;
  apaString += `.${doiLink}`;

  return apaString;
}

function formatAsMLA(
  article: XmlPubmedArticle,
  context: RequestContext,
): string {
  const medlineCitation = article.MedlineCitation;
  const articleDetails = medlineCitation?.Article;
  const pmid = extractPmid(medlineCitation);

  logger.debug(
    "Formatting MLA for article",
    requestContextService.createRequestContext({ ...context, pmid }),
  );

  if (!articleDetails) return "Article details not found.";

  const parsedAuthors = extractAuthors(articleDetails.AuthorList);
  const journalInfo = extractJournalInfo(
    articleDetails.Journal,
    medlineCitation,
  );
  const titleText = getText(articleDetails.ArticleTitle);
  const doi = extractDoi(articleDetails);

  let authorsString = "N/A";
  if (parsedAuthors.length > 0) {
    if (parsedAuthors.length <= 2) {
      authorsString = parsedAuthors
        .map((author, index) => {
          if (author.lastName && author.firstName) {
            return index === 0
              ? `${author.lastName}, ${author.firstName}`
              : `${author.firstName} ${author.lastName}`;
          }
          if (author.lastName) return author.lastName;
          return "";
        })
        .filter(Boolean)
        .join(" and ");
    } else {
      const firstAuthor = parsedAuthors[0];
      if (firstAuthor.lastName && firstAuthor.firstName) {
        authorsString = `${firstAuthor.lastName}, ${firstAuthor.firstName}, et al`;
      } else if (firstAuthor.lastName) {
        authorsString = `${firstAuthor.lastName}, et al`;
      }
    }
  }

  const title = titleText ? `"${titleText}."` : "N/A.";
  const journal = journalInfo?.title ? `<em>${journalInfo.title}</em>` : "N/A";

  let publicationDateString = journalInfo?.publicationDate?.year || "";
  if (journalInfo?.publicationDate?.month && journalInfo.publicationDate.year) {
    const month = journalInfo.publicationDate.month.substring(0, 3) + "."; // Abbreviate month
    publicationDateString = `${month} ${journalInfo.publicationDate.year}`;
    if (journalInfo.publicationDate.day) {
      publicationDateString = `${journalInfo.publicationDate.day} ${month} ${journalInfo.publicationDate.year}`;
    }
  } else if (journalInfo?.publicationDate?.medlineDate) {
    publicationDateString = journalInfo.publicationDate.medlineDate;
  }

  const volume = journalInfo?.volume ? `vol. ${journalInfo.volume}` : "";
  const issue = journalInfo?.issue ? `no. ${journalInfo.issue}` : "";
  const pages = journalInfo?.pages
    ? `pp. ${journalInfo.pages.replace("-", "–")}`
    : ""; // en-dash for MLA

  const accessUrl = doi
    ? `doi:${doi}`
    : pmid
      ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}`
      : "";

  let mlaString = `${authorsString}. ${title} ${journal}`;
  if (volume) mlaString += `, ${volume}`;
  if (issue) mlaString += `, ${issue}`;
  if (publicationDateString) mlaString += `, ${publicationDateString}`;
  if (pages) mlaString += `, ${pages}`;
  mlaString += `. PubMed Central, ${accessUrl}.`; // Assuming PubMed Central or just PubMed

  return mlaString;
}
