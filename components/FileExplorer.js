import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderIcon,
  DocumentIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  TrashIcon,
  PlusIcon,
  ArrowPathIcon,
  EllipsisHorizontalIcon,
  HomeIcon,
  ChevronRightIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  CloudArrowUpIcon,
  EyeIcon,
  DocumentTextIcon,
  TableCellsIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  DocumentArrowDownIcon,
} from "@heroicons/react/24/outline";
import SearchBar from "./SearchBar";
import FilterPanel from "./FilterPanel";
import QuickFilters from "./QuickFilters";
import SearchResults from "./SearchResults";
import { SearchEngine } from "../utils/searchEngine";

// Connection-specific search engine manager
const connectionSearchEngines = new Map();

// Cleanup function to remove old search engines (can be called when connections are closed)
export const cleanupSearchEngine = (connectionInfo) => {
  if (!connectionInfo) return;

  const connectionId =
    connectionInfo.type === "s3"
      ? `s3-${connectionInfo.bucket}-${connectionInfo.region}`.replace(
          /[^a-zA-Z0-9\-_]/g,
          "-"
        )
      : `ftp-${connectionInfo.host}-${connectionInfo.port}-${connectionInfo.username}`.replace(
          /[^a-zA-Z0-9\-_]/g,
          "-"
        );

  if (connectionSearchEngines.has(connectionId)) {
    console.log(`🧹 Cleaning up search engine for connection: ${connectionId}`);
    connectionSearchEngines.delete(connectionId);
  }
};

