import { connect } from "@lancedb/lancedb";
import { pipeline } from "@xenova/transformers";
import path from "path";

/**
 * Semantic Search Engine using LanceDB and local embeddings
 * Provides vector similarity search for file content
 */
class SemanticSearchEngine {
  constructor() {
    this.db = null;
    this.table = null;
    this.embedder = null;
    this.isInitialized = false;
    this.initializationPromise = null;
    this.dbPath = null;
  }

  /**
   * Initialize the semantic search engine
   */
  async initialize(userDataPath) {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._doInitialize(userDataPath);
    return this.initializationPromise;
  }

  async _doInitialize(userDataPath) {
    try {
      console.log("🧠 Initializing Semantic Search Engine...");

      // Set up database path
      this.dbPath = path.join(userDataPath, "semantic-search.lance");

      // Initialize LanceDB
      console.log("📦 Connecting to LanceDB...");
      this.db = await connect(this.dbPath);

      // Initialize embedding model (lightweight, runs locally)
      console.log("🤖 Loading embedding model...");
      this.embedder = await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2",
        {
          quantized: true, // Smaller model size
          progress_callback: (progress) => {
            if (progress.status === "downloading") {
              console.log(
                `📥 Downloading model: ${progress.file} (${Math.round(
                  progress.progress
                )}%)`
              );
            }
          },
        }
      );

      // Create or connect to table
      await this.initializeTable();

      this.isInitialized = true;
      console.log("✅ Semantic Search Engine initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize Semantic Search Engine:", error);
      throw error;
    }
  }

  /**
   * Initialize or connect to the embeddings table
   */
  async initializeTable() {
    try {
      const tables = await this.db.tableNames();

      if (tables.includes("file_embeddings")) {
        // Connect to existing table
        this.table = await this.db.openTable("file_embeddings");
        console.log("🔗 Connected to existing embeddings table");
      } else {
        // Create new table with schema
        const sampleData = [
          {
            id: "sample",
            path: "/sample/path",
            filename: "sample.txt",
            content: "sample content",
            fileType: "txt",
            size: 0,
            modifiedDate: new Date().toISOString(),
            vector: new Array(384).fill(0), // all-MiniLM-L6-v2 produces 384-dim vectors
            contentHash: "sample",
          },
        ];

        this.table = await this.db.createTable("file_embeddings", sampleData);

        // Remove sample data
        await this.table.delete('id = "sample"');

        console.log("🆕 Created new embeddings table");
      }
    } catch (error) {
      console.error("❌ Failed to initialize table:", error);
      throw error;
    }
  }

  /**
   * Generate embedding for text content
   */
  async generateEmbedding(text) {
    if (!this.embedder) {
      throw new Error("Embedder not initialized");
    }

    try {
      // Clean and truncate text (model has token limits)
      const cleanText = text.replace(/\s+/g, " ").trim().substring(0, 8000);

      if (!cleanText) {
        return new Array(384).fill(0); // Return zero vector for empty content
      }

      const output = await this.embedder(cleanText, {
        pooling: "mean",
        normalize: true,
      });
      return Array.from(output.data);
    } catch (error) {
      console.error("❌ Failed to generate embedding:", error);
      return new Array(384).fill(0); // Return zero vector on error
    }
  }
  /**
   * Add or update file embedding
   */
  async addFileEmbedding(fileData) {
    if (!this.isInitialized) {
      console.warn("⚠️ Semantic search not initialized, skipping embedding");
      return;
    }

    try {
      const {
        path: filePath,
        filename,
        content,
        fileType,
        size,
        modifiedDate,
      } = fileData;

      // Generate content hash for deduplication
      const contentHash = await this.generateContentHash(content);

      // Check if we already have this exact content
      const existing = await this.table
        .search([0])
        .where(`path = '${filePath}'`)
        .limit(1)
        .toArray();

      if (existing.length > 0 && existing[0].contentHash === contentHash) {
        console.log(`⏭️ Skipping ${filename} - content unchanged`);
        return;
      }

      // Generate embedding
      const searchableText = this.extractSearchableText(content, filename);
      const vector = await this.generateEmbedding(searchableText);

      const embeddingData = {
        id: filePath,
        path: filePath,
        filename,
        content: content.substring(0, 2000), // Store preview for snippets
        fileType,
        size,
        modifiedDate,
        vector,
        contentHash,
        searchableText: searchableText.substring(0, 1000), // Store for debugging
      };

      // Upsert (insert or update)
      if (existing.length > 0) {
        await this.table.delete(`path = '${filePath}'`);
      }

      await this.table.add([embeddingData]);

      console.log(`🧠 Added embedding for ${filename}`);
    } catch (error) {
      console.error(
        `❌ Failed to add embedding for ${fileData.filename}:`,
        error
      );
    }
  }

  /**
   * Extract searchable text from content and metadata
   */
  extractSearchableText(content, filename) {
    const parts = [];

    // Include filename (important for relevance)
    parts.push(filename.replace(/[._-]/g, " "));

    // Include content based on type
    if (typeof content === "string") {
      parts.push(content);
    } else if (content && typeof content === "object") {
      // For structured data, extract meaningful text
      if (content.searchableText) {
        parts.push(content.searchableText);
      }
      if (content.values && Array.isArray(content.values)) {
        parts.push(content.values.flat().join(" "));
      }
      if (content.fields && Array.isArray(content.fields)) {
        parts.push(content.fields.join(" "));
      }
    }

    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  /**
   * Generate content hash for deduplication
   */
  async generateContentHash(content) {
    const contentStr =
      typeof content === "string" ? content : JSON.stringify(content);
    const encoder = new TextEncoder();
    const data = encoder.encode(contentStr);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Semantic search for files
   */
  async searchSemantic(query, limit = 50) {
    if (!this.isInitialized) {
      console.warn("⚠️ Semantic search not initialized");
      return [];
    }

    try {
      console.log(`🔍 Semantic search: "${query}"`);

      // Generate query embedding
      const queryVector = await this.generateEmbedding(query);

      // Perform vector similarity search
      const results = await this.table
        .search(queryVector)
        .limit(limit)
        .toArray();

      // Format results with similarity scores
      return results.map((result) => ({
        path: result.path,
        filename: result.filename,
        fileType: result.fileType,
        size: result.size,
        modifiedDate: result.modifiedDate,
        similarity: result._distance ? 1 - result._distance : 0, // Convert distance to similarity
        snippet: this.generateSnippet(result.content, query),
        source: "semantic",
        matchReason: `Semantic similarity: ${Math.round(
          (1 - (result._distance || 1)) * 100
        )}%`,
      }));
    } catch (error) {
      console.error("❌ Semantic search failed:", error);
      return [];
    }
  }

  /**
   * Generate content snippet for display
   */
  generateSnippet(content, query, maxLength = 200) {
    if (!content || typeof content !== "string") {
      return "";
    }

    const queryWords = query.toLowerCase().split(/\s+/);
    const contentLower = content.toLowerCase();

    // Find best match position
    let bestPos = 0;
    let bestScore = 0;

    for (let i = 0; i < content.length - maxLength; i += 50) {
      const window = contentLower.substring(i, i + maxLength);
      const score = queryWords.reduce(
        (acc, word) => acc + (window.includes(word) ? 1 : 0),
        0
      );

      if (score > bestScore) {
        bestScore = score;
        bestPos = i;
      }
    }

    let snippet = content.substring(bestPos, bestPos + maxLength);

    // Clean up snippet
    if (bestPos > 0) snippet = "..." + snippet;
    if (bestPos + maxLength < content.length) snippet = snippet + "...";

    return snippet.trim();
  }

  /**
   * Get statistics about the semantic index
   */
  async getStats() {
    if (!this.isInitialized || !this.table) {
      return { totalFiles: 0, initialized: false };
    }

    try {
      const count = await this.table.countRows();
      return {
        totalFiles: count,
        initialized: true,
        modelName: "all-MiniLM-L6-v2",
        vectorDimensions: 384,
      };
    } catch (error) {
      console.error("❌ Failed to get stats:", error);
      return { totalFiles: 0, initialized: false, error: error.message };
    }
  }

  /**
   * Clear all embeddings (for testing or reset)
   */
  async clearEmbeddings() {
    if (!this.table) return;

    try {
      await this.table.delete("true"); // Delete all rows
      console.log("🧹 Cleared all embeddings");
    } catch (error) {
      console.error("❌ Failed to clear embeddings:", error);
    }
  }

  /**
   * Find similar files to a given file
   */
  async findSimilarFiles(filePath, limit = 10) {
    if (!this.isInitialized) return [];

    try {
      // Get the embedding for the target file
      const targetFile = await this.table
        .search([0])
        .where(`path = '${filePath}'`)
        .limit(1)
        .toArray();

      if (targetFile.length === 0) {
        console.warn(`⚠️ File not found in semantic index: ${filePath}`);
        return [];
      }

      // Search for similar files
      const results = await this.table
        .search(targetFile[0].vector)
        .where(`path != '${filePath}'`) // Exclude the target file itself
        .limit(limit)
        .toArray();

      return results.map((result) => ({
        path: result.path,
        filename: result.filename,
        similarity: 1 - (result._distance || 1),
        reason: "Content similarity",
      }));
    } catch (error) {
      console.error("❌ Failed to find similar files:", error);
      return [];
    }
  }
}

export default SemanticSearchEngine;
