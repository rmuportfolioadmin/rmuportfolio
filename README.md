## JSON → Excel Aggregation Tool

`json2excel.py` consolidates all portfolio JSON files in `data/` into a single Excel workbook with multiple analysis sheets.

### Install Dependencies
```
pip install pandas openpyxl pillow requests tqdm python-dateutil
```

### Basic Usage
```
python json2excel.py --input-dir ./data --output-xlsx combined_report.xlsx
```

### Options
| Option | Description | Default |
|--------|-------------|---------|
| `--thumb-size` | Thumbnail max dimension (px) | 128 |
| `--workers` | Parallel image download workers | 8 |
| `--no-images` | Skip image downloading & embedding | off |
| `--include-raw` | Add RawJSONs sheet | off |
| `--recursive` | Recurse into subdirectories | off |
| `--max-text-length` | Truncation limit for large text | 32767 |
| `--cache-dir` | Image cache directory | .cache_images |

### Example (faster + raw JSONs)
```
python json2excel.py --workers 16 --include-raw --thumb-size 100
```

### Output Sheets
1. Summary – metrics & category counts
2. AllPortfolios – one row per portfolio (optional embedded thumbnail)
3. Reflections – exploded reflections
4. DescriptiveDetails – achievements / descriptive entries
5. RawJSONs – only if `--include-raw`

### Acceptance Checks
After running, the script prints quick checks (row counts, workbook existence) and writes a `combined_report.log` alongside the XLSX.

### Security Note
Do not process confidential or encrypted material without prior local decryption in a secure environment.

# Portfolio Gallery System - Complete Guide

## Overview
This is a multi-portfolio gallery system that allows browsing and viewing individual medical student portfolios. The system consists of several interconnected components working together.

## System Architecture

### 1. Data Storage Structure
```
Code/
├── data/                          # All portfolio JSON files go here
│   ├── student1.json             # Individual portfolio data
│   ├── abdul-haseebs-medfolio.json
│   ├── ahmads-medfolio.json
│   └── ... (any *.json files)
├── files.json                     # Generated index of all portfolios
├── index.html                     # Gallery landing page
├── portfolio.html                 # Individual portfolio viewer
├── gallery.js                     # Gallery functionality
├── portfolio.js                   # Portfolio functionality
├── make_files_index.py           # Index generator script
└── run_portfolio_index.ps1       # PowerShell automation script
```

### 2. Data Flow Process

**Step 1: Data Preparation**
1. JSON portfolio files are placed in `data/` folder
2. Each JSON contains portfolio data (achievements, reflections, personal info)
3. Run indexer script to scan all JSON files

**Step 2: Index Generation**
1. `make_files_index.py` scans `data/` folder
2. Extracts metadata from each JSON file (name, filename)
3. Creates `files.json` with list of all available portfolios

**Step 3: Gallery Display**
1. `index.html` loads and displays the gallery
2. `gallery.js` fetches `files.json` for portfolio list
3. Each portfolio appears as a clickable row

**Step 4: Portfolio Loading**
1. User clicks a portfolio row
2. Redirects to `portfolio.html?file=data/filename.json`
3. `portfolio.html` loads the specific JSON file
4. Displays full portfolio content

## Component Details

### make_files_index.py Script

**Purpose**: Generate an index of all portfolio JSON files in the data folder.

**What it does**:
- Scans `data/` folder for ALL `*.json` files (any filename pattern)
- Reads each JSON file and validates it's a portfolio
- Extracts the name from multiple possible fields: `name`, `title`, `studentName`, `student_name`
- If no name found, derives one from filename (e.g., "john-doe-portfolio.json" → "John Doe Portfolio")
- Creates `files.json` with simplified metadata: `[{"file": "data/xxx.json", "name": "Display Name"}, ...]`

**What it extracts from each JSON**:
- **File path**: Always `data/filename.json`
- **Display name**: From `name` field, or derived from filename if missing
- **Validation**: Checks if JSON has portfolio-like structure (achievements, reflections, personalInfo, or any content)

**Performance for large datasets**:
- Handles 1000+ files efficiently
- Pretty-prints JSON for large datasets (easier debugging)
- Provides progress feedback during processing
- Skips malformed JSON files with error messages

