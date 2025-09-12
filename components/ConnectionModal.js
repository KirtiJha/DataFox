import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  XMarkIcon,
  EyeIcon,
  EyeSlashIcon,
  BookmarkIcon,
  WifiIcon,
  CloudIcon,
  ServerIcon,
  ShieldCheckIcon,
  DocumentIcon,
  FolderIcon,
  KeyIcon,
  LinkIcon,
  ChevronDownIcon,
  CogIcon,
} from "@heroicons/react/24/outline";

const ConnectionModal = ({ onClose, onConnect, onBookmarkSaved, bookmarks, loading: externalLoading }) => {
  const [formData, setFormData] = useState({
    name: "",
    nickname: "",
    labels: "",
    url: "",
    host: "",
    port: 21,
    username: "",
    password: "",
    type: "ftp",
    secure: false,
    privateKey: "",
    passphrase: "",
    clientCertificate: "",
    path: "/",
    webUrl: "",
    downloadFolder: "",
    bucket: "",
    transferFiles: "Default",
    encoding: "UTF-8",
    timezone: "UTC",
    connectMode: "Default",
    anonymousLogin: false,
    notes: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [saveAsBookmark, setSaveAsBookmark] = useState(false);
  const [loading, setLoading] = useState(false);

  // Protocol configurations
  const protocolConfigs = {
    ftp: {
      name: "FTP (File Transfer Protocol)",
      icon: ServerIcon,
      defaultPort: 21,
      fields: [
        "host",
        "port",
        "username",
        "password",
        "path",
        "connectMode",
        "encoding",
        "timezone",
        "webUrl",
        "downloadFolder",
        "transferFiles",
      ],
      description: "Standard File Transfer Protocol",
      color: "blue",
    },
    ftps: {
      name: "FTP-SSL (Explicit AUTH TLS)",
      icon: ShieldCheckIcon,
      defaultPort: 21,
      fields: [
        "host",
        "port",
        "username",
        "password",
        "path",
        "connectMode",
        "encoding",
        "timezone",
        "webUrl",
        "downloadFolder",
        "transferFiles",
        "clientCertificate",
      ],
      description: "FTP with explicit SSL/TLS encryption",
      color: "green",
    },
    sftp: {
      name: "SFTP (SSH File Transfer Protocol)",
      icon: ShieldCheckIcon,
      defaultPort: 22,
      fields: [
        "host",
        "port",
        "username",
        "password",
        "privateKey",
        "passphrase",
        "path",
        "encoding",
        "timezone",
        "webUrl",
        "downloadFolder",
        "transferFiles",
      ],
      description: "SSH File Transfer Protocol",
      color: "purple",
    },
    s3: {
      name: "Amazon S3",
      icon: CloudIcon,
      defaultPort: 443,
      fields: [
        "host",
        "bucket",
        "username",
        "password",
        "path",
        "webUrl",
        "downloadFolder",
        "transferFiles",
      ],
      description: "Amazon Simple Storage Service",
      color: "orange",
    },
    "google-cloud": {
      name: "Google Cloud Storage",
      icon: CloudIcon,
      defaultPort: 443,
      fields: [
        "host",
        "username",
        "password",
        "path",
        "webUrl",
        "downloadFolder",
        "transferFiles",
      ],
      description: "Google Cloud Storage Service",
      color: "red",
    },
    azure: {
      name: "Microsoft Azure",
      icon: CloudIcon,
      defaultPort: 443,
      fields: [
        "host",
        "username",
        "password",
        "path",
        "webUrl",
        "downloadFolder",
        "transferFiles",
      ],
      description: "Microsoft Azure Blob Storage",
      color: "blue",
    },
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      // You can add toast notifications here for better UX
      console.error("Validation errors:", validationErrors);
      if (typeof window !== "undefined" && window.toast) {
        validationErrors.forEach(error => window.toast.error(error));
      }
      return;
    }

    setLoading(true);
    
    try {
      await onConnect(formData);

      if (saveAsBookmark && formData.name?.trim()) {
        if (typeof window !== "undefined" && window.electronAPI) {
          console.log('Available electronAPI methods:', Object.keys(window.electronAPI));
          
          // Try the bookmarksAdd method, fallback to bookmarksSave if needed
          const addBookmark = window.electronAPI.bookmarksAdd || window.electronAPI.bookmarksSave;
          
          if (addBookmark) {
            const bookmarkData = {
              ...formData,
              name: formData.name.trim(),
              createdAt: new Date().toISOString(),
              id: Date.now().toString(),
            };
            
            console.log('Attempting to save bookmark:', bookmarkData);
            
            try {
              const result = await addBookmark(bookmarkData);
              console.log('Bookmark save result:', result);
              
              if (typeof window !== "undefined" && window.toast) {
                window.toast.success("Bookmark saved successfully!");
              }
              
              // Refresh bookmarks list in parent component
              if (onBookmarkSaved) {
                await onBookmarkSaved();
              }
            } catch (bookmarkError) {
              console.error('Bookmark save failed:', bookmarkError);
              throw new Error(`Failed to save bookmark: ${bookmarkError.message}`);
            }
          } else {
            console.error('Neither bookmarksAdd nor bookmarksSave methods are available');
            throw new Error('Bookmark functionality not available. Please restart the application.');
          }
        }
      }
      
      onClose();
    } catch (error) {
      console.error("Connection error:", error);
      if (typeof window !== "undefined" && window.toast) {
        window.toast.error(error.message || "Failed to connect to server");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBookmarkConnect = (bookmark) => {
    onConnect(bookmark);
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Auto-parse S3 URLs when host field OR url field is changed for S3 connections
    if ((field === 'host' || field === 'url') && formData.type === 's3' && value) {
      parseS3URL(value);
    }
  };

  const parseS3URL = (url) => {
    try {
      // Handle IBM Cloud Object Storage format: access-key@endpoint/bucket
      if (url.includes('@') && !url.startsWith('http')) {
        const atIndex = url.indexOf('@');
        const accessKey = url.substring(0, atIndex);
        const remaining = url.substring(atIndex + 1);
        
        let endpoint = remaining;
        let bucket = '';
        
        if (remaining.includes('/')) {
          const slashIndex = remaining.indexOf('/');
          endpoint = remaining.substring(0, slashIndex);
          bucket = remaining.substring(slashIndex + 1);
        }
        
        setFormData(prev => ({
          ...prev,
          host: endpoint,
          username: accessKey,
          bucket: bucket
          // Don't auto-fill password - user needs to enter secret access key manually
        }));
        
        if (typeof window !== "undefined" && window.toast) {
          window.toast.success(`Auto-detected: Endpoint: ${endpoint}, Access Key: ${accessKey.substring(0, 8)}..., Bucket: ${bucket}. Please enter your Secret Access Key in the password field.`);
        }
        return;
      }
      
      // Handle full URLs like: https://s3.us.cloud-object-storage.appdomain.cloud/bucket-name
      if (url.includes('/') && (url.startsWith('http') || url.includes('.'))) {
        const parsedURL = new URL(url.startsWith('http') ? url : `https://${url}`);
        const pathParts = parsedURL.pathname.split('/').filter(part => part);
        
        if (pathParts.length > 0) {
          const bucket = pathParts[0];
          const endpoint = parsedURL.hostname; // Use hostname instead of origin
          
          setFormData(prev => ({
            ...prev,
            host: endpoint,
            bucket: bucket
          }));
          
          if (typeof window !== "undefined" && window.toast) {
            window.toast.success(`Auto-detected: Endpoint: ${endpoint}, Bucket: ${bucket}`);
          }
        }
      }
    } catch (error) {
      console.log('Could not parse S3 URL:', error);
    }
  };

  const handleProtocolChange = (newType) => {
    const config = protocolConfigs[newType];
    setFormData((prev) => ({
      ...prev,
      type: newType,
      port: config.defaultPort,
      // Reset protocol-specific fields
      privateKey: "",
      passphrase: "",
      connectMode:
        newType === "ftp" || newType === "ftps" ? "active" : prev.connectMode,
      anonymousLogin: false,
    }));
  };

  const getCurrentConfig = () => protocolConfigs[formData.type];
  const shouldShowField = (field) => getCurrentConfig().fields.includes(field);

  // Form validation
  const validateForm = () => {
    const errors = [];
    
    if (!formData.host?.trim()) {
      errors.push("Server address is required");
    }
    
    if (!formData.port || formData.port < 1 || formData.port > 65535) {
      errors.push("Port must be between 1 and 65535");
    }
    
    if (!formData.anonymousLogin && !formData.username?.trim()) {
      errors.push("Username is required for non-anonymous connections");
    }
    
    if (formData.type === "sftp" && formData.privateKey && !formData.username?.trim()) {
      errors.push("Username is required when using SSH private key");
    }
    
    if (saveAsBookmark && !formData.name?.trim()) {
      errors.push("Bookmark name is required");
    }
    
    return errors;
  };

  const renderProtocolSelector = () => (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700/60 shadow-sm">
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-3">
        Connection Protocol
      </label>
      <div className="relative">
        <select
          value={formData.type}
          onChange={(e) => handleProtocolChange(e.target.value)}
          className="w-full px-4 py-2.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white appearance-none transition-all duration-200 hover:border-gray-400 dark:hover:border-gray-500"
        >
          {Object.entries(protocolConfigs).map(([key, config]) => (
            <option key={key} value={key}>
              {config.name}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none">
          <ChevronDownIcon className="w-4 h-4 text-gray-400" />
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
        {getCurrentConfig().description}
      </p>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
    >
            <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700/50 max-w-2xl w-full max-h-[85vh] overflow-hidden"
      >
        {/* Header */}
                {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg">
              <WifiIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                New Connection
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Connect to your server
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4 bg-white dark:bg-gray-900 overflow-y-auto max-h-[calc(85vh-100px)] scrollbar-hide" 
             style={{scrollbarWidth: 'none', msOverflowStyle: 'none'}}>
          {/* Quick Connect from Bookmarks */}
          {bookmarks.length > 0 && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800/30 dark:to-gray-700/30 rounded-xl p-4 border border-blue-100 dark:border-gray-700/50">
              <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                <BookmarkIcon className="w-4 h-4 text-blue-500" />
                Recent Connections
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {bookmarks.slice(0, 4).map((bookmark) => (
                  <button
                    key={bookmark.id}
                    onClick={() => handleBookmarkConnect(bookmark)}
                    className="p-3 text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 shadow-sm hover:shadow-md"
                    disabled={loading}
                  >
                    <div className="font-medium text-gray-900 dark:text-white text-xs">
                      {bookmark.name}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                      {bookmark.username}@{bookmark.host}:{bookmark.port}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Protocol Selection */}
          {renderProtocolSelector()}

          {/* Connection Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700/60 shadow-sm">
              <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                <ServerIcon className="w-3.5 h-3.5 text-blue-500" />
                Connection Details
              </h3>
              <div className="space-y-4">
                {/* Connection Name */}
                <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Connection Name
                </label>
                <input
                  type="text"
                  value={formData.nickname}
                  onChange={(e) =>
                    handleInputChange("nickname", e.target.value)
                  }
                  placeholder={`My ${getCurrentConfig().name} Server`}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white transition-all duration-200 hover:border-gray-400 dark:hover:border-gray-500"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tags
                </label>
                <input
                  type="text"
                  value={formData.labels}
                  onChange={(e) => handleInputChange("labels", e.target.value)}
                  placeholder="production, client-name, project"
                  className="w-full px-4 py-3 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white transition-all duration-200 hover:border-gray-400 dark:hover:border-gray-500"
                />
              </div>

              {/* Connection URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Connection URL
                </label>
                <div className="flex">
                  <span className="inline-flex items-center px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 dark:bg-gray-800 border border-r-0 border-gray-300 dark:border-gray-600 rounded-l-lg">
                    {formData.type}://
                  </span>
                  <input
                    type="text"
                    value={formData.url}
                    onChange={(e) => handleInputChange("url", e.target.value)}
                    placeholder="user@server.example.com/path"
                    className="flex-1 px-4 py-3 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-r-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white transition-all duration-200 hover:border-gray-400 dark:hover:border-gray-500"
                  />
                </div>
              </div>

              {/* Server and Port */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Server Address */}
                {shouldShowField("host") && (
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Server Address
                    </label>
                    <input
                      type="text"
                      value={formData.host}
                      onChange={(e) => handleInputChange("host", e.target.value)}
                      placeholder={
                        formData.type === "s3"
                          ? "s3.amazonaws.com or s3.us.cloud-object-storage.appdomain.cloud"
                          : "ftp.example.com"
                      }
                      className="w-full px-4 py-3 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white transition-all duration-200 hover:border-gray-400 dark:hover:border-gray-500"
                      required
                    />
                  </div>
                )}

                {/* S3 Bucket */}
                {shouldShowField("bucket") && (
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      S3 Bucket Name
                    </label>
                    <input
                      type="text"
                      value={formData.bucket}
                      onChange={(e) => handleInputChange("bucket", e.target.value)}
                      placeholder="your-bucket-name"
                      className="w-full px-4 py-3 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white transition-all duration-200 hover:border-gray-400 dark:hover:border-gray-500"
                      required={formData.type === "s3"}
                    />
                  </div>
                )}

                {/* Port */}
                {shouldShowField("port") && (
                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Port
                    </label>
                    <input
                      type="number"
                      value={formData.port}
                      onChange={(e) =>
                        handleInputChange(
                          "port",
                          parseInt(e.target.value) ||
                            getCurrentConfig().defaultPort
                        )
                      }
                      className="w-full px-4 py-3 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white transition-all duration-200 hover:border-gray-400 dark:hover:border-gray-500"
                      min="1"
                      max="65535"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Authentication */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700/60 shadow-sm">
              <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-6 flex items-center gap-2">
                <KeyIcon className="w-4 h-4 text-green-500" />
                Authentication
              </h3>
              <div className="space-y-5">
              {/* Anonymous Login Option for FTP/FTPS */}
              {(formData.type === "ftp" || formData.type === "ftps") && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="anonymousLogin"
                    checked={formData.anonymousLogin}
                    onChange={(e) => {
                      const isAnonymous = e.target.checked;
                      setFormData((prev) => ({
                        ...prev,
                        anonymousLogin: isAnonymous,
                        username: isAnonymous ? "anonymous" : "",
                        password: isAnonymous ? "" : prev.password,
                      }));
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label
                    htmlFor="anonymousLogin"
                    className="ml-3 text-sm text-gray-700 dark:text-gray-300"
                  >
                    Anonymous Login
                  </label>
                </div>
              )}

              {/* Access Key ID / Username */}
              {shouldShowField("username") && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {formData.type === "s3" ||
                    formData.type === "google-cloud" ||
                    formData.type === "azure"
                      ? "Access Key ID"
                      : "Username"}
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) =>
                      handleInputChange("username", e.target.value)
                    }
                    placeholder={
                      formData.type === "s3"
                        ? "AKIA..."
                        : formData.type === "google-cloud"
                        ? "GOOG..."
                        : formData.type === "azure"
                        ? "storage_account_name"
                        : "username"
                    }
                    className="w-full px-4 py-3 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white transition-all duration-200 hover:border-gray-400 dark:hover:border-gray-500"
                    required={!formData.anonymousLogin}
                    disabled={formData.anonymousLogin}
                  />
                </div>
              )}

              {/* Secret Access Key / Password */}
              {shouldShowField("password") && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {formData.type === "s3" ||
                    formData.type === "google-cloud" ||
                    formData.type === "azure"
                      ? "Secret Access Key"
                      : "Password"}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) =>
                        handleInputChange("password", e.target.value)
                      }
                      placeholder="••••••••••••••••••••••••••••••••••••••••"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white pr-8 transition-all duration-200 hover:border-gray-400 dark:hover:border-gray-500"
                      disabled={formData.anonymousLogin}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-2 flex items-center"
                      disabled={formData.anonymousLogin}
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="w-3 h-3 text-gray-400" />
                      ) : (
                        <EyeIcon className="w-3 h-3 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* SSH Key Authentication for SFTP */}
            {formData.type === "sftp" && shouldShowField("privateKey") && (
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                    SSH Private Key
                  </label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={formData.privateKey}
                      onChange={(e) =>
                        handleInputChange("privateKey", e.target.value)
                      }
                      placeholder="None"
                      className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-l-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:text-white"
                    />
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-600 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-md hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
                      onClick={async () => {
                        if (
                          typeof window !== "undefined" &&
                          window.electronAPI
                        ) {
                          const result =
                            await window.electronAPI.dialogOpenFile();
                          if (!result.canceled && result.filePaths.length > 0) {
                            handleInputChange(
                              "privateKey",
                              result.filePaths[0]
                            );
                          }
                        }
                      }}
                    >
                      <DocumentIcon className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* SSH Passphrase for Private Key */}
                {formData.privateKey && (
                  <div className="col-span-12">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                      SSH Passphrase
                    </label>
                    <div className="relative">
                      <input
                        type={showPassphrase ? "text" : "password"}
                        value={formData.passphrase || ""}
                        onChange={(e) =>
                          handleInputChange("passphrase", e.target.value)
                        }
                        placeholder="Enter passphrase for private key (if required)"
                        className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:text-white pr-8"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassphrase(!showPassphrase)}
                        className="absolute inset-y-0 right-0 pr-2 flex items-center"
                      >
                        {showPassphrase ? (
                          <EyeSlashIcon className="w-3 h-3 text-gray-400" />
                        ) : (
                          <EyeIcon className="w-3 h-3 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Client Certificate for FTPS */}
            {formData.type === "ftps" && shouldShowField("clientCertificate") && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">
                    Client Certificate
                  </label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={formData.clientCertificate}
                      onChange={(e) =>
                        handleInputChange("clientCertificate", e.target.value)
                      }
                      placeholder="None"
                      className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-l-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:text-white"
                    />
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-600 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-md hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
                      onClick={async () => {
                        if (typeof window !== "undefined" && window.electronAPI) {
                          const result = await window.electronAPI.dialogOpenFile();
                          if (!result.canceled && result.filePaths.length > 0) {
                            handleInputChange("clientCertificate", result.filePaths[0]);
                          }
                        }
                      }}
                    >
                      <DocumentIcon className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            )}
            </div>

            {/* More Options - Collapsible Section */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700/60 shadow-sm overflow-hidden">
              <details className="group">
                <summary className="flex items-center justify-between px-5 py-4 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <span className="flex items-center gap-2">
                    <CogIcon className="w-4 h-4 text-indigo-500" />
                    Advanced Options
                  </span>
                <svg
                  className="w-4 h-4 transform transition-transform group-open:rotate-90"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </summary>

              <div className="mt-3 space-y-3 pl-2 border-l-2 border-gray-100 dark:border-gray-700">
                {/* Path */}
                {shouldShowField("path") && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">
                      Path
                    </label>
                    <input
                      type="text"
                      value={formData.path}
                      onChange={(e) =>
                        handleInputChange("path", e.target.value)
                      }
                      placeholder={
                        formData.type === "s3"
                          ? "/epm-business-partner-sensitive-black-2"
                          : "/"
                      }
                      className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:text-white"
                    />
                  </div>
                )}

                {/* Web URL */}
                {shouldShowField("webUrl") && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">
                      Web URL
                    </label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 border border-r-0 border-gray-300 dark:border-gray-600 rounded-l-md">
                        https://
                      </span>
                      <input
                        type="text"
                        value={formData.webUrl}
                        onChange={(e) =>
                          handleInputChange("webUrl", e.target.value)
                        }
                        placeholder="s3.amazonaws.com/"
                        className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-r-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:text-white"
                      />
                      <button
                        type="button"
                        className="ml-1 px-2 py-1.5 text-xs bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
                        title="Open Web URL"
                      >
                        <LinkIcon className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Download Folder */}
                {shouldShowField("downloadFolder") && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">
                      Download Folder
                    </label>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={formData.downloadFolder}
                        onChange={(e) =>
                          handleInputChange("downloadFolder", e.target.value)
                        }
                        placeholder={formData.type === "s3" ? "/Users/username/Downloads" : "/path/to/local/downloads"}
                        className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-l-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:text-white"
                      />
                      <button
                        type="button"
                        className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-600 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-md hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
                        onClick={async () => {
                          if (
                            typeof window !== "undefined" &&
                            window.electronAPI
                          ) {
                            const result =
                              await window.electronAPI.dialogOpenDirectory();
                            if (
                              !result.canceled &&
                              result.filePaths.length > 0
                            ) {
                              handleInputChange(
                                "downloadFolder",
                                result.filePaths[0]
                              );
                            }
                          }
                        }}
                      >
                        <FolderIcon className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Transfer Files */}
                {shouldShowField("transferFiles") && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">
                      Transfer Files
                    </label>
                    <select
                      value={formData.transferFiles}
                      onChange={(e) =>
                        handleInputChange("transferFiles", e.target.value)
                      }
                      className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:text-white"
                    >
                      <option value="Default">Default</option>
                      <option value="Segmented">Segmented</option>
                      <option value="Multipart">Multipart</option>
                      <option value="Browser">Browser</option>
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {/* Timezone */}
                  {shouldShowField("timezone") && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">
                        Timezone
                      </label>
                      <select
                        value={formData.timezone}
                        onChange={(e) =>
                          handleInputChange("timezone", e.target.value)
                        }
                        className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:text-white"
                      >
                        <option value="UTC">UTC</option>
                        <option value="America/New_York">Eastern Time</option>
                        <option value="America/Chicago">Central Time</option>
                        <option value="America/Denver">Mountain Time</option>
                        <option value="America/Los_Angeles">
                          Pacific Time
                        </option>
                        <option value="Europe/London">London</option>
                        <option value="Europe/Paris">Paris</option>
                        <option value="Asia/Tokyo">Tokyo</option>
                      </select>
                    </div>
                  )}

                  {/* Encoding */}
                  {shouldShowField("encoding") && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">
                        Encoding
                      </label>
                      <select
                        value={formData.encoding}
                        onChange={(e) =>
                          handleInputChange("encoding", e.target.value)
                        }
                        className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:text-white"
                      >
                        <option value="Default">Default</option>
                        <option value="UTF-8">UTF-8</option>
                        <option value="ISO-8859-1">ISO-8859-1</option>
                        <option value="Windows-1252">Windows-1252</option>
                      </select>
                    </div>
                  )}

                  {/* Connect Mode */}
                  {shouldShowField("connectMode") && (
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">
                        Connect Mode
                      </label>
                      <select
                        value={formData.connectMode}
                        onChange={(e) =>
                          handleInputChange("connectMode", e.target.value)
                        }
                        className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:text-white"
                      >
                        <option value="Default">Default</option>
                        <option value="Active">Active</option>
                        <option value="Passive">Passive (PASV)</option>
                        <option value="Extended Passive">
                          Extended Passive (EPSV)
                        </option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">
                    Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => handleInputChange("notes", e.target.value)}
                    rows={3}
                    placeholder="Additional notes about this connection..."
                    className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:text-white resize-none"
                  />
                </div>
              </div>
            </details>
            </div>

            {/* Save as Bookmark */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="saveBookmark"
                  checked={saveAsBookmark}
                  onChange={(e) => setSaveAsBookmark(e.target.checked)}
                  className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                />
                <label
                  htmlFor="saveBookmark"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Save as bookmark
                </label>
              </div>

              {saveAsBookmark && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Bookmark Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        handleInputChange("name", e.target.value)
                      }
                      placeholder={`${getCurrentConfig().name} - ${
                        formData.host
                      }`}
                      className="input-field"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Labels (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="production, staging, client-name"
                      className="input-field"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Notes (Optional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Additional notes about this connection..."
                      className="input-field resize-none"
                    />
                  </div>
                </motion.div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between items-center pt-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {formData.host && (
                  <span>
                    Connecting to: {formData.username}@{formData.host}:
                    {formData.port}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary"
                  disabled={loading || externalLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex items-center gap-2 min-w-[120px]"
                  disabled={
                    loading || externalLoading ||
                    !formData.host ||
                    (!formData.username && !formData.anonymousLogin)
                  }
                >
                  {(loading || externalLoading) ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Connecting...
                    </>
                  ) : (
                    <>
                      <WifiIcon className="w-3.5 h-3.5" />
                      Connect
                    </>
                  )}
                </button>
              </div>
            </div>
              </div>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ConnectionModal;
