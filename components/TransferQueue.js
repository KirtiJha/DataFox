import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowUpIcon, 
  ArrowDownIcon, 
  CheckCircleIcon, 
  ExclamationCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline'

const TransferQueue = ({ transfers, onCancelTransfer, onClearCompleted }) => {
  const activeTransfers = transfers.filter(t => t.status === 'transferring')
  const completedTransfers = transfers.filter(t => t.status === 'completed' || t.status === 'failed')

  const getStatusIcon = (transfer) => {
    switch (transfer.status) {
      case 'transferring':
        return (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-600 border-t-transparent"></div>
        )
      case 'completed':
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />
      case 'failed':
        return <XCircleIcon className="w-4 h-4 text-red-500" />
      default:
        return <ExclamationCircleIcon className="w-4 h-4 text-yellow-500" />
    }
  }

  const getTransferIcon = (type) => {
    return type === 'upload' 
      ? <ArrowUpIcon className="w-4 h-4" />
      : <ArrowDownIcon className="w-4 h-4" />
  }

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  if (transfers.length === 0) {
    return null
  }

  return (
    <div className="w-80 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900 dark:text-white">
            Transfers
          </h3>
          {completedTransfers.length > 0 && (
            <button
              onClick={onClearCompleted}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Clear completed
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Active Transfers */}
        {activeTransfers.length > 0 && (
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Active ({activeTransfers.length})
            </h4>
            <div className="space-y-3">
              {activeTransfers.map((transfer) => (
                <motion.div
                  key={transfer.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div className="flex items-center gap-2 mb-2">
                    {getTransferIcon(transfer.type)}
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {transfer.fileName}
                    </span>
                    {getStatusIcon(transfer)}
                  </div>
                  
                  {transfer.progress !== undefined && (
                    <div className="mb-2">
                      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                        <span>{Math.round(transfer.progress)}%</span>
                        <span>
                          {formatBytes(transfer.transferred || 0)} / {formatBytes(transfer.total || 0)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                        <div 
                          className="bg-primary-600 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${transfer.progress || 0}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {transfer.speed && `${formatBytes(transfer.speed)}/s`}
                    </span>
                    <button
                      onClick={() => onCancelTransfer(transfer.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Completed Transfers */}
        {completedTransfers.length > 0 && (
          <div className="p-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Recent ({completedTransfers.length})
            </h4>
            <div className="space-y-2">
              <AnimatePresence>
                {completedTransfers.slice(-10).map((transfer) => (
                  <motion.div
                    key={transfer.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {getTransferIcon(transfer.type)}
                      <span className="text-sm text-gray-900 dark:text-white truncate">
                        {transfer.fileName}
                      </span>
                    </div>
                    {getStatusIcon(transfer)}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {transfers.length === 0 && (
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <div>
              <ArrowUpIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No transfers yet
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TransferQueue
