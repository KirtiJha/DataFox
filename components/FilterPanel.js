import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  XMarkIcon,
  DocumentIcon,
  PhotoIcon,
  ArchiveBoxIcon,
  MusicalNoteIcon,
  VideoCameraIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  TableCellsIcon,
  CalendarIcon,
  ScaleIcon,
  FolderIcon,
  EyeSlashIcon,
  BookmarkIcon,
  TrashIcon,
  ArrowPathIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

const FilterPanel = ({
  isOpen = false,
  filters = {},
  onFilterChange,
  onFilterReset,
  onSaveFilter,
  savedFilters = [],
  onDeleteSavedFilter,
  className = "",
}) => {
  const [localFilters, setLocalFilters] = useState(filters);
  const [saveFilterName, setSaveFilterName] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const fileTypes = [
    { id: "documents", label: "Documents", icon: DocumentIcon, extensions: ["pdf", "doc", "docx", "txt", "rtf"] },
    { id: "images", label: "Images", icon: PhotoIcon, extensions: ["jpg", "jpeg", "png", "gif", "bmp", "svg"] },
    { id: "archives", label: "Archives", icon: ArchiveBoxIcon, extensions: ["zip", "rar", "7z", "tar", "gz"] },
    { id: "audio", label: "Audio", icon: MusicalNoteIcon, extensions: ["mp3", "wav", "flac", "aac", "ogg"] },
    { id: "video", label: "Video", icon: VideoCameraIcon, extensions: ["mp4", "avi", "mkv", "mov", "wmv"] },
    { id: "code", label: "Code", icon: CodeBracketIcon, extensions: ["js", "ts", "py", "java", "cpp", "css", "html"] },
    { id: "data", label: "Data", icon: TableCellsIcon, extensions: ["json", "csv", "xml", "sql", "parquet"] },
    { id: "text", label: "Text", icon: DocumentTextIcon, extensions: ["txt", "md", "log", "cfg", "ini"] },
  ];

  const sizeRanges = [
    { id: "tiny", label: "Tiny (< 1KB)", min: 0, max: 1024 },
    { id: "small", label: "Small (1KB - 1MB)", min: 1024, max: 1024 * 1024 },
    { id: "medium", label: "Medium (1MB - 100MB)", min: 1024 * 1024, max: 100 * 1024 * 1024 },
    { id: "large", label: "Large (100MB - 1GB)", min: 100 * 1024 * 1024, max: 1024 * 1024 * 1024 },
    { id: "huge", label: "Huge (> 1GB)", min: 1024 * 1024 * 1024, max: Infinity },
  ];

  const dateRanges = [
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "thisWeek", label: "This Week" },
    { id: "lastWeek", label: "Last Week" },
    { id: "thisMonth", label: "This Month" },
    { id: "lastMonth", label: "Last Month" },
    { id: "custom", label: "Custom Range" },
  ];

  const handleFilterChange = (category, value) => {
    const newFilters = {
      ...localFilters,
      [category]: value,
    };
    setLocalFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleMultiSelectFilter = (category, itemId) => {
    const currentValues = localFilters[category] || [];
    const newValues = currentValues.includes(itemId)
      ? currentValues.filter(id => id !== itemId)
      : [...currentValues, itemId];
    
    handleFilterChange(category, newValues);
  };

  const handleResetFilters = () => {
    const emptyFilters = {};
    setLocalFilters(emptyFilters);
    onFilterReset();
  };

  const handleSaveFilter = () => {
    if (saveFilterName.trim() && Object.keys(localFilters).length > 0) {
      const filter = {
        id: Date.now().toString(),
        name: saveFilterName.trim(),
        filters: localFilters,
        description: generateFilterDescription(localFilters),
        createdAt: new Date().toISOString(),
      };
      onSaveFilter(filter);
      setSaveFilterName("");
      setShowSaveDialog(false);
    }
  };

  const generateFilterDescription = (filters) => {
    const parts = [];
    if (filters.fileTypes?.length) {
      parts.push(`${filters.fileTypes.length} file type${filters.fileTypes.length > 1 ? 's' : ''}`);
    }
    if (filters.sizeRanges?.length) {
      parts.push(`${filters.sizeRanges.length} size range${filters.sizeRanges.length > 1 ? 's' : ''}`);
    }
    if (filters.dateRange) {
      parts.push(`${filters.dateRange} date range`);
    }
    return parts.join(', ') || 'Custom filter';
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (localFilters.fileTypes?.length) count += localFilters.fileTypes.length;
    if (localFilters.sizeRanges?.length) count += localFilters.sizeRanges.length;
    if (localFilters.dateRange) count += 1;
    if (localFilters.showHidden) count += 1;
    if (localFilters.itemType && localFilters.itemType !== 'all') count += 1;
    return count;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.3 }}
        className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden ${className}`}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Advanced Filters
              </h3>
              {getActiveFilterCount() > 0 && (
                <span className="px-2 py-1 text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full">
                  {getActiveFilterCount()} active
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSaveDialog(!showSaveDialog)}
                disabled={Object.keys(localFilters).length === 0}
                className="px-3 py-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <BookmarkIcon className="w-4 h-4 inline mr-1" />
                Save
              </button>
              <button
                onClick={handleResetFilters}
                disabled={Object.keys(localFilters).length === 0}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowPathIcon className="w-4 h-4 inline mr-1" />
                Reset
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {/* File Types */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <DocumentIcon className="w-4 h-4" />
                File Types
              </h4>
              <div className="space-y-2">
                {fileTypes.map((type) => {
                  const Icon = type.icon;
                  const isSelected = localFilters.fileTypes?.includes(type.id);
                  return (
                    <label
                      key={type.id}
                      className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleMultiSelectFilter("fileTypes", type.id)}
                        className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {type.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Size Ranges */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <ScaleIcon className="w-4 h-4" />
                File Sizes
              </h4>
              <div className="space-y-2">
                {sizeRanges.map((range) => {
                  const isSelected = localFilters.sizeRanges?.includes(range.id);
                  return (
                    <label
                      key={range.id}
                      className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleMultiSelectFilter("sizeRanges", range.id)}
                        className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {range.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Date Ranges */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <CalendarIcon className="w-4 h-4" />
                Date Modified
              </h4>
              <div className="space-y-2">
                {dateRanges.map((range) => {
                  const isSelected = localFilters.dateRange === range.id;
                  return (
                    <label
                      key={range.id}
                      className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer transition-colors"
                    >
                      <input
                        type="radio"
                        name="dateRange"
                        checked={isSelected}
                        onChange={() => handleFilterChange("dateRange", range.id)}
                        className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {range.label}
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* Custom Date Range */}
              {localFilters.dateRange === "custom" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="space-y-3 pl-7"
                >
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      From
                    </label>
                    <input
                      type="date"
                      value={localFilters.customDateFrom || ""}
                      onChange={(e) => handleFilterChange("customDateFrom", e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      To
                    </label>
                    <input
                      type="date"
                      value={localFilters.customDateTo || ""}
                      onChange={(e) => handleFilterChange("customDateTo", e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>
                </motion.div>
              )}
            </div>

            {/* Item Type & Options */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                Item Type
              </h4>
              <div className="space-y-2">
                {[
                  { id: "all", label: "Files & Folders" },
                  { id: "files", label: "Files Only" },
                  { id: "folders", label: "Folders Only" },
                ].map((type) => {
                  const isSelected = (localFilters.itemType || "all") === type.id;
                  return (
                    <label
                      key={type.id}
                      className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer transition-colors"
                    >
                      <input
                        type="radio"
                        name="itemType"
                        checked={isSelected}
                        onChange={() => handleFilterChange("itemType", type.id)}
                        className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {type.label}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={localFilters.showHidden || false}
                    onChange={(e) => handleFilterChange("showHidden", e.target.checked)}
                    className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <EyeSlashIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Show Hidden Items
                  </span>
                </label>
              </div>
            </div>

            {/* Saved Filters */}
            {savedFilters.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <BookmarkIcon className="w-4 h-4" />
                  Saved Filters
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {savedFilters.map((filter) => (
                    <div
                      key={filter.id}
                      className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {filter.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {filter.description}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          onClick={() => {
                            setLocalFilters(filter.filters);
                            onFilterChange(filter.filters);
                          }}
                          className="p-1 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded transition-colors"
                          title="Apply Filter"
                        >
                          <CheckIcon className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onDeleteSavedFilter(filter.id)}
                          className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                          title="Delete Filter"
                        >
                          <TrashIcon className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Save Filter Dialog */}
          <AnimatePresence>
            {showSaveDialog && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={saveFilterName}
                    onChange={(e) => setSaveFilterName(e.target.value)}
                    placeholder="Enter filter name..."
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSaveFilter();
                      } else if (e.key === "Escape") {
                        setShowSaveDialog(false);
                        setSaveFilterName("");
                      }
                    }}
                  />
                  <button
                    onClick={handleSaveFilter}
                    disabled={!saveFilterName.trim()}
                    className="px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setShowSaveDialog(false);
                      setSaveFilterName("");
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default FilterPanel;
