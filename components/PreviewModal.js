import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  XMarkIcon,
  DocumentTextIcon,
  TableCellsIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";

const PreviewModal = ({ isOpen, onClose, previewData, onDownload }) => {
  const [formattedContent, setFormattedContent] = useState("");
  const [isTableView, setIsTableView] = useState(false);
  const [tableData, setTableData] = useState(null);

  useEffect(() => {
    if (previewData?.content) {
      formatContent(previewData.content, previewData.fileType);
    } else {
      // Reset state when no data
      setFormattedContent("");
      setIsTableView(false);
      setTableData(null);
    }
  }, [previewData]);

  const formatContent = (content, fileType) => {
    try {
      // Handle case where content might be an object
      let contentStr = content;
      if (typeof content === "object") {
        contentStr = JSON.stringify(content, null, 2);
      } else if (typeof content !== "string") {
        contentStr = String(content);
      }

      switch (fileType) {
        case "json":
          // Try to parse and format JSON
          setIsTableView(false);
          setTableData(null);
          try {
            const parsed = JSON.parse(contentStr);
            const formatted = JSON.stringify(parsed, null, 2);
            setFormattedContent(formatted);
          } catch {
            // If parsing fails, show raw content
            setFormattedContent(contentStr);
          }
          break;
        case "parquet":
          // Handle Parquet data specially
          try {
            const parquetData = JSON.parse(contentStr);
            if (
              parquetData.previewRows &&
              Array.isArray(parquetData.previewRows)
            ) {
              // Set up table view for Parquet
              setIsTableView(true);
              setTableData(parquetData);

              // Also set a text summary for copy functionality
              let formatted = `Parquet File Preview\n`;
              formatted += `Total Rows: ${parquetData.rowCount || "Unknown"}\n`;
              formatted += `Columns: ${parquetData.columnCount || "Unknown"}\n`;
              formatted += `${parquetData.message || ""}\n\n`;

              if (parquetData.previewRows.length > 0) {
                // Get column names from first row
                const columns = Object.keys(parquetData.previewRows[0]);

                // Create table header
                formatted += columns.join("\t") + "\n";
                formatted += columns.map(() => "---").join("\t") + "\n";

                // Add data rows
                parquetData.previewRows.forEach((row) => {
                  formatted +=
                    columns
                      .map((col) => {
                        const val = row[col];
                        return val === null || val === undefined
                          ? "null"
                          : String(val);
                      })
                      .join("\t") + "\n";
                });
              }

              setFormattedContent(formatted);
            } else {
              // Fallback to JSON formatting
              setIsTableView(false);
              setTableData(null);
              setFormattedContent(JSON.stringify(parquetData, null, 2));
            }
          } catch {
            setIsTableView(false);
            setTableData(null);
            setFormattedContent(contentStr);
          }
          break;
        case "txt":
        case "csv":
          setFormattedContent(contentStr);
          break;
        default:
          setFormattedContent(contentStr);
      }
    } catch (error) {
      console.error("formatContent error:", error);
      setFormattedContent("Error formatting content: " + error.message);
    }
  };

  const getFileIcon = (fileType) => {
    switch (fileType) {
      case "json":
        return <DocumentTextIcon className="w-6 h-6 text-amber-500" />;
      case "parquet":
        return <TableCellsIcon className="w-6 h-6 text-green-500" />;
      case "txt":
        return <DocumentTextIcon className="w-6 h-6 text-gray-500" />;
      case "csv":
        return <TableCellsIcon className="w-6 h-6 text-emerald-500" />;
      default:
        return <DocumentTextIcon className="w-6 h-6 text-gray-500" />;
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard
      .writeText(formattedContent)
      .then(() => {
        // Could add a toast notification here
        console.log("Content copied to clipboard");
      })
      .catch((err) => {
        console.error("Failed to copy content: ", err);
      });
  };

  if (!isOpen || !previewData) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-4xl max-h-[90vh] mx-4 bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700">
            <div className="flex items-center gap-3">
              {getFileIcon(previewData.fileType)}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {previewData.fileName}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {previewData.fileType?.toUpperCase()} File Preview
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={copyToClipboard}
                className="px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                title="Copy to Clipboard"
              >
                Copy
              </button>

              <button
                onClick={() => {
                  onDownload && onDownload();
                  onClose();
                }}
                className="px-3 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors flex items-center gap-1"
                title="Download File"
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                Download
              </button>

              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 max-h-[70vh] overflow-auto">
            {isTableView && tableData ? (
              // Render table view for Parquet data
              <div className="space-y-4">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <p>
                    <strong>Total Rows:</strong> {tableData.rowCount}
                  </p>
                  <p>
                    <strong>Columns:</strong> {tableData.columnCount}
                  </p>
                  <p>
                    <strong>Message:</strong> {tableData.message}
                  </p>
                  {tableData.schema && tableData.schema.length > 0 && (
                    <div className="mt-2">
                      <strong>Schema:</strong>
                      <div className="ml-4 text-xs">
                        {tableData.schema.map((field, idx) => (
                          <div key={idx}>
                            {field.name}: {field.type}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {tableData.previewRows && tableData.previewRows.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs border border-gray-300 dark:border-gray-600">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          {Object.keys(tableData.previewRows[0]).map(
                            (column, idx) => (
                              <th
                                key={idx}
                                className="px-2 py-1 text-left font-medium text-gray-700 dark:text-gray-300 border-r border-gray-300 dark:border-gray-600"
                              >
                                {column}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {tableData.previewRows.map((row, rowIdx) => (
                          <tr
                            key={rowIdx}
                            className={
                              rowIdx % 2 === 0
                                ? "bg-white dark:bg-gray-800"
                                : "bg-gray-100 dark:bg-gray-700"
                            }
                          >
                            {Object.keys(tableData.previewRows[0]).map(
                              (column, colIdx) => (
                                <td
                                  key={colIdx}
                                  className="px-2 py-1 border-r border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                                >
                                  {row[column] === null ||
                                  row[column] === undefined ? (
                                    <span className="text-gray-400 italic">
                                      null
                                    </span>
                                  ) : (
                                    String(row[column])
                                  )}
                                </td>
                              )
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              // Default text view
              <pre className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap font-mono bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-auto">
                {formattedContent}
              </pre>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default PreviewModal;
