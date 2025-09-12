/**
 * Base Connection Manager Interface
 * Defines the common interface that all connection managers should implement
 */

class BaseConnectionManager {
  constructor() {
    this.isConnected = false;
    this.client = null;
    this.connectionInfo = {};
  }

  /**
   * Connect to the server
   * @param {Object} config - Connection configuration
   * @returns {Promise<Object>} Connection result
   */
  async connect(config) {
    throw new Error('connect() method must be implemented by subclass');
  }

  /**
   * Disconnect from the server
   * @returns {Promise<void>}
   */
  async disconnect() {
    throw new Error('disconnect() method must be implemented by subclass');
  }

  /**
   * List directory contents
   * @param {string} path - Directory path
   * @returns {Promise<Array>} Array of file/folder objects
   */
  async listDirectory(path = '/') {
    throw new Error('listDirectory() method must be implemented by subclass');
  }

  /**
   * Upload a file
   * @param {string} localPath - Local file path
   * @param {string} remotePath - Remote file path
   * @returns {Promise<Object>} Upload result
   */
  async uploadFile(localPath, remotePath) {
    throw new Error('uploadFile() method must be implemented by subclass');
  }

  /**
   * Download a file
   * @param {string} remotePath - Remote file path
   * @param {string} localPath - Local file path
   * @returns {Promise<Object>} Download result
   */
  async downloadFile(remotePath, localPath) {
    throw new Error('downloadFile() method must be implemented by subclass');
  }

  /**
   * Delete a file or folder
   * @param {string} path - Path to delete
   * @param {boolean} isDirectory - Whether the path is a directory
   * @returns {Promise<Object>} Delete result
   */
  async deleteItem(path, isDirectory = false) {
    throw new Error('deleteItem() method must be implemented by subclass');
  }

  /**
   * Create a directory
   * @param {string} path - Directory path to create
   * @returns {Promise<Object>} Create directory result
   */
  async createDirectory(path) {
    throw new Error('createDirectory() method must be implemented by subclass');
  }

  /**
   * Get connection status
   * @returns {boolean} Connection status
   */
  getConnectionStatus() {
    return this.isConnected;
  }

  /**
   * Get connection info
   * @returns {Object} Connection information
   */
  getConnectionInfo() {
    return this.connectionInfo;
  }

  /**
   * Format file information consistently across all managers
   * @param {Object} file - Raw file info from protocol
   * @returns {Object} Standardized file info
   */
  formatFileInfo(file) {
    return {
      name: file.name || '',
      size: file.size || 0,
      type: file.type || 'file',
      isDirectory: file.isDirectory || false,
      modifiedAt: file.modifiedAt || new Date(),
      permissions: file.permissions || '',
      owner: file.owner || '',
      group: file.group || '',
      fileCount: file.fileCount, // Preserve file count for folders
      etag: file.etag // Preserve any additional metadata
    };
  }
}

module.exports = BaseConnectionManager;
