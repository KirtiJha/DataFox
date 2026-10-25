/**
 * File-type helpers shared by the search engine, indexer and filters.
 */

// Extensions whose content can be indexed for content search. Keep in sync
// with src/managers/fileContent.js, which does the actual extraction.
export const CONTENT_INDEXABLE_EXTENSIONS = new Set([
  "json",
  "parquet",
  "csv",
  "txt",
  "xml",
  "yaml",
  "yml",
  "log",
  "md",
]);

// Files larger than this are never downloaded for indexing.
export const MAX_INDEXABLE_SIZE = 50 * 1024 * 1024;

const TYPE_MAP = {
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

export function getFileExtension(filename = "") {
  const lastDot = filename.lastIndexOf(".");
  return lastDot > 0 ? filename.slice(lastDot + 1).toLowerCase() : "";
}

export function getFileType(filename) {
  return TYPE_MAP[getFileExtension(filename)] || null;
}

export function isContentIndexable(file) {
  if (!file || file.isDirectory) return false;
  return (
    CONTENT_INDEXABLE_EXTENSIONS.has(getFileExtension(file.name)) &&
    (file.size || 0) <= MAX_INDEXABLE_SIZE
  );
}

export function normalizePath(path) {
  return path.replace(/\/+/g, "/").replace(/(.)\/$/, "$1") || "/";
}

export function joinPath(dir, name) {
  return normalizePath(`${dir || "/"}/${name}`);
}

export function parentPath(fullPath) {
  const index = fullPath.lastIndexOf("/");
  return index <= 0 ? "/" : fullPath.slice(0, index);
}

/** Modification time as epoch ms, or null when unknown. */
export function getModifiedTime(file) {
  const value =
    file.mtime ??
    file.modifiedAt ??
    file.modifiedTime ??
    file.lastModified ??
    file.modified;
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const time = new Date(value).getTime();
  return isNaN(time) ? null : time;
}

export function buildSearchableText(file) {
  const parts = [
    file.name.toLowerCase(),
    getFileExtension(file.name),
    file.isDirectory ? "folder directory" : "file",
  ];
  if (!file.isDirectory) {
    parts.push(getFileType(file.name));
  }
  return parts.filter(Boolean).join(" ");
}
