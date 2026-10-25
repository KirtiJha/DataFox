/**
 * Query parsing, metadata filters and content matching.
 * Pure functions with no knowledge of storage or indexing.
 */

import { getFileType, getModifiedTime } from "./fileTypes";

const MAX_MATCHES_PER_FILE = 50;

/**
 * Split a query into patterns: "quoted phrases", wild*cards and plain words.
 */
export function parseSearchQuery(query) {
  const patterns = [];
  let rest = query;

  for (const match of query.match(/"([^"]+)"/g) || []) {
    patterns.push({ type: "phrase", value: match.slice(1, -1).toLowerCase() });
    rest = rest.replace(match, " ");
  }

  for (const match of rest.match(/\S*[*?]\S*/g) || []) {
    patterns.push({ type: "wildcard", value: wildcardToRegExp(match) });
    rest = rest.replace(match, " ");
  }

  for (const word of rest.trim().split(/\s+/).filter(Boolean)) {
    patterns.push({ type: "word", value: word.toLowerCase() });
  }

  return patterns;
}

function wildcardToRegExp(pattern) {
  return new RegExp(
    "^" +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".") +
      "$",
    "i"
  );
}

/** A pattern matches a file if its name/path text (or name, for wildcards) contains it. */
export function matchesPattern(pattern, { name, text }) {
  if (pattern.type === "wildcard") return pattern.value.test(name);
  return text.includes(pattern.value);
}

/**
 * Find content matches for a query inside a content-index entry.
 * Every query term must appear somewhere in the file's content.
 */
export function findContentMatches(contentEntry, patterns) {
  const text = contentEntry.searchableText || "";
  const terms = patterns.filter((p) => p.type !== "wildcard");
  if (!text || terms.length === 0) return [];
  if (!terms.every((term) => text.includes(term.value))) return [];

  const matches = [];
  const addMatches = (items, type, context) => {
    (items || []).forEach((item, index) => {
      if (matches.length >= MAX_MATCHES_PER_FILE) return;
      const lower = String(item).toLowerCase();
      if (terms.some((term) => lower.includes(term.value))) {
        matches.push({ type, value: String(item), context, path: `${type}s[${index}]` });
      }
    });
  };

  addMatches(contentEntry.fields, "field", "Field name");
  addMatches(contentEntry.values, "value", "Field value");

  if (matches.length === 0) {
    matches.push({
      type: "content",
      value: snippetAround(text, terms[0].value),
      context: "Content match",
    });
  }

  return matches;
}

function snippetAround(text, term, radius = 60) {
  const index = text.indexOf(term);
  if (index === -1) return term;
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + term.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

/**
 * Apply the FilterPanel/QuickFilters filters to a list of files.
 */
export function applyFilters(files, filters = {}) {
  let filtered = files;

  if (filters.fileTypes?.length > 0) {
    filtered = filtered.filter(
      (file) => !file.isDirectory && filters.fileTypes.includes(getFileType(file.name))
    );
  }

  if (filters.sizeRanges?.length > 0) {
    filtered = filtered.filter(
      (file) => file.isDirectory || matchesSizeFilter(file.size || 0, filters.sizeRanges)
    );
  }

  if (filters.dateRange) {
    filtered = filtered.filter((file) =>
      matchesDateFilter(file, filters.dateRange, filters.customDateFrom, filters.customDateTo)
    );
  }

  if (filters.itemType && filters.itemType !== "all") {
    filtered = filtered.filter((file) => {
      if (filters.itemType === "files") return !file.isDirectory;
      if (filters.itemType === "folders") return file.isDirectory;
      return true;
    });
  }

  if (!filters.showHidden) {
    filtered = filtered.filter((file) => !file.name.startsWith("."));
  }

  return filtered;
}

const SIZE_RANGES = {
  tiny: { min: 0, max: 1024 },
  small: { min: 1024, max: 1024 * 1024 },
  medium: { min: 1024 * 1024, max: 100 * 1024 * 1024 },
  large: { min: 100 * 1024 * 1024, max: 1024 * 1024 * 1024 },
  huge: { min: 1024 * 1024 * 1024, max: Infinity },
};

function matchesSizeFilter(size, sizeRanges) {
  return sizeRanges.some((range) => {
    const { min, max } = SIZE_RANGES[range] || { min: 0, max: Infinity };
    return size >= min && size < max;
  });
}

function matchesDateFilter(file, dateRange, customFrom, customTo) {
  const time = getModifiedTime(file);
  if (time === null) return false;
  const fileDate = new Date(time);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = (days) => {
    const date = new Date(today);
    date.setDate(date.getDate() - days);
    return date;
  };

  switch (dateRange) {
    case "today":
      return fileDate >= today;
    case "yesterday":
      return fileDate >= daysAgo(1) && fileDate < today;
    case "thisWeek":
      return fileDate >= daysAgo(today.getDay());
    case "lastWeek": {
      const lastWeekEnd = daysAgo(today.getDay());
      const lastWeekStart = daysAgo(today.getDay() + 7);
      return fileDate >= lastWeekStart && fileDate < lastWeekEnd;
    }
    case "thisMonth":
      return fileDate >= new Date(now.getFullYear(), now.getMonth(), 1);
    case "lastMonth":
      return (
        fileDate >= new Date(now.getFullYear(), now.getMonth() - 1, 1) &&
        fileDate < new Date(now.getFullYear(), now.getMonth(), 1)
      );
    case "custom": {
      if (!customFrom && !customTo) return true;
      const fromDate = customFrom ? new Date(customFrom) : new Date(0);
      const toDate = customTo ? new Date(customTo + "T23:59:59") : new Date();
      return fileDate >= fromDate && fileDate <= toDate;
    }
    default:
      return true;
  }
}

/**
 * Score a filename/path match. Higher is better; 0 means no match.
 */
export function scoreFilenameMatch(file, query, patterns) {
  const name = file.name.toLowerCase();
  const path = (file.fullPath || "").toLowerCase();
  const text = `${file.searchableText || ""} ${path}`;

  if (!patterns.every((pattern) => matchesPattern(pattern, { name, text }))) {
    return 0;
  }

  let score = 10;
  if (name === query) score += 100;
  else if (name.startsWith(query)) score += 50;
  else if (name.includes(query)) score += 25;
  else if (path.includes(query)) score += 10;

  if (!file.isDirectory) score += 5;
  if (name.startsWith(".")) score -= 10;
  return score;
}
