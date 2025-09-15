import BrowserSemanticSearchEngine from "./BrowserSemanticSearchEngine";

/**
 * Unified Search Engine that combines filename, content, and semantic search
 * Provides intelligent ranking and result fusion
 */
class UnifiedSearchEngine {
  constructor() {
    this.searchEngine = null; // Regular SearchEngine instance
    this.semanticEngine = new BrowserSemanticSearchEngine();
    this.isSemanticReady = false;
  }

  /**
   * Initialize the unified search system
   */
  async initialize(searchEngine, userDataPath) {
    this.searchEngine = searchEngine;

    try {
      // Initialize semantic search in background
      console.log("🔄 Initializing semantic search capabilities...");
      await this.semanticEngine.initialize(userDataPath);
      this.isSemanticReady = true;
      console.log("✅ Unified search system ready");
    } catch (error) {
      console.warn(
        "⚠️ Semantic search unavailable, falling back to traditional search:",
        error
      );
      this.isSemanticReady = false;
    }
  }

  /**
   * Unified intelligent search
   */
  async search(query, options = {}) {
    // 🛡️ SAFETY: Ensure query is a string to prevent [object Object] errors
    if (typeof query !== "string") {
      console.error("⚠️ Invalid query type:", typeof query, query);
      return [];
    }

    if (!query || query.trim().length === 0) {
      return [];
    }

    const {
      limit = 200, // 🔧 INCREASED: From 50 to 200 for better pagination
      includeSemanticSearch = false, // 🚫 DISABLED TEMPORARILY
      minSimilarityThreshold = 0.3,
    } = options;

    const startTime = Date.now();
    console.log(`🔍 Unified search: "${query}"`);

    try {
      // Enhance query understanding
      const enhancedQuery = this.enhanceQuery(query);

      // 🔧 DEBUG: Check if we have indexed files (now async)
      const allFiles = await this.searchEngine.getIndexedFiles();
      console.log(`🔧 DEBUG: Found ${allFiles.length} indexed files`);
      if (allFiles.length > 0) {
        console.log(`🔧 DEBUG: First file sample:`, allFiles[0]);
      }

      // 🔧🚫 TEMPORARILY DISABLE SEMANTIC SEARCH - Run only filename and content search
      const searchPromises = [
        this.searchFilenames(enhancedQuery.normalized),
        this.searchContent(enhancedQuery.normalized),
      ];

      // ❌ SEMANTIC SEARCH DISABLED TEMPORARILY
      // if (includeSemanticSearch && this.isSemanticReady) {
      //   searchPromises.push(this.semanticEngine.searchSemantic(query, limit));
      // }

      const [filenameResults, contentResults] = await Promise.all(
        searchPromises
      );
      const semanticResults = []; // Empty semantic results for now

      // Intelligent result fusion (without semantic results)
      const fusedResults = this.fuseResults(query, {
        filename: filenameResults,
        content: contentResults,
        semantic: [], // No semantic results
      });

      const searchTime = Date.now() - startTime;
      console.log(
        `✅ Search completed in ${searchTime}ms - ${fusedResults.length} results`
      );

      return fusedResults.slice(0, limit);
    } catch (error) {
      console.error("❌ Unified search failed:", error);

      // Fallback to traditional search if unified search fails (avoid infinite recursion)
      return this.searchEngine
        ? await this.searchEngine.traditionalSearch(String(query))
        : [];
    }
  }

