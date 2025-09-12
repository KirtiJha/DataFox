import {
  WifiIcon,
  NoSymbolIcon,
  DocumentIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

const StatusBar = ({
  isConnected,
  connectionInfo,
  fileCount,
  selectedCount,
}) => {
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
