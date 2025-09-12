import { useState, useEffect } from "react";
import { motion } from "framer-motion";
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
} from "@heroicons/react/24/outline";

const FileExplorer = ({
  files,
  currentPath,
  loading,
  selectedFiles,
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
}) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");

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

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* Toolbar */}
      <div className="flex-shrink-0 toolbar">
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
