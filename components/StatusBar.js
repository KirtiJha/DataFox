import {
  WifiIcon,
  NoSymbolIcon,
  DocumentIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

const StatusBar = ({
  isConnected,
  connectionInfo,
  fileCount,
  selectedCount,
  indexingStatus,
}) => {
  const renderIndexingStatus = () => {
    if (!indexingStatus || !isConnected) return null;

    const { isIndexing, progress, totalIndexed, isPaused } = indexingStatus;

    if (isIndexing && !isPaused) {
      const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
      const phase = progress.phase || 'processing';
      const isCollecting = phase === 'collection' || progress.total === 0;
      const isUsingCache = phase === 'cache';
      
      return (
        <div className="flex items-center gap-2 text-sm">
          {isUsingCache ? 
            <ClockIcon className="w-4 h-4 text-green-500" /> :
            <ArrowPathIcon className="w-4 h-4 text-blue-500 animate-spin" />
          }
          <span className="text-blue-600 dark:text-blue-400">
            {isUsingCache ? 'Using cached discovery...' : 
             isCollecting ? 'Discovering files...' : 
             `Indexing: ${percentage}%`}
          </span>
          {progress.fileName && (
            <span className="text-gray-500 dark:text-gray-400 max-w-32 truncate">
              {progress.fileName}
            </span>
          )}
          {!isCollecting && (
            <span className="text-xs text-gray-400">
              ({progress.current}/{progress.total})
            </span>
          )}
        </div>
      );
    }

    if (isPaused) {
      return (
        <div className="flex items-center gap-2 text-sm">
          <ClockIcon className="w-4 h-4 text-yellow-500" />
          <span className="text-yellow-600 dark:text-yellow-400">
            Indexing paused
          </span>
        </div>
      );
    }

    if (totalIndexed > 0) {
      return (
        <div className="flex items-center gap-2 text-sm">
          <CheckCircleIcon className="w-4 h-4 text-green-500" />
          <span className="text-green-600 dark:text-green-400">
            {totalIndexed} files indexed
          </span>
        </div>
      );
    }

    return null;
  };
  return (
    <div className="status-bar">
      <div className="flex items-center gap-4">
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <WifiIcon className="w-4 h-4 text-green-500" />
              <span className="text-green-600 dark:text-green-400">
                Connected
              </span>
              {connectionInfo && (
                <span className="text-gray-500 dark:text-gray-400">
                  to{" "}
                  {connectionInfo.name ||
                    (connectionInfo.type === "s3"
                      ? connectionInfo.bucket
                      : `${connectionInfo.host}:${connectionInfo.port}`)}
                </span>
              )}
            </>
          ) : (
            <>
              <NoSymbolIcon className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500 dark:text-gray-400">
                Not connected
              </span>
            </>
          )}
        </div>

        {/* File Count */}
        {isConnected && (
          <div className="flex items-center gap-2">
            <DocumentIcon className="w-4 h-4" />
            <span>
              {fileCount} item{fileCount !== 1 ? "s" : ""}
              {selectedCount > 0 && (
                <span className="ml-1">({selectedCount} selected)</span>
              )}
            </span>
          </div>
        )}

        {/* Indexing Status */}
        {renderIndexingStatus()}
      </div>

      <div className="flex items-center gap-4">
        {/* Current Time */}
        <div className="flex items-center gap-1">
          <ClockIcon className="w-4 h-4" />
          <span>
            {new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {/* Version */}
        <span className="text-xs">v1.0.0</span>
      </div>
    </div>
  );
};

export default StatusBar;
