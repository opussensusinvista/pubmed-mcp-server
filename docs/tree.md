# pubmed-mcp-server - Directory Structure

Generated on: 2025-05-24 12:27:05

```
pubmed-mcp-server
├── .github
│   └── workflows
│       └── publish.yml
├── docs
│   ├── api-references
│   │   ├── jsdoc-standard-tags.md
│   │   └── typedoc-reference.md
│   ├── project-spec.md
│   └── tree.md
├── examples
│   └── research_agent_example.json
├── scripts
│   ├── clean.ts
│   ├── fetch-openapi-spec.ts
│   ├── make-executable.ts
│   └── tree.ts
├── src
│   ├── config
│   │   └── index.ts
│   ├── mcp-server
│   │   ├── resources
│   │   │   └── echoResource
│   │   │       ├── echoResourceLogic.ts
│   │   │       ├── index.ts
│   │   │       └── registration.ts
│   │   ├── tools
│   │   │   ├── fetchPubMedContent
│   │   │   │   ├── index.ts
│   │   │   │   ├── logic.ts
│   │   │   │   └── registration.ts
│   │   │   ├── getPubMedArticleConnections
│   │   │   │   ├── logic
│   │   │   │   │   ├── citationFormatter.ts
│   │   │   │   │   ├── elinkHandler.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   └── types.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── logic.ts
│   │   │   │   └── registration.ts
│   │   │   ├── pubmedResearchAgent
│   │   │   │   ├── logic
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── inputSchema.ts
│   │   │   │   │   ├── outputTypes.ts
│   │   │   │   │   └── planOrchestrator.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── logic.ts
│   │   │   │   └── registration.ts
│   │   │   └── searchPubMedArticles
│   │   │       ├── index.ts
│   │   │       ├── logic.ts
│   │   │       └── registration.ts
│   │   ├── transports
│   │   │   ├── authentication
│   │   │   │   └── authMiddleware.ts
│   │   │   ├── httpTransport.ts
│   │   │   └── stdioTransport.ts
│   │   └── server.ts
│   ├── services
│   │   ├── llm-providers
│   │   │   ├── openRouter
│   │   │   │   ├── index.ts
│   │   │   │   └── openRouterProvider.ts
│   │   │   ├── index.ts
│   │   │   └── llmFactory.ts
│   │   ├── NCBI
│   │   │   ├── ncbiConstants.ts
│   │   │   ├── ncbiCoreApiClient.ts
│   │   │   ├── ncbiRequestQueueManager.ts
│   │   │   ├── ncbiResponseHandler.ts
│   │   │   └── ncbiService.ts
│   │   └── index.ts
│   ├── types-global
│   │   ├── errors.ts
│   │   └── pubmedXml.ts
│   ├── utils
│   │   ├── internal
│   │   │   ├── errorHandler.ts
│   │   │   ├── index.ts
│   │   │   ├── logger.ts
│   │   │   └── requestContext.ts
│   │   ├── metrics
│   │   │   ├── index.ts
│   │   │   └── tokenCounter.ts
│   │   ├── parsing
│   │   │   ├── ncbi-parsing
│   │   │   │   ├── eSummaryResultParser.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── pubmedArticleStructureParser.ts
│   │   │   │   └── xmlGenericHelpers.ts
│   │   │   ├── dateParser.ts
│   │   │   ├── index.ts
│   │   │   └── jsonParser.ts
│   │   ├── security
│   │   │   ├── idGenerator.ts
│   │   │   ├── index.ts
│   │   │   ├── rateLimiter.ts
│   │   │   └── sanitization.ts
│   │   └── index.ts
│   └── index.ts
├── .clinerules
├── .dockerignore
├── .gitignore
├── CHANGELOG.md
├── CLAUDE.md
├── Dockerfile
├── LICENSE
├── mcp.json
├── package-lock.json
├── package.json
├── README.md
├── repomix.config.json
├── smithery.yaml
├── tsconfig.json
├── tsconfig.typedoc.json
├── tsdoc.json
└── typedoc.json
```

_Note: This tree excludes files and directories matched by .gitignore and default patterns._
