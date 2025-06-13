# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2025-06-13

### Added

- **HTTP Transport Layer**:
  - Migrated the HTTP transport from Express to **Hono**, a modern, lightweight, and high-performance web framework. This improves request handling efficiency and reduces dependency overhead.
  - Implemented session management with a garbage collector to automatically clean up stale or abandoned sessions, improving server stability and resource management (`src/mcp-server/transports/httpTransport.ts`).
  - Added IP-based rate limiting to the HTTP transport to prevent abuse and ensure fair usage.
- **Authentication & Authorization**:
  - Introduced a new, more robust authentication layer supporting both **JWT** and **OAuth 2.1** (`MCP_AUTH_MODE` environment variable).
  - Implemented `oauthMiddleware.ts` for validating OAuth 2.1 Bearer Tokens against a remote JWKS.
  - Created `authContext.ts` using `AsyncLocalStorage` to securely pass authentication information (like client ID and scopes) through the request lifecycle without prop drilling.
  - Added `authUtils.ts` with a `withRequiredScopes` utility for enforcing fine-grained, scope-based access control within tool and resource handlers.
- **Dockerfile**:
  - Added a multi-stage `Dockerfile` to create a smaller, more secure production image. This includes separate stages for dependency installation, building, and the final runtime, significantly reducing the final image size.
  - The Dockerfile now includes steps to properly handle native dependencies like `canvas`.
  - Example command for testing: `docker build -t pubmed-mcp-server . && docker run --rm -it -p 3010:3010 pubmed-mcp-server`.

### Changed

- **NCBI Service**:
  - Refactored `ncbiService.ts` to use a lazy initialization pattern (`getNcbiService`). This improves startup performance by deferring the creation of the service instance until it's first needed.
- **Server Shutdown Logic**:
  - Improved the graceful shutdown logic in `src/index.ts` to correctly handle the termination of both STDIO and the new Hono-based HTTP server, ensuring all resources are released properly.
- **Dependencies**:
  - Added `hono`, `@hono/node-server`, `jose`, and `@node-oauth/oauth2-server` to support the new transport and authentication layers.
  - Updated various other dependencies to their latest versions.
- **Build**:
  - Bumped project version to `1.1.0` in `package.json`.

### Removed

- **LLM Services**:
  - Removed the entire `src/services/llm-providers/` directory, including the `llmFactory.ts` and `openRouterProvider.ts`. This streamlines the server's focus on its core competency of interacting with PubMed, removing direct LLM integration from this project. This was a relic from the original `mcp-ts-template` and is no longer needed.

## [1.0.16] - 2025-06-04

### Changed

- **Tool `generatePubMedChart`**:
  - Modified the tool to output PNG images by default instead of SVG to improve compatibility with various MCP clients.
  - Updated the `outputFormat` in the Zod schema (`src/mcp-server/tools/generatePubMedChart/logic.ts`) to default to "png" and reflect PNG as the primary supported format.
  - Changed the `mimeType` in the MCP response to "image/png".
  - Updated Vega view initialization to explicitly use `renderer: "canvas"` and call `await view.runAsync()` before `view.toCanvas()` for robust server-side rendering.
- **Dependencies**:
  - Added `canvas` npm package (`^2.11.2` or similar, check `package.json`) as a direct dependency to support server-side PNG generation.
  - Updated various other dependencies (see `package-lock.json` for details).
- **Build**:
  - Bumped project version to `1.0.16` in `package.json` and `README.md`.

## [1.0.15] - 2025-05-30

### Changed

- **Configuration & Documentation**:
  - Updated `README.md`:
    - Removed `NCBI_ADMIN_EMAIL`, `NCBI_REQUEST_DELAY_MS`, and `NCBI_MAX_RETRIES` from the environment variable table.
    - Changed the default value for `NCBI_TOOL_IDENTIFIER` from `@cyanheads/pubmed-mcp-server/<version>` to `@cyanheads/pubmed-mcp-server`.
    - Removed `NCBI_ADMIN_EMAIL` from the example MCP client settings.
  - Updated `mcp.json`:
    - Removed `NCBI_ADMIN_EMAIL` and `NCBI_TOOL_IDENTIFIER` from the default environment variable settings for the server.
  - Updated `smithery.yaml`:
    - Changed the default value for `NCBI_TOOL_IDENTIFIER` to `@cyanheads/pubmed-mcp-server`.
