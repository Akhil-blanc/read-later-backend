# Read Later Backend API

A Node.js REST API server for the Read Later application with SQLite database and Obsidian sync capabilities.

## ✅ Features

- **SQLite Database** with better-sqlite3 for better Windows compatibility
- **Content Extraction** using Playwright (faster and more reliable than Puppeteer)
- **Winston Logging** with file and console output
- **CORS Support** for browser extensions
- **Health Check** endpoints
- **Graceful Shutdown** handling

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ 
- npm or yarn

### Installation

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

Or start the production server:
```bash
npm start
```

The server will start on `http://localhost:3000`

## 🧪 Testing

Test the server functionality:
```bash
npm test
```

This will run automated tests against the API endpoints.

## 📋 API Endpoints

### Health & Status
- `GET /` - API information and status
- `GET /api/health` - Health check with database status

### Articles
- `GET /api/articles` - Get all articles
- `GET /api/articles/:id` - Get specific article
- `POST /api/articles` - Create new article
- `PUT /api/articles/:id` - Update article
- `DELETE /api/articles/:id` - Delete article
- `POST /api/articles/extract` - Extract content from URL
- `GET /api/articles/search/:query` - Search articles

### Obsidian Sync
- `GET /api/sync/obsidian` - Trigger sync to Obsidian
- `POST /api/sync/obsidian` - Configure sync settings
- `GET /api/sync/config` - Get current sync configuration

## 🗄️ Database

The app uses SQLite with `better-sqlite3` for:
- Better Windows compatibility
- Synchronous operations (no async/await needed)
- Better performance
- Built-in backup capabilities

**Database location**: `backend/articles.db`

### Database Schema

```sql
CREATE TABLE articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    title TEXT,
    content TEXT,
    excerpt TEXT,
    author TEXT,
    domain TEXT,
    tags TEXT, -- JSON array as string
    reading_time INTEGER,
    is_read BOOLEAN DEFAULT FALSE,
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    obsidian_synced BOOLEAN DEFAULT FALSE
);
```

## 📝 Logging

Logs are written to:
- `backend/logs/combined.log` - All logs
- `backend/logs/error.log` - Error logs only
- Console output (development mode)

Log levels:
- `error` - Error messages
- `warn` - Warning messages
- `info` - General information
- `debug` - Debug information (dev mode only)

## 🔧 Configuration

### Environment Variables

```bash
PORT=3000              # Server port (default: 3000)
NODE_ENV=development   # Environment (development/production)
```

### Content Extraction

The server uses Playwright for content extraction:
- **Headless browsing** for JavaScript-heavy sites
- **Fallback to Cheerio** for simple HTML parsing
- **Smart content detection** with multiple selectors
- **Automatic tag generation** based on content

## 🛠️ Troubleshooting

### Server Won't Start

**Problem**: Server fails to start or crashes immediately

**Solutions**:
1. Check Node.js version: `node --version` (requires 16+)
2. Delete node_modules and reinstall: `rm -rf node_modules && npm install`
3. Check if port 3000 is already in use: `netstat -an | findstr :3000`
4. Check logs in `backend/logs/error.log`

### Database Issues

**Problem**: SQLite database errors

**Solutions**:
1. Delete the database file to reset: `del articles.db`
2. Check file permissions in the backend directory
3. Ensure the `logs` directory exists: `mkdir logs`

### Content Extraction Failures

**Problem**: Articles not extracting properly

**Solutions**:
1. Check if Playwright browser is installed: `npx playwright install chromium`
2. Some sites block automated access - this is normal
3. Try manually providing title and content when saving

### CORS Issues

**Problem**: Browser extension can't connect

**Solutions**:
1. Verify the extension is loading from the correct origin
2. Check browser console for specific CORS errors
3. Restart both server and browser after changes

### Performance Issues

**Problem**: Server running slowly

**Solutions**:
1. Check database size: large content can slow queries
2. Monitor memory usage - restart server if needed
3. Check logs for repeated errors
4. Consider cleaning old articles from database

## 🔍 Development

### Project Structure

```
backend/
├── server.js              # Main server file
├── database.js           # SQLite database service
├── logger.js             # Winston logging config
├── test-server.js        # Test script
├── routes/
│   └── articles.js       # Article routes
├── services/
│   ├── extractor.js      # Content extraction
│   └── obsidian-sync.js  # Obsidian integration
└── logs/                 # Log files
    ├── combined.log
    └── error.log
```

### Database Management

**Backup database**:
```bash
cp articles.db articles-backup.db
```

**View database contents** (with SQLite browser):
```bash
# Install sqlite3 command line tool
sqlite3 articles.db
.tables
SELECT * FROM articles;
```

**Reset database**:
```bash
rm articles.db
# Restart server to recreate
```

## 🚀 Production Deployment

For production use:

1. Set environment variables:
```bash
export NODE_ENV=production
export PORT=3000
```

2. Use a process manager:
```bash
npm install -g pm2
pm2 start server.js --name read-later-api
```

3. Set up log rotation:
```bash
pm2 install pm2-logrotate
```

4. Monitor the process:
```bash
pm2 status
pm2 logs read-later-api
```

## 📈 API Usage Examples

### Save an article
```bash
curl -X POST http://localhost:3000/api/articles \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article"}'
```

### Get all articles
```bash
curl http://localhost:3000/api/articles
```

### Health check
```bash
curl http://localhost:3000/api/health
```

### Extract content only
```bash
curl -X POST http://localhost:3000/api/articles/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article"}'
```

---

**Need help?** Check the logs in `backend/logs/` or run `npm test` to verify everything is working correctly.