const FileExplorer = ({
  files,
  currentPath,
  loading,
  selectedFiles,
  connectionInfo,
  onFileSelect,
  onFileDoubleClick,
  onNavigateUp,
  onNavigateTo,
  onRefresh,
  onDownload,
  onPreview,
  onDelete,
  onUpload,
  onCreateFolder,
  onIndexingStatusChange, // New prop to communicate indexing status back to parent
}) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [rawSearchResults, setRawSearchResults] = useState([]); // Store unfiltered results
  const [searchResults, setSearchResults] = useState([]); // Store filtered results
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState({});
  const [savedFilters, setSavedFilters] = useState([]);
  const [searchHistory, setSearchHistory] = useState([]);
  const [searchScope, setSearchScope] = useState("all"); // 'all' or 'current'
  const [searchViewMode, setSearchViewMode] = useState("list");
  const [searchSortBy, setSearchSortBy] = useState("relevance");

  const [savedSearchState, setSavedSearchState] = useState(null); // Add this to store search state

  // Add these state variables after the existing ones
  const [showBackToSearchButton, setShowBackToSearchButton] = useState(false);

  // Unified Search State
  const [isUnifiedSearchReady, setIsUnifiedSearchReady] = useState(false);
  const [searchStats, setSearchStats] = useState(null);

  // Indexing Status State
  const [localIndexingStatus, setLocalIndexingStatus] = useState({
    isIndexing: false,
    isPaused: false,
    progress: { current: 0, total: 0, fileName: "" },
    totalIndexed: 0,
  });

  // Refs to prevent flickering
  const searchTimeoutRef = useRef(null);
  const isSearchingRef = useRef(false);

  // Create stable connection ID that only changes when connection details change
  const connectionId = useMemo(() => {
    if (!connectionInfo) return null;

    return connectionInfo.type === "s3"
      ? `s3-${connectionInfo.bucket}-${connectionInfo.region}`.replace(
          /[^a-zA-Z0-9\-_]/g,
          "-"
        )
      : `ftp-${connectionInfo.host}-${connectionInfo.port}-${connectionInfo.username}`.replace(
          /[^a-zA-Z0-9\-_]/g,
          "-"
        );
  }, [
    connectionInfo?.type,
    connectionInfo?.bucket,
    connectionInfo?.region,
    connectionInfo?.host,
    connectionInfo?.port,
    connectionInfo?.username,
  ]);

  // Get or create connection-specific search engine
  const getSearchEngine = useCallback(() => {
    if (!connectionId) {
      console.warn("No connection info available for search engine");
      return null;
    }

    // Get existing search engine or create new one
    if (!connectionSearchEngines.has(connectionId)) {
      console.log(
        `🔍 Creating new search engine for connection: ${connectionId}`
      );
      const newEngine = new SearchEngine(connectionId);
      connectionSearchEngines.set(connectionId, newEngine);

      // ✅ FIXED: Initialize storage immediately and synchronously mark as ready
      newEngine
        .initializeStorage()
        .then((success) => {
          if (success) {
            console.log(
              `📥 Loaded existing index for connection: ${connectionId}`
            );
          } else {
            console.log(
              `📝 No existing index found for connection: ${connectionId}, will create new one`
            );
          }
          newEngine.storageReady = true; // Mark storage as ready
        })
        .catch((error) => {
          console.log(
            `📝 Failed to load existing index for connection: ${connectionId}, will create new one:`,
            error
          );
          newEngine.storageReady = true; // Mark as ready even if loading failed
        });
    } else {
      console.log(
        `🔍 Using existing search engine for connection: ${connectionId}`
      );
    }

    return connectionSearchEngines.get(connectionId);
  }, [connectionId]);

  // Load saved state from localStorage
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem("ftp-search-history");
      if (savedHistory) {
        setSearchHistory(JSON.parse(savedHistory));
      }

      const savedFiltersData = localStorage.getItem("ftp-saved-filters");
      if (savedFiltersData) {
        setSavedFilters(JSON.parse(savedFiltersData));
      }
    } catch (error) {
      console.error("Error loading saved search data:", error);
    }
  }, []);

  // Build search index when files change
  useEffect(() => {
    const searchEngine = getSearchEngine();
    if (files && files.length > 0 && searchEngine) {
      console.log(
        `📂 Building index for ${files.length} files in path: ${currentPath}`
      );
      searchEngine.buildIndex(files, currentPath);
    }
  }, [files, currentPath]); // ✅ FIXED: Removed getSearchEngine to prevent unnecessary re-runs

  // Start background content indexing when search engine and files are available
  useEffect(() => {
    const startIndexingWhenReady = async () => {
      const searchEngine = getSearchEngine();
      if (
        !searchEngine ||
        !files ||
        files.length === 0 ||
        searchEngine.isIndexing
      ) {
        if (searchEngine && searchEngine.isIndexing) {
          console.log(
            "🔄 Indexing already in progress, skipping new indexing request"
          );
        }
        return;
      }

      // ✅ FIXED: Wait for storage initialization before starting indexing
      console.log(
        "⏳ Waiting for storage initialization before starting indexing..."
      );

      // Wait for storage to be ready (max 5 seconds)
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds (100ms intervals)

      while (!searchEngine.storageReady && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }

      if (!searchEngine.storageReady) {
        console.warn(
          "⚠️ Storage initialization timed out, starting indexing anyway"
        );
        searchEngine.storageReady = true; // Fallback
      }

      console.log(
        "🚀 Storage ready! Starting background content indexing for connection-specific search engine"
      );

      const onIndexingProgress = (progress) => {
        console.log(
          `📊 Indexing progress: ${progress.current}/${progress.total} - ${
            progress.fileName || ""
          }`
        );

        // Update local indexing status
        const newStatus = {
          isIndexing: !progress.completed,
          isPaused: false,
          progress: progress,
          totalIndexed: searchEngine.contentIndex?.size || 0,
        };

        setLocalIndexingStatus(newStatus);

        // Notify parent component
        if (onIndexingStatusChange) {
          onIndexingStatusChange(newStatus);
        }
      };

      // Start background indexing
      searchEngine
        .startBackgroundIndexing(onIndexingProgress)
        .catch((error) => {
          console.error("Failed to start background indexing:", error);

          // Update status to show indexing stopped due to error
          const errorStatus = {
            isIndexing: false,
            isPaused: false,
            progress: { current: 0, total: 0, fileName: "" },
            totalIndexed: searchEngine.contentIndex?.size || 0,
          };

          setLocalIndexingStatus(errorStatus);
          if (onIndexingStatusChange) {
            onIndexingStatusChange(errorStatus);
          }
        });
    };

    startIndexingWhenReady();
  }, [files, connectionId]); // ✅ FIXED: Use connectionId instead of getSearchEngine to prevent unnecessary re-runs

  // Check unified search status
  useEffect(() => {
    const checkUnifiedSearchStatus = async () => {
      const searchEngine = getSearchEngine();
      if (!searchEngine) return;

      try {
        setIsUnifiedSearchReady(searchEngine.isUnifiedSearchReady);

        if (searchEngine.isUnifiedSearchReady) {
          const stats = await searchEngine.unifiedSearch.getSearchStats();
          setSearchStats(stats);
        }
      } catch (error) {
        console.warn("Failed to get search stats:", error);
      }
    };

    // Check immediately and then periodically
    checkUnifiedSearchStatus();
    const interval = setInterval(checkUnifiedSearchStatus, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [connectionId]); // ✅ FIXED: Use connectionId instead of getSearchEngine

  // Perform search when query or filters change - Fixed to prevent flickering
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const performSearch = async () => {
      // Prevent multiple concurrent searches
      if (isSearchingRef.current) {
        return;
      }

      const searchEngine = getSearchEngine();
      if (!searchEngine) {
        console.warn("Search engine not available");
        return;
      }

      if (!searchQuery.trim()) {
        setRawSearchResults([]);
        setSearchResults([]);
        setIsSearchMode(false);
        setIsSearching(false);
        isSearchingRef.current = false;
        return;
      }

      isSearchingRef.current = true;
      setIsSearching(true);
      setIsSearchMode(true);

      try {
        const scope = searchScope === "current" ? currentPath : "all";

        // Use unified search if available
        const results = await searchEngine.search(
          searchQuery,
          {}, // Don't pass filters here - we'll apply them client-side
          scope
        );

        // Store raw results without sorting - sorting will be applied client-side
        setRawSearchResults(results);

        // Save search to history (moved to separate effect to avoid dependency loop)
        if (searchQuery.trim()) {
          setSearchHistory((prev) => {
            const newHistory = [
              searchQuery,
              ...prev.filter((h) => h !== searchQuery),
            ].slice(0, 20);
            localStorage.setItem(
              "ftp-search-history",
              JSON.stringify(newHistory)
            );
            return newHistory;
          });
        }
      } catch (error) {
        console.error("Search error:", error);
        setRawSearchResults([]);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
        isSearchingRef.current = false;
      }
    };

    searchTimeoutRef.current = setTimeout(performSearch, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, searchScope, currentPath, connectionId]); // ✅ FIXED: Use connectionId instead of getSearchEngine

  // Client-side filtering and sorting effect - applies filters and sorting to existing search results without re-searching
  useEffect(() => {
    const searchEngine = getSearchEngine();
    if (!searchEngine) return;

    if (rawSearchResults.length === 0) {
      setSearchResults([]);
      return;
    }

    let processedResults = rawSearchResults;

    // Apply filters if any are active
    if (Object.keys(activeFilters).length > 0) {
      processedResults = searchEngine.applyFilters(
        processedResults,
        activeFilters
      );
    }

    // Apply sorting
    processedResults = sortSearchResults(processedResults, searchSortBy);

    setSearchResults(processedResults);
  }, [rawSearchResults, activeFilters, searchSortBy, connectionId]); // ✅ FIXED: Use connectionId instead of getSearchEngine

  const sortSearchResults = (results, sortBy) => {
    if (sortBy === "relevance") {
      return results; // Already sorted by relevance from search engine
    }

    return [...results].sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case "name":
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case "size":
          aValue = a.size || 0;
          bValue = b.size || 0;
          break;
        case "date":
          aValue = new Date(a.modifiedTime || a.modified || 0);
          bValue = new Date(b.modifiedTime || b.modified || 0);
          break;
        case "type":
          aValue = a.isDirectory
            ? "0_directory"
            : a.name.split(".").pop() || "";
          bValue = b.isDirectory
            ? "0_directory"
            : b.name.split(".").pop() || "";
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return -1;
      if (aValue > bValue) return 1;
      return 0;
    });
  };

  // Search and Filter Event Handlers
  const handleSearchChange = (query) => {
    setSearchQuery(query);
  };

  const handleFilterToggle = () => {
    setShowFilters(!showFilters);
  };

  const handleFilterChange = (filters) => {
    setActiveFilters(filters);
  };

  const handleFilterReset = () => {
    setActiveFilters({});
  };

  const handleQuickFilter = (quickFilters) => {
    // Merge quick filters with existing filters
    const newFilters = { ...activeFilters };

    Object.entries(quickFilters).forEach(([key, value]) => {
      if (Array.isArray(value) && newFilters[key]) {
        // Merge array values (for fileTypes, sizeRanges)
        const existing = Array.isArray(newFilters[key]) ? newFilters[key] : [];
        newFilters[key] = [...new Set([...existing, ...value])];
      } else {
        newFilters[key] = value;
      }
    });

    setActiveFilters(newFilters);
  };

  const handleClearFilters = () => {
    setActiveFilters({});
    setSearchQuery("");
  };

  const handleSaveFilter = (filter) => {
    const newSavedFilters = [...savedFilters, filter];
    setSavedFilters(newSavedFilters);
    localStorage.setItem("ftp-saved-filters", JSON.stringify(newSavedFilters));
  };

  const handleDeleteSavedFilter = (filterId) => {
    const newSavedFilters = savedFilters.filter((f) => f.id !== filterId);
    setSavedFilters(newSavedFilters);
    localStorage.setItem("ftp-saved-filters", JSON.stringify(newSavedFilters));
  };

  const handleApplySavedFilter = (filter) => {
    setActiveFilters(filter.filters);
    setSearchQuery(""); // Clear search when applying saved filter
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setActiveFilters({});
    setIsSearchMode(false);
    setRawSearchResults([]);
    setSearchResults([]);
  };

  // Check if any files are indexable for content search
  const hasIndexableFiles = files?.some((file) => {
    const searchEngine = getSearchEngine();
    return searchEngine?.isContentIndexable(file);
  });

  const handleSearchSubmit = (query) => {
    // Force immediate search
    setSearchQuery(query);
  };

  const handleBackToSearchResults = () => {
    if (savedSearchState) {
      setIsSearchMode(true);
      setSearchQuery(savedSearchState.searchQuery);
      setSearchResults(savedSearchState.searchResults);
      setRawSearchResults(savedSearchState.rawSearchResults);
      setActiveFilters(savedSearchState.activeFilters);
      setSearchViewMode(savedSearchState.searchViewMode);
      setSearchSortBy(savedSearchState.searchSortBy);
      setShowBackToSearchButton(false);
      setSavedSearchState(null);
    }
  };

  const handleNavigateToFile = (file) => {
    // Extract directory path from file path
    const filePath = file.fullPath || file.path;
    if (!filePath) {
      console.error("No path found for file:", file);
      return;
    }

    const pathParts = filePath.split("/");
    pathParts.pop(); // Remove filename
    const dirPath = pathParts.join("/") || "/";

    // Save current search state before navigating
    if (isSearchMode) {
      setSavedSearchState({
        searchQuery,
        searchResults,
        rawSearchResults,
        activeFilters,
        searchViewMode,
        searchSortBy,
      });
      setShowBackToSearchButton(true);
    }

    // Navigate to the directory and exit search mode
    setIsSearchMode(false);
    setSearchQuery("");
    setActiveFilters({});
    onNavigateTo(dirPath);
  };

  const handleExportResults = (results, format) => {
    const searchEngine = getSearchEngine();
    if (!searchEngine) {
      console.warn("Search engine not available for export");
      return;
    }

    try {
      const exportData = searchEngine.exportResults(results, format);
      const blob = new Blob([exportData], {
        type: format === "csv" ? "text/csv" : "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `search-results-${
        new Date().toISOString().split("T")[0]
      }.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };
  const formatFolderInfo = (fileCount) => {
    if (fileCount === undefined || fileCount === null) return "Folder";
    if (fileCount === 0) return "Folder"; // Changed from 'Empty' to 'Folder'
    return `${fileCount} item${fileCount === 1 ? "" : "s"}`;
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
    return (
      file.modifiedTime || file.modifiedAt || file.lastModified || file.modified
    );
  };

  const getFileIcon = (file) => {
    if (file.isDirectory) {
      return <FolderIcon className="w-5 h-5 text-blue-500" />;
    }

    // Get file extension
    const extension = file.name.split(".").pop()?.toLowerCase();

    switch (extension) {
      case "json":
        return <DocumentTextIcon className="w-5 h-5 text-amber-500" />;
      case "parquet":
        return <TableCellsIcon className="w-5 h-5 text-green-500" />;
      case "txt":
        return <DocumentTextIcon className="w-5 h-5 text-gray-500" />;
      case "csv":
        return <TableCellsIcon className="w-5 h-5 text-emerald-500" />;
      default:
        return <DocumentIcon className="w-5 h-5 text-gray-500" />;
    }
  };

  // Helper function to check if file can be previewed
  const canPreviewFile = (file) => {
    if (file.isDirectory) return false;
    const extension = file.name.split(".").pop()?.toLowerCase();
    return ["json", "txt", "csv", "parquet"].includes(extension);
  };

  const sortedFiles = [...files].sort((a, b) => {
    // Always put directories first
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;

    let aValue, bValue;
    switch (sortBy) {
      case "name":
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
        break;
      case "size":
        aValue = a.size || 0;
        bValue = b.size || 0;
        break;
      case "date":
        aValue = new Date(getModifiedDate(a));
        bValue = new Date(getModifiedDate(b));
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
    if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const handleFileClick = (file, index) => {
    setSelectedFile(index);
    onFileSelect([file]);
  };

  const handleFileContextMenu = (file, e) => {
    e.preventDefault();
    setSelectedFile(files.indexOf(file));
  };

  const renderPathBreadcrumbs = () => {
    const pathParts = currentPath.split("/").filter((part) => part !== "");

    return (
      <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
        {/* Back to Search Results Button */}
        {showBackToSearchButton && savedSearchState && (
          <>
            <button
              onClick={handleBackToSearchResults}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors mr-2"
              title="Return to search results"
            >
              <MagnifyingGlassIcon className="w-3 h-3" />
              Back to Search
            </button>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mr-2"></div>
          </>
        )}

        <button
          onClick={() => onNavigateTo && onNavigateTo("/")}
          className="flex items-center hover:text-gray-900 dark:hover:text-gray-200 transition-colors duration-200"
        >
          <HomeIcon className="w-4 h-4 mr-1" />
          Root
        </button>
        {pathParts.map((part, index) => {
          // Build the path up to this segment
          const pathToSegment = "/" + pathParts.slice(0, index + 1).join("/");
          return (
            <div key={index} className="flex items-center">
              <ChevronRightIcon className="w-3 h-3 mx-1" />
              <button
                onClick={() => onNavigateTo && onNavigateTo(pathToSegment)}
                className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors duration-200"
              >
                {part}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  // If in search mode, render search results
  if (isSearchMode) {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-gray-800">
        {/* Search Header */}
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 space-y-4">
          <SearchBar
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            onFilterToggle={handleFilterToggle}
            showFilters={showFilters}
            searchHistory={searchHistory}
            savedFilters={savedFilters}
            onApplySavedFilter={handleApplySavedFilter}
            onClearSearch={handleClearSearch}
            onSearchSubmit={handleSearchSubmit}
            isSearching={isSearching}
            searchResults={searchResults}
            placeholder="Search files and folders..."
            isUnifiedSearchReady={isUnifiedSearchReady}
          />

          <QuickFilters
            onQuickFilter={handleQuickFilter}
            activeFilters={activeFilters}
            onClearFilters={handleClearFilters}
          />

          <AnimatePresence>
            {showFilters && (
              <FilterPanel
                isOpen={showFilters}
                filters={activeFilters}
                onFilterChange={handleFilterChange}
                onFilterReset={handleFilterReset}
                onSaveFilter={handleSaveFilter}
                savedFilters={savedFilters}
                onDeleteSavedFilter={handleDeleteSavedFilter}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Search Results */}
        <SearchResults
          results={searchResults}
          searchQuery={searchQuery}
          isSearching={isSearching}
          onFileSelect={onFileSelect}
          onFileDoubleClick={onFileDoubleClick}
          onNavigateToFile={handleNavigateToFile}
          onPreview={onPreview}
          onDownload={onDownload}
          onDelete={onDelete}
          onExportResults={handleExportResults}
          onBackToExplorer={() => {
            setIsSearchMode(false);
            setSearchQuery("");
            setActiveFilters({});
            setShowBackToSearchButton(false);
            setSavedSearchState(null);
          }}
          selectedFiles={selectedFiles}
          viewMode={searchViewMode}
          searchStats={searchStats}
          onViewModeChange={setSearchViewMode}
          sortBy={searchSortBy}
          onSortChange={setSearchSortBy}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* Enhanced Toolbar with Search */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        {/* Main Toolbar */}
        <div className="flex items-center justify-between p-4 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onNavigateUp}
              disabled={currentPath === "/" || loading}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              title="Go Up"
            >
              <ArrowUpIcon className="w-4 h-4" />
            </button>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              title="Refresh"
            >
              <ArrowPathIcon
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>

          <div className="flex-1 mx-4">{renderPathBreadcrumbs()}</div>

          <div className="flex items-center gap-2">
            <button
              onClick={onUpload}
              disabled={loading}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              title="Upload files"
            >
              <CloudArrowUpIcon className="w-4 h-4" />
            </button>
            <button
              onClick={onCreateFolder}
              disabled={loading}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              title="Create new folder"
            >
              <PlusIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Section */}
        <div className="px-4 pb-4 space-y-3">
          <SearchBar
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            onFilterToggle={handleFilterToggle}
            showFilters={showFilters}
            searchHistory={searchHistory}
            savedFilters={savedFilters}
            onApplySavedFilter={handleApplySavedFilter}
            onClearSearch={handleClearSearch}
            onSearchSubmit={handleSearchSubmit}
            isSearching={isSearching}
            searchResults={searchResults}
            placeholder="Search files and folders..."
            isUnifiedSearchReady={isUnifiedSearchReady}
          />

          <QuickFilters
            onQuickFilter={handleQuickFilter}
            activeFilters={activeFilters}
            onClearFilters={handleClearFilters}
          />

          <AnimatePresence>
            {showFilters && (
              <FilterPanel
                isOpen={showFilters}
                filters={activeFilters}
                onFilterChange={handleFilterChange}
                onFilterReset={handleFilterReset}
                onSaveFilter={handleSaveFilter}
                savedFilters={savedFilters}
                onDeleteSavedFilter={handleDeleteSavedFilter}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* File List Header */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          <button
            className="col-span-6 text-left hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
            onClick={() => handleSort("name")}
          >
            Name
            {sortBy === "name" && (
              <span
                className={`transform ${
                  sortOrder === "desc" ? "rotate-180" : ""
                }`}
              >
                ↑
              </span>
            )}
          </button>
          <button
            className="col-span-2 text-left hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
            onClick={() => handleSort("size")}
          >
            Size
            {sortBy === "size" && (
              <span
                className={`transform ${
                  sortOrder === "desc" ? "rotate-180" : ""
                }`}
              >
                ↑
              </span>
            )}
          </button>
          <button
            className="col-span-3 text-left hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
            onClick={() => handleSort("date")}
          >
            Modified
            {sortBy === "date" && (
              <span
                className={`transform ${
                  sortOrder === "desc" ? "rotate-180" : ""
                }`}
              >
                ↑
              </span>
            )}
          </button>
          <div className="col-span-1 text-center">Actions</div>
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 border-t-transparent"></div>
          </div>
        ) : sortedFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500 dark:text-gray-400">
            <FolderIcon className="w-12 h-12 mb-2" />
            <p>This directory is empty</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {sortedFiles.map((file, index) => (
              <motion.div
                key={file.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                className={`grid grid-cols-12 gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors ${
                  selectedFile === index
                    ? "bg-primary-50 dark:bg-primary-900/20"
                    : ""
                }`}
                onClick={() => handleFileClick(file, index)}
                onDoubleClick={() => onFileDoubleClick(file)}
                onContextMenu={(e) => handleFileContextMenu(file, e)}
              >
                <div className="col-span-6 flex items-center gap-3 min-w-0">
                  {getFileIcon(file)}
                  <span className="truncate text-sm text-gray-900 dark:text-gray-100">
                    {file.name}
                  </span>
                </div>
                <div className="col-span-2 flex items-center text-sm text-gray-500 dark:text-gray-400">
                  {file.isDirectory
                    ? formatFolderInfo(file.fileCount)
                    : formatFileSize(file.size)}
                </div>
                <div className="col-span-3 flex items-center text-sm text-gray-500 dark:text-gray-400">
                  {formatDate(getModifiedDate(file))}
                </div>
                <div className="col-span-1 flex items-center justify-center">
                  <div className="flex items-center gap-1">
                    {!file.isDirectory && canPreviewFile(file) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreview && onPreview(file);
                        }}
                        className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900 rounded transition-colors"
                        title="Preview"
                      >
                        <EyeIcon className="w-4 h-4 text-blue-500" />
                      </button>
                    )}
                    {!file.isDirectory && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownload(file);
                        }}
                        className="p-1 hover:bg-green-100 dark:hover:bg-green-900 rounded transition-colors"
                        title="Download"
                      >
                        <ArrowDownTrayIcon className="w-4 h-4 text-green-500" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(file);
                      }}
                      className="p-1 hover:bg-red-100 dark:hover:bg-red-900 rounded transition-colors"
                      title="Delete"
                    >
                      <TrashIcon className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* File Info Panel */}
      {selectedFile !== null && sortedFiles[selectedFile] && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
          <div className="flex items-center gap-3">
            {getFileIcon(sortedFiles[selectedFile])}
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-gray-900 dark:text-white truncate">
                {sortedFiles[selectedFile].name}
              </h4>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {sortedFiles[selectedFile].isDirectory ? "Directory" : "File"} •
                {sortedFiles[selectedFile].isDirectory
                  ? ` ${formatFolderInfo(
                      sortedFiles[selectedFile].fileCount
                    )} • `
                  : ` ${formatFileSize(sortedFiles[selectedFile].size)} • `}
                Modified{" "}
                {formatDate(getModifiedDate(sortedFiles[selectedFile]))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!sortedFiles[selectedFile].isDirectory &&
                canPreviewFile(sortedFiles[selectedFile]) && (
                  <button
                    onClick={() =>
                      onPreview && onPreview(sortedFiles[selectedFile])
                    }
                    className="btn btn-primary btn-sm flex items-center gap-1"
                  >
                    <EyeIcon className="w-4 h-4" />
                    Preview
                  </button>
                )}
              {!sortedFiles[selectedFile].isDirectory && (
                <button
                  onClick={() => onDownload(sortedFiles[selectedFile])}
                  className="btn btn-secondary btn-sm flex items-center gap-1"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                  Download
                </button>
              )}
              <button
                onClick={() => onDelete(sortedFiles[selectedFile])}
                className="btn btn-danger btn-sm flex items-center gap-1"
              >
                <TrashIcon className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileExplorer;
