import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  FolderIcon,
  DocumentIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  TrashIcon,
  PencilIcon,
  PlusIcon,
  BookmarkIcon,
  Cog6ToothIcon,
  ServerIcon,
  WifiIcon,
  NoSymbolIcon,
  StarIcon,
  CloudIcon,
  ComputerDesktopIcon,
  BoltIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/outline";
import ConnectionModal from "./ConnectionModal";
import BookmarkModal from "./BookmarkModal";
import PreviewModal from "./PreviewModal";
import FileExplorer from "./FileExplorer";
import TransferQueue from "./TransferQueue";
import StatusBar from "./StatusBar";

const FTPClient = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState(null);
  const [currentConnectionConfig, setCurrentConnectionConfig] = useState(null);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [showBookmarkModal, setShowBookmarkModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentPath, setCurrentPath] = useState("/");
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [transfers, setTransfers] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);

  // Load bookmarks on component mount
  useEffect(() => {
    loadBookmarks();
    setupMenuListeners();

    return () => {
      // Cleanup menu listeners
      if (typeof window !== "undefined" && window.electronAPI) {
        window.electronAPI.removeAllListeners("menu-new-connection");
        window.electronAPI.removeAllListeners("menu-quick-connect");
        window.electronAPI.removeAllListeners("menu-manage-bookmarks");
      }
    };
  }, []);

  const setupMenuListeners = () => {
    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.onMenuNewConnection(() => {
        setShowConnectionModal(true);
      });

      window.electronAPI.onMenuQuickConnect(() => {
        setShowConnectionModal(true);
      });

      window.electronAPI.onMenuManageBookmarks(() => {
        setShowBookmarkModal(true);
      });
    }
  };

  const loadBookmarks = async () => {
    try {
      if (typeof window !== "undefined" && window.electronAPI) {
        console.log("Loading bookmarks...");
        const bookmarkList = await window.electronAPI.bookmarksGetAll();
        console.log("Received bookmarks:", bookmarkList);

        // Handle different response formats
        const bookmarks = Array.isArray(bookmarkList)
          ? bookmarkList
          : bookmarkList?.bookmarks || [];
        console.log("Setting bookmarks to state:", bookmarks);
        setBookmarks(bookmarks);
      }
    } catch (error) {
      console.error("Failed to load bookmarks:", error);
    }
  };

  // Check if current connection is already bookmarked
  const isCurrentConnectionBookmarked = () => {
    if (!connectionInfo || !bookmarks.length) return false;
    
    return bookmarks.some(bookmark => {
      if (connectionInfo.type === "s3") {
        return bookmark.bucket === connectionInfo.bucket && 
               bookmark.region === connectionInfo.region;
      } else {
        return bookmark.host === connectionInfo.host && 
               bookmark.port === connectionInfo.port && 
               bookmark.username === connectionInfo.username;
      }
    });
  };

  const handleBookmarkConnect = async (bookmark) => {
    try {
      // Handle field mapping between bookmark format and connection config format
      const config = {
        ...bookmark,
        // Map bookmark fields to connection config fields
        type:
          bookmark.type ||
          bookmark.protocol ||
          (bookmark.host && bookmark.host.includes("cloud-object-storage")
            ? "s3"
            : "ftp"),
        path: bookmark.path || bookmark.remotePath || "/",
        downloadFolder: bookmark.downloadFolder || bookmark.localPath || "",
        bucket: bookmark.bucket,
      };

      console.log("Connecting with bookmark config:", config);
      console.log("Available bookmark fields:", Object.keys(bookmark));
      console.log("Bucket/downloadFolder values:", {
        bucket: bookmark.bucket,
        downloadFolder: bookmark.downloadFolder,
        path: bookmark.path,
        remotePath: bookmark.remotePath,
        localPath: bookmark.localPath,
        configBucket: config.bucket,
        configType: config.type,
      });

      // For S3 connections, ensure we have bucket information
      if (config.type === "s3") {
        // If no bucket is set, try to extract from downloadFolder (for legacy bookmarks)
        if (!config.bucket) {
          if (config.downloadFolder && !config.downloadFolder.includes("/")) {
            // If downloadFolder looks like a bucket name (no slashes), use it
            config.bucket = config.downloadFolder;
            config.downloadFolder = ""; // Reset to default download location
            console.log(
              "Using downloadFolder as bucket for legacy bookmark:",
              config.bucket
            );
          } else if (config.path && config.path !== "/") {
            config.bucket = config.path.replace(/^\/+|\/+$/g, ""); // Remove leading/trailing slashes
            console.log("Using path as bucket:", config.bucket);
          } else {
            // Use toast instead of prompt for better UX
            toast.error(
              "This bookmark is missing bucket information. Please edit the bookmark to add the S3 bucket name."
            );
            return;
          }
        }
      }

      await handleConnect(config);
    } catch (error) {
      console.error("Failed to connect with bookmark:", error);
      toast.error("Failed to connect using bookmark");
    }
  };

  const handleConnect = async (config) => {
    setLoading(true);
    try {
      if (typeof window !== "undefined" && window.electronAPI) {
        const result = await window.electronAPI.ftpConnect(config);
        if (result.success) {
          setIsConnected(true);
          setConnectionInfo(result.data);
          setCurrentConnectionConfig(config); // Store the original config for bookmarking
          setCurrentPath("/");

          // Load directory after connection - bypass the isConnected check since we just connected
          try {
            const dirResult = await window.electronAPI.ftpList("/");
            if (dirResult.success) {
              setFiles(dirResult.data);
              setSelectedFiles([]);
            }
          } catch (dirError) {
            console.warn("Failed to load initial directory:", dirError);
          }

          toast.success(
            `Connected to ${config.name || config.nickname || config.host}`
          );
          setShowConnectionModal(false);
        } else {
          throw new Error(result.error);
        }
      }
    } catch (error) {
      toast.error(`Connection failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      if (typeof window !== "undefined" && window.electronAPI) {
        await window.electronAPI.ftpDisconnect();
        setIsConnected(false);
        setConnectionInfo(null);
        setCurrentConnectionConfig(null);
        setFiles([]);
        setCurrentPath("/");
        setSelectedFiles([]);
        toast.success("Disconnected from server");
      }
    } catch (error) {
      toast.error(`Disconnect failed: ${error.message}`);
    }
  };

  const handleSaveAsBookmark = async () => {
    if (!currentConnectionConfig) {
      toast.error("No active connection to save");
      return;
    }

    try {
      const bookmarkName = prompt(
        "Enter a name for this bookmark:",
        currentConnectionConfig.host || "My Connection"
      );
      if (!bookmarkName) return;

      const bookmark = {
        ...currentConnectionConfig,
        name: bookmarkName.trim(),
        nickname: bookmarkName.trim(),
        createdAt: new Date().toISOString(),
        id: Date.now().toString(),
      };

      if (typeof window !== "undefined" && window.electronAPI) {
        console.log(
          "Available electronAPI methods:",
          Object.keys(window.electronAPI)
        );

        // Try the bookmarksAdd method, fallback to bookmarksSave if needed
        const addBookmark =
          window.electronAPI.bookmarksAdd || window.electronAPI.bookmarksSave;

        if (addBookmark) {
          console.log("Attempting to save bookmark:", bookmark);

          try {
            const result = await addBookmark(bookmark);
            console.log("Bookmark save result:", result);
            toast.success("Connection saved as bookmark!");
            await loadBookmarks(); // Refresh bookmarks list
          } catch (bookmarkError) {
            console.error("Bookmark save failed:", bookmarkError);
            throw new Error(
              `Failed to save bookmark: ${bookmarkError.message}`
            );
          }
        } else {
          throw new Error(
            "Bookmark functionality not available. Please restart the application."
          );
        }
      }
    } catch (error) {
      toast.error(`Failed to save bookmark: ${error.message}`);
    }
  };

  const loadDirectory = useCallback(
    async (path) => {
      if (!isConnected) return;

      setLoading(true);
      try {
        if (typeof window !== "undefined" && window.electronAPI) {
          const result = await window.electronAPI.ftpList(path);
          if (result.success) {
            setFiles(result.data);
            setCurrentPath(path);
            setSelectedFiles([]);
          } else {
            throw new Error(result.error);
          }
        }
      } catch (error) {
        toast.error(`Failed to load directory: ${error.message}`);
      } finally {
        setLoading(false);
      }
    },
    [isConnected]
  );

  const handleFileDoubleClick = (file) => {
    if (file.isDirectory) {
      const newPath =
        currentPath === "/" ? `/${file.name}` : `${currentPath}/${file.name}`;
      loadDirectory(newPath);
    }
  };

  const handleNavigateUp = () => {
    if (currentPath !== "/") {
      const parentPath = currentPath.split("/").slice(0, -1).join("/") || "/";
      loadDirectory(parentPath);
    }
  };

  const handleUpload = async () => {
    try {
      if (typeof window !== "undefined" && window.electronAPI) {
        const result = await window.electronAPI.dialogOpenFile();
        if (!result.canceled && result.filePaths.length > 0) {
          const filePath = result.filePaths[0];
          const fileName = filePath.split("/").pop();
          const remotePath =
            currentPath === "/" ? `/${fileName}` : `${currentPath}/${fileName}`;

          const uploadResult = await window.electronAPI.ftpUpload(
            filePath,
            remotePath
          );
          if (uploadResult.success) {
            toast.success(`Uploaded ${fileName}`);
            await loadDirectory(currentPath);
          } else {
            throw new Error(uploadResult.error);
          }
        }
      }
    } catch (error) {
      toast.error(`Upload failed: ${error.message}`);
    }
  };

  const handleDownload = async (file) => {
    try {
      if (typeof window !== "undefined" && window.electronAPI) {
        const result = await window.electronAPI.dialogSaveFile({
          defaultPath: file.name,
        });
        if (!result.canceled) {
          const remotePath =
            currentPath === "/"
              ? `/${file.name}`
              : `${currentPath}/${file.name}`;

          const downloadResult = await window.electronAPI.ftpDownload(
            remotePath,
            result.filePath
          );
          if (downloadResult.success) {
            toast.success(`Downloaded ${file.name}`);
          } else {
            throw new Error(downloadResult.error);
          }
        }
      }
    } catch (error) {
      toast.error(`Download failed: ${error.message}`);
    }
  };

  const handlePreview = async (file) => {
    try {
      if (typeof window !== "undefined" && window.electronAPI) {
        const remotePath =
          currentPath === "/" ? `/${file.name}` : `${currentPath}/${file.name}`;

        // Get file content for preview
        const result = await window.electronAPI.ftpPreview(remotePath);
        console.log("Preview result:", result);

        // Handle both old and new response structures
        let content, success;
        if (result.data && result.data.content !== undefined) {
          // Old structure: { success: true, data: { content: "...", ... } }
          content = result.data.content;
          success = result.success && result.data.success;
        } else if (result.content !== undefined) {
          // New structure: { success: true, content: "...", ... }
          content = result.content;
          success = result.success;
        } else {
          success = false;
        }

        console.log(
          "Extracted - success:",
          success,
          "content length:",
          content?.length
        );

        if (success && content !== undefined) {
          console.log(
            "Setting preview data with content length:",
            content.length
          );
          setPreviewData({
            fileName: file.name,
            content: content,
            fileType: file.name.split(".").pop()?.toLowerCase(),
          });
          setShowPreviewModal(true);
        } else {
          throw new Error(result.error || "Failed to get file content");
        }
      }
    } catch (error) {
      console.error("Preview error:", error);
      toast.error(`Preview failed: ${error.message}`);
    }
  };

  const handleDelete = async (file) => {
    if (!confirm(`Are you sure you want to delete "${file.name}"?`)) {
      return;
    }

    try {
      if (typeof window !== "undefined" && window.electronAPI) {
        const remotePath =
          currentPath === "/" ? `/${file.name}` : `${currentPath}/${file.name}`;

        const result = await window.electronAPI.ftpDelete(remotePath);
        if (result.success) {
          toast.success(`Deleted ${file.name}`);
          await loadDirectory(currentPath);
        } else {
          throw new Error(result.error);
        }
      }
    } catch (error) {
      toast.error(`Delete failed: ${error.message}`);
    }
  };

  const handleCreateFolder = async () => {
    const folderName = prompt("Enter folder name:");
    if (!folderName) return;

    try {
      if (typeof window !== "undefined" && window.electronAPI) {
        const remotePath =
          currentPath === "/"
            ? `/${folderName}`
            : `${currentPath}/${folderName}`;

        const result = await window.electronAPI.ftpCreateDirectory(remotePath);
        if (result.success) {
          toast.success(`Created folder ${folderName}`);
          await loadDirectory(currentPath);
        } else {
          throw new Error(result.error);
        }
      }
    } catch (error) {
      toast.error(`Create folder failed: ${error.message}`);
    }
  };

  return (
    <div className="h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex flex-col">
      {/* Header */}
      {/* Header */}
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-700/50 shadow-sm">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8">
              <img 
                src="/assets/icons/datafox-icon.svg" 
                alt="DataFox" 
                className="w-7 h-7"
              />
            </div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
              DataFox
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                {!isCurrentConnectionBookmarked() && (
                  <button
                    onClick={handleSaveAsBookmark}
                    className="px-3 py-1.5 bg-gradient-to-r from-green-500/10 to-emerald-500/10 text-green-600 dark:text-green-400 rounded-lg shadow-md hover:shadow-lg border border-green-200/30 dark:border-green-600/30 hover:border-green-300/50 dark:hover:border-green-500/50 transition-all duration-300 flex items-center gap-1.5 backdrop-blur-sm transform hover:scale-105 text-sm"
                    title="Save current connection as bookmark"
                  >
                    <BookmarkIcon className="w-3.5 h-3.5" />
                    Save
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => setShowConnectionModal(true)}
                className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center gap-1.5 text-sm"
              >
                <WifiIcon className="w-3.5 h-3.5" />
                Connect
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div
          className={`bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-r border-gray-200/50 dark:border-gray-700/50 shadow-sm transition-all duration-300 ease-in-out ${
            sidebarCollapsed ? "w-16" : "w-56"
          }`}
        >
          <div className="flex flex-col h-full">
            {/* Sidebar Header with Toggle */}
            <div className="flex items-center justify-between p-3 border-b border-gray-200/50 dark:border-gray-700/50">
              {!sidebarCollapsed && (
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <BoltIcon className="w-4 h-4" />
                  Quick Actions
                </h2>
              )}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-1.5 rounded-lg hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors duration-200"
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <svg
                  className={`w-4 h-4 text-gray-600 dark:text-gray-400 transition-transform duration-200 ${
                    sidebarCollapsed ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                  />
                </svg>
              </button>
            </div>

            {/* Quick Actions */}
            <div className="p-2 border-b border-gray-200/50 dark:border-gray-700/50">
              {sidebarCollapsed ? (
                <div className="space-y-2">
                  {/* Clean icon-only buttons for collapsed state */}
                  <button
                    onClick={() => setShowConnectionModal(true)}
                    className="w-full p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200 flex items-center justify-center group"
                    title="New Connection"
                  >
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setShowBookmarkModal(true)}
                    className="w-full p-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all duration-200 flex items-center justify-center group"
                    title="Manage Bookmarks"
                  >
                    <BookmarkIcon className="w-5 h-5 text-purple-600 dark:text-purple-400 group-hover:text-purple-700 dark:group-hover:text-purple-300" />
                  </button>
                  {/* Show disconnect only when connected */}
                  {isConnected && (
                    <button
                      onClick={handleDisconnect}
                      className="w-full p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200 flex items-center justify-center group"
                      title="Disconnect"
                    >
                      <svg className="w-5 h-5 text-red-600 dark:text-red-400 group-hover:text-red-700 dark:group-hover:text-red-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowConnectionModal(true)}
                    className="w-full px-3 py-2 rounded-lg bg-gradient-to-r from-slate-50 to-blue-50 dark:from-slate-800 dark:to-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-medium border border-blue-100 dark:border-blue-800/50 hover:border-blue-200 dark:hover:border-blue-700/70 hover:bg-gradient-to-r hover:from-blue-50 hover:to-blue-100 dark:hover:from-blue-900/40 dark:hover:to-blue-800/40 transition-all duration-200 backdrop-blur-sm transform hover:scale-[1.02] shadow-sm hover:shadow-md flex items-center gap-2"
                  >
                    <PlusIcon className="w-4 h-4" />
                    New Connection
                  </button>
                  <button
                    onClick={() => setShowBookmarkModal(true)}
                    className="w-full px-3 py-2 rounded-lg bg-gradient-to-r from-slate-50 to-purple-50 dark:from-slate-800 dark:to-purple-900/30 text-purple-700 dark:text-purple-300 text-sm font-medium border border-purple-100 dark:border-purple-800/50 hover:border-purple-200 dark:hover:border-purple-700/70 hover:bg-gradient-to-r hover:from-purple-50 hover:to-purple-100 dark:hover:from-purple-900/40 dark:hover:to-purple-800/40 transition-all duration-200 backdrop-blur-sm transform hover:scale-[1.02] shadow-sm hover:shadow-md flex items-center gap-2"
                  >
                    <BookmarkIcon className="w-4 h-4" />
                    Manage Bookmarks
                  </button>
                  {isConnected && (
                    <button
                      onClick={handleDisconnect}
                      className="w-full px-3 py-2 rounded-lg bg-gradient-to-r from-slate-50 to-red-50 dark:from-slate-800 dark:to-red-900/30 text-red-700 dark:text-red-300 text-sm font-medium border border-red-100 dark:border-red-800/50 hover:border-red-200 dark:hover:border-red-700/70 hover:bg-gradient-to-r hover:from-red-50 hover:to-red-100 dark:hover:from-red-900/40 dark:hover:to-red-800/40 transition-all duration-200 backdrop-blur-sm transform hover:scale-[1.02] shadow-sm hover:shadow-md flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Disconnect
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Bookmarks List */}
            <div className="flex-1 overflow-hidden">
              {!sidebarCollapsed && (
                <>
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-3 py-2 flex items-center gap-2">
                    <StarIcon className="w-3.5 h-3.5" />
                    Bookmarks
                  </h3>
                  <div className="px-2 pb-2 overflow-y-auto h-full scrollbar-hidden">
                    {bookmarks.length === 0 ? (
                      <div className="px-3 py-6 text-center">
                        <BookmarkIcon className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          No bookmarks saved
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          Save connections for quick access
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {bookmarks.map((bookmark) => {
                          const isS3 = (bookmark.type || bookmark.protocol) === "s3";
                          const isFTP = (bookmark.type || bookmark.protocol) === "ftp" || (bookmark.type || bookmark.protocol) === "sftp";
                          
                          return (
                            <button
                              key={bookmark.id}
                              onClick={() => handleBookmarkConnect(bookmark)}
                              className="w-full text-left px-3 py-3 rounded-lg hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 dark:hover:from-blue-900/20 dark:hover:to-purple-900/20 transition-all duration-200 group border border-transparent hover:border-blue-200/50 dark:hover:border-blue-700/50 hover:shadow-sm"
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 mt-0.5">
                                  {isS3 ? (
                                    <CloudIcon className="w-4 h-4 text-orange-500" />
                                  ) : isFTP ? (
                                    <ComputerDesktopIcon className="w-4 h-4 text-blue-500" />
                                  ) : (
                                    <ServerIcon className="w-4 h-4 text-gray-500" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate mb-1">
                                    {bookmark.name}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    <span className="inline-flex items-center gap-1">
                                      <span className={`w-1.5 h-1.5 rounded-full ${isS3 ? 'bg-orange-400' : isFTP ? 'bg-blue-400' : 'bg-gray-400'}`}></span>
                                      {isS3 ? "S3" : isFTP ? "FTP" : "Unknown"}
                                    </span>
                                    <span className="mx-1">•</span>
                                    <span className="truncate">{bookmark.host || bookmark.endpoint}</span>
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
              {sidebarCollapsed && (
                <div className="px-1 py-2">
                  <div className="flex flex-col space-y-2">
                    {/* Individual bookmark icons only - no duplicate manage button */}
                    {bookmarks.slice(0, 4).map((bookmark) => {
                      const isS3 = (bookmark.type || bookmark.protocol) === "s3";
                      const isFTP = (bookmark.type || bookmark.protocol) === "ftp" || (bookmark.type || bookmark.protocol) === "sftp";
                      
                      return (
                        <button
                          key={bookmark.id}
                          onClick={() => handleBookmarkConnect(bookmark)}
                          className="w-full p-2 rounded-lg hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 dark:hover:from-blue-900/20 dark:hover:to-purple-900/20 transition-all duration-200 flex items-center justify-center border border-transparent hover:border-blue-200/50 dark:hover:border-blue-700/50"
                          title={`${bookmark.name} (${isS3 ? 'S3' : isFTP ? 'FTP' : 'Server'})`}
                        >
                          {isS3 ? (
                            <CloudIcon className="w-4 h-4 text-orange-500" />
                          ) : isFTP ? (
                            <ComputerDesktopIcon className="w-4 h-4 text-blue-500" />
                          ) : (
                            <ServerIcon className="w-4 h-4 text-gray-500" />
                          )}
                        </button>
                      );
                    })}
                    
                    {/* Show indicator if there are more bookmarks */}
                    {bookmarks.length > 4 && (
                      <button
                        onClick={() => setShowBookmarkModal(true)}
                        className="w-full p-2 rounded-lg hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors duration-200 flex items-center justify-center"
                        title={`+${bookmarks.length - 4} more bookmarks`}
                      >
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          +{bookmarks.length - 4}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>{" "}
        {/* File Explorer */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {isConnected ? (
            <FileExplorer
              files={files}
              currentPath={currentPath}
              loading={loading}
              selectedFiles={selectedFiles}
              onFileSelect={setSelectedFiles}
              onFileDoubleClick={handleFileDoubleClick}
              onNavigateUp={handleNavigateUp}
              onNavigateTo={loadDirectory}
              onRefresh={() => loadDirectory(currentPath)}
              onDownload={handleDownload}
              onPreview={handlePreview}
              onDelete={handleDelete}
              onUpload={handleUpload}
              onCreateFolder={handleCreateFolder}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm relative overflow-hidden">
              {/* Background Pattern */}
              <div className="absolute inset-0 opacity-5 dark:opacity-10">
                <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-500 rounded-full blur-3xl"></div>
                <div className="absolute bottom-1/4 right-1/4 w-40 h-40 bg-purple-500 rounded-full blur-3xl"></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500 rounded-full blur-3xl"></div>
              </div>

              <div className="text-center relative z-10 max-w-sm mx-auto px-6">
                {/* Animated Icon */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="relative mb-6"
                >
                  <img 
                    src="/assets/icons/datafox-icon.svg" 
                    alt="DataFox" 
                    className="w-32 h-32 mx-auto drop-shadow-lg"
                  />
                </motion.div>

                {/* Content */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                >
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                    Welcome to{" "}
                    <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                      DataFox
                    </span>
                  </h2>
                  <p className="text-gray-600 dark:text-gray-300 mb-2 text-base leading-relaxed">
                    The modern way to manage your files
                  </p>
                  <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
                    Connect to FTP, SFTP, and cloud servers with our intuitive
                    interface
                  </p>
                </motion.div>

                {/* Action Buttons */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  className="space-y-2"
                >
                  <button
                    onClick={() => setShowConnectionModal(true)}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-lg font-medium shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-200 flex items-center justify-center gap-2 text-sm"
                  >
                    <WifiIcon className="w-4 h-4" />
                    Connect to Server
                  </button>

                  {bookmarks.length > 0 && (
                    <button
                      onClick={() => setShowBookmarkModal(true)}
                      className="w-full bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-6 py-2.5 rounded-lg font-medium shadow-lg hover:shadow-xl border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 transform hover:scale-105 transition-all duration-200 flex items-center justify-center gap-2 text-sm"
                    >
                      <BookmarkIcon className="w-5 h-5" />
                      Quick Connect
                    </button>
                  )}
                </motion.div>

                {/* Features */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.6 }}
                  className="mt-8 grid grid-cols-3 gap-3 text-center"
                >
                  <div className="p-3">
                    <div className="w-7 h-7 bg-blue-100 dark:bg-blue-900/30 rounded-lg mx-auto mb-1.5 flex items-center justify-center">
                      <ServerIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Multiple Protocols
                    </p>
                  </div>
                  <div className="p-3">
                    <div className="w-7 h-7 bg-purple-100 dark:bg-purple-900/30 rounded-lg mx-auto mb-1.5 flex items-center justify-center">
                      <BookmarkIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Smart Bookmarks
                    </p>
                  </div>
                  <div className="p-3">
                    <div className="w-7 h-7 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg mx-auto mb-1.5 flex items-center justify-center">
                      <ArrowUpIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Fast Transfers
                    </p>
                  </div>
                </motion.div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        isConnected={isConnected}
        connectionInfo={connectionInfo}
        fileCount={files.length}
        selectedCount={selectedFiles.length}
      />

      {/* Modals */}
      <AnimatePresence>
        {showConnectionModal && (
          <ConnectionModal
            onClose={() => setShowConnectionModal(false)}
            onConnect={handleConnect}
            onBookmarkSaved={loadBookmarks}
            bookmarks={bookmarks}
            loading={loading}
          />
        )}
        {showBookmarkModal && (
          <BookmarkModal
            onClose={() => setShowBookmarkModal(false)}
            bookmarks={bookmarks}
            onBookmarksUpdate={loadBookmarks}
            onConnect={(bookmark) => {
              handleBookmarkConnect(bookmark);
              setShowBookmarkModal(false);
            }}
          />
        )}
        {showPreviewModal && previewData && (
          <PreviewModal
            isOpen={showPreviewModal}
            onClose={() => setShowPreviewModal(false)}
            previewData={previewData}
            onDownload={() => {
              // Find the file object and trigger download
              const file = { name: previewData.fileName };
              handleDownload(file);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default FTPClient;
