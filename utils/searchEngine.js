/**
 * Search engine for one connection.
 *
 * Holds two indexes:
 *  - fileIndex:    every file/folder seen (browsing + background crawl), for name/path search
 *  - contentIndex: extracted fields/values/text of JSON, Parquet and text files
 *
 * The heavy lifting lives in ./search/*:
 *  fileTypes (helpers), queryMatcher (matching/filters), contentIndexer
 *  (crawl + extraction), indexStore (persistence).
 */

import {
  buildSearchableText,
  getFileType,
  isContentIndexable,
  joinPath,
} from "./search/fileTypes";
import {
  applyFilters,
  findContentMatches,
  parseSearchQuery,
  scoreFilenameMatch,
} from "./search/queryMatcher";
import { ContentIndexer, isUnchanged } from "./search/contentIndexer";
import { IndexStore } from "./search/indexStore";
import BrowserSemanticSearchEngine from "./BrowserSemanticSearchEngine";

// Re-crawl the remote tree at most this often; in between, changes are picked
// up from directories the user browses.
const REDISCOVERY_INTERVAL_MS = 6 * 60 * 60 * 1000;
const SAVE_EVERY_FILES = 50;
const SAVE_EVERY_MS = 15 * 1000;
const MAX_RESULTS = 500;
const MAX_HISTORY = 50;

export class SearchEngine {
  /**
   * @param {string|null} connectionId - Stable id used to name the index file
   * @param {Object} [options]
   * @param {string} [options.protocol] - ftp | ftps | sftp | s3; sets indexing concurrency
   * @param {boolean} [options.semantic] - Also query the embedding-based semantic index
   */
  constructor(connectionId = null, { protocol = "ftp", semantic = false } = {}) {
    this.connectionId = connectionId;
    this.fileIndex = new Map();
    this.contentIndex = new Map();
    this.discoveredAt = null;
    this.store = new IndexStore(connectionId);
    this.storageReady = false;
    this.dirty = false; // Unsaved changes since the last save

    this.isIndexing = false;
    this.indexingPaused = false;
    this.indexingProgress = { current: 0, total: 0, fileName: "" };
    this.indexingCallbacks = new Set();
    this.indexer = new ContentIndexer({
      protocol,
      shouldStop: () => this.indexingPaused,
    });

    this.searchHistory = new Set();
    this.semantic = semantic ? new BrowserSemanticSearchEngine() : null;
  }

  /** Kept for the UI, which shows an "enhanced search" badge once ready. */
  get isUnifiedSearchReady() {
    return this.storageReady;
  }

  // ---------------------------------------------------------------------------
  // Setup and persistence
  // ---------------------------------------------------------------------------

  async initializeStorage() {
    try {
      const saved = await this.store.load();
      if (saved) {
        // Merge rather than replace: the UI may have indexed the first listing already.
        this.fileIndex = new Map([...saved.fileIndex, ...this.fileIndex]);
        this.contentIndex = saved.contentIndex;
        this.discoveredAt = saved.discoveredAt;
      }
      if (this.semantic) {
        await this.semantic.initialize();
      }
      return !!saved;
    } catch (error) {
      console.error("Failed to load search index:", error);
      return false;
    } finally {
      this.storageReady = true;
    }
  }

  saveIndexes() {
    this.dirty = false;
    return this.store.save(this.fileIndex, this.contentIndex, {
      discoveredAt: this.discoveredAt,
    });
  }

  async clearStoredIndexes() {
    this.fileIndex.clear();
    this.contentIndex.clear();
    this.discoveredAt = null;
    await this.store.clear();
  }

  // ---------------------------------------------------------------------------
  // File index
  // ---------------------------------------------------------------------------

  /**
   * Record a directory listing. Entries that disappeared from the directory
   * are dropped from both indexes.
   */
  buildIndex(files, currentPath = "/") {
    const seen = new Set();
    for (const file of files) {
      const fullPath = joinPath(currentPath, file.name);
      seen.add(fullPath);
      const entry = {
        name: file.name,
        size: file.size || 0,
        isDirectory: !!file.isDirectory,
        modifiedAt: toIsoDate(file.modifiedAt),
        fullPath,
        parentPath: currentPath,
        searchableText: buildSearchableText(file),
      };
      const existing = this.fileIndex.get(fullPath);
      if (
        !existing ||
        existing.size !== entry.size ||
        existing.isDirectory !== entry.isDirectory ||
        existing.modifiedAt !== entry.modifiedAt
      ) {
        this.dirty = true;
      }
      this.fileIndex.set(fullPath, entry);
    }

    for (const [fullPath, entry] of this.fileIndex) {
      if (entry.parentPath === currentPath && !seen.has(fullPath)) {
        this.removePath(fullPath);
      }
    }
  }

