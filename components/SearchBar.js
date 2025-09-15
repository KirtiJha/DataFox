import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  AdjustmentsHorizontalIcon,
  ClockIcon,
  BookmarkIcon,
  ChevronDownIcon,
  FunnelIcon,
  ArrowPathIcon,
  SparklesIcon,
  DocumentIcon,
  FolderIcon,
} from "@heroicons/react/24/outline";

const SearchBar = ({
  searchQuery = "",
  onSearchChange,
  onFilterToggle,
  showFilters = false,
  searchHistory = [],
  savedFilters = [],
  onApplySavedFilter,
  onClearSearch,
  onSearchSubmit,
  isSearching = false,
  searchResults = [],
  placeholder = "Search files, content, or describe what you're looking for...",
  // New props for unified search
  searchStats = null,
  isUnifiedSearchReady = false,
}) => {
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [showHistory, setShowHistory] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Sync with external searchQuery changes
  useEffect(() => {
    if (searchQuery !== localQuery) {
      setLocalQuery(searchQuery);
    }
  }, [searchQuery]);

  // Handle outside clicks
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowHistory(false);
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setLocalQuery(value);
    setShowSuggestions(value.length > 0);
    setShowHistory(false);
  };

  const handleInputFocus = () => {
    if (localQuery.length === 0 && searchHistory.length > 0) {
      setShowHistory(true);
    } else if (localQuery.length > 0) {
      setShowSuggestions(true);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
      setShowHistory(false);
      setShowSuggestions(false);
      searchInputRef.current?.blur();
    } else if (e.key === "Escape") {
      setShowHistory(false);
      setShowSuggestions(false);
      searchInputRef.current?.blur();
    }
  };

  const handleSearch = () => {
    onSearchChange(localQuery);
    onSearchSubmit && onSearchSubmit(localQuery);
  };

  const handleHistoryClick = (historyItem) => {
    setLocalQuery(historyItem);
    onSearchChange(historyItem);
    setShowHistory(false);
    setShowSuggestions(false);
  };

  const handleClear = () => {
    setLocalQuery("");
    onClearSearch();
    setShowHistory(false);
    setShowSuggestions(false);
    searchInputRef.current?.focus();
  };

  const getSearchSuggestions = () => {
    if (!localQuery) return [];

    // Simple suggestions based on common file operations
    const suggestions = [
      `${localQuery}*`,
      `*.${localQuery}`,
      `*${localQuery}*`,
    ].filter((suggestion) => suggestion !== localQuery);

    return suggestions.slice(0, 3);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Main Search Bar */}
      <div className="relative flex items-center">
        {/* Search Input Container */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {isSearching ? (
              <ArrowPathIcon className="h-5 w-5 text-gray-400 animate-spin" />
            ) : (
              <div className="flex items-center space-x-1">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                {isUnifiedSearchReady && (
                  <SparklesIcon
                    className="h-3 w-3 text-purple-500"
                    title="AI-powered search enabled"
                  />
                )}
              </div>
            )}
          </div>

          <input
            ref={searchInputRef}
            type="text"
            value={localQuery}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={`block w-full py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 ${
              isUnifiedSearchReady ? "pl-14" : "pl-10"
            } ${localQuery ? "pr-20" : "pr-12"}`}
          />

          {/* Search and Clear Buttons */}
          <div className="absolute inset-y-0 right-0 flex items-center">
            {/* Search Button */}
            <button
              onClick={handleSearch}
              disabled={!localQuery.trim()}
              className="p-2 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Search"
            >
              <MagnifyingGlassIcon className="h-4 w-4" />
            </button>

            {/* Clear Button */}
            {localQuery && (
              <button
                onClick={handleClear}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Clear search"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Toggle Button */}
        <button
          onClick={onFilterToggle}
          className={`ml-2 px-3 py-2.5 rounded-lg border transition-all duration-200 flex items-center gap-2 ${
            showFilters
              ? "bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-600 text-primary-700 dark:text-primary-300"
              : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          }`}
          title="Toggle Filters"
        >
          <FunnelIcon className="h-4 w-4" />
          <span className="hidden sm:inline text-sm font-medium">Filters</span>
          {showFilters && (
            <ChevronDownIcon className="h-3 w-3 transform rotate-180" />
          )}
        </button>
      </div>

      {/* Search Results Counter */}
      {searchQuery && (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {isSearching ? (
            <span>Searching...</span>
          ) : (
            <span>
              {searchResults.length === 0
                ? "No results found"
                : `${searchResults.length} result${
                    searchResults.length === 1 ? "" : "s"
                  } found`}
            </span>
          )}
        </div>
      )}

      {/* Dropdown for History and Suggestions */}
      <AnimatePresence>
        {(showHistory || showSuggestions) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto"
          >
            {/* Search History */}
            {showHistory && searchHistory.length > 0 && (
              <div className="p-2">
                <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  <ClockIcon className="h-3 w-3" />
                  Recent Searches
                </div>
                {searchHistory.slice(0, 5).map((item, index) => (
                  <button
                    key={index}
                    onClick={() => handleHistoryClick(item)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}

            {/* Search Suggestions */}
            {showSuggestions && getSearchSuggestions().length > 0 && (
              <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  <MagnifyingGlassIcon className="h-3 w-3" />
                  Suggestions
                </div>
                {getSearchSuggestions().map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleHistoryClick(suggestion)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {/* Saved Filters */}
            {showHistory && savedFilters.length > 0 && (
              <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  <BookmarkIcon className="h-3 w-3" />
                  Saved Filters
                </div>
                {savedFilters.slice(0, 3).map((filter, index) => (
                  <button
                    key={index}
                    onClick={() =>
                      onApplySavedFilter && onApplySavedFilter(filter)
                    }
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                  >
                    <div className="font-medium">{filter.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {filter.description}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SearchBar;