- **Build**:
  - Bumped project version to `1.0.15` in `package.json`.
  - Updated `README.md` version badge to `1.0.15`.

## [1.0.14] - 2025-05-24

### Changed

- **Tool `generatePubMedChart`**:
  - Updated input schema (`src/mcp-server/tools/generatePubMedChart/logic.ts`) with more detailed and descriptive fields for `chartType`, `title`, `width`, `height`, `dataValues`, `outputFormat`, `xField`, `yField`, `xFieldType`, `yFieldType`, `colorField`, `colorFieldType`, `seriesField`, `seriesFieldType`, `sizeField`, and `sizeFieldType`.
  - Enhanced the tool's main description in `src/mcp-server/tools/generatePubMedChart/registration.ts` to better reflect its capabilities and parameters.
- **Examples**:
  - Updated example SVG files (`examples/generate_pubmed_chart_example_bar.svg`, `examples/generate_pubmed_chart_example_line.svg`, `examples/generate_pubmed_chart_example_scatter.svg`) to reflect schema changes and showcase more complex chart configurations.
- **Documentation**:
  - Updated `README.md` version badge to `1.0.14`.
  - Updated `docs/tree.md` generation timestamp.
- **Build**:
  - Bumped project version to `1.0.14` in `package.json`.

## [1.0.13] - 2025-05-24

### Added

- **New Tool**: Implemented `generate_pubmed_chart` tool (`src/mcp-server/tools/generatePubMedChart/`) for generating SVG charts (bar, line, scatter) from input data using `vega-lite` and `vega`.
- **Examples**:
  - Added `examples/fetch_pubmed_content_example.md`.
  - Added `examples/generate_pubmed_chart_example_bar.svg`.
  - Added `examples/generate_pubmed_chart_example_line.svg`.
  - Added `examples/generate_pubmed_chart_example_scatter.svg`.
  - Added `examples/get_pubmed_article_connections_1.md`.
  - Added `examples/get_pubmed_article_connections_2.md`.
  - Added `examples/pubmed_research_agent_example.md` (replaces JSON version).
  - Added `examples/search_pubmed_articles_example.md`.
- **File**: Added `NOTICE` file to the project root.
- **Dependencies**: Added `vega` and `vega-lite` to `package.json`.

### Changed

- **Tool Integration**: Fully integrated the `pubmed_research_agent` tool by registering it in `src/mcp-server/server.ts`.
- **Configuration**:
  - Updated `NCBI_TOOL_IDENTIFIER` format in `.clinerules`, `CLAUDE.md`, and `README.md` to use the scoped package name (e.g., `@cyanheads/pubmed-mcp-server/1.0.13`).
- **Build**:
  - Updated `tsconfig.json` compilerOptions:
    - `module` changed from `ESNext` to `node16`.
    - `moduleResolution` changed from `node` to `node16`.
- **Dependencies**:
  - Updated project version to `1.0.13` in `package.json` and `package-lock.json`.
- **Documentation**:
  - Updated `README.md` to include the new `generate_pubmed_chart` tool, links to tool source code, and links to example files.
  - Updated `docs/tree.md` with new files and updated generation timestamp.
  - Updated `.clinerules` and `CLAUDE.md` to reflect the new tool and updated tree generation timestamp.
- **Services**:
  - Refactored barrel file exports in `src/services/index.ts`, `src/services/llm-providers/index.ts`, and `src/services/llm-providers/openRouter/index.ts` to use `.js` extension for ESM compatibility.

### Removed

- **Examples**: Deleted `examples/research_agent_example.json` (replaced by `pubmed_research_agent_example.md`).

### Fixed

- Applied `npm pkg fix` to resolve npm publishing warnings (this was previously noted for an earlier 1.0.12 attempt but is now part of 1.0.13). This included:
  - Correcting the `bin` path in `package.json`.

## [1.0.11] - 2025-05-24

### Changed

- **Type Definitions (`src/types-global/pubmedXml.ts`)**:
  - Introduced `XmlESummaryAuthorRaw` type to represent author data directly parsed from ESummary XML, accommodating inconsistencies in property names (e.g., `Name`/`name`) and structure.
  - Clarified that `ESummaryAuthor` is the normalized author type for application use.
  - Updated `ESummaryDocumentSummary.Authors` to use `XmlESummaryAuthorRaw[]` (or an object with `XmlESummaryAuthorRaw`, or a string) to better reflect the varied raw input from NCBI.