  /**
   * Search filenames with intelligent matching
   */
  async searchFilenames(query) {
    console.log(`🔧 DEBUG: searchFilenames called with query: "${query}"`);

    if (!this.searchEngine) return [];

    const results = [];
    const queryStr = String(query); // Ensure query is a string
    const queryLower = queryStr.toLowerCase();
    const queryWords = queryLower
      .split(/\s+/)
      .filter((word) => word.length > 1);

    console.log(
      `🔧 DEBUG: queryLower: "${queryLower}", queryWords:`,
      queryWords
    );

    // Get all indexed files (now async)
    const allFiles = await this.searchEngine.getIndexedFiles();
    console.log(
      `🔧 DEBUG: searchFilenames - Found ${allFiles.length} files to search`
    );

    for (const file of allFiles) {
      // Handle cases where file properties might be undefined
      const filename = (file.name || "").toLowerCase();
      const path = (file.fullPath || "").toLowerCase();

      let score = 0;
      let matchType = "";

      // Exact filename match (highest priority)
      if (filename.includes(queryLower)) {
        score += 100;
        matchType = "exact filename";
      }

      // Path match
      if (path.includes(queryLower)) {
        score += 50;
        matchType = matchType || "path match";
      }

      // Word-based matching
      const wordMatches = queryWords.filter(
        (word) => filename.includes(word) || path.includes(word)
      ).length;

      if (wordMatches > 0) {
        score += wordMatches * 20;
        matchType = matchType || `${wordMatches} word matches`;
      }

      // File extension relevance
      const fileType = this.searchEngine.getFileType(file.name);
      if (this.isRelevantFileType(fileType, query)) {
        score += 10;
      }

      if (score > 0) {
        console.log(
          `🔧 DEBUG: Found match - filename: "${filename}", score: ${score}, matchType: "${matchType}"`
        );
        results.push({
          ...file,
          relevanceScore: score,
          source: "filename",
          matchReason: matchType,
          snippet: this.generatePathSnippet(
            file.fullPath || file.name,
            queryLower
          ),
        });
      }
    }

    console.log(
      `🔧 DEBUG: searchFilenames returning ${results.length} results`
    );
    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Search content using existing search engine (fixed to avoid recursion)
   */
  async searchContent(query) {
    console.log(`🔧 DEBUG: searchContent called with query: "${query}"`);

    if (!this.searchEngine) return [];

    try {
      // 🔧 DEBUG: Check content index state
      const contentIndexSize = this.searchEngine.contentIndex?.size || 0;
      console.log(
        `🔧 DEBUG: Content index has ${contentIndexSize} indexed files`
      );

      if (contentIndexSize > 0) {
        const contentEntries = Array.from(
          this.searchEngine.contentIndex.entries()
        );
        const firstContentFile = contentEntries[0];
        console.log(
          `🔧 DEBUG: First content index entry:`,
          firstContentFile[0],
          "has",
          firstContentFile[1]?.fields?.length || 0,
          "fields and",
          firstContentFile[1]?.values?.length || 0,
          "values"
        );

        // Look for files with actual content (fields/values OR parsedContent)
        const filesWithContent = contentEntries.filter(
          ([path, data]) =>
            data.fields?.length > 0 ||
            data.values?.length > 0 ||
            data.parsedContent
        );
        console.log(
          `🔧 DEBUG: Files with actual content: ${filesWithContent.length}`
        );

        if (filesWithContent.length > 0) {
          const sampleFile = filesWithContent[0];
          console.log(`🔧 DEBUG: Sample file with content:`, sampleFile[0]);
          console.log(
            `🔧 DEBUG: Sample fields:`,
            sampleFile[1].fields?.slice(0, 5)
          );
          console.log(
            `🔧 DEBUG: Sample values:`,
            sampleFile[1].values?.slice(0, 5)
          );
          console.log(
            `🔧 DEBUG: Has parsedContent:`,
            !!sampleFile[1].parsedContent
          );
          if (sampleFile[1].parsedContent) {
            console.log(
              `🔧 DEBUG: Sample parsedContent keys:`,
              Object.keys(sampleFile[1].parsedContent)
            );
          }
        }

        // Check if the query matches any indexed content (including parsedContent)
        const queryLower = String(query).toLowerCase();
        let potentialMatches = 0;
        for (const [path, data] of contentEntries) {
          if (
            data.fields?.some((field) =>
              field.toLowerCase().includes(queryLower)
            ) ||
            data.values?.some((value) =>
              String(value).toLowerCase().includes(queryLower)
            ) ||
            (data.parsedContent &&
              JSON.stringify(data.parsedContent)
                .toLowerCase()
                .includes(queryLower))
          ) {
            potentialMatches++;
          }
        }
        console.log(
          `🔧 DEBUG: Potential matches for "${query}": ${potentialMatches}`
        );
      }

      // 🔧 FIX: Use async searchEngine.searchContent that reads fresh from index file
      const rawResults = await this.searchEngine.searchContent(String(query));
      const contentResults = Array.isArray(rawResults) ? rawResults : [];

      console.log(
        `🔧 DEBUG: searchContent returned ${
          contentResults ? contentResults.length : "null/undefined"
        } results`
      );

      if (!Array.isArray(contentResults)) {
        console.error(
          `🔧 ERROR: searchContent returned non-array:`,
          typeof contentResults,
          contentResults
        );
        return [];
      }

      const mappedResults = contentResults.map((result) => ({
        ...result,
        source: "content",
        matchReason: `Content contains "${query}"`,
        relevanceScore: this.calculateContentRelevance(result, query),
      }));

      console.log(
        `🔧 DEBUG: searchContent returning ${mappedResults.length} results`
      );
      return mappedResults;
    } catch (error) {
      console.error("Content search failed:", error);
      return [];
    }
  }

  /**
   * Enhance query with intelligent understanding
   */
  enhanceQuery(query) {
    const queryStr = String(query); // Ensure query is a string
    const enhanced = {
      original: queryStr,
      normalized: queryStr.toLowerCase().trim(),
      words: queryStr
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word.length > 1),
      fileTypeHints: this.detectFileTypeIntention(queryStr),
      isSemanticQuery: this.isSemanticQuery(queryStr),
    };

    return enhanced;
  }