  /** Remove a file, or a folder and everything below it. */
  removePath(fullPath) {
    const prefix = `${fullPath}/`;
    for (const index of [this.fileIndex, this.contentIndex]) {
      for (const key of index.keys()) {
        if (key === fullPath || key.startsWith(prefix)) {
          index.delete(key);
          this.dirty = true;
        }
      }
    }
  }

  isContentIndexable(file) {
    return isContentIndexable(file);
  }

  getFileType(filename) {
    return getFileType(filename);
  }

  // ---------------------------------------------------------------------------
  // Background indexing
  // ---------------------------------------------------------------------------

  async startBackgroundIndexing(onProgress) {
    if (onProgress) this.indexingCallbacks.add(onProgress);

    if (this.isIndexing) {
      onProgress?.(this.indexingProgress);
      return;
    }

    if (typeof window === "undefined" || !window.electronAPI) return;

    this.isIndexing = true;
    this.indexingPaused = false;

    try {
      await this.discoverFiles();
      if (!this.indexingPaused) await this.indexContent();
    } catch (error) {
      console.error("Background indexing error:", error);
    } finally {
      this.isIndexing = false;
      if (this.dirty) await this.saveIndexes();
      this.notifyProgress({
        ...this.indexingProgress,
        fileName: "",
        completed: true,
      });
    }
  }

  stopBackgroundIndexing() {
    this.indexingPaused = true;
  }

  async discoverFiles() {
    if (
      this.discoveredAt &&
      Date.now() - this.discoveredAt < REDISCOVERY_INTERVAL_MS
    ) {
      this.notifyProgress({
        current: 0,
        total: 0,
        fileName: "Using cached file discovery...",
        phase: "cache",
        cached: true,
      });
      return;
    }

    let directories = 0;
    await this.indexer.discover("/", (dirPath, entries) => {
      this.buildIndex(entries, dirPath);
      directories++;
      this.notifyProgress({
        current: 0,
        total: 0,
        fileName: `Discovering files... (${directories} folders, ${this.fileIndex.size} items)`,
        phase: "collection",
      });
    });

    if (!this.indexingPaused) {
      this.discoveredAt = Date.now();
      await this.saveIndexes();
    }
  }

  async indexContent() {
    const candidates = Array.from(this.fileIndex.values()).filter(isContentIndexable);
    const pending = candidates.filter(
      (file) => !isUnchanged(file, this.contentIndex.get(file.fullPath))
    );

    // Content entries for files that are no longer indexable (or gone) are stale.
    const candidatePaths = new Set(candidates.map((file) => file.fullPath));
    for (const path of this.contentIndex.keys()) {
      if (!candidatePaths.has(path)) {
        this.contentIndex.delete(path);
        this.dirty = true;
      }
    }

    this.indexingProgress = {
      current: candidates.length - pending.length,
      total: candidates.length,
      fileName: pending.length ? "" : "All files up to date",
      phase: "indexing",
    };
    this.notifyProgress(this.indexingProgress);
    if (pending.length === 0) return;

    let sinceSave = 0;
    let lastSave = Date.now();

    await this.indexer.indexFiles(pending, async (file, entry) => {
      if (!entry) return;
      this.contentIndex.set(file.fullPath, entry);
      this.dirty = true;
      this.indexingProgress.current++;
      this.indexingProgress.fileName = file.name;
      this.notifyProgress(this.indexingProgress);

      if (this.semantic && entry.searchableText) {
        await this.semantic.addFileEmbedding(file.fullPath, entry.searchableText, {
          size: file.size,
          mtime: entry.mtime,
        });
      }

      sinceSave++;
      if (sinceSave >= SAVE_EVERY_FILES || Date.now() - lastSave > SAVE_EVERY_MS) {
        sinceSave = 0;
        lastSave = Date.now();
        await this.saveIndexes();
      }
    });
  }

  notifyProgress(progress) {
    this.indexingProgress = progress;
    for (const callback of this.indexingCallbacks) {
      try {
        callback({ ...progress });
      } catch (error) {
        console.error("Progress callback error:", error);
      }
    }
  }

  removeProgressCallback(callback) {
    this.indexingCallbacks.delete(callback);
  }

