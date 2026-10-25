/**
 * One SearchEngine per connection, shared by the file explorer and the AI
 * assistant. Engines load their saved index on creation.
 */

import { SearchEngine } from "./searchEngine";

const engines = new Map();

/** Stable id for a connection; also names its saved index file. */
export function connectionIdFor(connectionInfo) {
  if (!connectionInfo) return null;
  const raw =
    connectionInfo.type === "s3"
      ? `s3-${connectionInfo.bucket}-${connectionInfo.region}`
      : `ftp-${connectionInfo.host}-${connectionInfo.port}-${connectionInfo.username}`;
  return raw.replace(/[^a-zA-Z0-9\-_]/g, "-");
}

export function getSearchEngine(connectionInfo) {
  const connectionId = connectionIdFor(connectionInfo);
  if (!connectionId) return null;

  if (!engines.has(connectionId)) {
    const engine = new SearchEngine(connectionId, { protocol: connectionInfo.type });
    engines.set(connectionId, engine);
    // initializeStorage always marks the engine ready, even if loading fails.
    engine.initializeStorage();
  }
  return engines.get(connectionId);
}

/** Stop indexing and drop the engine; its saved index stays on disk. */
export function cleanupSearchEngine(connectionInfo) {
  const connectionId = connectionIdFor(connectionInfo);
  const engine = engines.get(connectionId);
  if (engine) {
    engine.stopBackgroundIndexing();
    engines.delete(connectionId);
  }
}