  /**
   * Detect if query implies specific file types
   */
  detectFileTypeIntention(query) {
    const hints = [];
    const queryLower = String(query).toLowerCase();

    const typeMap = {
      spreadsheet: ["csv", "xlsx", "xls"],
      document: ["doc", "docx", "pdf", "txt"],
      data: ["json", "csv", "parquet", "xml"],
      image: ["jpg", "jpeg", "png", "gif", "svg"],
      code: ["js", "py", "java", "cpp", "html", "css"],
      config: ["json", "yaml", "yml", "toml", "ini"],
    };

    for (const [keyword, extensions] of Object.entries(typeMap)) {
      if (queryLower.includes(keyword)) {
        hints.push(...extensions);
      }
    }

    return [...new Set(hints)]; // Remove duplicates
  }

  /**
   * Check if query is semantic in nature
   */
  isSemanticQuery(query) {
    const semanticIndicators = [
      "similar to",
      "related to",
      "like",
      "about",
      "containing",
      "financial",
      "report",
      "analysis",
      "summary",
      "data about",
    ];

    return semanticIndicators.some((indicator) =>
      String(query).toLowerCase().includes(indicator)
    );
  }

  /**
   * Intelligent result fusion with deduplication and ranking
   */
  fuseResults(query, results) {
    const seen = new Map();
    const fused = [];

    // Combine all results with source tracking
    const allResults = [
      ...results.filename.map((r) => ({ ...r, source: "filename" })),
      ...results.content.map((r) => ({ ...r, source: "content" })),
      ...results.semantic.map((r) => ({ ...r, source: "semantic" })),
    ];

    // Group by file path and combine scores
    for (const result of allResults) {
      const key = result.path;

      if (seen.has(key)) {
        const existing = seen.get(key);

        // Combine sources and scores
        existing.sources.push(result.source);
        existing.totalScore +=
          (result.relevanceScore || 0) + (result.similarity * 100 || 0);
        existing.matchReasons.push(result.matchReason);

        // Use best snippet
        if (
          result.snippet &&
          result.snippet.length > (existing.snippet?.length || 0)
        ) {
          existing.snippet = result.snippet;
        }
      } else {
        const fusedResult = {
          ...result,
          sources: [result.source],
          totalScore:
            (result.relevanceScore || 0) + (result.similarity * 100 || 0),
          matchReasons: [result.matchReason].filter(Boolean),
          searchQuery: query,
        };

        seen.set(key, fusedResult);
        fused.push(fusedResult);
      }
    }

    // Apply intelligent ranking
    return this.rankResults(fused, query);
  }

