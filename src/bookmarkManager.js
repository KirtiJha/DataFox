const fs = require('fs-extra');
const path = require('path');
const { app } = require('electron');
const crypto = require('crypto');

class BookmarkManager {
    constructor() {
        this.bookmarksFile = path.join(app.getPath('userData'), 'bookmarks.json');
        this.bookmarks = [];
        this.loadBookmarks();
    }

    async loadBookmarks() {
        try {
            if (await fs.pathExists(this.bookmarksFile)) {
                const data = await fs.readJson(this.bookmarksFile);
                this.bookmarks = Array.isArray(data) ? data : [];
            } else {
                this.bookmarks = [];
                await this.saveBookmarks();
            }
        } catch (error) {
            console.error('Error loading bookmarks:', error);
            this.bookmarks = [];
        }
    }

    async saveBookmarks() {
        try {
            await fs.ensureDir(path.dirname(this.bookmarksFile));
            await fs.writeJson(this.bookmarksFile, this.bookmarks, { spaces: 2 });
        } catch (error) {
            console.error('Error saving bookmarks:', error);
            throw error;
        }
    }

    generateId() {
        return crypto.randomUUID();
    }

    async getAllBookmarks() {
        return this.bookmarks;
    }

    async saveBookmark(bookmarkData) {
        try {
            const bookmark = {
                id: this.generateId(),
                name: bookmarkData.name,
                protocol: bookmarkData.type || bookmarkData.protocol || 'ftp', // Support both field names
                type: bookmarkData.type || bookmarkData.protocol || 'ftp', // Add type field for consistency
                host: bookmarkData.host,
                port: bookmarkData.port || (bookmarkData.type === 'sftp' || bookmarkData.protocol === 'sftp' ? 22 : (bookmarkData.type === 's3' || bookmarkData.protocol === 's3' ? 443 : 21)),
                username: bookmarkData.username,
                password: bookmarkData.password || '', // In a real app, encrypt this
                bucket: bookmarkData.bucket || '', // S3 bucket field
                privateKey: bookmarkData.privateKey || '',
                passive: bookmarkData.passive !== false,
                secure: bookmarkData.secure || false,
                encoding: bookmarkData.encoding || 'utf8',
                remotePath: bookmarkData.path || bookmarkData.remotePath || '/',
                path: bookmarkData.path || bookmarkData.remotePath || '/', // Add path field for consistency
                localPath: bookmarkData.downloadFolder || bookmarkData.localPath || '',
                downloadFolder: bookmarkData.downloadFolder || bookmarkData.localPath || '', // Add downloadFolder field for consistency
                notes: bookmarkData.notes || '',
                tags: bookmarkData.tags || [],
                createdAt: new Date().toISOString(),
                lastConnected: null,
                connectionCount: 0
            };

            this.bookmarks.push(bookmark);
            await this.saveBookmarks();
            
            return { success: true, bookmark };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async updateBookmark(bookmarkData) {
        try {
            const index = this.bookmarks.findIndex(b => b.id === bookmarkData.id);
            if (index === -1) {
                return { success: false, error: 'Bookmark not found' };
            }

            const existingBookmark = this.bookmarks[index];
            const updatedBookmark = {
                ...existingBookmark,
                ...bookmarkData,
                updatedAt: new Date().toISOString()
            };

            this.bookmarks[index] = updatedBookmark;
            await this.saveBookmarks();

            return { success: true, bookmark: updatedBookmark };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async deleteBookmark(id) {
        try {
            const index = this.bookmarks.findIndex(b => b.id === id);
            if (index === -1) {
                return { success: false, error: 'Bookmark not found' };
            }

            this.bookmarks.splice(index, 1);
            await this.saveBookmarks();

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getBookmarkById(id) {
        const bookmark = this.bookmarks.find(b => b.id === id);
        return bookmark || null;
    }

    async updateLastConnected(id) {
        try {
            const bookmark = this.bookmarks.find(b => b.id === id);
            if (bookmark) {
                bookmark.lastConnected = new Date().toISOString();
                bookmark.connectionCount = (bookmark.connectionCount || 0) + 1;
                await this.saveBookmarks();
            }
        } catch (error) {
            console.error('Error updating last connected:', error);
        }
    }

    async searchBookmarks(query) {
        const lowercaseQuery = query.toLowerCase();
        return this.bookmarks.filter(bookmark => 
            bookmark.name.toLowerCase().includes(lowercaseQuery) ||
            bookmark.host.toLowerCase().includes(lowercaseQuery) ||
            bookmark.username.toLowerCase().includes(lowercaseQuery) ||
            bookmark.notes.toLowerCase().includes(lowercaseQuery) ||
            (bookmark.tags && bookmark.tags.some(tag => 
                tag.toLowerCase().includes(lowercaseQuery)
            ))
        );
    }

    async getBookmarksByTag(tag) {
        return this.bookmarks.filter(bookmark => 
            bookmark.tags && bookmark.tags.includes(tag)
        );
    }

    async getAllTags() {
        const allTags = this.bookmarks.reduce((tags, bookmark) => {
            if (bookmark.tags) {
                return [...tags, ...bookmark.tags];
            }
            return tags;
        }, []);

        return [...new Set(allTags)].sort();
    }

    async exportBookmarks(filePath) {
        try {
            const exportData = {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                bookmarks: this.bookmarks.map(bookmark => ({
                    ...bookmark,
                    password: '', // Don't export passwords for security
                    privateKey: '' // Don't export private keys
                }))
            };

            await fs.writeJson(filePath, exportData, { spaces: 2 });
            return { success: true, count: this.bookmarks.length };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async importBookmarks(filePath, mergeMode = 'append') {
        try {
            const importData = await fs.readJson(filePath);
            
            if (!importData.bookmarks || !Array.isArray(importData.bookmarks)) {
                return { success: false, error: 'Invalid bookmark file format' };
            }

            let importedCount = 0;
            const errors = [];

            for (const bookmarkData of importData.bookmarks) {
                try {
                    // Generate new ID and timestamps for imported bookmarks
                    const bookmark = {
                        ...bookmarkData,
                        id: this.generateId(),
                        importedAt: new Date().toISOString(),
                        lastConnected: null,
                        connectionCount: 0
                    };

                    // Check for duplicates based on host and username
                    const duplicate = this.bookmarks.find(b => 
                        b.host === bookmark.host && 
                        b.username === bookmark.username &&
                        b.protocol === bookmark.protocol
                    );

                    if (duplicate && mergeMode === 'skip') {
                        continue;
                    } else if (duplicate && mergeMode === 'replace') {
                        const index = this.bookmarks.findIndex(b => b.id === duplicate.id);
                        this.bookmarks[index] = { ...duplicate, ...bookmark, id: duplicate.id };
                    } else {
                        this.bookmarks.push(bookmark);
                    }

                    importedCount++;
                } catch (error) {
                    errors.push(`Error importing bookmark ${bookmarkData.name}: ${error.message}`);
                }
            }

            await this.saveBookmarks();

            return { 
                success: true, 
                importedCount,
                errors: errors.length > 0 ? errors : null
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getRecentConnections(limit = 10) {
        return this.bookmarks
            .filter(bookmark => bookmark.lastConnected)
            .sort((a, b) => new Date(b.lastConnected) - new Date(a.lastConnected))
            .slice(0, limit);
    }

    async getMostUsedConnections(limit = 10) {
        return this.bookmarks
            .filter(bookmark => bookmark.connectionCount > 0)
            .sort((a, b) => (b.connectionCount || 0) - (a.connectionCount || 0))
            .slice(0, limit);
    }
}

module.exports = BookmarkManager;
