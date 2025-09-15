import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderIcon,
  DocumentIcon,
  ArrowTopRightOnSquareIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  MapPinIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  DocumentArrowDownIcon,
  TableCellsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Squares2X2Icon,
  ListBulletIcon,
  FunnelIcon,
  SparklesIcon,
  TagIcon,
  StarIcon,
} from "@heroicons/react/24/outline";
import {
  DocumentTextIcon,
  PhotoIcon,
  ArchiveBoxIcon,
  MusicalNoteIcon,
  VideoCameraIcon,
  CodeBracketIcon,
} from "@heroicons/react/24/solid";

const SearchResults = ({
  results = [],
  searchQuery = "",
  isSearching = false,
  onFileSelect,
  onFileDoubleClick,
  onNavigateToFile,
  onPreview,
  onDownload,
  onDelete,
  onExportResults,
  onBackToExplorer,
  selectedFiles = [],
  viewMode = "list", // 'list' or 'grid'
  onViewModeChange,
  sortBy = "relevance",
  onSortChange,
  className = "",
  // New props for unified search
  searchStats = null,
  isUnifiedSearchEnabled = false,
}) => {
  const [selectedResult, setSelectedResult] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [expandedResults, setExpandedResults] = useState(new Set()); // Track expanded search results

  const totalPages = Math.ceil(results.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedResults = results.slice(startIndex, endIndex);

  // Reset pagination when results change
  useEffect(() => {
    setCurrentPage(1);
    setExpandedResults(new Set()); // Reset expanded state when new search
  }, [results]);

  // Toggle expansion for a result
  const toggleResultExpansion = (index) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedResults(newExpanded);
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (date) => {
    if (!date) return "Unknown";

    // Handle different date formats
    let dateObj;
    if (date instanceof Date) {
      dateObj = date;
    } else if (typeof date === "string" || typeof date === "number") {
      dateObj = new Date(date);
    } else {
      return "Unknown";
    }

    // Check if date is valid
    if (isNaN(dateObj.getTime())) {
      return "Unknown";
    }

    return dateObj.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Helper function to get the modified date from file object
  const getModifiedDate = (file) => {
    // Try multiple possible date properties
    const possibleDates = [
      file.modifiedTime,
      file.modifiedAt,
      file.lastModified,
      file.modified,
      file.mtime,
      file.date,
      file.dateModified,
      file.lastModifiedDate,
      file.mtimeMs,
      file.stat?.mtime,
      file.stat?.mtimeMs,
    ];

    // Find the first valid date
    for (const dateValue of possibleDates) {
      if (dateValue) {
        // Handle timestamp in milliseconds
        if (typeof dateValue === "number") {
          return new Date(dateValue);
        }
        // Handle date strings or Date objects
        if (dateValue instanceof Date || typeof dateValue === "string") {
          const date = new Date(dateValue);
          if (!isNaN(date.getTime())) {
            return date;
          }
        }
      }
    }

    // Return current date as fallback if no valid date found
    return new Date();
  };

  const getFileIcon = (file) => {
    if (file.isDirectory) {
      return <FolderIcon className="w-5 h-5 text-blue-500" />;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();

    // Use solid icons for better visual distinction in search results
    switch (extension) {
      case "json":
      case "txt":
      case "md":
        return <DocumentTextIcon className="w-5 h-5 text-amber-500" />;
      case "jpg":
      case "jpeg":
      case "png":
      case "gif":
      case "svg":
        return <PhotoIcon className="w-5 h-5 text-green-500" />;
      case "zip":
      case "rar":
      case "7z":
        return <ArchiveBoxIcon className="w-5 h-5 text-purple-500" />;
      case "mp3":
      case "wav":
      case "flac":
        return <MusicalNoteIcon className="w-5 h-5 text-pink-500" />;
      case "mp4":
      case "avi":
      case "mkv":
        return <VideoCameraIcon className="w-5 h-5 text-red-500" />;
      case "js":
      case "ts":
      case "py":
      case "java":
        return <CodeBracketIcon className="w-5 h-5 text-indigo-500" />;
      case "csv":
      case "parquet":
        return <TableCellsIcon className="w-5 h-5 text-emerald-500" />;
      default:
        return <DocumentIcon className="w-5 h-5 text-gray-500" />;
    }
  };

  const canPreviewFile = (file) => {
    if (file.isDirectory) return false;
    const extension = file.name.split(".").pop()?.toLowerCase();
    return ["json", "txt", "csv", "parquet", "md", "log"].includes(extension);
  };

  const highlightText = (text, query) => {
    if (!query) return text;

    const regex = new RegExp(
      `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi"
    );
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark
          key={index}
          className="bg-yellow-300 dark:bg-yellow-500 text-gray-900 dark:text-gray-900 px-1 py-0.5 rounded font-semibold"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const getPathBreadcrumb = (fullPath) => {
    if (!fullPath || typeof fullPath !== "string") return "/";
    const parts = fullPath.split("/").filter(Boolean);
    if (parts.length <= 1) return "/";

    const dir = "/" + parts.slice(0, -1).join("/");
    return dir;
  };

  // Unified Search Helper Functions
  const getSourceBadges = (result) => {
    if (!result.sources) return null;

    const badges = [];

    if (result.sources.includes("filename")) {
      badges.push({
        text: "Name",
        icon: TagIcon,
        color: "blue",
      });
    }

    if (result.sources.includes("content")) {
      badges.push({
        text: "Content",
        icon: DocumentIcon,
        color: "green",
      });
    }

    if (result.sources.includes("semantic")) {
      badges.push({
        text: "AI",
        icon: SparklesIcon,
        color: "purple",
      });
    }

    return badges;
  };

  const formatSnippet = (snippet, maxLength = 150) => {
    if (!snippet) return "";
    if (snippet.length <= maxLength) return snippet;

    // Try to break at word boundary
    const truncated = snippet.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");

    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace) + "...";
    }

    return truncated + "...";
  };

  const sortOptions = [
    { id: "relevance", label: "Relevance" },
    { id: "name", label: "Name" },
    { id: "size", label: "Size" },
    { id: "date", label: "Date Modified" },
    { id: "type", label: "Type" },
  ];

  const handleResultClick = (result, index) => {
    setSelectedResult(index);
    onFileSelect([result]);
  };

  const handleExport = (format) => {
    onExportResults(results, format);
  };

  if (isSearching) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Searching files...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col h-full bg-white dark:bg-gray-800 ${className}`}
    >
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button
                onClick={onBackToExplorer}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <ChevronLeftIcon className="w-4 h-4" />
                Back to Explorer
              </button>

              <div className="h-4 border-l border-gray-300 dark:border-gray-600"></div>

              <div className="flex items-center gap-2">
                <MagnifyingGlassIcon className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Search results for:{" "}
                  <span className="font-medium text-gray-900 dark:text-white">
                    "{searchQuery}"
                  </span>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* View Mode Toggle */}
              <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                <button
                  onClick={() => onViewModeChange("list")}
                  className={`p-2 ${
                    viewMode === "list"
                      ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                  title="List View"
                >
                  <ListBulletIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onViewModeChange("grid")}
                  className={`p-2 ${
                    viewMode === "grid"
                      ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                  title="Grid View"
                >
                  <Squares2X2Icon className="w-4 h-4" />
                </button>
              </div>

              {/* Sort Dropdown */}
              <select
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                {sortOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    Sort by {option.label}
                  </option>
                ))}
              </select>

              {/* Export Dropdown */}
              <div className="relative">
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleExport(e.target.value);
                      e.target.value = "";
                    }
                  }}
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  defaultValue=""
                >
                  <option value="">Export...</option>
                  <option value="json">Export as JSON</option>
                  <option value="csv">Export as CSV</option>
                </select>
              </div>
            </div>
          </div>

          {/* Results Summary and Pagination */}
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>
              {results.length === 0
                ? "No results found"
                : `${results.length} result${
                    results.length === 1 ? "" : "s"
                  } found`}
            </span>

            {/* Top Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center gap-4">
                <span>
                  Page {currentPage} of {totalPages} • Showing {startIndex + 1}-
                  {Math.min(endIndex, results.length)} of {results.length}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Previous page"
                  >
                    <ChevronLeftIcon className="w-4 h-4" />
                  </button>

                  <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded">
                    {currentPage} / {totalPages}
                  </span>

                  <button
                    onClick={() =>
                      setCurrentPage(Math.min(totalPages, currentPage + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Next page"
                  >
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Results Container - Fixed structure to always show pagination */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Scrollable Results Area */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
          <style jsx>{`
            .scrollbar-hide {
              -ms-overflow-style: none; /* Internet Explorer 10+ */
              scrollbar-width: none; /* Firefox */
            }
            .scrollbar-hide::-webkit-scrollbar {
              display: none; /* Safari and Chrome */
            }
          `}</style>
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
              <MagnifyingGlassIcon className="w-16 h-16 mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No results found</h3>
              <p className="text-center max-w-md">
                Try adjusting your search terms or filters. Make sure all words
                are spelled correctly or try different keywords.
              </p>
            </div>
          ) : viewMode === "list" ? (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              `
              {paginatedResults.map((result, index) => {
                const sourceBadges = getSourceBadges(result);

                return (
                  <motion.div
                    key={`${result.fullPath || result.path}-${index}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors ${
                      selectedResult === index + startIndex
                        ? "bg-primary-50 dark:bg-primary-900/20"
                        : ""
                    }`}
                    onClick={() =>
                      handleResultClick(result, index + startIndex)
                    }
                    onDoubleClick={() => onFileDoubleClick(result)}
                  >
                    <div className="flex items-start gap-4">
                      {/* File Icon & Name */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {getFileIcon(result)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-gray-900 dark:text-white truncate">
                              {highlightText(
                                result.filename || result.name,
                                searchQuery
                              )}
                            </h4>

                            {/* Source Badges */}
                            {sourceBadges && (
                              <div className="flex items-center gap-1">
                                {sourceBadges.map((badge, idx) => (
                                  <span
                                    key={idx}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                                    ${
                                      badge.color === "blue"
                                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                        : badge.color === "green"
                                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                        : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                                    }`}
                                  >
                                    <badge.icon className="w-3 h-3" />
                                    {badge.text}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Snippet */}
                          {result.snippet && (
                            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2 leading-relaxed">
                              {highlightText(
                                formatSnippet(result.snippet),
                                searchQuery
                              )}
                            </p>
                          )}

                          {/* Match Reasons */}
                          {result.matchReasons &&
                            result.matchReasons.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-2">
                                {result.matchReasons
                                  .slice(0, 2)
                                  .map((reason, idx) => (
                                    <span
                                      key={idx}
                                      className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded"
                                    >
                                      {reason}
                                    </span>
                                  ))}
                              </div>
                            )}

                          {/* Content Matches - Expandable */}
                          {result.matches && result.matches.length > 0 && (
                            <div className="mb-3">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleResultExpansion(index);
                                }}
                                className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                              >
                                <MagnifyingGlassIcon className="w-4 h-4" />
                                {result.totalMatches} match
                                {result.totalMatches !== 1 ? "es" : ""} found
                                <span className="text-xs">
                                  {expandedResults.has(index)
                                    ? "(hide)"
                                    : "(show)"}
                                </span>
                              </button>

                              {expandedResults.has(index) && (
                                <div className="mt-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-3">
                                  {result.matches
                                    .slice(0, 5)
                                    .map((match, matchIdx) => (
                                      <div
                                        key={matchIdx}
                                        className="text-sm border-l-2 border-blue-400 pl-3"
                                      >
                                        <div className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
                                          <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded-md text-xs font-medium">
                                            {match.type === "field"
                                              ? "Field Name"
                                              : match.type === "value"
                                              ? "Field Value"
                                              : match.type === "content"
                                              ? "Content Match"
                                              : match.context || "Match"}
                                          </span>
                                        </div>
                                        <div className="text-gray-700 dark:text-gray-300 font-mono bg-white dark:bg-gray-700 rounded px-3 py-2 text-sm break-all border shadow-sm">
                                          {highlightText(
                                            match.value ||
                                              match.text ||
                                              match.context ||
                                              "Found in content",
                                            searchQuery
                                          )}
                                        </div>
                                        {match.path && (
                                          <div className="text-xs text-gray-400 mt-1">
                                            Path: {match.path}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  {result.matches.length > 5 && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                                      ... and {result.matches.length - 5} more
                                      match
                                      {result.matches.length - 5 !== 1
                                        ? "es"
                                        : ""}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                            <MapPinIcon className="w-3 h-3" />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onNavigateToFile(result);
                              }}
                              className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors truncate"
                              title="Navigate to file location"
                            >
                              {getPathBreadcrumb(
                                result.fullPath || result.path
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* File Details */}
                      <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
                        <div className="text-right">
                          <div>
                            {result.isDirectory
                              ? "Folder"
                              : formatFileSize(result.size)}
                          </div>
                          <div className="flex items-center gap-1">
                            <ClockIcon className="w-3 h-3" />
                            {formatDate(getModifiedDate(result))}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateToFile(result);
                            }}
                            className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900 rounded transition-colors"
                            title="Navigate to location"
                          >
                            <ArrowTopRightOnSquareIcon className="w-4 h-4 text-blue-500" />
                          </button>

                          {!result.isDirectory && canPreviewFile(result) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onPreview(result);
                              }}
                              className="p-1.5 hover:bg-green-100 dark:hover:bg-green-900 rounded transition-colors"
                              title="Preview"
                            >
                              <EyeIcon className="w-4 h-4 text-green-500" />
                            </button>
                          )}

                          {!result.isDirectory && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDownload(result);
                              }}
                              className="p-1.5 hover:bg-purple-100 dark:hover:bg-purple-900 rounded transition-colors"
                              title="Download"
                            >
                              <ArrowDownTrayIcon className="w-4 h-4 text-purple-500" />
                            </button>
                          )}

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(result);
                            }}
                            className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900 rounded transition-colors"
                            title="Delete"
                          >
                            <TrashIcon className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            /* Grid View */
            <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {paginatedResults.map((result, index) => (
                <motion.div
                  key={`${result.fullPath}-${index}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.02 }}
                  className={`p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md cursor-pointer transition-all ${
                    selectedResult === index + startIndex
                      ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                      : "hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                  onClick={() => handleResultClick(result, index + startIndex)}
                  onDoubleClick={() => onFileDoubleClick(result)}
                >
                  <div className="text-center">
                    <div className="flex justify-center mb-2">
                      {getFileIcon(result)}
                    </div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate mb-1">
                      {highlightText(result.name, searchQuery)}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {result.isDirectory
                        ? "Folder"
                        : formatFileSize(result.size)}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination Footer - Adjusted width */}
        {totalPages > 1 && (
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 sticky bottom-0 max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeftIcon className="w-4 h-4" />
                Previous
              </button>

              <div className="flex items-center gap-2">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum =
                    Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                        pageNum === currentPage
                          ? "bg-primary-600 text-white"
                          : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() =>
                  setCurrentPage(Math.min(totalPages, currentPage + 1))
                }
                disabled={currentPage === totalPages}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchResults;
