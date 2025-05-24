# PubMed MCP Server Pubmed

[![TypeScript](https://img.shields.io/badge/TypeScript-^5.8.3-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol SDK](https://img.shields.io/badge/MCP%20SDK-1.12.0-green.svg)](https://github.com/modelcontextprotocol/typescript-sdk)
[![MCP Spec Version](https://img.shields.io/badge/MCP%20Spec-2025--03--26-lightgrey.svg)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/changelog.mdx)
[![Version](https://img.shields.io/badge/Version-1.0.3-blue.svg)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Development-yellow.svg)](https://github.com/cyanheads/pubmed-mcp-server/issues)
[![GitHub](https://img.shields.io/github/stars/cyanheads/pubmed-mcp-server?style=social)](https://github.com/cyanheads/pubmed-mcp-server)

**Unlock the power of biomedical literature for your AI agents with the PubMed MCP Server!**

This server acts as a bridge, connecting your AI to NCBI's PubMed and E-utilities through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). It empowers language models to seamlessly search, retrieve, and analyze biomedical articles and data. Built with TypeScript and adhering to the **MCP 2025-03-26 specification**, it's designed for robustness and includes production-grade utilities.

## 🚀 Core Capabilities: PubMed Tools 🛠️

This server equips your AI with specialized tools to interact with PubMed:

| Tool Name                        | Description                                                                             | Key Features                                                                                                                                                                                                                                            | Output Structure                                                                                                                                                          |
| :------------------------------- | :-------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `search_pubmed_articles`         | Searches PubMed for articles based on your query.                                       | - Filter by max results, sort order, date range, publication types.<br/>- Uses NCBI ESearch for PMIDs.<br/>- Optionally fetches brief summaries (title, authors, source, dates) via ESummary.                                                           | JSON object: <br/>- Original search parameters<br/>- ESearch term used<br/>- Result counts<br/>- List of PMIDs<br/>- Optional article summaries<br/>- E-utility URLs used |
| `fetch_pubmed_content`           | Retrieves detailed information for a list of specified PubMed PMIDs.                    | - Flexible `detailLevel`: `abstract_plus` (parsed details, optional MeSH/grant), `full_xml` (JSON representation of the PubMedArticle XML structure), `medline_text` (MEDLINE format), `citation_data` (minimal for citations).<br/>- Uses NCBI EFetch. | JSON object: <br/>- Requested PMIDs<br/>- Array of article data (parsed/raw based on `detailLevel`)<br/>- PMIDs not found<br/>- EFetch URL used                           |
| `get_pubmed_article_connections` | Finds related articles (cited by, similar, references) or formats citations for a PMID. | - Uses NCBI ELink for relationships.<br/>- Uses NCBI EFetch for citation data (RIS, BibTeX, APA, MLA).<br/>- Filter by max related results.                                                                                                             | JSON object: <br/>- Source PMID<br/>- Relationship type<br/>- List of related PMIDs or formatted citations<br/>- E-utility URLs used                                      |

---

## ✨ Key Features Beyond Tools

| Feature Category               | Description                                                                                                                                                                  |
| :----------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **🔌 MCP Compliant**           | Fully functional server supporting `stdio` and `http` (SSE) transports.                                                                                                      |
| **🚀 Production-Ready Utils**  | Includes robust logging, error handling, ID generation, rate limiting, request context tracking, and input sanitization.                                                     |
| **🔒 Secure & Type-Safe**      | Built with TypeScript & Zod for strong type checking and input validation. Manages NCBI API keys, implements rate limiting, and features JWT-based auth middleware for HTTP. |
| **⚙️ Advanced Error Handling** | Consistent error categorization, detailed logging, and centralized handling, including specific error types for NCBI interactions.                                           |
| **📚 Well-Documented**         | Comprehensive JSDoc comments, API references, and project specifications.                                                                                                    |
| **🤖 Agent-Friendly**          | Includes a `.clinerules` developer cheatsheet tailored for LLM coding agents using this server.                                                                              |
| **🛠️ Developer Utilities**     | Scripts for cleaning builds, setting executable permissions, generating directory trees, and fetching OpenAPI specifications.                                                |

## 🚀 Quick Start

Get the PubMed MCP server running in minutes:

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/cyanheads/pubmed-mcp-server.git
    cd pubmed-mcp-server
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Configure Environment Variables (`.env` file):**
    Create a `.env` file in the project root. Key variables:

    ```env
    # REQUIRED FOR HTTP TRANSPORT
    MCP_AUTH_SECRET_KEY=generate_a_strong_random_32_plus_char_secret_key

    # RECOMMENDED FOR NCBI E-UTILITIES (for higher rate limits)
    # NCBI_API_KEY=your_ncbi_api_key_here
    # NCBI_ADMIN_EMAIL=your_email@example.com # Recommended if using an API key
    # NCBI_TOOL_IDENTIFIER=@cyanheads/pubmed-mcp-server/1.0.3 # Optional: Tool identifier for NCBI
    ```

    For all options, see the [Configuration](#⚙️-configuration) section below or the [Developer Cheatsheet (.clinerules)](./.clinerules).

4.  **Build the project:**

    ```bash
    npm run build
    # Or use 'npm run rebuild' for a clean install (deletes node_modules, logs, dist)
    ```

5.  **Format the code (Optional but Recommended):**

    ```bash
    npm run format
    ```

6.  **Run the Server:**

    - **Via Stdio (Default):** Many MCP host applications will run this automatically using `stdio`. To run manually for testing:
      ```bash
      npm start
      # or 'npm run start:stdio'
      ```
    - **Via HTTP (SSE):** (Ensure `MCP_TRANSPORT_TYPE=http` and `MCP_AUTH_SECRET_KEY` are set in your `.env`)
      ```bash
      npm run start:http
      ```
      This starts an HTTP server (default: `http://127.0.0.1:3010`) using Server-Sent Events.

## ⚙️ Configuration

### Server Configuration (Environment Variables)

Configure the PubMed MCP server's behavior using environment variables (typically in a `.env` file).

| Variable                | Description                                                                                            | Default                                  |
| :---------------------- | :----------------------------------------------------------------------------------------------------- | :--------------------------------------- |
| `MCP_TRANSPORT_TYPE`    | Server transport: `stdio` or `http`.                                                                   | `stdio`                                  |
| `MCP_HTTP_PORT`         | Port for the HTTP server (if `MCP_TRANSPORT_TYPE=http`).                                               | `3010`                                   |
| `MCP_HTTP_HOST`         | Host address for the HTTP server (if `MCP_TRANSPORT_TYPE=http`).                                       | `127.0.0.1`                              |
| `MCP_ALLOWED_ORIGINS`   | Comma-separated allowed origins for CORS (if `MCP_TRANSPORT_TYPE=http`).                               | (none)                                   |
| `MCP_SERVER_NAME`       | Optional server name (used in MCP initialization).                                                     | (from package.json)                      |
| `MCP_SERVER_VERSION`    | Optional server version (used in MCP initialization).                                                  | (from package.json)                      |
| `MCP_LOG_LEVEL`         | Server logging level (`debug`, `info`, `warning`, `error`, etc.).                                      | `debug`                                  |
| `LOGS_DIR`              | Directory for log files.                                                                               | `logs/` (in project root)                |
| `NODE_ENV`              | Runtime environment (`development`, `production`).                                                     | `development`                            |
| `MCP_AUTH_SECRET_KEY`   | **Required for HTTP transport.** Secret key (min 32 chars) for signing/verifying auth tokens (JWT).    | (none - **MUST be set in production**)   |
| `NCBI_API_KEY`          | **Optional, but highly recommended.** Your NCBI API Key for higher rate limits (10/sec vs 3/sec).      | (none)                                   |
| `NCBI_ADMIN_EMAIL`      | **Optional, but recommended if using an API key.** Your email for NCBI contact.                        | (none)                                   |
| `NCBI_TOOL_IDENTIFIER`  | Optional. Tool identifier sent to NCBI.                                                                | `@cyanheads/pubmed-mcp-server/<version>` |
| `NCBI_REQUEST_DELAY_MS` | Milliseconds to wait between NCBI requests. Dynamically set (e.g., 100ms with API key, 334ms without). | (see `src/config/index.ts`)              |
| `NCBI_MAX_RETRIES`      | Maximum number of retries for failed NCBI requests.                                                    | `3`                                      |

**Note on HTTP Port Retries:** If the `MCP_HTTP_PORT` is busy, the server automatically tries the next port (up to 15 times).

**Security Note for HTTP Transport:** When using `MCP_TRANSPORT_TYPE=http`, authentication is **mandatory** as per the MCP specification. This server includes JWT-based authentication middleware. You **MUST** set a strong, unique `MCP_AUTH_SECRET_KEY` in your production environment.

For a **comprehensive list of all available environment variables**, their descriptions, and default values, please review the configuration loader at `src/config/index.ts`.

## 🏗️ Project Structure Overview

The `src/` directory contains the core logic:

- `config/`: Environment variable loading and package information.
- `mcp-server/`: The heart of the PubMed MCP server.
  - `server.ts`: Initializes the server instance and registers all tools and resources.
  - `resources/`: Implementations for MCP resources (e.g., server status, PubMed statistics).
  - `tools/`: Implementations for MCP tools (like `searchPubMedArticles`, `fetchPubMedContent`).
  - `transports/`: Handles `stdio` and `http` (SSE) communication, including authentication for HTTP.
- `services/`: Integrations with external services.
  - `NCBI/ncbiService.ts`: Manages all interactions with NCBI E-utilities, including API calls, rate limiting, and response parsing.
  - `llm-providers/`: (Optional) For integrating LLM capabilities directly within the server.
- `types-global/`: Shared TypeScript definitions, especially for errors and MCP types.
- `utils/`: A comprehensive suite of reusable utilities for logging, error handling, security, parsing, metrics, and more.

For a detailed file tree, run: `npm run tree`

## 🧩 Extending with More PubMed Capabilities

Adding new tools or resources is straightforward:

1.  **Directory Setup**: Create a new directory under `src/mcp-server/tools/yourNewTool/` or `src/mcp-server/resources/yourNewResource/`.
2.  **Implement Core Logic (`logic.ts`)**:
    - Define Zod schemas for input validation.
    - Write the function that interacts with `src/services/NCBI/ncbiService.ts` (e.g., `ncbiService.eLink(...)`).
    - Parse the NCBI response and format it according to MCP specifications (`CallToolResult` or `ReadResourceResult`).
3.  **Register the Capability (`registration.ts`)**:
    - For tools: `server.tool(name, description, zodSchemaShape, handlerFunction)`
    - For resources: `server.resource(registrationName, template, metadata, handlerFunction)`
    - Always wrap your logic in `ErrorHandler.tryCatch` for robust error management.
4.  **Export and Integrate**: Export the registration function from your new directory's `index.ts` and call it within `src/mcp-server/server.ts`.

The existing `searchPubMedArticles` and `fetchPubMedContent` tools serve as excellent examples. The [.clinerules](.clinerules) file also provides in-depth guidance for development.

## 🌍 Learn More

- **[Model Context Protocol Official Site](https://modelcontextprotocol.io/)**
- **[MCP Specification (2025-03-26)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/changelog.mdx)**
- **[TypeScript SDK for MCP](https://github.com/modelcontextprotocol/typescript-sdk)**
- **[NCBI E-utilities Documentation](https://www.ncbi.nlm.nih.gov/books/NBK25501/)** (A PDF copy is also available in `docs/Entrez-EUtils-Documentation.pdf`)

## 📜 License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

---

<div align="center">
  Empowering AI with PubMed | Built on the <a href="https://modelcontextprotocol.io/">Model Context Protocol</a>
</div>
