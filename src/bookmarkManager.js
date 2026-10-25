const fs = require('fs-extra');
const path = require('path');
const { app, safeStorage } = require('electron');
const crypto = require('crypto');

// Fields encrypted at rest with the OS keychain (Keychain, DPAPI, libsecret/kwallet).
const SECRET_FIELDS = ['password', 'passphrase', 'secretKey'];
const ENCRYPTED_PREFIX = 'safe:v1:';

class BookmarkManager {
    constructor() {
        this.bookmarksFile = path.join(app.getPath('userData'), 'bookmarks.json');
        this.bookmarks = [];
        // Encrypted values we could not decrypt (e.g. keychain locked), by "id:field".
        // They are written back unchanged so a save never destroys them.
        this.undecryptable = new Map();
        // safeStorage is only usable once the app is ready.
        this.ready = app.whenReady().then(() => this.loadBookmarks());
    }

    canEncrypt() {
        return safeStorage.isEncryptionAvailable();
    }

    encryptSecret(value) {
        if (!value || !this.canEncrypt()) return value;
        return ENCRYPTED_PREFIX + safeStorage.encryptString(value).toString('base64');
    }

    decryptSecret(value) {
        if (typeof value !== 'string' || !value.startsWith(ENCRYPTED_PREFIX)) return value;
        try {
            return safeStorage.decryptString(Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64'));
        } catch (error) {
            // E.g. the file was copied from another machine or user account.
            console.error('Could not decrypt a saved bookmark secret; it must be re-entered.');
            return '';
        }
    }

    mapSecrets(bookmark, transform) {
        const result = { ...bookmark };
        for (const field of SECRET_FIELDS) {
            if (result[field]) result[field] = transform(result[field], field);
        }
        return result;
    }

    decryptBookmark(stored) {
        return this.mapSecrets(stored, (value, field) => {
            const decrypted = this.decryptSecret(value);
            if (!decrypted && value) this.undecryptable.set(`${stored.id}:${field}`, value);
            return decrypted;
        });
    }

    encryptBookmark(bookmark) {
        const stored = this.mapSecrets(bookmark, v => this.encryptSecret(v));
        for (const field of SECRET_FIELDS) {
            const original = this.undecryptable.get(`${bookmark.id}:${field}`);
            if (original && !bookmark[field]) stored[field] = original;
        }
        return stored;
    }

    async loadBookmarks() {
        try {
            if (await fs.pathExists(this.bookmarksFile)) {
                const data = await fs.readJson(this.bookmarksFile);
                const stored = Array.isArray(data) ? data : [];
                this.undecryptable.clear();
                this.bookmarks = stored.map(b => this.decryptBookmark(b));

                // Encrypt secrets saved in plain text by earlier versions.
                const hasPlaintext = stored.some(b => SECRET_FIELDS.some(f =>
                    b[f] && !String(b[f]).startsWith(ENCRYPTED_PREFIX)));
                if (hasPlaintext && this.canEncrypt()) {
                    await this.saveBookmarks();
                }
            } else {
                this.bookmarks = [];
                await this.saveBookmarks();
            }

            if (!this.canEncrypt()) {
                console.warn('OS encryption is unavailable; bookmark passwords are stored unencrypted.');
            }
        } catch (error) {
            console.error('Error loading bookmarks:', error);
            this.bookmarks = [];
        }
    }

    async saveBookmarks() {
        try {
            await fs.ensureDir(path.dirname(this.bookmarksFile));
            const stored = this.bookmarks.map(b => this.encryptBookmark(b));
            await fs.writeJson(this.bookmarksFile, stored, { spaces: 2 });
        } catch (error) {
            console.error('Error saving bookmarks:', error);
            throw error;
        }
    }

    generateId() {
        return crypto.randomUUID();
    }

    async getAllBookmarks() {
        await this.ready;
        return this.bookmarks;
    }

    async saveBookmark(bookmarkData) {
        try {
            await this.ready;
            const bookmark = {
                id: this.generateId(),
                name: bookmarkData.name,
                protocol: bookmarkData.type || bookmarkData.protocol || 'ftp', // Support both field names
                type: bookmarkData.type || bookmarkData.protocol || 'ftp', // Add type field for consistency
                host: bookmarkData.host,
                port: bookmarkData.port || (bookmarkData.type === 'sftp' || bookmarkData.protocol === 'sftp' ? 22 : (bookmarkData.type === 's3' || bookmarkData.protocol === 's3' ? 443 : 21)),
                username: bookmarkData.username,
                password: bookmarkData.password || '',
                passphrase: bookmarkData.passphrase || '',
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
            await this.ready;
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
            await this.ready;
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
            await this.ready;
            // Secrets are never exported; they would be plain text in the file.
            const exportData = {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                bookmarks: this.bookmarks.map(bookmark => ({
                    ...this.mapSecrets(bookmark, () => ''),
                    privateKey: ''
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
            await this.ready;
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
                        // Encrypted values from another machine can't be decrypted here.
                        ...this.mapSecrets(bookmarkData, v =>
                            String(v).startsWith(ENCRYPTED_PREFIX) ? '' : v),
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
