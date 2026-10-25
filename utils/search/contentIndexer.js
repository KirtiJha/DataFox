/**
 * Background indexing: crawls the remote tree and extracts content from
 * indexable files via the main process. Holds no index state itself; results
 * are handed back through callbacks.
 */

import { joinPath, getModifiedTime } from "./fileTypes";

// FTP runs one command at a time per connection, so more workers would only
// queue behind each other and delay the user's own browsing.
const CONCURRENCY_BY_PROTOCOL = { ftp: 1, ftps: 1, sftp: 4, s3: 8 };
const MAX_RETRIES = 2;
// Files that failed to index are retried after this long, even if unchanged.
const ERROR_RETRY_MS = 60 * 60 * 1000;

function api() {
  return typeof window !== "undefined" ? window.electronAPI : null;
}

export function concurrencyFor(protocol) {
  return CONCURRENCY_BY_PROTOCOL[protocol] || 2;
}

/** An entry is up to date when size and modification time are unchanged. */
export function isUnchanged(file, contentEntry) {
  if (!contentEntry) return false;
  if (contentEntry.error && Date.now() - (contentEntry.indexedAt || 0) > ERROR_RETRY_MS) {
    return false;
  }
  if ((file.size || 0) !== (contentEntry.size || 0)) return false;
  const mtime = getModifiedTime(file);
  return mtime === null || mtime === contentEntry.mtime;
}

/**
 * Run `worker` over `items` with at most `limit` in flight.
 * Stops picking up new items once `shouldStop()` returns true.
 */
async function runPool(items, limit, worker, shouldStop) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && !shouldStop()) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

export class ContentIndexer {
  constructor({ protocol, shouldStop }) {
    this.concurrency = concurrencyFor(protocol);
    this.shouldStop = shouldStop;
  }

  /**
   * Walk the remote tree from `startPath`, calling `onDirectory(path, entries)`
   * for every listed directory. Directories are listed in parallel batches.
   */
  async discover(startPath, onDirectory) {
    const pending = [startPath];

    while (pending.length > 0 && !this.shouldStop()) {
      const batch = pending.splice(0, this.concurrency);
      await Promise.all(
        batch.map(async (dirPath) => {
          const result = await api().ftpList(dirPath);
          if (!result.success) {
            console.warn(`Indexer: failed to list ${dirPath}:`, result.error);
            return;
          }
          const entries = result.data || [];
          onDirectory(dirPath, entries);
          for (const entry of entries) {
            if (entry.isDirectory) pending.push(joinPath(dirPath, entry.name));
          }
        })
      );
    }
  }

  /**
   * Extract content for each file, calling `onIndexed(file, contentEntry)`.
   * Failures are recorded as entries with an `error`; isUnchanged() retries
   * them after a while.
   */
  async indexFiles(files, onIndexed) {
    await runPool(
      files,
      this.concurrency,
      async (file) => {
        const entry = await this.extract(file);
        if (entry) await onIndexed(file, entry);
      },
      this.shouldStop
    );
  }

  async extract(file) {
    const meta = { name: file.name, size: file.size || 0, mtime: getModifiedTime(file) };

    for (let attempt = 0; ; attempt++) {
      const result = await api().ftpExtractContent(file.fullPath, file.size);
      if (result.success) {
        return { ...result.data, ...meta, indexedAt: Date.now() };
      }
      // A failure while stopping (e.g. disconnect) says nothing about the file.
      if (this.shouldStop()) return null;
      if (attempt >= MAX_RETRIES) {
        return { ...meta, error: result.error, searchableText: "", indexedAt: Date.now() };
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
}