- **Parsing Logic (`src/utils/parsing/ncbi-parsing/eSummaryResultParser.ts`)**:
  - Significantly refactored `parseESummaryAuthorsFromDocumentSummary` to robustly handle diverse author data structures using `XmlESummaryAuthorRaw`. This includes improved handling of property casing and direct text content.
  - Changed `standardizeESummaryDate` to return `undefined` (instead of the original string) if date parsing fails, enforcing stricter date handling.
  - Updated `parseSingleDocumentSummary` to consistently use the `getText` helper for extracting `DOI`, `Title`, `Source`, `PubDate`, and `EPubDate`, improving resilience to XML variations.
  - Added a check for `_Name === "doi"` in `parseSingleDocSumOldXml` for better compatibility with older ESummary XML formats.
- **Build**: Bumped project version from `1.0.10` to `1.0.11` in `package.json` and `README.md`.
- **Documentation**: Updated `docs/tree.md` generation timestamp.

## [1.0.10] - 2025-05-24

### Changed

- **Parsing**: Enhanced author name extraction in `parseESummaryAuthorsFromDocumentSummary` (`src/utils/parsing/ncbi-parsing/eSummaryResultParser.ts`) to more robustly handle varied NCBI ESummary XML structures. This includes better checking for `Name` or `name` properties (even if they are objects) and adding a fallback to use single string properties or the stringified object for debugging if a name isn't found through standard paths.
- **Build**: Bumped project version from `1.0.9` to `1.0.10` in `package.json` and `README.md` (to be done in a subsequent step).
- **Documentation**: Updated `docs/tree.md` generation timestamp.

## [1.0.9] - 2025-05-24

### Changed

- **Tool `fetch_pubmed_content`**:
  - Enhanced to support fetching content using NCBI ESearch history via `queryKey` and `webEnv` parameters.
  - Added support for pagination using `retstart` and `retmax` parameters when ESearch history is used.
  - Updated `FetchPubMedContentInputSchema` in `src/mcp-server/tools/fetchPubMedContent/logic.ts` with new optional fields for history and pagination, and added a `superRefine` block for complex inter-field validation (e.g., `queryKey` requires `webEnv`, `pmids` and history params are mutually exclusive).
  - Updated the tool's description in `src/mcp-server/tools/fetchPubMedContent/registration.ts` to reflect new capabilities.
  - Adjusted Zod schema access in `registration.ts` to `FetchPubMedContentInputSchema._def.schema.shape` due to the use of `superRefine`.
- **NCBI Service**:
  - Made the `db` parameter optional in `NcbiRequestParams` (`src/services/NCBI/ncbiConstants.ts`) to allow more flexible E-utility calls (e.g., EInfo without a specific database).
- **Documentation**:
  - Updated `README.md`:
    - Changed version badge and example `NCBI_TOOL_IDENTIFIER` to `1.0.9`.
    - Updated the description for the `fetch_pubmed_content` tool in the capabilities table to include history and pagination features.
  - Updated directory tree in `.clinerules` and `CLAUDE.md`.
- **Build**: Bumped project version from `1.0.8` to `1.0.9` in `package.json`.

## [1.0.8] - 2025-05-24

### Changed

- **Parsing**: Significantly refactored the `parseESummaryAuthorsFromDocumentSummary` function in `src/utils/parsing/ncbi-parsing/eSummaryResultParser.ts` to robustly handle diverse XML structures for author data returned by NCBI ESummary. This includes improved extraction logic for author names, types, and cluster IDs, and enhanced logging for unhandled structures.
- **Build**: Bumped project version from `1.0.7` to `1.0.8` in `package.json` and `README.md`.
- **Internal**: Minor import order change in `eSummaryResultParser.ts`.

## [1.0.7] - 2025-05-24

### Added

- **New Tool**: Implemented `pubmed_research_agent` tool (`src/mcp-server/tools/pubmedResearchAgent/`) for generating standardized JSON research plan outlines.
- **Examples**: Added `examples/research_agent_example.json` to demonstrate the usage of the new `pubmed_research_agent` tool.

