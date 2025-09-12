const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

class BookmarkManager {
  constructor() {
    this.bookmarksFile = path.join(app.getPath('userData'), 'bookmarks.json');
    this.bookmarks = [];
    this.loadBookmarks();
  }

  async loadBookmarks() {
    try {
      const data = await fs.readFile(this.bookmarksFile, 'utf8');
      this.bookmarks = JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid, start with empty array
      this.bookmarks = [];
    }
  }

  async saveBookmarks() {
    try {
      await fs.writeFile(this.bookmarksFile, JSON.stringify(this.bookmarks, null, 2));
    } catch (error) {
      throw new Error(`Failed to save bookmarks: ${error.message}`);
    }
  }

  getBookmarks() {
    return this.bookmarks;
  }

  async addBookmark(bookmark) {
    const newBookmark = {
      id: Date.now().toString(),
      name: bookmark.name,
      host: bookmark.host,
      port: bookmark.port,
      username: bookmark.username,
      password: bookmark.password, // In production, encrypt this
      type: bookmark.type || 'ftp',
      secure: bookmark.secure || false,
      privateKey: bookmark.privateKey || '',
      passphrase: bookmark.passphrase || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.bookmarks.push(newBookmark);
    await this.saveBookmarks();
    return newBookmark;
  }

  async updateBookmark(id, updates) {
    const index = this.bookmarks.findIndex(b => b.id === id);
    if (index === -1) {
      throw new Error('Bookmark not found');
    }

    this.bookmarks[index] = {
      ...this.bookmarks[index],
      ...updates,
      id: id, // Ensure ID doesn't change
      updatedAt: new Date().toISOString()
    };

    await this.saveBookmarks();
    return this.bookmarks[index];
  }

  async deleteBookmark(id) {
    const index = this.bookmarks.findIndex(b => b.id === id);
    if (index === -1) {
      throw new Error('Bookmark not found');
    }

    this.bookmarks.splice(index, 1);
    await this.saveBookmarks();
    return true;
  }

  async exportBookmarks(filePath) {
    try {
      const exportData = {
        version: '1.0',
        exported: new Date().toISOString(),
        bookmarks: this.bookmarks
      };
      await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));
      return true;
    } catch (error) {
      throw new Error(`Export failed: ${error.message}`);
    }
  }

  async importBookmarks(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const importData = JSON.parse(data);
      
      if (importData.bookmarks && Array.isArray(importData.bookmarks)) {
        // Add imported bookmarks with new IDs to avoid conflicts
        const importedBookmarks = importData.bookmarks.map(bookmark => ({
          ...bookmark,
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }));

        this.bookmarks.push(...importedBookmarks);
        await this.saveBookmarks();
        return importedBookmarks.length;
      } else {
        throw new Error('Invalid bookmark file format');
      }
    } catch (error) {
      throw new Error(`Import failed: ${error.message}`);
    }
  }
}

module.exports = BookmarkManager;
