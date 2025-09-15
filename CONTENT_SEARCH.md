# Content Search Feature

## Overview
The FTP Client now includes advanced content search capabilities that allow you to search inside JSON and Parquet files for specific field names, values, and schema information.

## Features

### 🔍 Content Search Panel
- **Field Name Search**: Find files containing specific field names (e.g., "email", "productId", "address.city")
- **Value Search**: Search for specific values within JSON files (e.g., "Engineering", "john.doe@example.com", "completed")
- **Schema Search**: Search within the data structure and schema information
- **Combined Results**: See both filename/metadata matches and content matches in one view

### 📊 Smart Indexing
- **Automatic Indexing**: Files are automatically indexed when viewing content search
- **Efficient Caching**: Content is cached to improve performance on subsequent searches
- **Background Processing**: Indexing happens in the background without blocking the UI
- **Size Limits**: Only files under 10MB are indexed for performance

### 🎯 Search Modes
- **All Content**: Search across field names, values, and schema (default)
- **Field Names**: Search only in field/property names
- **Field Values**: Search only in field values
- **Schema**: Search only in data structure information

### 📁 File Type Support
- **JSON Files**: Full content indexing with nested object support
- **Parquet Files**: Schema and metadata extraction (content processing requires server-side support)

## How to Use

### 1. Enable Content Search
1. Navigate to any folder containing JSON or Parquet files
2. Enter search mode by clicking the search icon or pressing Ctrl+F
3. Look for the "🔍 Content Search" toggle button
4. Click "Show Content Search" to enable the feature

### 2. Search Content
1. In the Content Search panel, enter your search query
2. Choose your search mode (All Content, Field Names, etc.)
3. Select file type filter if needed (All Types, JSON Files, Parquet Files)
4. View results with detailed match information

### 3. Analyze Results
- **Content Matches**: See exactly where your search terms were found
  - 🏷️ Field matches (field names)
  - 💾 Value matches (field values)  
  - 🏗️ Schema matches (data structure)
- **File Structure**: View file metadata like record count, nesting depth, common fields
- **Expandable Details**: Click on results to see detailed match information

## Technical Details

### Indexing Process
1. **File Detection**: Automatically detects indexable files (JSON/Parquet under 10MB)
2. **Content Extraction**: Parses file content and extracts searchable information
3. **Field Analysis**: Identifies field names, values, and schema structure
4. **Index Building**: Creates searchable index with caching for performance
5. **Background Updates**: Maintains index as files change

### Performance Optimizations
- **Debounced Search**: Search queries are debounced to prevent excessive API calls
- **Limited Results**: Results are limited to prevent UI slowdown
- **Smart Caching**: Frequently accessed content is cached in memory
- **Async Processing**: Heavy operations run asynchronously

### Search Capabilities
- **Fuzzy Matching**: Find approximate matches for typos
- **Nested Field Search**: Search within nested objects (e.g., "address.city")
- **Array Content**: Search within array elements
- **Type Detection**: Automatically detects data types (string, number, date, email, etc.)
- **Common Fields**: Identifies frequently used fields across records

## Example Searches

### Field Name Searches
- `email` - Find all files with email fields
- `address` - Find files with address information
- `department` - Find files containing department data
- `specifications` - Find product files with spec details

### Value Searches
- `"Engineering"` - Find files containing the term "Engineering"
- `"john.doe@example.com"` - Find specific email addresses
- `"completed"` - Find records with completed status
- `"San Francisco"` - Find location-specific data

### Schema Searches
- `array` - Find files with array structures
- `object` - Find files with nested objects
- `integer` - Find files with numeric data

## Sample Data
The `test-data/` folder contains sample JSON files to test the content search:
- `sample-users.json` - User management data with nested structures
- `products-catalog.json` - Product catalog with specifications and reviews

## Requirements
- JSON files must be valid JSON format
- Parquet files require additional server-side processing for full content extraction
- Files should be under 10MB for optimal performance
- Modern browser with JavaScript enabled

## Troubleshooting

### Content Not Searchable
- Ensure file is under 10MB size limit
- Verify file has .json or .parquet extension
- Check that file content is valid JSON format

### Search Not Working
- Wait for indexing to complete (progress shown in panel)
- Try different search terms or modes
- Check browser console for any errors

### Performance Issues
- Reduce number of large files being indexed
- Clear browser cache if experiencing memory issues
- Use more specific search queries to reduce result sets