### Changed

- **Server**: Registered the new `pubmed_research_agent` tool in `src/mcp-server/server.ts`.
- **Documentation**:
  - Updated `README.md` to include `pubmed_research_agent` in the tools table.
  - Updated `docs/tree.md` to reflect the new tool and example files.
- **Build**:
  - Updated `.gitignore` to no longer ignore the `examples/` directory.
  - Bumped project version from `1.0.6` to `1.0.7` in `package.json` and `README.md`.

## [1.0.6] - 2025-05-24

### Changed

- **Documentation Overhaul**:
  - Transformed `.clinerules` and `CLAUDE.md` from a "Developer Cheatsheet" into a comprehensive "Developer Guide & MCP Standards" document. This includes restructured content, more detailed explanations of environment variables, MCP concepts, SDK usage (emphasizing `server.tool` and `server.resource`), security mandates, JSDoc standards, core utilities, and project-specific PubMed integration.
  - Updated the directory tree within the developer guide.
- **Build & Versioning**:
  - Bumped project version from `1.0.5` to `1.0.6` in `README.md` and `package.json`.
  - Updated generation timestamp in `docs/tree.md`.
- **Core Refactoring**:
  - Moved `requestContextService.configure()` call to `src/index.ts` for global, one-time initialization, removing it from `createMcpServerInstance` in `src/mcp-server/server.ts`.
- **Tool Registration & Exports**:
  - Removed `registrationContext` parameter from `registerGetPubMedArticleConnectionsTool` invocation and definition.
  - Standardized tool registration exports in barrel files (e.g., `src/mcp-server/tools/fetchPubMedContent/index.ts`) to use explicit named exports like `export { registerFetchPubMedContentTool } from "./registration.js";`.
- **`fetchPubMedContent` Tool Enhancements**:
  - Improved type safety in `parsePubMedArticleSet` with a type guard for `xmlData`.
  - Correctly implemented raw XML string output for `detailLevel: "full_xml"` and `outputFormat: "raw_text"` by leveraging a new `returnRawXml` option in `ncbiService`.
  - Accurately populates `notFoundPmids` for `detailLevel: "medline_text"` by parsing PMIDs from the MEDLINE response.
  - Made MeSH term inclusion in `citation_data` conditional based on the `input.includeMeshTerms` flag.
  - Introduced `EFetchServiceParams` interface for better typing of parameters passed to `ncbiService.eFetch`.
- **`getPubMedArticleConnections` Tool Enhancements**:
  - `elinkHandler.ts`: Now robustly uses `ensureArray` for parsing ELink API responses, improving resilience.
  - `citationFormatter.ts`: Minor refactoring for EFetch URL construction and parameter typing.
- **`searchPubMedArticles` Tool Enhancements**:
  - Introduced `ESearchServiceParams` interface for improved typing of parameters passed to `ncbiService.eSearch` and `eSummary`.
- **Authentication Middleware (`authMiddleware.ts`)**:
  - Clarified logging for missing/invalid JWT scopes.
  - Added a comment regarding downstream authorization logic's responsibility to handle default empty scopes.
- **NCBI Service Layer (`ncbiConstants.ts`, `ncbiResponseHandler.ts`)**:
  - Added `returnRawXml?: boolean` to `NcbiRequestOptions` in `ncbiConstants.ts`.
  - `NcbiResponseHandler.ts`: Modified to always parse XML responses for error checking, even if `returnRawXml` is true. If no errors are found and raw XML was requested, the original XML string is returned; otherwise, the parsed object is returned. This ensures errors are caught before returning potentially unvalidated raw XML.

### Fixed

- Ensured type safety and correctness in handling various NCBI API response formats and XML parsing across multiple tools.
- Addressed potential inconsistencies in request context initialization.

## [1.0.5] - 2025-05-24

### Added

- **`fetchPubMedContent` Tool**:
  - Introduced an `outputFormat` parameter (`json` or `raw_text`) to the `fetchPubMedContent` tool.
  - When `outputFormat` is `raw_text`:
    - For `detailLevel: "medline_text"`, the tool now returns the direct MEDLINE text string.
    - For `detailLevel: "full_xml"`, the tool returns a JSON string representation of the parsed XML structure. A warning is logged as true raw XML string output is not yet supported by the underlying `ncbiService`.
  - For `detailLevel: "abstract_plus"` and `detailLevel: "citation_data"`, the output remains a JSON object regardless of the `outputFormat` setting, as raw text is not applicable for these structured data types.
  - Updated `FetchPubMedContentInputSchema` in `src/mcp-server/tools/fetchPubMedContent/logic.ts` to include the new `outputFormat` option.
  - Modified the logic in `fetchPubMedContentLogic` to handle the new `outputFormat` and adjust the response accordingly.

