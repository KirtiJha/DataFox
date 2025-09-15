import React from 'react';
import { motion } from 'framer-motion';
import { XMarkIcon, FunnelIcon } from '@heroicons/react/24/outline';

const QuickFilters = ({ activeFilters, onFilterChange, onClearFilters, className = '' }) => {
  // Quick filters removed as requested - keeping only utility functions for filter management
  
  const getActiveFilterCount = () => {
    let count = 0;
    if (activeFilters.fileTypes?.length) count += activeFilters.fileTypes.length;
    if (activeFilters.sizeRanges?.length) count += activeFilters.sizeRanges.length;
    if (activeFilters.dateRange) count += 1;
    if (activeFilters.showHidden) count += 1;
    if (activeFilters.itemType && activeFilters.itemType !== 'all') count += 1;
    return count;
  };

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {/* Quick filter buttons removed - showing only active filter status */}
      
      {/* Clear Filters Button */}
      {getActiveFilterCount() > 0 && (
        <>
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={onClearFilters}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg transition-all duration-200 hover:scale-105"
            title="Clear all filters"
          >
            <XMarkIcon className="w-4 h-4" />
            <span>Clear All</span>
            <span className="px-1.5 py-0.5 text-xs bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded">
              {getActiveFilterCount()}
            </span>
          </motion.button>

          {/* Filter Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
            <FunnelIcon className="w-4 h-4" />
            <span>
              {getActiveFilterCount()} filter{getActiveFilterCount() === 1 ? "" : "s"} active
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export default QuickFilters;
