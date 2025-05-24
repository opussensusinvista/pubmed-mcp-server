/**
 * @fileoverview Shared type definitions for the getPubMedArticleConnections tool logic.
 * @module src/mcp-server/tools/getPubMedArticleConnections/logic/types
 */

import type { GetPubMedArticleConnectionsInput } from "../registration.js";

// Helper type for enriched related articles
export interface RelatedArticle {
  pmid: string;
  title?: string;
  authors?: string; // e.g., "Smith J, Doe A"
  score?: number; // From ELink, if available
  linkUrl: string;
}

export interface CitationOutput {
  ris?: string;
  bibtex?: string;
  apa_string?: string;
  mla_string?: string;
}

export interface ToolOutputData {
  sourcePmid: string;
  relationshipType: GetPubMedArticleConnectionsInput["relationshipType"];
  relatedArticles: RelatedArticle[];
  citations: CitationOutput;
  retrievedCount: number;
  eUtilityUrl?: string; // ELink or EFetch URL
  message?: string; // For errors or additional info
}