## [1.0.4] - 2025-05-24

### Changed

- **NCBI ELink Interaction (`getPubMedArticleConnections` tool)**:
  - Significantly refactored the ELink response handling in `src/mcp-server/tools/getPubMedArticleConnections/logic/elinkHandler.ts` to improve robustness and accuracy for different `relationshipType` values:
    - Correctly processes `cmd=neighbor_history` responses (used for `pubmed_citedin` and `pubmed_references`) by utilizing `LinkSetDbHistory`, `QueryKey`, and `WebEnv` to perform a subsequent ESearch to retrieve related PMIDs.
    - Accurately parses `cmd=neighbor_score` responses (used for `pubmed_similar_articles`) by targeting the `LinkSetDb` entry with `LinkName` as `pubmed_pubmed`.
    - Loosened type definitions for `XmlELinkItem`'s `Id` and `Score` to accept numbers, accommodating variations in NCBI's XML output.
    - Enhanced filtering of results to exclude the source PMID and invalid PMIDs (e.g., "0").
    - Added more detailed debug logging throughout the ELink processing flow.
- **NCBI EFetch Interaction (`getPubMedArticleConnections` tool)**:
  - In `src/mcp-server/tools/getPubMedArticleConnections/logic/citationFormatter.ts`, the `rettype` parameter is now omitted by default when calling EFetch for citation data. This aims to retrieve the fullest possible XML record from NCBI, potentially improving the quality and completeness of generated citations. The EFetch URL construction was updated accordingly.
- **XML Parsing Utilities**:
  - Improved the `getText` helper function in `src/utils/parsing/ncbi-parsing/xmlGenericHelpers.ts` to more robustly extract text content from XML elements. It now handles cases where the element itself or its `#text` child might be a number or boolean, and correctly handles undefined or null elements.
- **Date Parsing Utilities**:
  - Enhanced `standardizeESummaryDate` in `src/utils/parsing/ncbi-parsing/eSummaryResultParser.ts` to explicitly check for `null` inputs and ensure the date string is consistently handled as a string before parsing.

### Removed

- **Documentation**: Deleted `docs/Entrez-EUtils-Documentation.pdf`. Users should refer to the official NCBI E-utilities documentation online.

### Fixed

- Minor type issues and potential parsing inconsistencies in NCBI data handling.

## [1.0.3] - 2025-05-23

### Added

- **New Tool**: Implemented `getPubMedArticleConnections` tool (`src/mcp-server/tools/getPubMedArticleConnections/`) for finding related articles (cited by, similar, references) and formatting citations (RIS, BibTeX, APA, MLA) using NCBI ELink and EFetch.
- **NCBI Service Modules**: Introduced new modules for `NcbiService` to enhance modularity and maintainability:
  - `src/services/NCBI/ncbiConstants.ts`: Defines constants and types for NCBI interactions.
  - `src/services/NCBI/ncbiCoreApiClient.ts`: Handles core HTTP request logic to NCBI E-utilities.
  - `src/services/NCBI/ncbiRequestQueueManager.ts`: Manages request queuing and rate limiting for NCBI API calls.
  - `src/services/NCBI/ncbiResponseHandler.ts`: Responsible for parsing and validating responses from NCBI.
- **NCBI Parsing Utilities**: Created a new directory `src/utils/parsing/ncbi-parsing/` with specialized XML parsing helpers:
  - `eSummaryResultParser.ts`: For parsing ESummary results.
  - `pubmedArticleStructureParser.ts`: For parsing detailed PubMed article XML.
  - `xmlGenericHelpers.ts`: Common XML parsing utilities.
- **Types**: Added `src/types-global/pubmedXml.ts` for PubMed XML type definitions. (This was also noted in 1.0.2 but is a key part of this set of changes).

### Changed

