/**
 * @fileoverview Service for interacting with NCBI E-utilities.
 * This module centralizes all communication with NCBI's E-utility APIs,
 * handling request construction, API key management, rate limiting,
 * retries, and parsing of XML/JSON responses. It aims to provide a robust
 * and compliant interface for other parts of the pubmed-mcp-server to
 * access PubMed data.
 * @module src/services/ncbiService
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { config } from "../../config/index.js";
import { BaseErrorCode, McpError } from "../../types-global/errors.js";
import {
  logger,
  RequestContext,
  requestContextService,
  sanitizeInputForLogging,
} from "../../utils/index.js";

const NCBI_EUTILS_BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

interface NcbiRequestParams {
  db: string;
  [key: string]: any; // Allow other E-utility specific params
}

interface NcbiRequestOptions {
  retmode?: "xml" | "json" | "text"; // Add other retmodes as needed
  rettype?: string; // Add other rettypes as needed
  usePost?: boolean; // Hint to use POST for large payloads
}

// Simple in-memory queue for rate limiting
interface QueuedRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  task: () => Promise<any>;
  context: RequestContext;
  endpoint: string;
  params: NcbiRequestParams;
}

export class NcbiService {
  private axiosInstance: AxiosInstance;
  private requestQueue: QueuedRequest[] = [];
  private isProcessingQueue = false;
  private lastRequestTime = 0;
  private xmlParser: XMLParser;

  constructor() {
    this.axiosInstance = axios.create({
      timeout: 30000, // 30 seconds timeout for NCBI requests
    });

    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseTagValue: true, // auto-convert numbers, booleans if possible
      isArray: (name, jpath, isLeafNode, isAttribute) => {
        // Common NCBI list tags - expand as needed
        const arrayTags = [
          "IdList.Id",
          "eSearchResult.IdList.Id",
          "PubmedArticleSet.PubmedArticle",
          "PubmedArticleSet.DeleteCitation.PMID",
          "AuthorList.Author",
          "MeshHeadingList.MeshHeading",
          "GrantList.Grant",
          "KeywordList.Keyword",
          "PublicationTypeList.PublicationType",
          "LinkSet.LinkSetDb.Link",
          "Link.Id",
          "DbInfo.FieldList.Field",
          "DbInfo.LinkList.Link",
          "DocSum.Item", // For ESummary v2.0 JSON-like XML
        ];
        return arrayTags.includes(jpath);
      },
    });

    // Initialize logger for NCBI Service context
    logger.debug(
      "NcbiService initialized",
      requestContextService.createRequestContext({
        service: "NcbiService",
        ncbiBaseUrl: NCBI_EUTILS_BASE_URL,
        requestDelay: config.ncbiRequestDelayMs,
        maxRetries: config.ncbiMaxRetries,
      }),
    );
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }
    this.isProcessingQueue = true;

    const requestItem = this.requestQueue.shift();
    if (!requestItem) {
      this.isProcessingQueue = false;
      return;
    }

    const { resolve, reject, task, context, endpoint, params } = requestItem;

    try {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      const delayNeeded = config.ncbiRequestDelayMs - timeSinceLastRequest;

      if (delayNeeded > 0) {
        logger.debug(
          `Delaying NCBI request by ${delayNeeded}ms to respect rate limit.`,
          requestContextService.createRequestContext({ ...context, delayNeeded }),
        );
        await new Promise((r) => setTimeout(r, delayNeeded));
      }

      this.lastRequestTime = Date.now();
      logger.info(
        `Executing NCBI request: ${endpoint}`,
        requestContextService.createRequestContext({
          ...context,
          endpoint,
          params: sanitizeInputForLogging(params),
        }),
      );
      const result = await task();
      resolve(result);
    } catch (error: any) {
      logger.error(
        "Error processing NCBI request from queue",
        error instanceof Error ? error : new Error(String(error)),
        requestContextService.createRequestContext({
          ...context,
          endpoint,
          params: sanitizeInputForLogging(params),
          errorMessage: error?.message,
        }),
      );
      reject(error);
    } finally {
      this.isProcessingQueue = false;
      if (this.requestQueue.length > 0) {
        this.processQueue(); // Process next item
      }
    }
  }

  private enqueueRequest<T>(
    task: () => Promise<T>,
    context: RequestContext,
    endpoint: string,
    params: NcbiRequestParams,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.requestQueue.push({ resolve, reject, task, context, endpoint, params });
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  private async makeRequest<T = any>(
    endpoint: string,
    params: NcbiRequestParams,
    context: RequestContext,
    options: NcbiRequestOptions = {},
    retries = 0,
  ): Promise<T> {
    const commonParams = {
      tool: config.ncbiToolIdentifier,
      email: config.ncbiAdminEmail,
      api_key: config.ncbiApiKey,
      ...params,
    };

    const requestConfig: AxiosRequestConfig = {
      method: options.usePost ? "POST" : "GET",
      url: `${NCBI_EUTILS_BASE_URL}/${endpoint}.fcgi`,
    };

    if (options.usePost) {
      requestConfig.data = new URLSearchParams(commonParams).toString();
      requestConfig.headers = {
        "Content-Type": "application/x-www-form-urlencoded",
      };
    } else {
      requestConfig.params = commonParams;
    }

    try {
      const response: AxiosResponse = await this.axiosInstance(requestConfig);
      const responseData = response.data;

      if (options.retmode === "xml" || typeof responseData === "string") {
        if (XMLValidator.validate(responseData) !== true) {
          logger.error(
            "Invalid XML response from NCBI",
            new Error("Invalid XML structure"),
            requestContextService.createRequestContext({
              ...context,
              endpoint,
              responseSnippet: responseData.substring(0, 500),
            }),
          );
          throw new McpError(
            BaseErrorCode.NCBI_PARSING_ERROR,
            "Received invalid XML from NCBI.",
            { endpoint, responseSnippet: responseData.substring(0, 200) },
          );
        }
        const parsedXml = this.xmlParser.parse(responseData);

        if (parsedXml.eSearchResult?.ErrorList || parsedXml.eLinkResult?.ERROR || parsedXml.eSummaryResult?.ERROR || parsedXml.PubmedArticleSet?.ErrorList || parsedXml.ERROR) {
          const errorMessages = this.extractNcbiErrorMessages(parsedXml);
          logger.error(
            "NCBI API returned an error in XML",
            new Error(errorMessages.join("; ")),
            requestContextService.createRequestContext({
              ...context,
              endpoint,
              errors: errorMessages,
              parsedXml: sanitizeInputForLogging(parsedXml),
            }),
          );
          throw new McpError(
            BaseErrorCode.NCBI_API_ERROR,
            `NCBI API Error: ${errorMessages.join("; ")}`,
            { endpoint, ncbiErrors: errorMessages },
          );
        }
        return parsedXml as T;
      }

      if (options.retmode === 'json' && responseData.error) {
        logger.error(
          "NCBI API returned an error in JSON",
          new Error(String(responseData.error)),
          requestContextService.createRequestContext({
            ...context,
            endpoint,
            error: responseData.error,
            responseData: sanitizeInputForLogging(responseData),
          }),
        );
        throw new McpError(
            BaseErrorCode.NCBI_API_ERROR,
            `NCBI API Error: ${responseData.error}`,
            { endpoint, ncbiError: responseData.error },
          );
      }

      return responseData as T;
    } catch (error: any) {
      if (retries < config.ncbiMaxRetries) {
        const retryDelay = Math.pow(2, retries) * 100;
        logger.warning(
          `NCBI request failed. Retrying (${retries + 1}/${config.ncbiMaxRetries}) in ${retryDelay}ms...`,
          requestContextService.createRequestContext({
            ...context,
            endpoint,
            error: error.message,
            retryCount: retries + 1,
          }),
        );
        await new Promise((r) => setTimeout(r, retryDelay));
        return this.makeRequest(endpoint, params, context, options, retries + 1);
      }

      if (axios.isAxiosError(error)) {
        logger.error(
          "Axios error during NCBI request",
          error,
          requestContextService.createRequestContext({
            ...context,
            endpoint,
            status: error.response?.status,
            data: sanitizeInputForLogging(error.response?.data),
          }),
        );
        throw new McpError(
          BaseErrorCode.NCBI_SERVICE_UNAVAILABLE,
          `NCBI request failed: ${error.message}`,
          {
            endpoint,
            status: error.response?.status,
            details: error.response?.data,
          },
        );
      }
      if (error instanceof McpError) throw error;

      logger.error(
        "Unexpected error during NCBI request",
        error,
        requestContextService.createRequestContext({ ...context, endpoint, errorMessage: error.message }),
      );
      throw new McpError(
        BaseErrorCode.INTERNAL_ERROR,
        `Unexpected error communicating with NCBI: ${error.message}`,
        { endpoint },
      );
    }
  }

  private extractNcbiErrorMessages(parsedXml: any): string[] {
    const messages: string[] = [];
    const errorSources = [
      parsedXml.eSearchResult?.ErrorList?.PhraseNotFound,
      parsedXml.eSearchResult?.ErrorList?.FieldNotFound,
      parsedXml.eLinkResult?.ERROR,
      parsedXml.eSummaryResult?.ERROR,
      parsedXml.PubmedArticleSet?.ErrorList?.CannotRetrievePMID,
      parsedXml.ERROR
    ].flat().filter(Boolean);

    for (const errorSource of errorSources) {
        if (typeof errorSource === 'string') {
            messages.push(errorSource);
        } else if (typeof errorSource === 'object' && errorSource !== null) {
            if (Array.isArray(errorSource)) {
                errorSource.forEach(errItem => {
                    if (errItem && typeof errItem['#text'] === 'string') {
                        messages.push(errItem['#text']);
                    } else if (typeof errItem === 'string') {
                        messages.push(errItem);
                    }
                });
            } else if (typeof errorSource['#text'] === 'string') {
                messages.push(errorSource['#text']);
            }
        }
    }
    if (messages.length === 0 && parsedXml.eSearchResult?.WarningList) {
        const warningSources = [
            parsedXml.eSearchResult?.WarningList?.QuotedPhraseNotFound,
            parsedXml.eSearchResult?.WarningList?.OutputMessage
        ].flat().filter(Boolean);
        for (const warningSource of warningSources) {
            if (typeof warningSource === 'string') {
                messages.push(`Warning: ${warningSource}`);
            } else if (Array.isArray(warningSource)) {
                warningSource.forEach(warnItem => {
                    if (typeof warnItem === 'string') messages.push(`Warning: ${warnItem}`);
                });
            }
        }
    }
    return messages.length > 0 ? messages : ["Unknown NCBI API error structure."];
  }

  public async eSearch(
    params: NcbiRequestParams,
    context: RequestContext,
  ): Promise<any> {
    return this.enqueueRequest(
      () => this.makeRequest("esearch", params, context, { retmode: "xml" }),
      context,
      "esearch",
      params,
    );
  }

  public async eSummary(
    params: NcbiRequestParams,
    context: RequestContext,
  ): Promise<any> {
    const retmode = params.version === "2.0" && params.retmode === "json" ? "json" : "xml";
    return this.enqueueRequest(
      () => this.makeRequest("esummary", params, context, { retmode }),
      context,
      "esummary",
      params,
    );
  }

  public async eFetch(
    params: NcbiRequestParams,
    context: RequestContext,
    options: NcbiRequestOptions = { retmode: "xml" },
  ): Promise<any> {
    const usePost = typeof params.id === 'string' && params.id.split(',').length > 200;
    const fetchOptions = { ...options, usePost };

    return this.enqueueRequest(
      () => this.makeRequest("efetch", params, context, fetchOptions),
      context,
      "efetch",
      params,
    );
  }

  public async eLink(
    params: NcbiRequestParams,
    context: RequestContext,
  ): Promise<any> {
    return this.enqueueRequest(
      () => this.makeRequest("elink", params, context, { retmode: "xml" }),
      context,
      "elink",
      params,
    );
  }

  public async eInfo(
    params: NcbiRequestParams,
    context: RequestContext,
  ): Promise<any> {
    return this.enqueueRequest(
      () => this.makeRequest("einfo", params, context, { retmode: "xml" }),
      context,
      "einfo",
      params,
    );
  }
}

export const ncbiService = new NcbiService();