  getIndexingStatus() {
    return {
      isIndexing: this.isIndexing,
      progress: this.indexingProgress,
      totalIndexed: this.contentIndex.size,
      isPaused: this.indexingPaused,
    };
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  /**
   * Search file names/paths and indexed content.
   * @param {string} query - Words (all must match), "quoted phrases", or wild*cards
   * @param {Object} filters - FilterPanel filters
   * @param {string} scope - "all", or a folder path to search within (recursively)
   */
  async search(query = "", filters = {}, scope = "all") {
    if (typeof query !== "string") return [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    const patterns = parseSearchQuery(normalized);
    const inScope = (path) =>
      scope === "all" || scope === "/" || path === scope || path.startsWith(`${scope}/`);
    const results = new Map();

    const resultFor = (fullPath) => {
      if (!results.has(fullPath)) {
        const entry = this.fileIndex.get(fullPath) || this.metaFromContent(fullPath);
        results.set(fullPath, {
          ...entry,
          fullPath,
          path: fullPath,
          modifiedTime: entry.modifiedAt,
          sources: [],
          matchReasons: [],
          matches: [],
          totalMatches: 0,
          relevanceScore: 0,
        });
      }
      return results.get(fullPath);
    };

    for (const [fullPath, entry] of this.fileIndex) {
      if (!inScope(fullPath)) continue;
      const score = scoreFilenameMatch(entry, normalized, patterns);
      if (score > 0) {
        const result = resultFor(fullPath);
        result.sources.push("filename");
        result.matchReasons.push("Name or path match");
        result.relevanceScore += score;
      }
    }

    for (const [fullPath, content] of this.contentIndex) {
      if (!inScope(fullPath)) continue;
      const matches = findContentMatches(content, patterns);
      if (matches.length > 0) {
        const result = resultFor(fullPath);
        result.sources.push("content");
        result.matchReasons.push(`Content contains "${query.trim()}"`);
        result.matches = matches;
        result.totalMatches = matches.length;
        result.searchType = "content";
        result.relevanceScore += 50 + Math.min(matches.length, 10) * 5;
      }
    }

    if (this.semantic?.isInitialized) {
      for (const hit of await this.semantic.searchSemantic(query, 20)) {
        if (!hit.file_path || !inScope(hit.file_path)) continue;
        const result = resultFor(hit.file_path);
        result.sources.push("semantic");
        result.matchReasons.push(hit.matchReason || "Semantic similarity");
        result.relevanceScore += hit.relevanceScore || 0;
      }
    }

    this.addToHistory(query);

    const ranked = applyFilters(Array.from(results.values()), filters)
      .map((result) => ({
        ...result,
        // Matching more than one way (name and content) is a strong signal.
        relevanceScore:
          result.sources.length > 1 ? result.relevanceScore * 1.5 : result.relevanceScore,
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    return ranked.slice(0, MAX_RESULTS);
  }

  /** Content-only search, returning just files whose content matched. */
  async searchContent(query) {
    const results = await this.search(query);
    return results.filter((result) => result.sources.includes("content"));
  }

  metaFromContent(fullPath) {
    const content = this.contentIndex.get(fullPath) || {};
    return {
      name: content.name || fullPath.split("/").pop(),
      size: content.size || 0,
      isDirectory: false,
      modifiedAt: content.mtime ? new Date(content.mtime).toISOString() : null,
    };
  }

  applyFilters(files, filters) {
    return applyFilters(files, filters);
  }

  addToHistory(query) {
    const trimmed = query.trim();
    if (!trimmed) return;
    this.searchHistory.delete(trimmed);
    this.searchHistory.add(trimmed);
    if (this.searchHistory.size > MAX_HISTORY) {
      this.searchHistory.delete(this.searchHistory.values().next().value);
    }
  }

  getHistory() {
    return Array.from(this.searchHistory).reverse();
  }

  clearHistory() {
    this.searchHistory.clear();
  }

  async getSearchStats() {
    let fullyIndexed = 0;
    let failed = 0;
    for (const entry of this.contentIndex.values()) {
      if (entry.error) failed++;
      else if (entry.fullyIndexed) fullyIndexed++;
    }
    return {
      indexedFiles: this.fileIndex.size,
      contentIndexed: this.contentIndex.size,
      fullyIndexed,
      failed,
      discoveredAt: this.discoveredAt,
      semanticSearchReady: !!this.semantic?.isInitialized,
    };
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  exportResults(results, format = "json") {
    const rows = results.map((file) => ({
      name: file.name,
      path: file.fullPath || file.path,
      size: file.size,
      type: file.isDirectory ? "directory" : "file",
      modified: file.modifiedTime || file.modifiedAt || "",
      matchedBy: (file.sources || []).join("|"),
    }));
    return format === "csv" ? toCsv(rows) : JSON.stringify(rows, null, 2);
  }
}

// Dates arrive as Date objects over IPC but as strings after a reload; store one form.
function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

function toCsv(rows) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    const str = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(",")),
  ].join("\n");
}
