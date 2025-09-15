/**
 * Advanced Search and Filter Engine for File Explorer
 * Provides fast, accurate search and filtering capabilities with content indexing
 */

import _ from "lodash";
import Fuse from "fuse.js";
import UnifiedSearchEngine from "./unifiedSearchEngine.js";
import BrowserSemanticSearchEngine from "./BrowserSemanticSearchEngine.js";

export class SearchEngine {
  constructor(connectionId = null) {
    console.log(
      `🔧 SearchEngine constructor called with connectionId: "${connectionId}"`
    );
    this.connectionId = connectionId; // Store connection ID for file naming
    this.fileIndex = new Map();
    this.contentIndex = new Map(); // New: Store file content
    this.schemaIndex = new Map(); // New: Store file schemas
    this.searchHistory = new Set();
    this.maxHistorySize = 50;
    this.contentCache = new Map(); // Cache for processed content
    this.maxCacheSize = 100;
    this.indexingQueue = new Set(); // Track files being indexed

    // Background indexing properties
    this.isIndexing = false;
    this.indexingProgress = { current: 0, total: 0, fileName: "" };
    this.indexingCallbacks = new Set(); // For progress updates
    this.indexingPaused = false;
    this.indexingBatchSize = 10; // ⚡ OPTIMIZED: Increased from 5 to 10 files at a time
    this.concurrentDownloads = 200; // 🔥 LUDICROUS SPEED: Maximum possible concurrent downloads
    this.maxConcurrentDownloads = 200; // 🔥 ABSOLUTE MAX: Push the limits for ultimate speed
    this.adaptiveScaling = true; // ⚡ FEATURE: Enable adaptive scaling based on success rate
    this.requestQueue = []; // ⚡ NEW: Request batching for better performance
    this.processingQueue = false; // ⚡ NEW: Queue processing flag
    this.extensionCache = new Map(); // ⚡ NEW: Cache file extensions to avoid repeated parsing
    this.maxFileSize = 50 * 1024 * 1024; // 50MB limit for indexing

    // Storage initialization tracking
    this.storageReady = false; // ✅ NEW: Track if storage has been initialized

    // Unified search engine for semantic + traditional search
    this.unifiedSearch = new UnifiedSearchEngine();
    this.isUnifiedSearchReady = false;

    // Note: Indexes will be loaded when initializeStorage() is called from the UI
  }

  /**
   * Build searchable index from files
   */
  buildIndex(files, currentPath = "/") {
    files.forEach((file) => {
      const fullPath = this.normalizePath(`${currentPath}/${file.name}`);
      const indexEntry = {
        ...file,
        fullPath,
        searchableText: this.buildSearchableText(file),
        lastIndexed: Date.now(),
        parentPath: currentPath,
      };
      this.fileIndex.set(fullPath, indexEntry);
    });
  }

  /**
   * Build content index for JSON and Parquet files
   */
  async buildContentIndex(file, content) {
    if (!content || file.isDirectory) {
      return;
    }

    const fullPath = file.fullPath || file.name;

    // Check if already being indexed
    if (this.indexingQueue.has(fullPath)) {
      return;
    }

    this.indexingQueue.add(fullPath);

    try {
      let contentData = {};
      const extension = file.name.split(".").pop()?.toLowerCase();

      if (extension === "json") {
        contentData = this.indexJsonContent(content);
      } else if (extension === "parquet") {
        contentData = await this.indexParquetContent(content);
      }

      if (contentData.fields || contentData.values) {
        this.contentIndex.set(fullPath, {
          ...contentData,
          lastIndexed: Date.now(),
          fileSize: file.size,
          // ✅ FIXED: Add file metadata needed for change detection
          size: file.size,
          mtime: this.getFileModifiedTime(file),
          name: file.name,
        });

        // Update file index with content searchable text
        const fileEntry = this.fileIndex.get(fullPath);
        if (fileEntry) {
          fileEntry.searchableText += ` ${contentData.searchableText || ""}`;
          fileEntry.hasContentIndex = true;
          this.fileIndex.set(fullPath, fileEntry);
        }

        // Manage cache size
        this.manageCacheSize();
      }
    } catch (error) {
      console.error(`Failed to index content for ${file.name}:`, error);
    } finally {
      this.indexingQueue.delete(fullPath);
    }
  }

