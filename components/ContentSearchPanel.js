import React, { useState, useCallback, useEffect } from 'react';
import { debounce } from 'lodash';

const ContentSearchPanel = ({ 
  searchEngine, 
  onResultsChange, 
  isVisible, 
  currentQuery,
  ftpClient 
}) => {
  const [contentQuery, setContentQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [expandedResults, setExpandedResults] = useState(new Set());
  const [useMockData, setUseMockData] = useState(false); // Toggle for demo mode

    // Content search function using SearchEngine
  const searchFileContent = async (query) => {
    if (!query.trim() || !searchEngine) {
      return [];
    }

    try {
      // Use the SearchEngine's content search capabilities
      const contentResults = await searchEngine.searchContent(query);
      
      // Transform results to match our display format
      return contentResults.map(result => ({
        ...result,
        type: 'content',
        totalMatches: result.matches?.length || 0
      }));
    } catch (error) {
      console.error('Content search error:', error);
      return [];
    }
  };

  // Get mock data for demo purposes
  const getMockData = (file) => {
    if (file.name.includes('user')) {
      return [
        { id: 1, firstName: "John", lastName: "Doe", email: "john@example.com", status: "active" },
        { id: 2, firstName: "Jane", lastName: "Smith", email: "jane@company.com", status: "pending" },
        { id: 3, firstName: "Admin", lastName: "User", email: "admin@system.com", status: "admin" }
      ];
    } else if (file.name.includes('product')) {
      return [
        { id: 101, name: "Laptop", price: 999.99, category: "electronics", inStock: true },
        { id: 102, name: "Mouse", price: 29.99, category: "accessories", inStock: false },
        { id: 103, name: "Keyboard", price: 79.99, category: "accessories", inStock: true }
      ];
    } else {
      return {
        name: "Sample Document",
        type: "example", 
        description: "This is a sample file",
        metadata: { created: "2024-01-01", status: "active" }
      };
    }
  };

  // Download and search file content
  const downloadAndSearchFile = async (file, searchTerm) => {
    try {
      let jsonData;

      if (useMockData) {
        // Use mock data for demo
        jsonData = getMockData(file);
      } else {
        // Actually download the file content
        if (!ftpClient?.downloadFile) {
          console.warn('FTP client download not available, falling back to mock data');
          jsonData = getMockData(file);
        } else {
          try {
            // Download the file content
            const fileContent = await ftpClient.downloadFile(file.fullPath || file.name);
            
            // Parse JSON content
            if (typeof fileContent === 'string') {
              jsonData = JSON.parse(fileContent);
            } else if (fileContent instanceof ArrayBuffer) {
              const text = new TextDecoder().decode(fileContent);
              jsonData = JSON.parse(text);
            } else {
              jsonData = fileContent;
            }
          } catch (downloadError) {
            console.warn(`Failed to download ${file.name}, using mock data:`, downloadError);
            jsonData = getMockData(file);
          }
        }
      }

      const matches = searchInJsonData(jsonData, searchTerm, file.name);
      
      if (matches.length > 0) {
        return {
          ...file,
          type: 'json',
          matches: matches,
          totalMatches: matches.length,
          usingMockData: useMockData || !ftpClient?.downloadFile
        };
      }
      
      return null;
    } catch (error) {
      throw error;
    }
  };

  // Search within JSON data
  const searchInJsonData = (data, searchTerm) => {
    const matches = [];
    const seen = new Set();

    const searchRecursive = (obj, path = '') => {
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          searchRecursive(item, `${path}[${index}]`);
        });
      } else if (obj && typeof obj === 'object') {
        Object.entries(obj).forEach(([key, value]) => {
          const currentPath = path ? `${path}.${key}` : key;
          
          // Check field name
          if (key.toLowerCase().includes(searchTerm)) {
            const matchKey = `field:${key}`;
            if (!seen.has(matchKey)) {
              matches.push({
                type: 'field',
                value: key,
                context: 'Field name',
                path: currentPath
              });
              seen.add(matchKey);
            }
          }
          
          // Check field value
          if (value !== null && value !== undefined) {
            const valueStr = String(value).toLowerCase();
            if (valueStr.includes(searchTerm)) {
              const matchKey = `value:${key}:${value}`;
              if (!seen.has(matchKey)) {
                matches.push({
                  type: 'value',
                  value: String(value),
                  context: `Value in "${key}"`,
                  path: currentPath
                });
                seen.add(matchKey);
              }
            }
          }
          
          // Recurse into nested objects
          if (typeof value === 'object' && value !== null) {
            searchRecursive(value, currentPath);
          }
        });
      }
    };

    searchRecursive(data);
    return matches.slice(0, 20); // Limit results for performance
  };

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (query) => {
      if (!query.trim()) {
        setResults([]);
        onResultsChange?.([]);
        return;
      }

      setIsSearching(true);
      try {
        const searchResults = await searchFileContent(query);
        setResults(searchResults);
        onResultsChange?.(searchResults);
      } catch (error) {
        console.error('Content search error:', error);
        setResults([]);
        onResultsChange?.([]);
      } finally {
        setIsSearching(false);
      }
    }, 300),
    [ftpClient, onResultsChange]
  );

  // Effect to trigger search when query changes
  useEffect(() => {
    debouncedSearch(contentQuery);
  }, [contentQuery, debouncedSearch]);

  const toggleResultExpansion = (filePath) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(filePath)) {
      newExpanded.delete(filePath);
    } else {
      newExpanded.add(filePath);
    }
    setExpandedResults(newExpanded);
  };

  const renderMatch = (match, index) => {
    const getMatchIcon = (type) => {
      switch (type) {
        case 'field': return '🏷️';
        case 'value': return '💾';
        case 'error': return '❌';
        default: return '📝';
      }
    };

    const getMatchStyles = (type) => {
      switch (type) {
        case 'field': return {
          borderColor: 'border-l-blue-500',
          bgColor: 'bg-blue-50 dark:bg-blue-900/20',
          textColor: 'text-blue-700 dark:text-blue-300',
          codeBg: 'bg-blue-100 dark:bg-blue-800/30'
        };
        case 'value': return {
          borderColor: 'border-l-green-500',
          bgColor: 'bg-green-50 dark:bg-green-900/20',
          textColor: 'text-green-700 dark:text-green-300',
          codeBg: 'bg-green-100 dark:bg-green-800/30'
        };
        case 'error': return {
          borderColor: 'border-l-red-500',
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          textColor: 'text-red-700 dark:text-red-300',
          codeBg: 'bg-red-100 dark:bg-red-800/30'
        };
        default: return {
          borderColor: 'border-l-gray-500',
          bgColor: 'bg-gray-50 dark:bg-gray-800/50',
          textColor: 'text-gray-700 dark:text-gray-300',
          codeBg: 'bg-gray-100 dark:bg-gray-700/50'
        };
      }
    };

    const styles = getMatchStyles(match.type);

    return (
      <div 
        key={index}
        className={`p-2 my-1 rounded border-l-4 ${styles.borderColor} ${styles.bgColor} text-sm flex items-center gap-2`}
      >
        <span>{getMatchIcon(match.type)}</span>
        <span className={`font-medium ${styles.textColor}`}>
          {match.context}:
        </span>
        <code className={`${styles.codeBg} px-1 py-0.5 rounded text-xs`}>
          {match.value}
        </code>
        {match.path && (
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
            {match.path}
          </span>
        )}
      </div>
    );
  };

  if (!isVisible) return null;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4 shadow-sm">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
          🔍 Content Search
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Search within indexed JSON and Parquet files for field names, values, and nested content
        </p>
      </div>

      {/* Search Input */}
      <div className="mb-4">
        <input
          type="text"
          value={contentQuery}
          onChange={(e) => setContentQuery(e.target.value)}
          placeholder="Search file content... (e.g., field names, values, or any text within JSON/Parquet files)"
          className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
        />
      </div>

      {/* Search Status */}
      {isSearching && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md mb-4 text-sm text-center">
          🔄 Searching content...
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div>
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            📄 Found in {results.length} file{results.length !== 1 ? 's' : ''}
            {contentQuery && (
              <span className="text-xs text-gray-500 dark:text-gray-400 font-normal ml-2">
                containing "{contentQuery}"
              </span>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {results.map((result) => {
              const isExpanded = expandedResults.has(result.name);
              
              return (
                <div 
                  key={result.name}
                  className="border border-gray-200 dark:border-gray-600 rounded-md mb-2 overflow-hidden"
                >
                  {/* Result Header */}
                  <div 
                    className={`p-3 cursor-pointer flex items-center justify-between transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                      result.hasError 
                        ? 'bg-red-50 dark:bg-red-900/20' 
                        : 'bg-gray-50 dark:bg-gray-700/30'
                    } ${isExpanded ? 'border-b border-gray-200 dark:border-gray-600' : ''}`}
                    onClick={() => toggleResultExpansion(result.name)}
                  >
                    <div className="flex items-center gap-2">
                      <span>{result.hasError ? '❌' : '📄'}</span>
                      <span className="font-medium text-sm text-gray-900 dark:text-white">
                        {result.name}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        result.hasError 
                          ? 'bg-red-100 dark:bg-red-800/30 text-red-700 dark:text-red-300' 
                          : 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                      }`}>
                        {result.hasError ? 'Error' : `${result.totalMatches} match${result.totalMatches !== 1 ? 'es' : ''}`}
                      </span>
                    </div>
                    <span className={`text-xs text-gray-500 dark:text-gray-400 transform transition-transform duration-200 ${
                      isExpanded ? 'rotate-180' : 'rotate-0'
                    }`}>
                      ▼
                    </span>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="p-3">
                      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {result.hasError ? 'Error details:' : 'Matches found:'}
                      </div>
                      {result.matches.map((match, matchIndex) => 
                        renderMatch(match, matchIndex)
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No Results Message */}
      {contentQuery && !isSearching && results.length === 0 && (
        <div className="p-4 text-center text-gray-600 dark:text-gray-400 text-sm bg-gray-50 dark:bg-gray-700/50 rounded-md">
          No indexed files contain "{contentQuery}"
          <div className="text-xs mt-1">
            {searchEngine && searchEngine.contentIndex?.size === 0 
              ? "No files have been indexed yet. Preview or download files to add them to the content index."
              : "Try different search terms or check if the files containing this content have been indexed."
            }
          </div>
        </div>
      )}

      {/* Help Message */}
      {!contentQuery && !isSearching && (
        <div className="p-4 text-center text-gray-600 dark:text-gray-400 text-sm bg-gray-50 dark:bg-gray-700/50 rounded-md">
          <div className="mb-2">💡 <strong>How to use Content Search:</strong></div>
          <div className="text-xs leading-relaxed">
            • Search inside JSON and Parquet files for any content<br/>
            • Find field names, values, or nested data<br/>
            • Content is indexed automatically when files are accessed<br/>
            • Results show exactly where matches were found in the file structure
          </div>
          {searchEngine && (
            <div className="mt-3 text-xs text-gray-500 dark:text-gray-500">
              Indexed files: {searchEngine.contentIndex?.size || 0} | Total files: {searchEngine.fileIndex?.size || 0}
            </div>
          )}
        </div>
      )}

      {/* No Content Indexed Message */}
      {!contentQuery && !isSearching && searchEngine && searchEngine.contentIndex?.size === 0 && (
        <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-md">
          <div className="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-1">
            📋 No files indexed yet
          </div>
          <div className="text-xs text-yellow-700 dark:text-yellow-300">
            Content search works with files that have been indexed. Preview or download JSON/Parquet files to add them to the content index.
          </div>
        </div>
      )}
    </div>
  );
};

export default ContentSearchPanel;