### files.json Structure
```json
[
  {"file": "data/student1.json", "name": "Student Name 1"},
  {"file": "data/john-doe-portfolio.json", "name": "John Doe"},
  {"file": "data/any-filename.json", "name": "Derived Name"}
]
```

### Gallery System (index.html + gallery.js)

**Is files.json required before opening index.html?**
- **Recommended**: Yes, for best experience
- **Not strictly required**: Gallery has fallback scanning if `files.json` missing
- **Without files.json**: Page will try to guess filenames (student1.json, student2.json, etc.)

**How the search box works**:
- Searches both display names AND filenames
- Real-time filtering with debouncing (waits 150-300ms after typing stops)
- Case-insensitive matching
- Performance optimized for 1000+ portfolios

**Rendering performance for large datasets**:
- **Small datasets (≤200)**: Renders immediately
- **Large datasets (>200)**: Batch rendering (50 items at a time) to prevent browser freezing
- **Progress feedback**: Shows "Rendering X portfolios..." for large sets
- **Memory efficient**: Uses document fragments for DOM insertion

### Portfolio Loading (portfolio.html + portfolio.js)

**When you click a portfolio from the gallery**:
1. **Direct file loading**: Loads the ENTIRE specific JSON file from `data/` folder
2. **Not from files.json**: The gallery index is only for listing; actual portfolio data comes directly from the individual JSON file
3. **Query parameter**: Uses `?file=data/filename.json` to specify which file to load
4. **Override prevention**: Skips loading default `portfolio-data.json` when specific file requested

**What gets loaded from the JSON**:
- Complete portfolio data (achievements, reflections, personal information)
- All attachments, images, documents
- Custom styling and personal info
- Full portfolio functionality (editing, exporting, Drive sync if authenticated)

## Performance Considerations

### For 1000+ JSON Files

**Index Generation**:
- Processing time: ~1-3 seconds per 1000 files (depends on file sizes)
- Memory usage: Minimal (processes one file at a time)
- Error handling: Continues if individual files fail

**Gallery Loading**:
- Initial load: ~100-500ms for 1000 portfolios
- Search performance: Optimized with debouncing and pre-computed search strings
- Rendering: Batch processing prevents browser freezing
- Memory: Efficient DOM management

**Individual Portfolio Loading**:
- Same speed regardless of total portfolio count
- Only loads the specific requested JSON file
- No performance impact from having many portfolios

## Usage Workflow

### Adding New Portfolios
1. **Place JSON file** in `data/` folder (any filename ending in `.json`)
2. **Run indexer**: `./run_portfolio_index.ps1` or `python make_files_index.py`
3. **Refresh gallery**: Browser refresh or reopen `index.html`
4. **Verify**: New portfolio appears in the list

### Updating Existing Portfolios
1. **Edit JSON file** in `data/` folder directly
2. **No re-indexing needed** (unless name changed)
3. **Portfolio loads updated data** immediately

### Removing Portfolios
1. **Delete JSON file** from `data/` folder
2. **Re-run indexer** to update `files.json`
3. **Gallery automatically reflects changes**

## Error Handling

**Missing files.json**:
- Gallery shows fallback scanning message
- Attempts to discover files automatically
- User can disable auto-scan via toggle

**Malformed JSON files**:
- Indexer skips with error message
- Continues processing other files
- Logs specific error details

**Network issues**:
- Graceful fallback to local data
- Clear error messages to user
- No system crashes

## Best Practices

1. **File naming**: Use descriptive filenames (e.g., `student-name-portfolio.json`)
2. **JSON structure**: Include `"name"` field for display names
3. **Regular indexing**: Run indexer after adding/removing files
4. **Local server**: Use `-Serve` flag for testing (avoids browser security restrictions)
5. **Large datasets**: Monitor performance, consider pagination for 5000+ files

## Troubleshooting

**Gallery shows no portfolios**:
- Check if `files.json` exists and is valid
- Run indexer script
- Verify JSON files in `data/` folder

**Portfolio loads wrong data**:
- Clear browser cache (Ctrl+F5)
- Verify `?file=` parameter in URL
- Check JSON file syntax

**Slow performance**:
- Check dataset size (use batch rendering for 500+ portfolios)
- Consider splitting into multiple galleries
- Use local server instead of file:// protocol