  /**
   * Index JSON file content - Store only essential search data
   */
  indexJsonContent(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      const fields = this.extractJsonFields(data);
      const values = this.extractJsonValues(data);

      // Create searchable text from fields and values
      const searchableText = `${fields.join(" ")} ${values.join(
        " "
      )}`.toLowerCase();

      console.log(
        `🔧 JSON indexed: ${fields.length} fields, ${values.length} values`
      );

      return {
        type: "json",
        searchableText: searchableText,
        recordCount: Array.isArray(data) ? data.length : 1,
        fullyIndexed: true,
      };
    } catch (error) {
      console.error("JSON parsing error:", error);
      return {
        type: "json",
        searchableText: `json-parse-error: ${error.message}`,
        recordCount: 0,
        fullyIndexed: false,
      };
    }
  }

  /**
   * Index Parquet file content - ALWAYS parse and index completely
   */
  async indexParquetContent(arrayBuffer) {
    try {
      console.log(`🔧 Parsing Parquet file (${arrayBuffer.byteLength} bytes)`);

      let parsedData = null;
      let parseMethod = "unknown";

      // Method 1: Try parquet-wasm (browser-compatible)
      try {
        if (typeof window !== "undefined" && window.parquet) {
          const table = window.parquet.readParquet(new Uint8Array(arrayBuffer));
          const records = [];

          // Convert Arrow table to regular objects
          for (let i = 0; i < table.numRows; i++) {
            const record = {};
            for (let j = 0; j < table.schema.fields.length; j++) {
              const field = table.schema.fields[j];
              const column = table.getChild(j);
              record[field.name] = column.get(i);
            }
            records.push(record);
          }

          parsedData = records;
          parseMethod = "parquet-wasm";
          console.log(
            `✅ Parquet parsed with parquet-wasm: ${records.length} rows`
          );
        }
      } catch (wasmError) {
        console.warn("parquet-wasm parsing failed:", wasmError);
      }

      // Method 2: Use main process (Node.js environment with @dsnp/parquetjs)
      if (
        !parsedData &&
        window.electronAPI &&
        window.electronAPI.parseParquet
      ) {
        try {
          const result = await window.electronAPI.parseParquet(arrayBuffer);
          if (result.success && result.data) {
            parsedData = result.data;
            parseMethod = "main-process";
            console.log(
              `✅ Parquet parsed via main process: ${parsedData.length} rows`
            );
          }
        } catch (mainProcessError) {
          console.warn(
            "Main process parquet parsing failed:",
            mainProcessError
          );
        }
      }

      // If we successfully parsed the data, index it optimally for search
      if (parsedData && parsedData.length > 0) {
        const allValues = parsedData.flatMap((row) =>
          Object.values(row).filter((v) => v != null)
        );
        const searchableText = allValues
          .map((v) => String(v))
          .join(" ")
          .toLowerCase();

        console.log(
          `🔧 ✅ Parquet indexed: ${parsedData.length} rows, ${allValues.length} searchable values`
        );

        return {
          type: "parquet",
          searchableText: searchableText,
          recordCount: parsedData.length,
          parseMethod: parseMethod,
          fullyIndexed: true,
        };
      }

      // If all parsing methods failed, this is an error condition
      throw new Error(
        "All parquet parsing methods failed - file may be corrupted or unsupported format"
      );
    } catch (error) {
      console.error("❌ CRITICAL: Parquet parsing completely failed:", error);

      // Return minimal data but mark as failed
      return {
        type: "parquet",
        searchableText: `parquet-file-parse-error: ${error.message}`,
        recordCount: 0,
        error: error.message,
        fullyIndexed: false,
        parseMethod: "failed",
      };
    }
  }

  /**
   * Extract field names from JSON data
   */
  extractJsonFields(obj, prefix = "", maxDepth = 5) {
    if (maxDepth <= 0) return [];

    const fields = [];

    if (Array.isArray(obj)) {
      if (obj.length > 0 && typeof obj[0] === "object") {
        fields.push(...this.extractJsonFields(obj[0], prefix, maxDepth - 1));
      }
    } else if (obj && typeof obj === "object") {
      for (const [key, value] of Object.entries(obj)) {
        const fieldName = prefix ? `${prefix}.${key}` : key;
        fields.push(fieldName);

        if (typeof value === "object" && value !== null) {
          fields.push(
            ...this.extractJsonFields(value, fieldName, maxDepth - 1)
          );
        }
      }
    }

    return fields;
  }

  /**
   * Extract searchable values from JSON data (optimized for performance)
   */
  extractJsonValues(obj, maxValues = 500) {
    const values = [];
    const seen = new Set();

    const extract = (item) => {
      if (values.length >= maxValues) return;

      if (Array.isArray(item)) {
        // ⚡ PERFORMANCE: Use for loop instead of forEach for better performance
        const len = Math.min(item.length, 100); // Reasonable limit for large arrays
        for (let i = 0; i < len; i++) {
          extract(item[i]);
        }
      } else if (item && typeof item === "object") {
        // ⚡ PERFORMANCE: Use Object.values with for loop
        const objectValues = Object.values(item);
        for (let i = 0; i < objectValues.length; i++) {
          extract(objectValues[i]);
        }
      } else if (item !== null && item !== undefined) {
        const valueStr = String(item);
        if (!seen.has(valueStr) && valueStr.length < 200) {
          // Increased from 100 to capture more data
          seen.add(valueStr);
          values.push(valueStr);
        }
      }
    };

    extract(obj);
    return values;
  }

  /**
   * Infer schema from JSON data
   */
  inferJsonSchema(data) {
    const inferType = (value) => {
      if (value === null) return "null";
      if (Array.isArray(value)) return "array";
      if (typeof value === "object") return "object";
      if (typeof value === "number")
        return Number.isInteger(value) ? "integer" : "number";
      if (typeof value === "boolean") return "boolean";
      if (typeof value === "string") {
        // Try to detect common formats
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
        if (/^[\w-]+@[\w-]+\.[\w-]+$/.test(value)) return "email";
        return "string";
      }
      return "unknown";
    };

    const buildSchema = (obj, maxDepth = 3) => {
      if (maxDepth <= 0) return "object";

      if (Array.isArray(obj)) {
        if (obj.length === 0) return { type: "array", items: "unknown" };
        return {
          type: "array",
          items: buildSchema(obj[0], maxDepth - 1),
          length: obj.length,
        };
      } else if (obj && typeof obj === "object") {
        const schema = { type: "object", properties: {} };
        for (const [key, value] of Object.entries(obj)) {
          schema.properties[key] = buildSchema(value, maxDepth - 1);
        }
        return schema;
      } else {
        return inferType(obj);
      }
    };

    return buildSchema(data);
  }

  /**
   * Analyze JSON structure for better search insights
   */
  analyzeJsonStructure(data) {
    const structure = {
      type: Array.isArray(data) ? "array" : "object",
      depth: this.calculateDepth(data),
      hasNestedObjects: this.hasNestedObjects(data),
      commonFields: [],
      dataTypes: new Set(),
    };

    if (Array.isArray(data) && data.length > 0) {
      structure.itemCount = data.length;
      structure.commonFields = this.findCommonFields(data);
    }

    return structure;
  }

  /**
   * Calculate maximum depth of nested structure
   */
  calculateDepth(obj, currentDepth = 0) {
    if (currentDepth > 10) return currentDepth; // Prevent infinite recursion

    if (Array.isArray(obj)) {
      if (obj.length === 0) return currentDepth;
      return Math.max(
        ...obj
          .slice(0, 5)
          .map((item) => this.calculateDepth(item, currentDepth + 1))
      );
    } else if (obj && typeof obj === "object") {
      const depths = Object.values(obj).map((value) =>
        this.calculateDepth(value, currentDepth + 1)
      );
      return depths.length > 0 ? Math.max(...depths) : currentDepth;
    }

    return currentDepth;
  }

  /**
   * Check if data has nested objects
   */
  hasNestedObjects(obj) {
    if (Array.isArray(obj)) {
      return obj.some((item) => typeof item === "object" && item !== null);
    } else if (obj && typeof obj === "object") {
      return Object.values(obj).some(
        (value) => typeof value === "object" && value !== null
      );
    }
    return false;
  }

  /**
   * Find common fields across array items
   */
  findCommonFields(array) {
    if (!Array.isArray(array) || array.length === 0) return [];

    const firstItem = array[0];
    if (typeof firstItem !== "object" || firstItem === null) return [];

    const firstKeys = new Set(Object.keys(firstItem));
    const sampleSize = Math.min(array.length, 10);

    for (let i = 1; i < sampleSize; i++) {
      if (typeof array[i] === "object" && array[i] !== null) {
        const currentKeys = new Set(Object.keys(array[i]));
        // Keep only keys that exist in both sets
        for (const key of firstKeys) {
          if (!currentKeys.has(key)) {
            firstKeys.delete(key);
          }
        }
      }
    }

    return Array.from(firstKeys);
  }

  /**
   * Manage content cache size
   */
  manageCacheSize() {
    if (this.contentIndex.size > this.maxCacheSize) {
      // Remove oldest entries
      const entries = Array.from(this.contentIndex.entries());
      entries.sort((a, b) => a[1].lastIndexed - b[1].lastIndexed);

      const toRemove = entries.slice(0, entries.length - this.maxCacheSize);
      toRemove.forEach(([key]) => {
        this.contentIndex.delete(key);
      });
    }
  }

  /**
   * Check if file is indexable for content search
   */
  isContentIndexable(file) {
    if (file.isDirectory) return false;

    const extension = file.name.split(".").pop()?.toLowerCase();
    const supportedExtensions = ["json", "parquet"];
    const maxSize = 10 * 1024 * 1024; // 10MB limit

    return supportedExtensions.includes(extension) && file.size <= maxSize;
  }

  /**
   * Get content index for a file
   */
  getContentIndex(filePath) {
    return this.contentIndex.get(filePath);
  }

  /**
   * Search within file content
   */
  searchContent(query, filters = {}) {
    const results = [];
    const searchQuery = query.toLowerCase();

    console.log(
      `🔍 SEARCH DEBUG: Searching for "${searchQuery}" in ${this.contentIndex.size} files`
    );

    for (const [filePath, contentData] of this.contentIndex.entries()) {
      const fileEntry = this.fileIndex.get(filePath);
      if (!fileEntry) continue;

      let matches = [];

      // Search in field names (if available)
      if (filters.searchFields !== false && contentData.fields) {
        contentData.fields.forEach((field) => {
          if (field.toLowerCase().includes(searchQuery)) {
            matches.push({
              type: "field",
              value: field,
              context: "Field name",
            });
          }
        });
      }

      // Search in values (if available)
      if (filters.searchValues !== false && contentData.values) {
        contentData.values.forEach((value) => {
          if (String(value).toLowerCase().includes(searchQuery)) {
            matches.push({
              type: "value",
              value: value,
              context: "Field value",
            });
          }
        });
      }

      // 🔧 IMPROVED: Search in searchableText (most efficient for full content search)
      if (filters.searchContent !== false && contentData.searchableText) {
        if (contentData.searchableText.toLowerCase().includes(searchQuery)) {
          matches.push({
            type: "content",
            value: query,
            context: "Content match",
          });
        }
      }

      // 🔧 LEGACY: Search in parsedContent (if it exists from old indexing)
      if (contentData.parsedContent && filters.searchParsedContent !== false) {
        const contentStr = JSON.stringify(
          contentData.parsedContent
        ).toLowerCase();
        if (contentStr.includes(searchQuery)) {
          matches.push({
            type: "content",
            value: query,
            context: "JSON content",
          });
        }
      }

      // Search in schema
      if (filters.searchSchema && contentData.schema) {
        const schemaStr = JSON.stringify(contentData.schema).toLowerCase();
        if (schemaStr.includes(searchQuery)) {
          matches.push({
            type: "schema",
            value: query,
            context: "Data schema",
          });
        }
      }

      if (matches.length > 0) {
        console.log(
          `🔍 FOUND MATCHES in ${filePath}: ${matches.length} matches`
        );
        results.push({
          ...fileEntry,
          contentMatches: matches.slice(0, 10), // Limit matches
          contentData: {
            type: contentData.type,
            recordCount: contentData.recordCount,
            structure: contentData.structure,
          },
        });
      }
    }

    console.log(
      `🔍 SEARCH COMPLETE: Found ${results.length} files with matches`
    );
    return results;
  }

  /**
   * Add search query to history
   */
  addToHistory(query) {
    if (query && query.trim().length > 0) {
      this.searchHistory.add(query.trim());
      if (this.searchHistory.size > this.maxHistorySize) {
        const firstItem = this.searchHistory.values().next().value;
        this.searchHistory.delete(firstItem);
      }
    }
  }

  /**
   * Get search history as array
   */
  getHistory() {
    return Array.from(this.searchHistory).reverse();
  }

  /**
   * Clear search history
   */
  clearHistory() {
    this.searchHistory.clear();
  }

  /**
   * Build searchable text from file metadata
   */
  buildSearchableText(file) {
    const parts = [
      file.name.toLowerCase(),
      this.getFileExtension(file.name),
      file.isDirectory ? "folder directory" : "file",
    ];

    // Add file type categories
    if (!file.isDirectory) {
      const fileType = this.getFileType(file.name);
      if (fileType) {
        parts.push(fileType);
      }
    }

    return parts.filter(Boolean).join(" ");
  }

  /**
   * Main search function with unified intelligent search
   */
  async search(query = "", filters = {}, scope = "all") {
    // 🛡️ SAFETY: Ensure query is a string to prevent [object Object] errors
    if (typeof query !== "string") {
      console.error(
        "⚠️ Invalid query type in searchEngine:",
        typeof query,
        query
      );
      return [];
    }

    console.log(
      `🔍 Main search called - Query: "${query}", Unified ready: ${this.isUnifiedSearchReady}, Scope: ${scope}, FileIndex size: ${this.fileIndex.size}, ContentIndex size: ${this.contentIndex.size}`
    );

    // If unified search is ready, use it for better results
    if (this.isUnifiedSearchReady && query.trim()) {
      try {
        console.log("🧠 Using unified search for:", query);
        const unifiedResults = await this.unifiedSearch.search(query, {
          limit: 200, // 🔧 INCREASED: Match unified search engine limit
          includeSemanticSearch: false, // 🚫 DISABLED TEMPORARILY
        });

        // Apply scope and additional filters
        let results = unifiedResults;

        if (scope !== "all") {
          results = results.filter((file) => file.path?.startsWith(scope));
        }

        results = this.applyFilters(results, filters);

        // Add to search history
        this.addToHistory(query);

        console.log(`✅ Unified search results: ${results.length}`);
        return results;
      } catch (error) {
        console.warn(
          "⚠️ Unified search failed, falling back to traditional search:",
          error
        );
      }
    }

    // Fallback to traditional search
    console.log("🔄 Falling back to traditional search");
    return this.traditionalSearch(query, filters, scope);
  }

  /**
   * Traditional search method (fallback)
   */
  traditionalSearch(query = "", filters = {}, scope = "all") {
    const searchQuery = query.trim().toLowerCase();
    let results = Array.from(this.fileIndex.values());

    console.log(
      `🔍 Traditional search - Query: "${query}", Index size: ${this.fileIndex.size}, Initial results: ${results.length}`
    );

    // Debug: Show what files are actually in the index
    console.log("📋 Current index contents (first 10 files):");
    results.slice(0, 10).forEach((file, i) => {
      console.log(
        `  ${i + 1}. ${file.name} (${
          file.path
        }) - SearchText: "${file.searchableText?.substring(0, 50)}..."`
      );
    });

    // Debug: Show some file names that might contain the search term
    if (query === "0007183108") {
      console.log("🔍 Looking for files that might contain '0007183108':");
      const possibleMatches = results.filter(
        (file) =>
          file.name?.includes("0007183108") ||
          file.path?.includes("0007183108") ||
          (file.searchableText && file.searchableText.includes("0007183108"))
      );
      console.log(
        `Found ${possibleMatches.length} possible direct matches:`,
        possibleMatches.slice(0, 5).map((f) => f.name)
      );
    }

    // Apply scope filter
    if (scope !== "all") {
      results = results.filter((file) => file.parentPath === scope);
      console.log(
        `🎯 After scope filter ("${scope}"): ${results.length} results`
      );
    }

    // Apply text search
    if (searchQuery) {
      const beforeTextSearch = results.length;
      results = this.applyTextSearch(results, searchQuery);
      console.log(
        `📝 After text search ("${searchQuery}"): ${results.length} results (was ${beforeTextSearch})`
      );
      this.addToHistory(query);
    }

    // Apply filters
    const beforeFilters = results.length;
    results = this.applyFilters(results, filters);
    console.log(
      `🔧 After filters: ${results.length} results (was ${beforeFilters})`
    );

    // Sort results by relevance
    if (searchQuery) {
      results = this.sortByRelevance(results, searchQuery);
    }

    console.log(`✅ Final traditional search results: ${results.length}`);
    return results;
  }

  /**
   * Apply text search with various matching strategies
   */
  applyTextSearch(files, query) {
    if (!query) return files;

    const patterns = this.parseSearchQuery(query);
    console.log(`📋 Search patterns for "${query}":`, patterns);

    // Check a few sample files to see their searchableText content
    console.log("🔍 Sample file searchableText content:");
    files.slice(0, 3).forEach((file) => {
      console.log(
        `  - ${file.name}: "${file.searchableText?.substring(0, 200)}..."`
      );
    });

    const results = files.filter((file) => {
      const matches = patterns.some((pattern) =>
        this.matchesPattern(file, pattern)
      );
      if (matches) {
        console.log(`✅ Match found: ${file.name} (${file.path})`);
      }
      return matches;
    });

    console.log(
      `🔍 Text search filtered ${files.length} files down to ${results.length} matches`
    );
    return results;
  }

  /**
   * Parse search query to extract patterns and operators
   */
  parseSearchQuery(query) {
    const patterns = [];

    // Handle quoted phrases
    const quotedMatches = query.match(/"([^"]+)"/g);
    if (quotedMatches) {
      quotedMatches.forEach((match) => {
        const phrase = match.slice(1, -1);
        patterns.push({ type: "phrase", value: phrase });
        query = query.replace(match, "");
      });
    }

    // Handle wildcards
    const wildcardMatches = query.match(/\S*[*?]\S*/g);
    if (wildcardMatches) {
      wildcardMatches.forEach((match) => {
        patterns.push({ type: "wildcard", value: match });
        query = query.replace(match, "");
      });
    }

    // Handle remaining words
    const words = query.trim().split(/\s+/).filter(Boolean);
    words.forEach((word) => {
      patterns.push({ type: "word", value: word });
    });

    return patterns;
  }

  /**
   * Check if file matches a search pattern
   */
  matchesPattern(file, pattern) {
    const searchText = file.searchableText || "";

    // Debug: Show first few matches to understand the data
    if (Math.random() < 0.01) {
      // 1% sampling to avoid spam
      console.log(
        `🔍 Debug sample - File: ${
          file.name
        }, SearchText: "${searchText?.substring(0, 100)}...", Pattern: ${
          pattern.value
        }`
      );
    }

    switch (pattern.type) {
      case "phrase":
        return searchText.includes(pattern.value.toLowerCase());

      case "wildcard":
        return this.matchesWildcard(
          file.name.toLowerCase(),
          pattern.value.toLowerCase()
        );

      case "word":
        return searchText.includes(pattern.value.toLowerCase());

      default:
        return false;
    }
  }

  /**
   * Match wildcard patterns (* and ?)
   */
  matchesWildcard(text, pattern) {
    const regex = new RegExp(
      pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, "."),
      "i"
    );
    return regex.test(text);
  }

  /**
   * Apply advanced filters
   */
  applyFilters(files, filters) {
    let filtered = [...files];

    // File type filter
    if (filters.fileTypes?.length > 0) {
      filtered = filtered.filter((file) => {
        if (file.isDirectory) return false;
        const fileType = this.getFileType(file.name);
        return filters.fileTypes.includes(fileType);
      });
    }

    // Size filter
    if (filters.sizeRanges?.length > 0) {
      filtered = filtered.filter((file) => {
        if (file.isDirectory) return true; // Always include directories
        return this.matchesSizeFilter(file.size || 0, filters.sizeRanges);
      });
    }

    // Date filter
    if (filters.dateRange) {
      filtered = filtered.filter((file) => {
        return this.matchesDateFilter(
          file,
          filters.dateRange,
          filters.customDateFrom,
          filters.customDateTo
        );
      });
    }

    // Item type filter
    if (filters.itemType && filters.itemType !== "all") {
      filtered = filtered.filter((file) => {
        if (filters.itemType === "files") return !file.isDirectory;
        if (filters.itemType === "folders") return file.isDirectory;
        return true;
      });
    }

    // Hidden files filter
    if (!filters.showHidden) {
      filtered = filtered.filter((file) => !file.name.startsWith("."));
    }

    return filtered;
  }

  /**
   * Check if file size matches size filter
   */
  matchesSizeFilter(size, sizeRanges) {
    const sizeMap = {
      tiny: { min: 0, max: 1024 },
      small: { min: 1024, max: 1024 * 1024 },
      medium: { min: 1024 * 1024, max: 100 * 1024 * 1024 },
      large: { min: 100 * 1024 * 1024, max: 1024 * 1024 * 1024 },
      huge: { min: 1024 * 1024 * 1024, max: Infinity },
    };

    return sizeRanges.some((range) => {
      const { min, max } = sizeMap[range] || { min: 0, max: Infinity };
      return size >= min && size < max;
    });
  }

  /**
   * Check if file matches date filter
   */
  matchesDateFilter(file, dateRange, customFrom, customTo) {
    const fileDate = this.getFileDate(file);
    if (!fileDate) return false;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (dateRange) {
      case "today":
        return fileDate >= today;

      case "yesterday":
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return fileDate >= yesterday && fileDate < today;

      case "thisWeek":
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        return fileDate >= weekStart;

      case "lastWeek":
        const lastWeekEnd = new Date(today);
        lastWeekEnd.setDate(lastWeekEnd.getDate() - lastWeekEnd.getDay());
        const lastWeekStart = new Date(lastWeekEnd);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        return fileDate >= lastWeekStart && fileDate < lastWeekEnd;

      case "thisMonth":
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return fileDate >= monthStart;

      case "lastMonth":
        const lastMonthStart = new Date(
          now.getFullYear(),
          now.getMonth() - 1,
          1
        );
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
        return fileDate >= lastMonthStart && fileDate < lastMonthEnd;

      case "custom":
        if (customFrom || customTo) {
          const fromDate = customFrom ? new Date(customFrom) : new Date(0);
          const toDate = customTo
            ? new Date(customTo + "T23:59:59")
            : new Date();
          return fileDate >= fromDate && fileDate <= toDate;
        }
        return true;

      default:
        return true;
    }
  }

  /**
   * Sort results by relevance score
   */
  sortByRelevance(files, query) {
    return files.sort((a, b) => {
      const scoreA = this.calculateRelevanceScore(a, query);
      const scoreB = this.calculateRelevanceScore(b, query);
      return scoreB - scoreA;
    });
  }

  /**
   * Calculate relevance score for search result
   */
  calculateRelevanceScore(file, query) {
    let score = 0;
    const fileName = file.name.toLowerCase();
    const queryLower = query.toLowerCase();

    // Exact name match gets highest score
    if (fileName === queryLower) {
      score += 100;
    }

    // Name starts with query
    if (fileName.startsWith(queryLower)) {
      score += 50;
    }

    // Name contains query
    if (fileName.includes(queryLower)) {
      score += 25;
    }

    // Boost for files vs directories based on context
    if (!file.isDirectory) {
      score += 5;
    }

    // Recent files get slight boost
    const daysSinceModified = this.getDaysSinceModified(file);
    if (daysSinceModified < 7) {
      score += 3;
    }

    // Penalize hidden files
    if (fileName.startsWith(".")) {
      score -= 10;
    }

    return score;
  }

  /**
   * Utility functions
   */
  normalizePath(path) {
    return path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  }

  getFileExtension(filename) {
    const lastDot = filename.lastIndexOf(".");
    return lastDot > 0 ? filename.slice(lastDot + 1).toLowerCase() : "";
  }

  getFileType(filename) {
    const extension = this.getFileExtension(filename);

    const typeMap = {
      // Documents
      pdf: "documents",
      doc: "documents",
      docx: "documents",
      txt: "documents",
      rtf: "documents",
      // Images
      jpg: "images",
      jpeg: "images",
      png: "images",
      gif: "images",
      bmp: "images",
      svg: "images",
      // Archives
      zip: "archives",
      rar: "archives",
      "7z": "archives",
      tar: "archives",
      gz: "archives",
      // Audio
      mp3: "audio",
      wav: "audio",
      flac: "audio",
      aac: "audio",
      ogg: "audio",
      // Video
      mp4: "video",
      avi: "video",
      mkv: "video",
      mov: "video",
      wmv: "video",
      // Code
      js: "code",
      ts: "code",
      py: "code",
      java: "code",
      cpp: "code",
      css: "code",
      html: "code",
      // Data
      json: "data",
      csv: "data",
      xml: "data",
      sql: "data",
      parquet: "data",
      // Text
      md: "text",
      log: "text",
      cfg: "text",
      ini: "text",
    };

    return typeMap[extension] || null;
  }

  getFileDate(file) {
    const dateField =
      file.modifiedTime ||
      file.modifiedAt ||
      file.lastModified ||
      file.modified;
    if (!dateField) return null;

    const date = new Date(dateField);
    return isNaN(date.getTime()) ? null : date;
  }

  getDaysSinceModified(file) {
    const fileDate = this.getFileDate(file);
    if (!fileDate) return Infinity;

    const now = new Date();
    const diffTime = Math.abs(now - fileDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Get file modified time as numeric timestamp
   */
  getFileModifiedTime(file) {
    const timeField =
      file.mtime || file.modifiedAt || file.modifiedTime || file.lastModified;
    if (!timeField) return Date.now(); // Fallback to current time

    if (typeof timeField === "number") {
      return timeField;
    }

    const timestamp = new Date(timeField).getTime();
    return isNaN(timestamp) ? Date.now() : timestamp;
  }

  /**
   * Start background indexing of all files
   */
  async startBackgroundIndexing(onProgress) {
    console.log("=== Starting Background Indexing ===");
    console.log(
      "Available electronAPI methods:",
      typeof window !== "undefined" && window.electronAPI
        ? Object.keys(window.electronAPI)
        : "none"
    );

    // Migrate existing indexes to optimized structure for backward compatibility
    this.migrateIndexesToFlatStructure();

    if (this.isIndexing) {
      console.log("⚠️  Indexing already in progress - ignoring new request");
      // Make sure the caller gets the current progress
      if (onProgress) {
        this.indexingCallbacks.add(onProgress);
        // Send current progress immediately
        onProgress(this.getIndexingStatus());
      }
      return;
    }

    this.isIndexing = true;
    this.indexingPaused = false;

    if (onProgress) {
      this.indexingCallbacks.add(onProgress);
    }

    try {
      console.log("About to call indexAllFiles...");
      await this.indexAllFiles();

      // Save indexes to storage when complete
      console.log("Indexing complete, saving to storage...");
      await this.saveIndexesToStorage();
    } catch (error) {
      console.error("Background indexing error:", error);
    } finally {
      this.isIndexing = false;
      this.notifyProgress({
        current: 0,
        total: 0,
        fileName: "",
        completed: true,
      });
      console.log("=== Background Indexing Finished ===");
    }
  }

  /**
   * Stop background indexing
   */
  stopBackgroundIndexing() {
    this.indexingPaused = true;
    this.isIndexing = false;
  }

  /**
   * Index all files recursively using electron API
   */
  async indexAllFiles(startPath = "/") {
    if (typeof window === "undefined" || !window.electronAPI) {
      console.error("Electron API not available for indexing");
      return;
    }

    // Check if we have a recent file discovery cache
    const cachedDiscovery = await this.loadFileDiscoveryCache();
    let filesToIndex = [];

    if (cachedDiscovery && this.isDiscoveryCacheValid(cachedDiscovery)) {
      console.log(
        `🎯 USING CACHED DISCOVERY: Found ${cachedDiscovery.files.length} files from previous discovery`
      );
      console.log(
        `   📅 Cache created: ${new Date(
          cachedDiscovery.timestamp
        ).toLocaleString()}`
      );
      console.log(`   ⚡ Skipping Phase 1 - jumping directly to Phase 2`);
      filesToIndex = cachedDiscovery.files;

      // Notify that we're using cache
      this.notifyProgress({
        ...this.indexingProgress,
        fileName: "Using cached file discovery...",
        phase: "cache",
        cached: true,
      });

      // Brief delay to show cache message
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Skip directly to Phase 2
    } else {
      // Check why we're not using cache
      if (cachedDiscovery) {
        console.log(
          `⚠️  CACHE EXPIRED: Discovery cache is stale (> 6 hours old)`
        );
        console.log(
          `   📅 Cache created: ${new Date(
            cachedDiscovery.timestamp
          ).toLocaleString()}`
        );
        console.log(`   🔄 Will re-discover all files...`);
      } else {
        console.log(`📂 NO CACHE FOUND: Starting fresh discovery...`);
      }

      // Need to perform Phase 1 - File Discovery
      console.log(
        `🔍 PHASE 1: Collecting indexable files starting from ${startPath}...`
      );
      this.notifyProgress({
        ...this.indexingProgress,
        fileName: "Discovering files...",
        phase: "collection",
      });

      await this.collectIndexableFiles(startPath, filesToIndex);

      console.log(
        `🔍 PHASE 1 COMPLETE: Found ${filesToIndex.length} indexable files`
      );

      // Save discovery results for future use
      await this.saveFileDiscoveryCache(filesToIndex);
    }

    if (filesToIndex.length === 0) {
      console.log("No indexable files found");
      return;
    }

    // 🚀 DIRECTORY OPTIMIZATION: For large datasets, optimize by directory patterns
    if (filesToIndex.length > 1000) {
      filesToIndex = this.optimizeFileListByDirectory(filesToIndex);
    }

    // ⚡ SIZE OPTIMIZATION: Process smaller files first for faster initial results
    if (filesToIndex.length > 100) {
      console.log(
        "🎯 PRIORITIZING SMALLER FILES: Sorting by file size for faster indexing"
      );
      filesToIndex.sort((a, b) => {
        // Primary sort: file size (smaller files first)
        const sizeA = a.size || 0;
        const sizeB = b.size || 0;
        if (sizeA !== sizeB) {
          return sizeA - sizeB;
        }
        // Secondary sort: file type (JSON/Parquet first)
        const extA = (a.name || "").toLowerCase().split(".").pop();
        const extB = (b.name || "").toLowerCase().split(".").pop();
        const priorityTypes = ["json", "parquet", "csv", "txt"];
        const priorityA = priorityTypes.indexOf(extA);
        const priorityB = priorityTypes.indexOf(extB);
        return (
          (priorityB === -1 ? 999 : priorityB) -
          (priorityA === -1 ? 999 : priorityA)
        );
      });
      console.log(
        `📊 File size distribution: Small (${
          filesToIndex.filter((f) => (f.size || 0) < 1024 * 1024).length
        }), Medium (${
          filesToIndex.filter(
            (f) =>
              (f.size || 0) >= 1024 * 1024 && (f.size || 0) < 10 * 1024 * 1024
          ).length
        }), Large (${
          filesToIndex.filter((f) => (f.size || 0) >= 10 * 1024 * 1024).length
        })`
      );
    }

    // 🚀 GLOBAL PRE-FILTERING: Filter out already-indexed files before batch processing
    console.log(
      `🔍 GLOBAL PRE-FILTER: Analyzing ${filesToIndex.length} files for indexing needs...`
    );
    const globalFilterStartTime = Date.now();

    const { needsIndexing, alreadyIndexed } =
      this.preFilterFilesForIndexing(filesToIndex);

    const globalFilterTime = Date.now() - globalFilterStartTime;
    console.log(`✅ GLOBAL PRE-FILTER complete in ${globalFilterTime}ms:`);
    console.log(`   📄 Files needing indexing: ${needsIndexing.length}`);
    console.log(`   ✓ Files already indexed: ${alreadyIndexed.length}`);
    console.log(
      `   📊 Global skip ratio: ${Math.round(
        (alreadyIndexed.length / filesToIndex.length) * 100
      )}%`
    );
    console.log(
      `   ⚡ Performance: ${Math.round(
        (filesToIndex.length / globalFilterTime) * 1000
      )} files/second`
    );

    // If nothing needs indexing, we're done!
    if (needsIndexing.length === 0) {
      console.log("🎉 All files already indexed - indexing complete!");
      this.indexingProgress.current = filesToIndex.length;
      this.indexingProgress.total = filesToIndex.length;
      this.notifyProgress({
        ...this.indexingProgress,
        fileName: "All files up to date",
        completed: true,
      });
      return;
    }

    // Update progress to reflect files already indexed
    this.indexingProgress.current = alreadyIndexed.length;
    this.indexingProgress.total = filesToIndex.length;
    this.notifyProgress({
      ...this.indexingProgress,
      fileName: `${alreadyIndexed.length} files already indexed`,
      phase: "filtering",
    });

    // Process only files that actually need indexing
    console.log(
      `📊 PHASE 2: Processing only ${needsIndexing.length} files that need indexing (skipping ${alreadyIndexed.length})...`
    );

    // Dynamic batch sizing based on dataset size and system performance
    let optimizedBatchSize;
    if (needsIndexing.length > 10000) {
      optimizedBatchSize = 100; // ⚡ OPTIMIZED: Large datasets: bigger batches (was 50)
    } else if (needsIndexing.length > 1000) {
      optimizedBatchSize = 50; // ⚡ OPTIMIZED: Medium datasets: bigger batches (was 25)
    } else {
      optimizedBatchSize = Math.min(30, this.indexingBatchSize * 6); // ⚡ OPTIMIZED: Small datasets: increased batches (was 20, *4)
    }

    console.log(
      `⚙️  Using optimized batch size: ${optimizedBatchSize} (dataset size: ${needsIndexing.length})`
    );

    for (let i = 0; i < needsIndexing.length; i += optimizedBatchSize) {
      if (this.indexingPaused) {
        break;
      }

      const batch = needsIndexing.slice(i, i + optimizedBatchSize);
      const batchStartTime = Date.now();

      // Use optimized processing since we know these files need indexing
      await this.processPreFilteredBatch(batch);

      const batchTime = Date.now() - batchStartTime;
      const filesPerSecond = Math.round((batch.length / batchTime) * 1000);
      console.log(
        `⚡ Batch ${
          Math.ceil(i / optimizedBatchSize) + 1
        } completed in ${batchTime}ms (${
          batch.length
        } files, ${filesPerSecond} files/sec)`
      );

      // ⚡ OPTIMIZED: Save indexes after fewer, larger batches - less I/O overhead
      const saveInterval = Math.max(1, Math.floor(200 / optimizedBatchSize)); // Increased from 100
      if (
        (i / optimizedBatchSize + 1) % saveInterval === 0 ||
        i + optimizedBatchSize >= needsIndexing.length
      ) {
        console.log(
          `💾 Saving incremental progress... (${this.indexingProgress.current}/${this.indexingProgress.total})`
        );
        await this.saveIndexesToStorage();

        // ⚡ PERFORMANCE: Clear extension cache periodically to manage memory
        if (this.extensionCache.size > 1000) {
          console.log("🧹 Clearing extension cache to manage memory");
          this.extensionCache.clear();
        }
      }

      // ⚡ OPTIMIZED: Minimal delay for faster processing
      await this.sleep(Math.max(5, 50 - optimizedBatchSize)); // Reduced from 100
    }
  }

  /**
   * Recursively collect all indexable files using electron API
   */
  async collectIndexableFiles(path, filesList) {
    try {
      console.log(`Scanning directory: ${path}`);
      const result = await window.electronAPI.ftpList(path);

      if (!result.success) {
        console.error(`Failed to list ${path}:`, result.error);
        return;
      }

      const files = result.data || [];
      console.log(`Found ${files.length} items in ${path}`);

      for (const file of files) {
        if (this.indexingPaused) break;

        if (file.isDirectory) {
          const subPath = `${path}/${file.name}`.replace(/\/+/g, "/");
          await this.collectIndexableFiles(subPath, filesList);
        } else if (this.isIndexableFile(file)) {
          const fullPath = `${path}/${file.name}`.replace(/\/+/g, "/");
          console.log(`Adding indexable file: ${fullPath}`);
          filesList.push({ ...file, fullPath });
        }
      }
    } catch (error) {
      console.error(`Error collecting files from ${path}:`, error);
    }
  }

  /**
   * Check if file should be indexed
   */
  isIndexableFile(file) {
    if (file.isDirectory) return false;
    if (file.size > this.maxFileSize) return false;

    const ext = file.name.toLowerCase().split(".").pop();
    const indexableExtensions = [
      "json",
      "parquet",
      "csv",
      "txt",
      "xml",
      "yaml",
      "yml",
    ];

    return indexableExtensions.includes(ext);
  }

  /**
   * Migrate existing indexes to optimized flat structure (backward compatibility)
   */
  migrateIndexesToFlatStructure() {
    let migratedCount = 0;

    for (const [filePath, indexData] of this.contentIndex) {
      if (indexData.fileMetadata && !indexData.size) {
        // Migrate from nested to flat structure
        const metadata = indexData.fileMetadata;
        indexData.size = metadata.size;
        indexData.mtime =
          typeof metadata.mtime === "number"
            ? metadata.mtime
            : new Date(metadata.mtime).getTime();
        indexData.name = metadata.name;

        // Remove old nested structure
        delete indexData.fileMetadata;
        migratedCount++;
      }
    }

    if (migratedCount > 0) {
      console.log(
        `📦 Migrated ${migratedCount} indexes to optimized flat structure`
      );
    }
  }

  /**
   * Advanced optimization: Group files by directory for bulk skipping
   */
  optimizeFileListByDirectory(files) {
    if (files.length < 1000) {
      // For smaller datasets, don't add directory grouping overhead
      return files;
    }

    console.log(`📁 Analyzing directory patterns for ${files.length} files...`);
    const directoryGroups = new Map();

    // Group files by directory
    for (const file of files) {
      const dirPath = file.fullPath.substring(
        0,
        file.fullPath.lastIndexOf("/")
      );
      if (!directoryGroups.has(dirPath)) {
        directoryGroups.set(dirPath, []);
      }
      directoryGroups.get(dirPath).push(file);
    }

    console.log(`📊 Found ${directoryGroups.size} unique directories`);

    // For very large datasets, prioritize processing directories with changes
    if (files.length > 10000) {
      const directoriesWithChanges = [];
      const directoriesWithoutChanges = [];

      for (const [dirPath, dirFiles] of directoryGroups) {
        const hasChanges = dirFiles.some((file) => {
          const existing = this.contentIndex.get(file.fullPath);
          return !existing || !this.isFileUnchanged(file, existing);
        });

        if (hasChanges) {
          directoriesWithChanges.push(...dirFiles);
        } else {
          directoriesWithoutChanges.push(...dirFiles);
        }
      }

      console.log(
        `📈 Optimization: ${directoriesWithChanges.length} files in changed directories, ${directoriesWithoutChanges.length} in unchanged directories`
      );

      // Process changed directories first, then unchanged ones
      return [...directoriesWithChanges, ...directoriesWithoutChanges];
    }

    return files;
  }

  /**
   * Pre-filter files to identify which ones need indexing (bulk optimization)
   */
  preFilterFilesForIndexing(files) {
    const needsIndexing = [];
    const alreadyIndexed = [];

    // For large datasets, reduce logging overhead
    const isLargeDataset = files.length > 1000;

    if (!isLargeDataset) {
      console.log(`🔍 Pre-filtering ${files.length} files for indexing...`);
    }

    // DEBUG: Show contentIndex size and sample keys for troubleshooting
    console.log(`🔍 DEBUG: contentIndex size: ${this.contentIndex.size}`);
    if (this.contentIndex.size > 0 && !isLargeDataset) {
      const sampleKeys = Array.from(this.contentIndex.keys()).slice(0, 3);
      console.log(`🔍 DEBUG: Sample contentIndex keys:`, sampleKeys);
    }

    const startTime = Date.now();

    // Cache extension parsing to avoid repeated string operations
    const indexableExtensions = new Set([
      "json",
      "parquet",
      "csv",
      "txt",
      "xml",
      "yaml",
      "yml",
    ]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Cache extension parsing
      if (!file.extension) {
        file.extension = file.name.toLowerCase().split(".").pop();
      }

      // Quick checks first
      if (
        !indexableExtensions.has(file.extension) ||
        file.size > this.maxFileSize
      ) {
        continue;
      }

      // ✅ FIXED: Use fullPath as the primary key (matches file structure)
      const indexKey = file.fullPath;
      const existing = this.contentIndex.get(indexKey);

      if (existing && this.isFileUnchanged(file, existing)) {
        alreadyIndexed.push(file);
        if (!isLargeDataset && alreadyIndexed.length <= 3) {
          console.log(
            `✅ Found existing index for ${file.name} using key: ${indexKey}`
          );
        }
      } else {
        needsIndexing.push(file);
        if (!isLargeDataset && needsIndexing.length <= 3) {
          console.log(
            `🔄 Need to index ${
              file.name
            } - existing: ${!!existing}, key: ${indexKey}`
          );
        }
      }
    }

    const filterTime = Date.now() - startTime;

    if (!isLargeDataset) {
      console.log(`✅ Pre-filtering complete in ${filterTime}ms:`);
      console.log(`   📄 Needs indexing: ${needsIndexing.length} files`);
      console.log(`   ✓ Already indexed: ${alreadyIndexed.length} files`);
      console.log(
        `   📊 Skip ratio: ${Math.round(
          (alreadyIndexed.length /
            (needsIndexing.length + alreadyIndexed.length)) *
            100
        )}%`
      );
    }

    return { needsIndexing, alreadyIndexed };
  }

  /**
   * Check if file hasn't changed since last indexing (optimized)
   */
  isFileUnchanged(currentFile, existingIndex) {
    if (!existingIndex) {
      return false; // No previous index, need to index
    }

    // Use flattened metadata structure for better performance
    const { size: indexedSize, mtime: indexedMtime } = existingIndex;

    // Compare file size (most reliable indicator)
    if (currentFile.size !== indexedSize) {
      console.log(
        `📊 Size changed for ${currentFile.name}: ${indexedSize} → ${currentFile.size}`
      );
      return false;
    }

    // ✅ FIXED: Use modifiedAt if mtime is not available
    const currentTime = currentFile.mtime || currentFile.modifiedAt;
    if (currentTime && indexedMtime) {
      const currentMtimeNum =
        typeof currentTime === "number"
          ? currentTime
          : new Date(currentTime).getTime();
      const indexedMtimeNum =
        typeof indexedMtime === "number"
          ? indexedMtime
          : new Date(indexedMtime).getTime();

      if (currentMtimeNum !== indexedMtimeNum) {
        console.log(
          `📅 Modified time changed for ${currentFile.name}: ${new Date(
            indexedMtimeNum
          ).toISOString()} → ${new Date(currentMtimeNum).toISOString()}`
        );
        return false;
      }
    }

    // If we reach here, file appears unchanged
    return true;
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  /**
   * Process a batch of files that are already pre-filtered (all need indexing)
   */
  async processPreFilteredBatch(batch) {
    console.log(
      `🔄 Processing pre-filtered batch of ${batch.length} files (no filtering needed)`
    );

    // 🔥 OPTIMIZATION: Process files in smaller concurrent chunks for better throughput
    // LUDICROUS SPEED: 200 concurrent downloads for absolute maximum indexing speed
    const chunkSize = Math.min(this.concurrentDownloads || 200, batch.length);

    // ⚡ PERFORMANCE: Track performance to adjust concurrency dynamically
    const startTime = Date.now();

    for (let i = 0; i < batch.length; i += chunkSize) {
      if (this.indexingPaused) return;

      const chunk = batch.slice(i, i + chunkSize);
      console.log(`🚀 Processing concurrent chunk: ${chunk.length} files`);

      const chunkStartTime = Date.now();
      const promises = chunk.map(async (file, chunkIndex) => {
        if (this.indexingPaused) return;

        try {
          this.indexingProgress.current++;

          // ⚡ OPTIMIZATION: Update progress less frequently for better performance
          if (chunkIndex === 0 || this.indexingProgress.current % 5 === 0) {
            this.indexingProgress.fileName = file.name;
            this.notifyProgress(this.indexingProgress);
          }

          // ⚡ PERFORMANCE: Add retry logic for failed requests
          let retryCount = 0;
          const maxRetries = 2;

          while (retryCount <= maxRetries) {
            try {
              // Use optimized method since we know this file needs indexing
              await this.indexSingleFileOptimized(file);
              break; // Success, exit retry loop
            } catch (error) {
              retryCount++;
              if (retryCount > maxRetries) {
                console.error(
                  `❌ Failed to index ${file.name} after ${maxRetries} retries:`,
                  error
                );
                break;
              } else {
                console.warn(
                  `⚠️ Retry ${retryCount}/${maxRetries} for ${file.name}:`,
                  error.message
                );
                await this.sleep(retryCount * 100); // Exponential backoff
              }
            }
          }
        } catch (error) {
          console.error(`Error indexing ${file.name}:`, error);
        }
      });

      await Promise.all(promises);

      // ⚡ PERFORMANCE: Track chunk performance and adjust if needed
      const chunkTime = Date.now() - chunkStartTime;
      const throughput = Math.round((chunk.length / chunkTime) * 1000);
      console.log(
        `📊 Chunk completed: ${chunk.length} files in ${chunkTime}ms (${throughput} files/sec)`
      );

      // ⚡ PERFORMANCE: Very minimal delay between chunks - only prevent overwhelming
      if (i + chunkSize < batch.length) {
        await this.sleep(Math.max(1, 10 - throughput)); // Adaptive delay based on throughput
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ Batch completed: ${batch.length} files in ${totalTime}ms`);
  }

  /**
   * Process a batch of files
   */
  async processBatch(batch) {
    // Pre-filter the batch to avoid unnecessary processing
    const { needsIndexing, alreadyIndexed } =
      this.preFilterFilesForIndexing(batch);

    // Update progress for skipped files
    this.indexingProgress.current += alreadyIndexed.length;

    if (needsIndexing.length === 0) {
      console.log(
        `⏭️  Skipping entire batch - all ${batch.length} files already indexed`
      );
      this.notifyProgress(this.indexingProgress);
      return;
    }

    console.log(
      `🔄 Processing ${needsIndexing.length}/${batch.length} files (${alreadyIndexed.length} already indexed)`
    );

    const promises = needsIndexing.map(async (file) => {
      if (this.indexingPaused) return;

      try {
        this.indexingProgress.current++;
        this.indexingProgress.fileName = file.name;
        this.notifyProgress(this.indexingProgress);

        await this.indexSingleFileOptimized(file);
      } catch (error) {
        console.error(`Error indexing ${file.name}:`, error);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Index a single file using electron API (optimized - assumes pre-filtering done)
   */
  async indexSingleFileOptimized(file) {
    try {
      console.log(
        `🔍 Indexing ${file.name} (${this.formatFileSize(file.size)})`
      );

      // ⚡ PERFORMANCE: Use cached extension to avoid repeated string parsing
      let ext = this.extensionCache.get(file.name);
      if (!ext) {
        ext = file.extension || file.name.toLowerCase().split(".").pop();
        this.extensionCache.set(file.name, ext);
      }

      if (ext === "json") {
        await this.indexJsonFile(file);
      } else if (ext === "parquet") {
        await this.indexParquetFile(file);
      } else if (["csv", "txt", "xml", "yaml", "yml"].includes(ext)) {
        await this.indexTextFile(file);
      } else {
        // ⚡ PERFORMANCE: For unknown file types, create minimal index entry
        this.contentIndex.set(file.fullPath, {
          type: ext || "unknown",
          searchableText: `${ext || "unknown"}-file ${file.name}`.toLowerCase(),
          indexedAt: Date.now(),
          size: file.size,
          mtime: this.getFileModifiedTime(file),
          name: file.name,
          file: file,
          fullyIndexed: false,
          reason: "unsupported-type",
        });
      }
    } catch (error) {
      console.error(`Failed to index ${file.name}:`, error);
    }
  }

  /**
   * Index a single file using electron API
   */
  async indexSingleFile(file) {
    try {
      // Skip if already indexed and file hasn't changed
      const existing = this.contentIndex.get(file.fullPath);
      if (existing && this.isFileUnchanged(file, existing)) {
        console.log(
          `⏭️  Skipping ${file.name} - already indexed and unchanged`
        );
        return;
      }

      console.log(
        `🔍 Indexing ${file.name} (${this.formatFileSize(file.size)})`
      );
      const ext = file.name.toLowerCase().split(".").pop();

      if (ext === "json") {
        await this.indexJsonFile(file);
      } else if (ext === "parquet") {
        await this.indexParquetFile(file);
      } else if (["csv", "txt", "xml", "yaml", "yml"].includes(ext)) {
        await this.indexTextFile(file);
      }
    } catch (error) {
      console.error(`Failed to index ${file.name}:`, error);
    }
  }

  /**
   * Index JSON file using electron download API
   */
  async indexJsonFile(file) {
    try {
      // For smaller JSON files, download and parse
      if (file.size < 1024 * 1024) {
        // 1MB limit for full download
        const result = await window.electronAPI.ftpPreview(file.fullPath);

        if (result.success && result.data) {
          // Use the proper indexJsonContent method that extracts fields and values
          const indexedContent = this.indexJsonContent(result.data.content);

          // Optimized flat metadata structure with proper content indexing
          const contentData = {
            ...indexedContent, // This includes type, fields, values, schema, searchableText
            indexedAt: Date.now(),
            // ✅ FIXED: Use helper method for time handling
            size: file.size,
            mtime: this.getFileModifiedTime(file),
            name: file.name,
            file: file,
          };

          this.contentIndex.set(file.fullPath, contentData);

          // Add to semantic index if available
          await this.addToSemanticIndex(file, result.data);
        }
      } else {
        // For larger files, just store metadata with optimized flat structure
        const contentData = {
          type: "json",
          schema: { note: "Large file - schema not extracted" },
          indexedAt: Date.now(),
          // ✅ FIXED: Use modifiedAt if mtime is not available
          size: file.size,
          mtime: this.getFileModifiedTime(file),
          name: file.name,
          file: file,
          note: "File too large for full indexing",
        };

        this.contentIndex.set(file.fullPath, contentData);

        // Add to semantic index with metadata only
        await this.addToSemanticIndex(file, `JSON file: ${file.name}`);
      }
    } catch (error) {
      // Store error info but don't fail the indexing
      this.contentIndex.set(file.fullPath, {
        type: "json",
        error: error.message,
        indexedAt: Date.now(),
        // ✅ FIXED: Use flat structure and correct time handling
        size: file.size,
        mtime: this.getFileModifiedTime(file),
        name: file.name,
        file: file,
      });
    }
  }

  /**
   * Index Parquet file (convert preview data to searchable content)
   */
  async indexParquetFile(file) {
    try {
      console.log(
        `🔧 Indexing Parquet file: ${file.name} (${this.formatFileSize(
          file.size
        )})`
      );

      // Get file content using preview (which already handles parquet parsing)
      const result = await window.electronAPI.ftpPreview(file.fullPath);
      if (!result.success) {
        throw new Error(`Failed to fetch parquet content: ${result.error}`);
      }

      let contentData;

      // The result.data.content should contain the actual parquet data, let's parse it like the preview modal does
      try {
        let parquetData;

        // Access the content field from the response
        const content = result.data.content;

        // If content is a string, parse it as JSON
        if (typeof content === "string") {
          parquetData = JSON.parse(content);
        } else if (content && typeof content === "object") {
          parquetData = content;
        }

        // Check if we have the expected parquet structure with previewRows
        if (
          parquetData &&
          parquetData.previewRows &&
          Array.isArray(parquetData.previewRows)
        ) {
          console.log(
            `📊 Found parquet data: ${
              parquetData.previewRows.length
            } preview rows, ${parquetData.rowCount || "unknown"} total rows`
          );

          // Extract fields from the first row
          const fields =
            parquetData.previewRows.length > 0
              ? Object.keys(parquetData.previewRows[0])
              : [];

          // Extract all values from all preview rows
          const allValues = [];
          parquetData.previewRows.forEach((row) => {
            fields.forEach((field) => {
              const value = row[field];
              if (value !== null && value !== undefined) {
                allValues.push(String(value));
              }
            });
          });

          // Create searchable text from all values
          const searchableText = allValues.join(" ").toLowerCase();

          // Build schema from first row
          const schema = {};
          if (parquetData.previewRows.length > 0) {
            const firstRow = parquetData.previewRows[0];
            fields.forEach((field) => {
              const value = firstRow[field];
              schema[field] = typeof value;
            });
          }

          contentData = {
            type: "parquet",
            fields: fields,
            values: allValues,
            schema: schema,
            searchableText: searchableText,
            recordCount: parquetData.rowCount || parquetData.previewRows.length,
            columnCount: parquetData.columnCount || fields.length,
            previewRowCount: parquetData.previewRows.length,
            fullyIndexed: true,
          };

          console.log(
            `✅ Parquet data indexed: ${file.name} (${contentData.recordCount} total rows, ${contentData.previewRowCount} preview rows, ${fields.length} columns)`
          );
        } else if (parquetData && typeof parquetData === "object") {
          // Fallback: treat as generic object data
          const fields = this.extractJsonFields(parquetData);
          const values = this.extractJsonValues(parquetData);
          const searchableText = values.join(" ").toLowerCase();

          contentData = {
            type: "parquet",
            fields: fields,
            values: values,
            schema: this.extractSchema(parquetData),
            searchableText: searchableText,
            recordCount: 1,
            fullyIndexed: true,
          };
          console.log(
            `✅ Parquet object indexed: ${file.name} (${fields.length} fields, ${values.length} values)`
          );
        } else {
          throw new Error("No valid parquet data structure found");
        }
      } catch (parseError) {
        console.warn(
          `⚠️ Could not parse parquet data for ${file.name}:`,
          parseError
        );

        // Fallback to basic indexing
        contentData = {
          type: "parquet",
          content:
            typeof result.data === "string" ? result.data : String(result.data),
          searchableText: `parquet file ${file.name}`.toLowerCase(),
          error: parseError.message,
          fullyIndexed: false,
        };
      }

      // Store the content in index
      this.contentIndex.set(file.fullPath, {
        ...contentData,
        indexedAt: Date.now(),
        size: file.size,
        mtime:
          typeof file.mtime === "number"
            ? file.mtime
            : new Date(file.mtime).getTime(),
        name: file.name,
        file: file,
      });

      console.log(`✅ Parquet file indexed successfully: ${file.name}`);

      // Add to semantic index if enabled (currently disabled)
      await this.addToSemanticIndex(
        file,
        contentData.searchableText || `Parquet file: ${file.name}`
      );
    } catch (error) {
      console.error(`❌ Failed to index parquet file ${file.name}:`, error);

      // Store error information
      this.contentIndex.set(file.fullPath, {
        type: "parquet",
        error: error.message,
        indexedAt: Date.now(),
        size: file.size,
        mtime:
          typeof file.mtime === "number"
            ? file.mtime
            : new Date(file.mtime).getTime(),
        name: file.name,
        file: file,
        fullyIndexed: false,
      });
    }
  }

  /**
   * Index text-based file (optimized with flat structure)
   */
  async indexTextFile(file) {
    try {
      // For small text files, download and index
      if (file.size < 512 * 1024) {
        // 512KB limit
        const result = await window.electronAPI.ftpPreview(file.fullPath);

        if (result.success && result.data) {
          this.contentIndex.set(file.fullPath, {
            type: "text",
            content: result.data,
            indexedAt: Date.now(),
            // Flat structure for better performance
            size: file.size,
            mtime:
              typeof file.mtime === "number"
                ? file.mtime
                : new Date(file.mtime).getTime(),
            name: file.name,
            file: file,
          });

          // Add to semantic index if available
          await this.addToSemanticIndex(file, result.data);
        }
      } else {
        // For larger files, just store metadata with flat structure
        this.contentIndex.set(file.fullPath, {
          type: "text",
          indexedAt: Date.now(),
          // Flat structure for better performance
          size: file.size,
          mtime:
            typeof file.mtime === "number"
              ? file.mtime
              : new Date(file.mtime).getTime(),
          name: file.name,
          file: file,
          largeFile: true,
        });
      }
    } catch (error) {
      this.contentIndex.set(file.fullPath, {
        type: "text",
        error: error.message,
        indexedAt: Date.now(),
        // Flat structure for better performance
        size: file.size,
        mtime:
          typeof file.mtime === "number"
            ? file.mtime
            : new Date(file.mtime).getTime(),
        name: file.name,
        file: file,
      });
    }
  }

  /**
   * Extract schema from JSON data
   */
  extractSchema(data, maxDepth = 3) {
    const schema = {};

    const extractRecursive = (obj, depth = 0) => {
      if (depth > maxDepth) return "object";

      if (Array.isArray(obj)) {
        return obj.length > 0 ? [extractRecursive(obj[0], depth + 1)] : [];
      } else if (obj && typeof obj === "object") {
        const result = {};
        Object.entries(obj).forEach(([key, value]) => {
          result[key] = extractRecursive(value, depth + 1);
        });
        return result;
      } else {
        return typeof obj;
      }
    };

    return extractRecursive(data);
  }

  /**
   * Notify progress callbacks
   */
  notifyProgress(progress) {
    this.indexingCallbacks.forEach((callback) => {
      try {
        callback(progress);
      } catch (error) {
        console.error("Progress callback error:", error);
      }
    });
  }

  /**
   * Remove progress callback
   */
  removeProgressCallback(callback) {
    this.indexingCallbacks.delete(callback);
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Save optimized indexes to local file storage for persistence
   */
  async saveIndexesToStorage() {
    try {
      // Check if Electron API is available
      if (
        typeof window === "undefined" ||
        !window.electronAPI ||
        !window.electronAPI.indexSave
      ) {
        console.log("Electron API not available, skipping index save");
        return false;
      }

      // Create optimized index data - only store what's needed for search
      const indexData = {
        connectionId: this.connectionId,
        contentIndex: Array.from(this.contentIndex.entries()).map(
          ([path, data]) => [
            path,
            {
              // Only store essential search data
              type: data.type,
              searchableText: data.searchableText,
              recordCount: data.recordCount,
              lastIndexed: data.lastIndexed,
              fileSize: data.fileSize,
              fullyIndexed: data.fullyIndexed,
              // ✅ FIXED: Include file metadata needed for change detection
              size: data.size,
              mtime: data.mtime,
              name: data.name,
            },
          ]
        ),
        fileIndex: Array.from(this.fileIndex.entries()).map(([path, data]) => [
          path,
          {
            // Only store essential file metadata
            name: data.name,
            path: data.path,
            parentPath: data.parentPath,
            isDirectory: data.isDirectory,
            size: data.size,
            lastModified: data.lastModified,
            searchableText: data.searchableText,
          },
        ]),
        lastSaved: Date.now(),
        optimized: true, // Mark as optimized format
      };

      // Create connection-specific filename
      const fileName = this.connectionId
        ? `search-index-${this.connectionId}.json`
        : "search-indexes.json";

      const result = await window.electronAPI.indexSave(indexData, fileName);
      if (result.success) {
        console.log(
          `💾 Saved optimized index: ${this.contentIndex.size} content entries, ${this.fileIndex.size} file entries to ${fileName}`
        );
        return true;
      } else {
        console.error("Failed to save indexes:", result.error);
        return false;
      }
    } catch (error) {
      console.error("Failed to save indexes to storage:", error);
      return false;
    }
  }

  /**
   * Load indexes from file storage
   */
  async loadIndexesFromStorage() {
    try {
      console.log(
        `🔍 loadIndexesFromStorage called with connectionId: "${this.connectionId}"`
      );

      // Check if Electron API is available
      if (
        typeof window === "undefined" ||
        !window.electronAPI ||
        !window.electronAPI.indexLoad
      ) {
        console.log("Electron API not available, skipping index load");
        return false;
      }

      // Create connection-specific filename
      const fileName = this.connectionId
        ? `search-index-${this.connectionId}.json`
        : "search-indexes.json";

      console.log(
        `🔍 Loading index with connectionId: "${this.connectionId}" -> fileName: "${fileName}"`
      );

      const result = await window.electronAPI.indexLoad(fileName);
      if (!result.success) {
        if (
          result.error &&
          result.error.includes("Unexpected end of JSON input")
        ) {
          console.log(
            `⚠️ Index file ${fileName} appears corrupted (incomplete write), will recreate`
          );
          // Delete the corrupted file and start fresh
          try {
            await window.electronAPI.indexDelete(fileName);
            console.log(`�️ Deleted corrupted index file: ${fileName}`);
          } catch (deleteError) {
            console.warn("Failed to delete corrupted index file:", deleteError);
          }
        } else {
          console.log(`�📂 No existing index file found for ${fileName}`);
        }
        return false;
      }

      if (!result.data) {
        console.log("No existing index data found");
        return false;
      }

      const indexData = result.data;
      console.log(
        `🔄 Found index data with ${
          indexData.contentIndex?.length || 0
        } content entries and ${indexData.fileIndex?.length || 0} file entries`
      );

      // Verify this index belongs to the correct connection
      if (this.connectionId && indexData.connectionId !== this.connectionId) {
        console.log(
          `⚠️ Index file connectionId mismatch. Expected: ${this.connectionId}, Found: ${indexData.connectionId}`
        );
        return false;
      }

      // Check if data is not too old (7 days)
      if (
        indexData.lastSaved &&
        Date.now() - indexData.lastSaved > 7 * 24 * 60 * 60 * 1000
      ) {
        console.log("Stored indexes are too old, clearing...");
        await this.clearStoredIndexes();
        return false;
      }

      this.contentIndex = new Map(indexData.contentIndex || []);
      this.fileIndex = new Map(indexData.fileIndex || []);

      // Log detailed statistics
      console.log(`📊 ✅ Loaded indexes from ${fileName}:`);
      console.log(`   📁 Content indexes: ${this.contentIndex.size}`);
      console.log(`   📂 File indexes: ${this.fileIndex.size}`);

      // Show breakdown by file type
      const typeBreakdown = {};
      this.contentIndex.forEach((value) => {
        const type = value.type || "unknown";
        typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
      });

      console.log(
        `   📋 Types: ${Object.entries(typeBreakdown)
          .map(([type, count]) => `${type}(${count})`)
          .join(", ")}`
      );

      return true;
    } catch (error) {
      console.error("Failed to load indexes from storage:", error);
      return false;
    }
  }

  /**
   * Clear stored indexes
   */
  async clearStoredIndexes() {
    try {
      // Check if Electron API is available
      if (
        typeof window === "undefined" ||
        !window.electronAPI ||
        !window.electronAPI.indexClear
      ) {
        console.log("Electron API not available, skipping index clear");
        return false;
      }

      const result = await window.electronAPI.indexClear();
      if (result.success) {
        console.log("Cleared stored indexes from file storage");
        return true;
      } else {
        console.error("Failed to clear indexes:", result.error);
        return false;
      }
    } catch (error) {
      console.error("Failed to clear stored indexes:", error);
      return false;
    }
  }

  /**
   * Save file discovery cache to avoid re-scanning on restart
   */
  async saveFileDiscoveryCache(files) {
    try {
      if (
        typeof window === "undefined" ||
        !window.electronAPI ||
        !window.electronAPI.indexSave
      ) {
        return false;
      }

      const cacheData = {
        timestamp: Date.now(),
        files: files,
        totalCount: files.length,
        cacheVersion: 1,
      };

      // Save to a separate discovery cache file
      const result = await window.electronAPI.indexSave(
        cacheData,
        "discovery-cache.json"
      );
      if (result.success) {
        console.log(`💾 Saved file discovery cache: ${files.length} files`);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to save discovery cache:", error);
      return false;
    }
  }

  /**
   * Load file discovery cache
   */
  async loadFileDiscoveryCache() {
    try {
      if (
        typeof window === "undefined" ||
        !window.electronAPI ||
        !window.electronAPI.indexLoad
      ) {
        return null;
      }

      const result = await window.electronAPI.indexLoad("discovery-cache.json");
      if (result.success && result.data) {
        return result.data;
      }
      return null;
    } catch (error) {
      console.error("Failed to load discovery cache:", error);
      return null;
    }
  }

  /**
   * Check if discovery cache is still valid (within 6 hours)
   */
  isDiscoveryCacheValid(cache) {
    if (!cache || !cache.timestamp) {
      return false;
    }

    const CACHE_VALIDITY_HOURS = 6;
    const cacheAge = Date.now() - cache.timestamp;
    const maxAge = CACHE_VALIDITY_HOURS * 60 * 60 * 1000; // 6 hours in milliseconds

    const isValid = cacheAge < maxAge;
    if (!isValid) {
      console.log(
        `📅 Discovery cache expired: ${Math.round(
          cacheAge / (60 * 60 * 1000)
        )} hours old`
      );
    }

    return isValid;
  }

  /**
   * Initialize storage when in browser environment
   */
  async initializeStorage() {
    if (typeof window !== "undefined" && window.electronAPI) {
      await this.loadIndexesFromStorage();

      // Initialize unified search engine in background
      this.initializeUnifiedSearch();

      this.storageReady = true; // ✅ Mark storage as ready
      return true;
    }
    this.storageReady = true; // ✅ Mark as ready even if not in electron
    return false;
  }

  /**
   * Initialize unified search engine
   */
  async initializeUnifiedSearch() {
    try {
      console.log("🚀 Initializing unified search engine...");

      // Get user data path from main process
      const userDataPath = await window.electronAPI.getUserDataPath();

      // Initialize unified search
      await this.unifiedSearch.initialize(this, userDataPath);
      this.isUnifiedSearchReady = true;

      console.log("✅ Unified search engine ready");
    } catch (error) {
      console.warn(
        "⚠️ Failed to initialize unified search, using traditional search only:",
        error
      );
      this.isUnifiedSearchReady = false;
    }
  }

  /**
   * Add file to semantic index - DISABLED FOR NOW
   */
  async addToSemanticIndex(file, content) {
    // 🚫 SEMANTIC SEARCH DISABLED TEMPORARILY
    console.log(`📝 Skipping semantic indexing for ${file.name} (disabled)`);
    return;

    if (!this.isUnifiedSearchReady) {
      return; // Skip if unified search not ready
    }

    try {
      const fileData = {
        path: file.fullPath,
        filename: file.name,
        content: content,
        fileType: file.name.split(".").pop()?.toLowerCase() || "unknown",
        size: file.size,
        modifiedDate: file.mtime || new Date().toISOString(),
      };

      await this.unifiedSearch.addToSemanticIndex(fileData);
    } catch (error) {
      console.error(`Failed to add ${file.name} to semantic index:`, error);
    }
  }

  /**
   * Get all indexed files for unified search - reads fresh data from file with retry
   */
  async getIndexedFiles() {
    // If indexing is in progress, use in-memory data to avoid race conditions
    if (this.isIndexing) {
      console.log(
        "🔄 Indexing in progress, using in-memory data for getIndexedFiles"
      );
      return Array.from(this.fileIndex.values());
    }

    // Retry logic for reading the index file
    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Use connection-specific filename
        const fileName = this.connectionId
          ? `search-index-${this.connectionId}.json`
          : "search-indexes.json";

        console.log(
          `🔍 getIndexedFiles loading from: ${fileName} (attempt ${attempt}/${maxRetries})`
        );

        const indexResult = await window.electronAPI.indexLoad(fileName);
        if (!indexResult.success || !indexResult.data) {
          console.error(
            "Failed to load fresh index for getIndexedFiles:",
            indexResult.error
          );
          // Fallback to in-memory data if file read fails
          return Array.from(this.fileIndex.values());
        }

        const indexData = indexResult.data;

        // Validate the data structure
        if (!indexData.fileIndex || !Array.isArray(indexData.fileIndex)) {
          console.warn("Invalid index data structure, using in-memory data");
          return Array.from(this.fileIndex.values());
        }

        const freshFileIndex = new Map(indexData.fileIndex || []);
        console.log(`📊 Loaded ${freshFileIndex.size} files from ${fileName}`);

        return Array.from(freshFileIndex.values());
      } catch (error) {
        lastError = error;
        console.warn(`Attempt ${attempt}/${maxRetries} failed:`, error.message);

        if (attempt < maxRetries) {
          // Wait before retrying (exponential backoff)
          const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    console.error("All attempts failed, using in-memory data:", lastError);
    // Fallback to in-memory data if all retries fail
    return Array.from(this.fileIndex.values());
  }

  /**
   * Get indexing status
   */
  getIndexingStatus() {
    return {
      isIndexing: this.isIndexing,
      progress: this.indexingProgress,
      totalIndexed: this.contentIndex.size,
      isPaused: this.indexingPaused,
    };
  }

  /**
   * Search content across indexed files - reads fresh from index file
   */
  async searchContent(query) {
    if (!query || !query.trim()) {
      return [];
    }

    const searchTerm = query.toLowerCase();
    const results = [];

    try {
      // 🔧 FIXED: Read fresh index data from file instead of using cached in-memory data
      const fileName = this.connectionId
        ? `search-index-${this.connectionId}.json`
        : "search-indexes.json";

      console.log(`🔍 LOADING FRESH INDEX: Reading from ${fileName}...`);

      const indexResult = await window.electronAPI.indexLoad(fileName);
      if (!indexResult.success || !indexResult.data) {
        console.error("Failed to load fresh index data:", indexResult.error);
        return [];
      }

      const indexData = indexResult.data;
      const contentIndex = new Map(indexData.contentIndex || []);
      const freshFileIndex = new Map(indexData.fileIndex || []);

      console.log(
        `🔍 Searching ${contentIndex.size} files for "${searchTerm}"`
      );

      // Search through fresh content index
      for (const [filePath, contentData] of contentIndex.entries()) {
        const matches = this.searchInContent(contentData, searchTerm, filePath);

        if (matches.length > 0) {
          // 🔧 FIXED: Get file info from fresh file index instead of stale in-memory data
          const fileInfo = freshFileIndex.get(filePath) || {
            name: filePath.split("/").pop(),
            size: 0,
            modifiedTime: null,
            isDirectory: false,
          };

          // 🔧 ALSO TRY CONTENT INDEX: The file metadata might be in contentData instead
          const contentFileInfo = contentData.file || contentData;

          // 🔧 Try to infer file size from content if not available
          let estimatedSize = fileInfo.size || contentData.size || 0;
          if (!estimatedSize && contentData.searchableText) {
            estimatedSize = contentData.searchableText.length;
          }

          // 🔧 EXTRACT MODIFIED DATE: Try multiple sources including contentData
          let modifiedDate = null;

          // First try contentData which should have the file metadata
          if (contentData.file && contentData.file.modifiedAt) {
            modifiedDate = contentData.file.modifiedAt;
          } else if (contentData.modifiedAt) {
            modifiedDate = contentData.modifiedAt;
          } else if (contentFileInfo.modifiedAt) {
            modifiedDate = contentFileInfo.modifiedAt;
          } else if (fileInfo.file && fileInfo.file.modifiedAt) {
            modifiedDate = fileInfo.file.modifiedAt;
          } else if (fileInfo.modifiedAt) {
            modifiedDate = fileInfo.modifiedAt;
          } else if (fileInfo.modifiedTime) {
            modifiedDate = fileInfo.modifiedTime;
          } else if (fileInfo.lastModified) {
            modifiedDate = fileInfo.lastModified;
          } else if (fileInfo.modified) {
            modifiedDate = fileInfo.modified;
          } else if (fileInfo.mtime) {
            modifiedDate = fileInfo.mtime;
          }

          // 🔧 CRITICAL FIX: Always include the full path for preview/download
          // 🔧 ENHANCED: Include size and modified date for better display
          const result = {
            ...fileInfo,
            path: filePath,
            size: estimatedSize,
            modifiedTime: modifiedDate,
            isDirectory: fileInfo.isDirectory || false,
            matches: matches,
            totalMatches: matches.length,
            searchType: "content",
          };

          // 🔧 ONLY LOG WHEN SEARCH RESULTS ARE FOUND
          console.log(`🔍 Found ${matches.length} matches in: ${result.name}`, {
            size: result.size,
            modifiedTime: result.modifiedTime,
            matchTypes: matches.map((m) => m.type),
            hasContentFile: !!contentData.file,
            contentDataKeys: Object.keys(contentData),
          });
          results.push(result);
        }
      }

      return results;
    } catch (error) {
      console.error("Error in searchContent:", error);
      return [];
    }
  }

  /**
   * Search within structured content data
   */
  searchInContent(contentData, searchTerm, filePath) {
    const matches = [];
    const seen = new Set();

    // Search in field names
    if (contentData.fields && Array.isArray(contentData.fields)) {
      contentData.fields.forEach((field, index) => {
        if (field && field.toLowerCase().includes(searchTerm)) {
          const matchKey = `field:${field}:${index}`;
          if (!seen.has(matchKey)) {
            matches.push({
              type: "field",
              value: field,
              context: "Field name",
              path: `fields[${index}]`,
              file: filePath,
            });
            seen.add(matchKey);
          }
        }
      });
    }

    // Search in values
    if (contentData.values && Array.isArray(contentData.values)) {
      contentData.values.forEach((value, index) => {
        if (value !== null && value !== undefined) {
          const valueStr = String(value).toLowerCase();
          if (valueStr.includes(searchTerm)) {
            const matchKey = `value:${value}:${index}`;
            if (!seen.has(matchKey)) {
              matches.push({
                type: "value",
                value: String(value),
                context: "Field value",
                path: `values[${index}]`,
                file: filePath,
              });
              seen.add(matchKey);
            }
          }
        }
      });
    }

    // Search in searchableText (most comprehensive)
    if (
      contentData.searchableText &&
      contentData.searchableText.toLowerCase().includes(searchTerm)
    ) {
      const matchKey = `searchableText:${searchTerm}`;
      if (!seen.has(matchKey)) {
        matches.push({
          type: "content",
          value: searchTerm,
          context: "Full content match",
          path: "searchableText",
          file: filePath,
        });
        seen.add(matchKey);
      }
    }

    // Legacy support: search in parsedContent if it exists
    if (contentData.parsedContent) {
      const searchRecursive = (obj, path = "") => {
        if (Array.isArray(obj)) {
          obj.forEach((item, index) => {
            searchRecursive(item, `${path}[${index}]`);
          });
        } else if (obj && typeof obj === "object") {
          Object.entries(obj).forEach(([key, value]) => {
            const currentPath = path ? `${path}.${key}` : key;

            // Check field name
            if (key.toLowerCase().includes(searchTerm)) {
              const matchKey = `field:${key}:${currentPath}`;
              if (!seen.has(matchKey)) {
                matches.push({
                  type: "field",
                  value: key,
                  context: "Field name",
                  path: currentPath,
                  file: filePath,
                });
                seen.add(matchKey);
              }
            }

            // Check field value
            if (value !== null && value !== undefined) {
              const valueStr = String(value).toLowerCase();
              if (valueStr.includes(searchTerm)) {
                const matchKey = `value:${key}:${value}:${currentPath}`;
                if (!seen.has(matchKey)) {
                  matches.push({
                    type: "value",
                    value: String(value),
                    context: `Value in "${key}"`,
                    path: currentPath,
                    file: filePath,
                  });
                  seen.add(matchKey);
                }
              }
            }

            // Recurse into nested objects
            if (typeof value === "object" && value !== null) {
              searchRecursive(value, currentPath);
            }
          });
        }
      };

      searchRecursive(contentData.parsedContent);
    }

    return matches.slice(0, 50); // Limit results for performance
  }

  /**
   * Get search statistics
   */
  getStats() {
    return {
      totalFiles: this.fileIndex.size,
      historySize: this.searchHistory.size,
      lastIndexed: Math.max(
        ...Array.from(this.fileIndex.values()).map((f) => f.lastIndexed)
      ),
    };
  }

  /**
   * Clear index
   */
  clearIndex() {
    this.fileIndex.clear();
  }

  /**
   * Export search results
   */
  exportResults(results, format = "json") {
    const exportData = results.map((file) => ({
      name: file.name,
      path: file.fullPath,
      size: file.size,
      type: file.isDirectory ? "directory" : "file",
      modified: file.modifiedTime || file.modified,
    }));

    switch (format) {
      case "csv":
        return this.exportToCsv(exportData);
      case "json":
      default:
        return JSON.stringify(exportData, null, 2);
    }
  }

  exportToCsv(data) {
    if (data.length === 0) return "";

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((header) => {
            const value = row[header];
            return typeof value === "string" && value.includes(",")
              ? `"${value.replace(/"/g, '""')}"`
              : value;
          })
          .join(",")
      ),
    ];

    return csvRows.join("\n");
  }

  /**
   * ⚡ PERFORMANCE TUNING: Adjust concurrency settings dynamically
   * @param {number} concurrentDownloads - Number of concurrent downloads (default: 30, max recommended: 100)
   * @param {boolean} adaptiveScaling - Enable adaptive scaling (default: true)
   */
  configureConcurrency(concurrentDownloads = 30, adaptiveScaling = true) {
    const oldValue = this.concurrentDownloads;
    this.concurrentDownloads = Math.min(Math.max(concurrentDownloads, 1), 200); // Min 1, Max 200
    this.adaptiveScaling = adaptiveScaling;

    console.log(
      `⚙️ CONCURRENCY UPDATED: ${oldValue} → ${this.concurrentDownloads} (adaptive: ${adaptiveScaling})`
    );

    // Provide guidance based on the setting
    if (this.concurrentDownloads <= 15) {
      console.log(
        "🐌 CONSERVATIVE: Good for unstable connections or limited resources"
      );
    } else if (this.concurrentDownloads <= 50) {
      console.log("⚡ BALANCED: Good performance for most scenarios");
    } else if (this.concurrentDownloads <= 100) {
      console.log("🚀 AGGRESSIVE: Maximum speed for stable, fast connections");
    } else {
      console.log(
        "🔥 MAXIMUM: Use only with very stable connections and powerful hardware"
      );
    }

    return this.concurrentDownloads;
  }
}

// Create a singleton instance
export const searchEngine = new SearchEngine();
