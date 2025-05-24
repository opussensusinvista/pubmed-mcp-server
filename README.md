# PubMed MCP Server Pubmed

[![TypeScript](https://img.shields.io/badge/TypeScript-^5.8.3-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol SDK](https://img.shields.io/badge/MCP%20SDK-1.12.0-green.svg)](https://github.com/modelcontextprotocol/typescript-sdk)
[![MCP Spec Version](https://img.shields.io/badge/MCP%20Spec-2025--03--26-lightgrey.svg)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/changelog.mdx)
[![Version](https://img.shields.io/badge/Version-1.0.0-blue.svg)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Development-yellow.svg)](https://github.com/cyanheads/pubmed-mcp-server/issues)
[![GitHub](https://img.shields.io/github/stars/cyanheads/pubmed-mcp-server?style=social)](https://github.com/cyanheads/pubmed-mcp-server)

**Connect your AI agents to the world of biomedical literature with the PubMed MCP Server!**

This server provides a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) interface to NCBI's PubMed and E-utilities, enabling language models to search, fetch, and analyze biomedical articles and data. Built on a robust TypeScript foundation (derived from `mcp-ts-template`), it adheres to the **MCP 2025-03-26 specification** and includes production-ready utilities for logging, error handling, and secure communication.

## ✨ Key Features

| Feature Area                | Description                                                                                                                               | Key Components / Location                                                      |
| :-------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| **PubMed Integration**      | Tools for searching articles (`searchPubMedArticles`), fetching content (`fetchPubMedContent`).                                           | `src/mcp-server/tools/`, `src/services/NCBI/`                                  |
| **🔌 MCP Server**           | Functional server with PubMed tools. Supports `stdio` and `http` (SSE) transports.                                                        | `src/mcp-server/`                                                              |
| **🚀 Production Utilities** | Logging, Error Handling, ID Generation, Rate Limiting, Request Context tracking, Input Sanitization.                                      | `src/utils/`                                                                   |
| **🔒 Type Safety/Security** | Strong type checking via TypeScript & Zod validation. NCBI API key management, rate limiting, auth middleware for HTTP.                    | Throughout, `src/utils/security/`, `src/mcp-server/transports/authentication/` |
| **⚙️ Error Handling**       | Consistent error categorization (`BaseErrorCode`), detailed logging, centralized handling (`ErrorHandler`), NCBI-specific error types.    | `src/utils/internal/errorHandler.ts`, `src/types-global/`                      |
| **📚 Documentation**        | Comprehensive `README.md`, structured JSDoc comments (via `tsdoc.json`), API references, project specification.                           | `README.md`, Codebase, `tsdoc.json`, `docs/`                                   |
| **🤖 Agent Ready**          | Includes a [.clinerules](.clinerules) developer cheatsheet tailored for LLM coding agents, specific to this PubMed server.                 | `.clinerules`                                                                  |
| **🛠️ Utility Scripts**      | Scripts for cleaning builds, setting executable permissions, generating directory trees, and fetching OpenAPI specs.                      | `scripts/`                                                                     |

## 📋 Table of Contents

[✨ Key Features](#-key-features) | [🚀 Quick Start](#quick-start) | [⚙️ Configuration](#️-configuration) | [Server Configuration](#server-configuration-environment-variables) | [🏗️ Project Structure](#️-project-structure) | [🧩 Adding PubMed Tools/Resources](#-adding-pubmed-toolsresources) | [🌍 More MCP Resources](#-explore-more-mcp-resources) | [📜 License](#-license)

## 🚀 Quick Start

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/cyanheads/pubmed-mcp-server.git
    cd pubmed-mcp-server
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file in the project root and add your NCBI API key and admin email:
    ```env
    NCBI_API_KEY=your_ncbi_api_key_here
    NCBI_ADMIN_EMAIL=your_email@example.com
    MCP_AUTH_SECRET_KEY=generate_a_strong_random_32_plus_char_secret_key_for_http_auth # Required for HTTP
    # Optional:
    # MCP_TRANSPORT_TYPE=http
    # MCP_HTTP_PORT=3010
    # MCP_LOG_LEVEL=debug
    ```
    Refer to the [Configuration](#server-configuration-environment-variables) section for more details.

4.  **Build the project:**

    ```bash
    npm run build
    ```

5.  **Run the Server:**

    - **Via Stdio (Default):**
      ```bash
      npm start
      # or 'npm run start:stdio'
      ```
    - **Via HTTP (SSE):** Ensure `MCP_TRANSPORT_TYPE=http` and `MCP_AUTH_SECRET_KEY` are set in your `.env` file.
      ```bash
      npm run start:http
      ```
      This starts an HTTP server (default: `http://127.0.0.1:3010`).

## ⚙️ Configuration

### Server Configuration (Environment Variables)

Configure the PubMed MCP server using these environment variables (typically in a `.env` file):

| Variable                        | Description                                                                                                | Default                                      | Required                                  |
| :------------------------------ | :--------------------------------------------------------------------------------------------------------- | :------------------------------------------- | :---------------------------------------- |
| **`NCBI_API_KEY`**              | **Your NCBI API Key.** Essential for higher rate limits and reliable access.                               | (none)                                       | **Yes**                                   |
| **`NCBI_ADMIN_EMAIL`**          | **Your email address for NCBI contact.**                                                                   | (none)                                       | **Yes**                                   |
| `NCBI_TOOL_IDENTIFIER`          | Tool identifier sent to NCBI.                                                                              | `pubmed-mcp-server/<version>`                | No                                        |
| `NCBI_REQUEST_DELAY_MS`         | Milliseconds to wait between NCBI requests (e.g., 100 for API key, 334 for no key).                        | `100`                                        | No                                        |
| `NCBI_MAX_RETRIES`              | Maximum number of retries for failed NCBI requests.                                                        | `3`                                          | No                                        |
| `MCP_TRANSPORT_TYPE`            | Server transport: `stdio` or `http`.                                                                       | `stdio`                                      | No                                        |
| `MCP_HTTP_PORT`                 | Port for the HTTP server (if `MCP_TRANSPORT_TYPE=http`).                                                   | `3010`                                       | No (if stdio)                             |
| `MCP_HTTP_HOST`                 | Host address for the HTTP server (if `MCP_TRANSPORT_TYPE=http`).                                           | `127.0.0.1`                                  | No (if stdio)                             |
| `MCP_ALLOWED_ORIGINS`           | Comma-separated allowed origins for CORS (if `MCP_TRANSPORT_TYPE=http`).                                   | (none)                                       | No                                        |
| **`MCP_AUTH_SECRET_KEY`**       | **Secret key (min 32 chars) for JWT auth (HTTP transport).**                                               | (none)                                       | **Yes (if `MCP_TRANSPORT_TYPE=http`)**    |
| `MCP_SERVER_NAME`               | Optional server name (used in MCP initialization).                                                         | (from package.json)                          | No                                        |
| `MCP_SERVER_VERSION`            | Optional server version (used in MCP initialization).                                                      | (from package.json)                          | No                                        |
| `MCP_LOG_LEVEL`                 | Server logging level (`debug`, `info`, `warning`, `error`, etc.).                                          | `debug`                                      | No                                        |
| `LOGS_DIR`                      | Directory for log files.                                                                                   | `logs/` (in project root)                    | No                                        |
| `NODE_ENV`                      | Runtime environment (`development`, `production`).                                                         | `development`                                | No                                        |
| `OPENROUTER_API_KEY`            | API key for OpenRouter.ai (if using internal LLM features).                                                | (none)                                       | No                                        |
| `OPENROUTER_APP_URL`            | Application URL for OpenRouter.                                                                            | `http://localhost:3000`                      | No                                        |
| `OPENROUTER_APP_NAME`           | Application name for OpenRouter.                                                                           | (from package.json name)                     | No                                        |
| `LLM_DEFAULT_MODEL`             | Default LLM model for OpenRouter.                                                                          | `google/gemini-2.5-flash-preview-05-20`      | No                                        |
| `GEMINI_API_KEY`                | API key for Google Gemini services (if using internal LLM features).                                       | (none)                                       | No                                        |
| `OAUTH_PROXY_AUTHORIZATION_URL` | OAuth provider authorization endpoint URL.                                                                 | (none)                                       | No                                        |
| `OAUTH_PROXY_TOKEN_URL`         | OAuth provider token endpoint URL.                                                                         | (none)                                       | No                                        |
| `OAUTH_PROXY_REVOCATION_URL`    | OAuth provider revocation endpoint URL.                                                                    | (none)                                       | No                                        |
| `OAUTH_PROXY_ISSUER_URL`        | OAuth provider issuer URL.                                                                                 | (none)                                       | No                                        |
| `OAUTH_PROXY_SERVICE_DOCUMENTATION_URL` | OAuth service documentation URL.                                                                 | (none)                                       | No                                        |
| `OAUTH_PROXY_DEFAULT_CLIENT_REDIRECT_URIS` | Comma-separated default OAuth client redirect URIs.                                             | (none)                                       | No                                        |

**Security Note for HTTP Transport:** When using `MCP_TRANSPORT_TYPE=http`, authentication is **mandatory**. This server uses JWT-based authentication. You **MUST** set a strong, unique `MCP_AUTH_SECRET_KEY` in your production environment.

## 🏗️ Project Structure

The `src/` directory is organized as follows:

- `config/`: Loads environment variables and package info.
- `mcp-server/`: Core logic for the PubMed MCP server.
  - `server.ts`: Initializes the server, registers PubMed tools/resources.
  - `resources/`: PubMed-specific resource implementations (e.g., `serverInfo`, `getPubMedStats` - to be implemented).
  - `tools/`: PubMed-specific tool implementations.
    - `searchPubMedArticles/`: Implements PubMed search.
    - `fetchPubMedContent/`: Implements fetching article details.
    - `getArticleRelationships/`: (To be implemented)
  - `transports/`: Handles `stdio` and `http` communication for the server.
    - `authentication/`: JWT authentication middleware for HTTP.
- `services/`: Contains service integrations.
  - `NCBI/`: Service for interacting with NCBI E-utilities.
    - `ncbiService.ts`: Handles API calls, rate limiting, parsing.
  - `llm-providers/`: (Optional) For internal LLM use.
- `types-global/`: Shared TypeScript definitions (Errors, MCP types).
- `utils/`: Reusable utilities (logging, errors, security, parsing, etc.).

**View the full structure:**

```bash
npm run tree
```

## 🧩 Adding PubMed Tools/Resources

Extend the server's capabilities by adding new PubMed tools or resources:

1.  **Create Directories**: Under `src/mcp-server/tools/yourNewToolName/` or `src/mcp-server/resources/yourNewResourceName/`.
2.  **Implement Logic (`logic.ts`)**:
    - Define Zod schemas for inputs.
    - Write the core function to interact with `src/services/NCBI/ncbiService.ts` (e.g., call `ncbiService.eFetch(...)`).
    - Parse the NCBI response and format it as per MCP `CallToolResult` or `ReadResourceResult`.
3.  **Register (`registration.ts`)**:
    - Use `server.tool(name, description, zodSchemaShape, handler)` for tools.
    - Use `server.resource(regName, template, metadata, handler)` for resources.
    - Wrap logic in `ErrorHandler.tryCatch`.
4.  **Export & Import**: Export the registration function from your new directory's `index.ts` and call it in `src/mcp-server/server.ts`.

Refer to the implemented `searchPubMedArticles` and `fetchPubMedContent` tools for examples. The [.clinerules](.clinerules) file also contains detailed guidance.

## 🌍 Explore More MCP Resources

-   **[Model Context Protocol Official Site](https://modelcontextprotocol.io/)**
-   **[MCP Specification (2025-03-26)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/changelog.mdx)**
-   **[TypeScript SDK for MCP](https://github.com/modelcontextprotocol/typescript-sdk)**
-   **[NCBI E-utilities Documentation](https://www.ncbi.nlm.nih.gov/books/NBK25501/)** (also in `docs/Entrez-EUtils-Documentation.pdf`)

## 📜 License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

---

<div align="center">
Access PubMed with AI | Built with the <a href="https://modelcontextprotocol.io/">Model Context Protocol</a>
</div>