  /**
   * Intelligent result ranking
   */
  rankResults(results, query) {
    return results
      .map((result) => ({
        ...result,
        finalScore: this.calculateFinalScore(result, query),
      }))
      .sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Calculate final relevance score
   */
  calculateFinalScore(result, query) {
    let score = result.totalScore || 0;

    // Boost for multiple source matches
    if (result.sources.length > 1) {
      score *= 1.5;
    }

    // Boost for exact filename matches
    if (
      result.sources.includes("filename") &&
      result.filename.toLowerCase().includes(String(query).toLowerCase())
    ) {
      score *= 2;
    }

    // Boost for semantic relevance
    if (result.sources.includes("semantic") && result.similarity > 0.7) {
      score *= 1.3;
    }

    // Recency boost (newer files slightly preferred)
    if (result.modifiedDate) {
      const daysSinceModified =
        (Date.now() - new Date(result.modifiedDate).getTime()) /
        (1000 * 60 * 60 * 24);
      if (daysSinceModified < 30) {
        score *= 1.1;
      }
    }

    // File type relevance
    const fileType = this.searchEngine.getFileType(
      result.name || result.filename || ""
    );
    if (this.isRelevantFileType(fileType, query)) {
      score *= 1.1;
    }

    return score;
  }

  /**
   * Check if file type is relevant to query
   */
  isRelevantFileType(fileType, query) {
    const queryLower = String(query).toLowerCase();

    if (
      queryLower.includes("data") &&
      ["csv", "json", "parquet"].includes(fileType)
    ) {
      return true;
    }

    if (
      queryLower.includes("document") &&
      ["pdf", "doc", "docx", "txt"].includes(fileType)
    ) {
      return true;
    }

    if (
      queryLower.includes("spreadsheet") &&
      ["csv", "xlsx", "xls"].includes(fileType)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Calculate content relevance score
   */
  calculateContentRelevance(result, query) {
    let score = 50; // Base score for content match

    const queryWords = String(query).toLowerCase().split(/\s+/);
    const content = (result.snippet || "").toLowerCase();

    // Count word matches in content
    const matches = queryWords.filter((word) => content.includes(word)).length;
    score += matches * 10;

    // Boost for multiple matches
    if (matches > 1) {
      score *= 1.2;
    }

    return score;
  }

  /**
   * Generate path snippet for display
   */
  generatePathSnippet(path, query) {
    const pathParts = path.split("/");
    const relevantParts = pathParts.filter((part) =>
      part.toLowerCase().includes(String(query).toLowerCase())
    );

    if (relevantParts.length > 0) {
      return `.../${relevantParts.join("/")}/...`;
    }

    return path.length > 50 ? "..." + path.slice(-47) : path;
  }

  /**
   * Get search statistics
   */
  async getSearchStats() {
    const stats = {
      unifiedSearchReady: !!this.searchEngine,
      semanticSearchReady: this.isSemanticReady,
    };

    if (this.searchEngine) {
      try {
        const indexedFiles = await this.searchEngine.getIndexedFiles();
        stats.indexedFiles = indexedFiles.length;
      } catch (error) {
        console.warn("Failed to get indexed files count:", error);
        stats.indexedFiles = 0;
      }
    }

    if (this.isSemanticReady) {
      const semanticStats = await this.semanticEngine.getStats();
      stats.semanticIndex = semanticStats;
    }

    return stats;
  }

  /**
   * Add file to semantic index
   */
  async addToSemanticIndex(fileData) {
    if (this.isSemanticReady) {
      await this.semanticEngine.addFileEmbedding(fileData);
    }
  }

  /**
   * Find similar files using semantic search
   */
  async findSimilarFiles(filePath, limit = 10) {
    if (this.isSemanticReady) {
      return await this.semanticEngine.findSimilarFiles(filePath, limit);
    }
    return [];
  }
}

export default UnifiedSearchEngine;
