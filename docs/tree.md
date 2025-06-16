# pubmed-mcp-server - Directory Structure

Generated on: 2025-06-16 03:22:03

```
pubmed-mcp-server
├── .github
│   ├── workflows
│   │   └── publish.yml
│   └── FUNDING.yml
├── docs
│   ├── api-references
│   │   └── typedoc-reference.md
│   ├── best-practices.md
│   ├── project-spec.md
│   └── tree.md
├── examples
│   ├── generate_pubmed_chart
│   │   ├── bar_chart.png
│   │   ├── doughnut_chart.png
│   │   ├── line_chart.png
│   │   ├── pie_chart.png
│   │   ├── polar_chart.png
│   │   ├── radar_chart.png
│   │   └── scatter_plot.png
│   ├── fetch_pubmed_content_example.md
│   ├── get_pubmed_article_connections_1.md
│   ├── get_pubmed_article_connections_2.md
│   ├── pubmed_research_agent_example.md
│   └── search_pubmed_articles_example.md
├── scripts
│   ├── clean.ts
│   ├── fetch-openapi-spec.ts
│   ├── make-executable.ts
│   └── tree.ts
├── src
│   ├── config
│   │   └── index.ts
│   ├── mcp-server
│   │   ├── tools
│   │   │   ├── fetchPubMedContent
│   │   │   │   ├── index.ts
│   │   │   │   ├── logic.ts
│   │   │   │   └── registration.ts
│   │   │   ├── generatePubMedChart
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
│   │   │   │   ├── authContext.ts
│   │   │   │   ├── authMiddleware.ts
│   │   │   │   ├── authUtils.ts
│   │   │   │   ├── oauthMiddleware.ts
│   │   │   │   └── types.ts
│   │   │   ├── httpTransport.ts
│   │   │   └── stdioTransport.ts
│   │   └── server.ts
│   ├── services
│   │   └── NCBI
│   │       ├── ncbiConstants.ts
│   │       ├── ncbiCoreApiClient.ts
│   │       ├── ncbiRequestQueueManager.ts
│   │       ├── ncbiResponseHandler.ts
│   │       └── ncbiService.ts
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
├── NOTICE
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
