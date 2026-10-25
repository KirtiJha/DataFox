/**
 * Base Connection Manager Interface
 * Defines the common interface that all connection managers should implement
 */

const path = require('path');
const {
  PREVIEW_MAX_BYTES,
  indexMaxBytes,
  buildPreviewContent,
  extractIndexContent,
} = require('./fileContent');

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
   * Rename or move a file or folder
   * @param {string} oldPath - Current path
   * @param {string} newPath - New path
   * @returns {Promise<Object>} Rename result
   */
  async rename(oldPath, newPath) {
    throw new Error('rename() method must be implemented by subclass');
  }

  /**
   * Get the size of a remote file in bytes
   * @param {string} remotePath - Remote file path
   * @returns {Promise<number>} File size
   */
  async getFileSize(remotePath) {
    throw new Error('getFileSize() method must be implemented by subclass');
  }

  /**
   * Read a remote file into memory
   * @param {string} remotePath - Remote file path
   * @returns {Promise<Buffer>} File contents
   */
  async readFile(remotePath) {
    throw new Error('readFile() method must be implemented by subclass');
  }

  /**
   * Read a file for preview, refusing files above the preview size limit
   * @param {string} remotePath - Remote file path
   * @returns {Promise<Object>} Preview result with text content
   */
  async previewFile(remotePath) {
    const fileSize = await this.getFileSize(remotePath);
    if (fileSize > PREVIEW_MAX_BYTES) {
      throw new Error('File too large for preview (max 10MB)');
    }

    const buffer = await this.readFile(remotePath);
    const fileName = path.posix.basename(remotePath);

    return {
      success: true,
      content: await buildPreviewContent(buffer, fileName),
      fileName,
      fileSize: buffer.length,
    };
  }

  /**
   * Download a file and extract its searchable content for the content index
   * @param {string} remotePath - Remote file path
   * @param {number} [knownSize] - Size from the directory listing, if known
   * @returns {Promise<Object>} Compact content index entry
   */
  async extractContent(remotePath, knownSize) {
    const fileName = path.posix.basename(remotePath);
    const maxBytes = indexMaxBytes(fileName);
    const fileSize = Number.isFinite(knownSize)
      ? knownSize
      : await this.getFileSize(remotePath);

    if (fileSize > maxBytes) {
      return {
        searchableText: '',
        fullyIndexed: false,
        reason: 'too-large',
      };
    }

    const buffer = await this.readFile(remotePath);
    return extractIndexContent(buffer, fileName);
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
      modifiedAt: file.modifiedAt || null,
      permissions: file.permissions || '',
      owner: file.owner || '',
      group: file.group || '',
      fileCount: file.fileCount, // Preserve file count for folders
      etag: file.etag // Preserve any additional metadata
    };
  }
}

module.exports = BaseConnectionManager;
