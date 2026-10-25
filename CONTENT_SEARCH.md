# Content Search

DataFox searches file names **and** the contents of data files on FTP, FTPS,
SFTP and S3 connections. Type in the search bar; results show whether a file
matched by name, by content, or both, along with the matching fields and values.

## What gets indexed

| Type | Extensions | What is searchable | Max size |
|------|------------|--------------------|----------|
| JSON | `.json` | Field names (nested as `address.city`), values, full text | 20 MB |
| Parquet | `.parquet` | Column names and values of **every** row | 50 MB |
| Text | `.csv` `.txt` `.xml` `.yaml` `.yml` `.log` `.md` | Full text | 5 MB |

Files above the limit are still found by name. Each file stores up to 500 field
names, 2,000 distinct values and 500 KB of text in the index.

## Query syntax

- `john engineering`: every word must appear (in the name, path, or content)
- `"San Francisco"`: an exact phrase
- `*.parquet`, `report-202?.csv`: wildcards, matched against file names
- `address.city`: a nested JSON field name

"Search in current folder" limits results to the current folder and its subfolders.

## How it works

1. **Discovery.** After you connect, the app crawls the remote tree in the
   background and records every file and folder. The crawl runs at most every
   6 hours per connection. In between, folders you browse update the index, so
   changed or deleted files are picked up as you navigate.
2. **Extraction.** Each indexable file is downloaded and parsed **in the main
   process** (`src/managers/fileContent.js`), and only the compact index entry
   is sent to the UI. Files whose size and modification time haven't changed
   are skipped. Files that failed to index are retried after an hour.
3. **Concurrency.** FTP/FTPS runs one transfer at a time (the protocol allows
   one command per connection), so browsing stays responsive while indexing.
   SFTP uses 4 parallel downloads and S3 uses 8.
4. **Storage.** The index is saved to `search-index-<connection>.json` in the
   app's user-data folder. It is written incrementally while indexing, so an
   interrupted run resumes where it stopped. Indexes older than 7 days are rebuilt.

## Code map

- `utils/searchEngine.js`: `SearchEngine`, the per-connection API used by the UI
- `utils/search/queryMatcher.js`: query parsing, matching, filters, scoring
- `utils/search/contentIndexer.js`: crawl and extraction worker pool
- `utils/search/indexStore.js`: persistence
- `src/managers/fileContent.js`: preview rendering and content extraction

## Sample data

`test-data/` contains `sample-users.json` and `products-catalog.json`. Upload
them to a server and try searches like `Engineering`, `address.city` or
`"San Francisco"`.

## Optional semantic search

`new SearchEngine(id, { semantic: true })` also embeds indexed text with
`Xenova/all-MiniLM-L6-v2` (LanceDB, main process) and merges similarity hits
into results. It is off by default because the model is downloaded on first use.
