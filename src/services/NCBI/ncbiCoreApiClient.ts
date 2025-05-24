/**
 * @fileoverview Core client for making HTTP requests to NCBI E-utilities.
 * Handles request construction, API key injection, retries, and basic error handling.
 * @module src/services/NCBI/ncbiCoreApiClient
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { config } from "../../config/index.js";
import { BaseErrorCode, McpError } from "../../types-global/errors.js";
import {
  logger,
  RequestContext,
  requestContextService,
  sanitizeInputForLogging,
} from "../../utils/index.js";
import {
  NCBI_EUTILS_BASE_URL,
  NcbiRequestParams,
  NcbiRequestOptions,
} from "./ncbiConstants.js";

export class NcbiCoreApiClient {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      timeout: 30000, // 30 seconds timeout for NCBI requests
    });

    logger.debug(
      "NcbiCoreApiClient initialized",
      requestContextService.createRequestContext({
        service: "NcbiCoreApiClient",
        ncbiBaseUrl: NCBI_EUTILS_BASE_URL,
        maxRetries: config.ncbiMaxRetries,
      }),
    );
  }

  /**
   * Makes an HTTP request to the specified NCBI E-utility endpoint.
   * Handles parameter assembly, API key injection, GET/POST selection, and retries.
   * @param endpoint The E-utility endpoint (e.g., "esearch", "efetch").
   * @param params The parameters for the E-utility.
   * @param context The request context for logging.
   * @param options Options for the request, like retmode and whether to use POST.
   * @param retries The current retry attempt number.
   * @returns A Promise resolving to the raw AxiosResponse.
   * @throws {McpError} If the request fails after all retries or an unexpected error occurs.
   */
  public async makeRequest(
    endpoint: string,
    params: NcbiRequestParams,
    context: RequestContext,
    options: NcbiRequestOptions = {},
    retries = 0,
  ): Promise<AxiosResponse> {
    const rawParams: Record<string, any> = {
      tool: config.ncbiToolIdentifier,
      email: config.ncbiAdminEmail,
      api_key: config.ncbiApiKey,
      ...params,
    };

    // Filter out undefined/null values and convert others to string for URLSearchParams/request body
    const finalParams: Record<string, string> = {};
    for (const key in rawParams) {
      if (Object.prototype.hasOwnProperty.call(rawParams, key)) {
        const value = rawParams[key];
        if (value !== undefined && value !== null) {
          finalParams[key] = String(value);
        }
      }
    }

    const requestConfig: AxiosRequestConfig = {
      method: options.usePost ? "POST" : "GET",
      url: `${NCBI_EUTILS_BASE_URL}/${endpoint}.fcgi`,
    };

    if (options.usePost) {
      requestConfig.data = new URLSearchParams(finalParams).toString();
      requestConfig.headers = {
        "Content-Type": "application/x-www-form-urlencoded",
      };
    } else {
      requestConfig.params = finalParams;
    }

    try {
      logger.debug(
        `Making NCBI HTTP request: ${requestConfig.method} ${requestConfig.url}`,
        requestContextService.createRequestContext({
          ...context,
          operation: "NCBI_HttpRequest",
          endpoint,
          method: requestConfig.method,
          requestParams: sanitizeInputForLogging(finalParams),
          attempt: retries + 1,
        }),
      );
      const response: AxiosResponse = await this.axiosInstance(requestConfig);
      return response;
    } catch (error: any) {
      if (retries < config.ncbiMaxRetries) {
        const retryDelay = Math.pow(2, retries) * 200; // Increased base delay for retries
        logger.warning(
          `NCBI request to ${endpoint} failed. Retrying (${retries + 1}/${config.ncbiMaxRetries}) in ${retryDelay}ms...`,
          requestContextService.createRequestContext({
            ...context,
            operation: "NCBI_HttpRequestRetry",
            endpoint,
            error: error.message,
            retryCount: retries + 1,
            maxRetries: config.ncbiMaxRetries,
            delay: retryDelay,
          }),
        );
        await new Promise((r) => setTimeout(r, retryDelay));
        return this.makeRequest(
          endpoint,
          params,
          context,
          options,
          retries + 1,
        );
      }

      if (axios.isAxiosError(error)) {
        logger.error(
          `Axios error during NCBI request to ${endpoint} after ${retries} retries`,
          error,
          requestContextService.createRequestContext({
            ...context,
            operation: "NCBI_AxiosError",
            endpoint,
            status: error.response?.status,
            responseData: sanitizeInputForLogging(error.response?.data),
          }),
        );
        throw new McpError(
          BaseErrorCode.NCBI_SERVICE_UNAVAILABLE,
          `NCBI request failed: ${error.message}`,
          {
            endpoint,
            status: error.response?.status,
            details: error.response?.data
              ? String(error.response.data).substring(0, 500)
              : undefined,
          },
        );
      }
      // If it's already an McpError, rethrow it (could be from a previous stage if this function is used more broadly)
      if (error instanceof McpError) throw error;

      logger.error(
        `Unexpected error during NCBI request to ${endpoint} after ${retries} retries`,
        error,
        requestContextService.createRequestContext({
          ...context,
          operation: "NCBI_UnexpectedError",
          endpoint,
          errorMessage: error.message,
        }),
      );
      throw new McpError(
        BaseErrorCode.INTERNAL_ERROR,
        `Unexpected error communicating with NCBI: ${error.message}`,
        { endpoint },
      );
    }
  }
}
