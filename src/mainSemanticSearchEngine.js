const { connect } = require('@lancedb/lancedb');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

class MainSemanticSearchEngine {
    constructor(userDataPath) {
        this.userDataPath = userDataPath;
        this.dbPath = path.join(userDataPath, 'semantic-search.lance');
        this.db = null;
        this.table = null;
        this.embedder = null;
        this.transformers = null; // Will store the dynamically imported transformers module
        this.isInitialized = false;
        this.isInitializing = false;
        this.contentHashes = new Map(); // Cache for content hashes
        
        console.log('MainSemanticSearchEngine: Constructor called with path:', this.dbPath);
    }

    async initialize() {
        if (this.isInitialized || this.isInitializing) {
            return this.isInitialized;
        }

        this.isInitializing = true;
        
        try {
            console.log('MainSemanticSearchEngine: Starting initialization...');
            
            // Ensure directory exists
            await fs.ensureDir(path.dirname(this.dbPath));
            
            // Dynamically import transformers module
            console.log('MainSemanticSearchEngine: Loading transformers module...');
            this.transformers = await import('@xenova/transformers');
            
            // Initialize embedding model
            console.log('MainSemanticSearchEngine: Loading embedding model...');
            this.embedder = await this.transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
            
            // Connect to LanceDB
            console.log('MainSemanticSearchEngine: Connecting to LanceDB...');
            this.db = await connect(this.dbPath);
            
            // Try to open existing table or create new one
            try {
                this.table = await this.db.openTable('file_embeddings');
                console.log('MainSemanticSearchEngine: Opened existing table');
            } catch (error) {
                console.log('MainSemanticSearchEngine: Creating new table...');
                
                // Try creating empty table with explicit schema definition
                try {
                    const emptyData = [];
                    const schema = {
                        id: 'string',
                        file_path: 'string', 
                        content: 'string',
                        content_hash: 'string',
                        chunk_index: 'int32',
                        file_size: 'int64',
                        last_modified: 'string',
                        embedding: { type: 'fixed_size_list', listSize: 384, valueType: 'float32' }
                    };
                    
                    this.table = await this.db.createEmptyTable('file_embeddings', schema);
                } catch (schemaError) {
                    console.log('MainSemanticSearchEngine: Schema creation failed, using dummy data approach...');
                    
                    // Fallback: Create table with a single dummy record
                    const dummyData = [{
                        id: 'dummy_record',
                        file_path: '/dummy',
                        content: 'dummy content',
                        content_hash: 'dummy_hash',
                        chunk_index: 0,
                        file_size: 0,
                        last_modified: '2023-01-01T00:00:00.000Z', // Hardcoded string
                        embedding: new Array(384).fill(0.0)
                    }];
                    
                    this.table = await this.db.createTable('file_embeddings', dummyData);
                    
                    // Remove the dummy record
                    await this.table.delete("id = 'dummy_record'");
                }
                
                console.log('MainSemanticSearchEngine: Table created successfully');
            }
            
            this.isInitialized = true;
            console.log('MainSemanticSearchEngine: Initialization completed successfully');
            return true;
            
        } catch (error) {
            console.error('MainSemanticSearchEngine: Initialization failed:', error);
            this.isInitialized = false;
            return false;
        } finally {
            this.isInitializing = false;
        }
    }

    async generateEmbedding(text) {
        if (!this.embedder) {
            throw new Error('Embedding model not initialized');
        }

        try {
            const result = await this.embedder(text, { pooling: 'mean', normalize: true });
            return Array.from(result.data);
        } catch (error) {
            console.error('MainSemanticSearchEngine: Error generating embedding:', error);
            throw error;
        }
    }

    generateContentHash(content) {
        return crypto.createHash('md5').update(content).digest('hex');
    }

    chunkText(text, maxChunkSize = 512, overlap = 50) {
        const chunks = [];
        const words = text.split(/\s+/);
        
        for (let i = 0; i < words.length; i += maxChunkSize - overlap) {
            const chunk = words.slice(i, i + maxChunkSize).join(' ');
            if (chunk.trim()) {
                chunks.push(chunk.trim());
            }
        }
        
        return chunks.length > 0 ? chunks : [text];
    }

    async addFileEmbedding(filePath, content, fileStats) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!this.isInitialized) {
            console.error('MainSemanticSearchEngine: Cannot add embedding - not initialized');
            return false;
        }

        try {
            const contentHash = this.generateContentHash(content);
            
            // Check if file already indexed with same content
            const dummyVector = new Array(384).fill(0.0);
            const existingRecords = await this.table
                .search(dummyVector) // Use proper 384-dimensional vector for metadata search
                .where(`file_path = '${filePath.replace(/'/g, "\\'")}'`)
                .limit(1)
                .toArray();

            if (existingRecords.length > 0 && existingRecords[0].content_hash === contentHash) {
                console.log('MainSemanticSearchEngine: File already indexed with same content:', filePath);
                return true;
            }

            // Remove existing entries for this file
            if (existingRecords.length > 0) {
                await this.table.delete(`file_path = '${filePath.replace(/'/g, "\\'")}'`);
            }

            // Chunk the content
            const chunks = this.chunkText(content);
            const records = [];

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const embedding = await this.generateEmbedding(chunk);
                
                records.push({
                    id: `${filePath}_${i}`,
                    file_path: filePath,
                    content: chunk,
                    content_hash: contentHash,
                    chunk_index: i,
                    file_size: fileStats.size || 0,
                    last_modified: new Date(fileStats.mtime || Date.now()).toISOString(),
                    embedding: embedding
                });
            }

            await this.table.add(records);
            console.log(`MainSemanticSearchEngine: Added ${chunks.length} chunks for file:`, filePath);
            return true;

        } catch (error) {
            console.error('MainSemanticSearchEngine: Error adding file embedding:', error);
            return false;
        }
    }

    async searchSemantic(query, limit = 10) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!this.isInitialized) {
            console.error('MainSemanticSearchEngine: Cannot search - not initialized');
            return [];
        }

        try {
            const queryEmbedding = await this.generateEmbedding(query);
            
            const results = await this.table
                .search(queryEmbedding)
                .limit(limit * 2) // Get more results to deduplicate
                .toArray();

            // Group by file path and get best chunk per file
            const fileResults = new Map();
            
            for (const result of results) {
                const filePath = result.file_path;
                if (!fileResults.has(filePath) || result._distance < fileResults.get(filePath)._distance) {
                    fileResults.set(filePath, {
                        ...result,
                        source: 'semantic',
                        relevanceScore: Math.max(0, (1 - result._distance) * 100),
                        matchReason: 'Semantic similarity to content'
                    });
                }
            }

            return Array.from(fileResults.values())
                .sort((a, b) => a._distance - b._distance)
                .slice(0, limit);

        } catch (error) {
            console.error('MainSemanticSearchEngine: Search error:', error);
            return [];
        }
    }

    async getStats() {
        if (!this.isInitialized) {
            return { totalFiles: 0, totalChunks: 0, isReady: false };
        }

        try {
            // Use a dummy 384-dimensional vector for metadata queries
            const dummyVector = new Array(384).fill(0.0);
            const allRecords = await this.table.search(dummyVector).limit(100000).toArray();
            const uniqueFiles = new Set(allRecords.map(r => r.file_path));
            
            return {
                totalFiles: uniqueFiles.size,
                totalChunks: allRecords.length,
                isReady: true
            };
        } catch (error) {
            console.error('MainSemanticSearchEngine: Error getting stats:', error);
            return { totalFiles: 0, totalChunks: 0, isReady: false };
        }
    }
}

module.exports = MainSemanticSearchEngine;