- **Refactor: `NcbiService`**: Major architectural overhaul of `src/services/NCBI/ncbiService.ts`. The service now delegates core responsibilities (API calls, request queuing, response handling) to the newly added modules (`ncbiCoreApiClient.ts`, `ncbiRequestQueueManager.ts`, `ncbiResponseHandler.ts`), significantly improving separation of concerns and testability.
- **Parsing Utilities**: Reorganized and enhanced XML parsing logic. Functionality from the previously deleted `src/utils/parsing/pubmedXmlParserHelpers.ts` has been moved and expanded within the new `src/utils/parsing/ncbi-parsing/` directory.
- **Project Identity & Configuration**:
  - Updated project version to `1.0.3` in `package.json`, `README.md`, and relevant configuration files.
  - Ensured `package.json` `name` is `@cyanheads/pubmed-mcp-server`.
  - Updated `NCBI_TOOL_IDENTIFIER` to `@cyanheads/pubmed-mcp-server/1.0.3` in `mcp.json`, `smithery.yaml`, and `README.md`.
  - Updated `package.json` description and keywords for better clarity and discoverability.
- **Tool Registration**: Updated `src/mcp-server/server.ts` to register the new `getPubMedArticleConnections` tool and reordered tool registrations alphabetically.
- **Import Paths**: Adjusted import paths in `fetchPubMedContent/logic.ts` and `searchPubMedArticles/logic.ts` to reflect the new location of parsing utilities.

### Removed

- **Old Parsing Utilities**: Deleted `src/utils/parsing/pubmedXmlParserHelpers.ts` as its functionality has been superseded by the new modules in `src/utils/parsing/ncbi-parsing/`.

## [1.0.2] - 2025-05-23

### Added

- **Types**: Added `src/types-global/pubmedXml.ts` for PubMed XML type definitions.
- **Parsing Utilities**: Added `src/utils/parsing/pubmedXmlParserHelpers.ts` for helper functions related to parsing PubMed XML.

### Changed

- **Project Identity & Configuration**:
  - Renamed `package.json` name to `@cyanheads/pubmed-mcp-server`.
  - Updated `NCBI_TOOL_IDENTIFIER` to `@cyanheads/pubmed-mcp-server/1.0.2` in `mcp.json`, `smithery.yaml` (as default), and `README.md`.
  - Ensured `NCBI_API_KEY` and `NCBI_ADMIN_EMAIL` placeholder configurations are present in `mcp.json` and `smithery.yaml`.
  - Renamed server key in `mcp.json` from `mcp-ts-template` to `pubmed-mcp-server` for accurate identification (this was part of the original changes for 1.0.2).
- **NCBI Service**:
  - In `src/services/NCBI/ncbiService.ts`, added a direct return path for `options.retmode === "text"`.
  - Improved robustness for `options.retmode === "xml"` by adding a `typeof responseData !== "string"` check before XML validation.
- **Documentation**:
  - Updated `README.md` to reflect the new package name and `NCBI_TOOL_IDENTIFIER` in configuration sections.
  - Regenerated `docs/tree.md` to reflect new files (`pubmedXml.ts`, `pubmedXmlParserHelpers.ts`) and updated timestamp.
- **Build**:
  - Updated project version to `1.0.2` in `package.json` (name also updated) and `README.md` version badge.

## [1.0.1] - 2025-05-23

### Changed

- **Refactor: PubMed XML Parsing & Data Extraction**:
  - Introduced dedicated TypeScript types for PubMed XML structures (`src/types-global/pubmedXml.ts`) to improve type safety and clarity.
  - Created a suite of helper functions (`src/utils/parsing/pubmedXmlParserHelpers.ts`) for modular, robust, and reusable extraction of data from parsed PubMed XML (e.g., authors, abstracts, MeSH terms, journal info).
  - Significantly refactored the `fetchPubMedContent` tool's internal logic (`src/mcp-server/tools/fetchPubMedContent/logic.ts`) to leverage these new types and helper functions. This enhances maintainability, readability, and the accuracy of data extraction.
  - Clarified in `README.md` and tool registration that `fetch_pubmed_content` with `detailLevel: "full_xml"` returns a JSON representation of the `PubmedArticleSet` XML structure, not raw XML text.
