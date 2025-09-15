// Browser-compatible SemanticSearchEngine that communicates with main process
class SemanticSearchEngine {
    constructor() {
        this.isInitialized = false;
        this.isInitializing = false;
        console.log('SemanticSearchEngine: Browser-compatible constructor called');
    }

    async initialize() {
        if (this.isInitialized || this.isInitializing) {
            return this.isInitialized;
        }

        this.isInitializing = true;
        
        try {
            console.log('SemanticSearchEngine: Requesting initialization from main process...');
            
            // Check if we're in electron environment
            if (typeof window !== 'undefined' && window.electronAPI) {
                const result = await window.electronAPI.semanticSearchInitialize();
                console.log('SemanticSearchEngine: Main process initialization result:', result);
                
                this.isInitialized = result.success && result.isReady;
                return this.isInitialized;
            } else {
                console.warn('SemanticSearchEngine: Not in Electron environment, semantic search unavailable');
                this.isInitialized = false;
                return false;
            }
            
        } catch (error) {
            console.error('SemanticSearchEngine: Initialization failed:', error);
            this.isInitialized = false;
            return false;
        } finally {
            this.isInitializing = false;
        }
    }

    async addFileEmbedding(filePath, content, fileStats) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!this.isInitialized) {
            console.error('SemanticSearchEngine: Cannot add embedding - not initialized');
            return false;
        }

        try {
            if (typeof window !== 'undefined' && window.electronAPI) {
                const result = await window.electronAPI.semanticSearchAddFile(filePath, content, fileStats);
                console.log(`SemanticSearchEngine: Add file result for ${filePath}:`, result);
                return result.success;
            }
            return false;
        } catch (error) {
            console.error('SemanticSearchEngine: Error adding file embedding:', error);
            return false;
        }
    }

    async searchSemantic(query, limit = 10) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!this.isInitialized) {
            console.error('SemanticSearchEngine: Cannot search - not initialized');
            return [];
        }

        try {
            if (typeof window !== 'undefined' && window.electronAPI) {
                const result = await window.electronAPI.semanticSearchQuery(query, limit);
                console.log(`SemanticSearchEngine: Search results for "${query}":`, result);
                return result.success ? result.results : [];
            }
            return [];
        } catch (error) {
            console.error('SemanticSearchEngine: Search error:', error);
            return [];
        }
    }

    async getStats() {
        try {
            if (typeof window !== 'undefined' && window.electronAPI) {
                const result = await window.electronAPI.semanticSearchGetStats();
                return result.success ? result.stats : { totalFiles: 0, totalChunks: 0, isReady: false };
            }
            return { totalFiles: 0, totalChunks: 0, isReady: false };
        } catch (error) {
            console.error('SemanticSearchEngine: Error getting stats:', error);
            return { totalFiles: 0, totalChunks: 0, isReady: false };
        }
    }
}

export default SemanticSearchEngine;
