/**
 * Persists a connection's search index via the Electron main process
 * (one JSON file per connection in the app's userData folder).
 */

const INDEX_FORMAT_VERSION = 2;
const INDEX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function api() {
  return typeof window !== "undefined" ? window.electronAPI : null;
}

export class IndexStore {
  constructor(connectionId) {
    this.connectionId = connectionId;
    this.indexFile = connectionId
      ? `search-index-${connectionId}.json`
      : "search-indexes.json";
    this.pendingSave = Promise.resolve();
  }

  get available() {
    return !!api()?.indexSave;
  }

  /**
   * Load { fileIndex, contentIndex, discoveredAt }, or null when there is no
   * usable index (missing, other connection, too old, or an older format).
   */
  async load() {
    if (!this.available) return null;

    const result = await api().indexLoad(this.indexFile);
    if (!result.success) {
      console.warn(`Index ${this.indexFile} unreadable, starting fresh:`, result.error);
      await api().indexDelete(this.indexFile);
      return null;
    }

    const data = result.data;
    if (!data) return null;

    if (
      data.version !== INDEX_FORMAT_VERSION ||
      (this.connectionId && data.connectionId !== this.connectionId) ||
      Date.now() - (data.lastSaved || 0) > INDEX_MAX_AGE_MS
    ) {
      // Earlier formats did not store field/value data, so rebuild instead of migrating.
      await this.clear();
      return null;
    }

    return {
      fileIndex: new Map(data.fileIndex || []),
      contentIndex: new Map(data.contentIndex || []),
      discoveredAt: data.discoveredAt || null,
    };
  }

  /** Save the index. Saves are serialized so writes never interleave. */
  save(fileIndex, contentIndex, { discoveredAt = null } = {}) {
    if (!this.available) return Promise.resolve(false);

    const payload = {
      version: INDEX_FORMAT_VERSION,
      connectionId: this.connectionId,
      lastSaved: Date.now(),
      discoveredAt,
      fileIndex: Array.from(fileIndex.entries()),
      contentIndex: Array.from(contentIndex.entries()),
    };

    const run = this.pendingSave.then(async () => {
      const result = await api().indexSave(payload, this.indexFile);
      if (!result.success) {
        console.error(`Failed to save ${this.indexFile}:`, result.error);
      }
      return result.success;
    });
    this.pendingSave = run.catch(() => false);
    return run;
  }

  async clear() {
    if (!this.available) return;
    await api().indexClear(this.indexFile);
  }
}