- **Refactor: ESummary Handling in `searchPubMedArticles` Tool**:
  - Updated the `searchPubMedArticles` tool (`src/mcp-server/tools/searchPubMedArticles/logic.ts`) to more effectively use NCBI ESearch history (`usehistory: "y"`) when `fetchBriefSummaries` is requested.
  - ESummary calls now correctly utilize `WebEnv` and `query_key` from ESearch results, along with `retmax`, for more efficient fetching of brief summaries.
  - Refactored ESummary response parsing to use the new XML parsing helper functions and types, improving consistency and robustness.
- **Improvement: NCBI Service Parameter Handling**:
  - Enhanced `src/services/NCBI/ncbiService.ts` to ensure all parameters sent to NCBI E-utilities are correctly stringified, preventing potential API errors.
- **Fix**: Adjusted the maximum value for the `fetchBriefSummaries` parameter in the `searchPubMedArticles` tool from 100 to 50.
- **Internal**: Minor improvements to logging context and type annotations in NCBI service and tool logic files.

## [1.0.0] - 2025-05-23

### Major Changes - Project Transformation to PubMed MCP Server

This version marks a significant transformation of the `mcp-ts-template` into the `pubmed-mcp-server`. The core focus is now on providing an MCP interface to NCBI's PubMed E-utilities.

### Added

- **PubMed Integration**:
  - Implemented `searchPubMedArticles` tool (`src/mcp-server/tools/searchPubMedArticles/`) for searching PubMed.
  - Implemented `fetchPubMedContent` tool (`src/mcp-server/tools/fetchPubMedContent/`) for retrieving detailed article information.
  - Added `src/services/NCBI/ncbiService.ts` to manage interactions with NCBI E-utilities, including API key handling, rate limiting, and response parsing.
  - Introduced NCBI-specific environment variables (`NCBI_API_KEY`, `NCBI_ADMIN_EMAIL`, `NCBI_TOOL_IDENTIFIER`, `NCBI_REQUEST_DELAY_MS`, `NCBI_MAX_RETRIES`) in `src/config/index.ts`.
  - Added NCBI-specific error codes (e.g., `NCBI_API_ERROR`, `NCBI_PARSING_ERROR`) to `src/types-global/errors.ts`.
- **Dependencies**:
  - Added `axios` for HTTP requests (now a direct dependency).
  - Added `fast-xml-parser` for parsing NCBI XML responses.
- **Documentation**:
  - Added `docs/Entrez-EUtils-Documentation.pdf` (NCBI E-utilities official documentation).
  - Added `docs/project-spec.md` outlining the PubMed MCP Server's goals and features.

### Changed

- **Project Identity**:
  - Renamed project from `mcp-ts-template` to `pubmed-mcp-server` in `package.json`, `README.md`, and `.clinerules`.
  - Updated project description, keywords, author, homepage, and repository URLs in `package.json`.
  - Reset project version to `1.0.0`.
- **Core Functionality**:
  - Refocused `src/mcp-server/server.ts` to register PubMed-specific tools.
- **Configuration**:
  - Updated `src/config/index.ts` to load and validate new NCBI-related environment variables.
- **Dependencies**:
  - Upgraded `@modelcontextprotocol/sdk` from `^1.11.5` to `^1.12.0`.
  - Upgraded `openai` from `^4.102.0` to `^4.103.0`.
  - Upgraded `zod` from `^3.25.20` to `^3.25.28`.
  - Updated `package-lock.json` accordingly.
- **Documentation**:
  - Extensively rewrote `README.md` to reflect the PubMed MCP Server's purpose, features, configuration, and usage.
  - Overhauled `.clinerules` to serve as a developer cheatsheet specifically for `pubmed-mcp-server`, including NCBI E-utility details and new tool information.
  - Updated `docs/tree.md` to reflect the new directory structure and removal/addition of files.

### Removed

- **Generic MCP Client**:
  - Deleted the entire `src/mcp-client/` directory and all its sub-modules (`client-config/`, `core/`, `transports/`, `index.ts`). The server no longer includes a generic client for connecting to other MCP servers.
- **Example Code**:
  - Deleted the example `echoTool` (`src/mcp-server/tools/echoTool/`) and its associated files.
  - Deleted the example `echoResource` (`src/mcp-server/resources/echoResource/`) (though its directory might still be in the tree if not explicitly removed by git, the registration in `server.ts` is gone).
