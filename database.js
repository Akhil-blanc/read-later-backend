const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'articles.db');

class DatabaseService {
  constructor() {
    this.db = null;
  }

  async init() {
    try {
      this.db = new Database(DB_PATH);
      console.log('Connected to SQLite database:', DB_PATH);
      
      // Enable WAL mode for better concurrent access
      this.db.pragma('journal_mode = WAL');
      
      this.createTables();
      return Promise.resolve();
    } catch (err) {
      console.error('Error opening database:', err);
      throw err;
    }
  }

  createTables() {
    const createArticlesTable = `
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        excerpt TEXT,
        author TEXT,
        domain TEXT,
        word_count INTEGER,
        reading_time INTEGER,
        publish_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_read_at DATETIME,
        reading_progress REAL DEFAULT 0.0,
        is_read BOOLEAN DEFAULT FALSE,
        is_favorite BOOLEAN DEFAULT FALSE,
        is_archived BOOLEAN DEFAULT FALSE,
        obsidian_path TEXT,
        obsidian_synced_at DATETIME
      )
    `;

    const createTagsTable = `
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        color TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createArticleTagsTable = `
      CREATE TABLE IF NOT EXISTS article_tags (
        article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
        tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (article_id, tag_id)
      )
    `;

    const createHighlightsTable = `
      CREATE TABLE IF NOT EXISTS highlights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        context TEXT,
        position_start INTEGER,
        position_end INTEGER,
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createArticlesFTS = `
      CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
        title, content, author, excerpt,
        content='articles', content_rowid='id'
      )
    `;

    try {
      this.db.exec(createArticlesTable);
      this.db.exec(createTagsTable);
      this.db.exec(createArticleTagsTable);
      this.db.exec(createHighlightsTable);
      this.db.exec(createArticlesFTS);
      console.log('Database tables ready');
    } catch (err) {
      console.error('Error creating database tables:', err);
      throw err;
    }
  }

  getAllArticles() {
    try {
      const stmt = this.db.prepare('SELECT * FROM articles ORDER BY created_at DESC');
      return stmt.all();
    } catch (err) {
      console.error('Error getting all articles:', err);
      throw err;
    }
  }

  getArticleById(id) {
    try {
      const stmt = this.db.prepare('SELECT * FROM articles WHERE id = ?');
      return stmt.get(id);
    } catch (err) {
      console.error('Error getting article by id:', err);
      throw err;
    }
  }

  getArticleByUrl(url) {
    try {
      const stmt = this.db.prepare('SELECT * FROM articles WHERE url = ?');
      return stmt.get(url);
    } catch (err) {
      console.error('Error getting article by URL:', err);
      throw err;
    }
  }

  createArticle(article) {
    const {
      url, title, content, excerpt, author, domain,
      word_count, reading_time, publish_date, is_read = false, is_favorite = false
    } = article;

    const transaction = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT INTO articles (
          url, title, content, excerpt, author, domain,
          word_count, reading_time, publish_date, is_read, is_favorite, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      const info = stmt.run(
        url, title, content, excerpt, author, domain,
        word_count || null, reading_time || null, publish_date || null,
        is_read ? 1 : 0, is_favorite ? 1 : 0
      );

      const articleId = info.lastInsertRowid;

      // Handle tags
      if (article.tags && Array.isArray(article.tags)) {
        this.addTagsToArticle(articleId, article.tags);
      }

      // Update FTS table
      const ftsStmt = this.db.prepare(`
        INSERT INTO articles_fts (rowid, title, content, author, excerpt)
        VALUES (?, ?, ?, ?, ?)
      `);
      ftsStmt.run(articleId, title, content, author, excerpt);

      return { id: articleId, ...article };
    });

    try {
      return transaction();
    } catch (err) {
      console.error('Error creating article:', err);
      throw err;
    }
  }

  updateArticle(id, updates) {
    const fields = [];
    const values = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id') {
        fields.push(`${key} = ?`);
        if (key === 'tags') {
          values.push(JSON.stringify(value));
        } else if (typeof value === 'boolean') {
          values.push(value ? 1 : 0);
        } else {
          values.push(value);
        }
      }
    });

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    try {
      const query = `UPDATE articles SET ${fields.join(', ')} WHERE id = ?`;
      const stmt = this.db.prepare(query);
      const info = stmt.run(...values);
      return { changes: info.changes };
    } catch (err) {
      console.error('Error updating article:', err);
      throw err;
    }
  }

  deleteArticle(id) {
    try {
      const stmt = this.db.prepare('DELETE FROM articles WHERE id = ?');
      const info = stmt.run(id);
      return { changes: info.changes };
    } catch (err) {
      console.error('Error deleting article:', err);
      throw err;
    }
  }

  getUnsyncedArticles() {
    try {
      const stmt = this.db.prepare('SELECT * FROM articles WHERE obsidian_synced = FALSE ORDER BY created_at ASC');
      return stmt.all();
    } catch (err) {
      console.error('Error getting unsynced articles:', err);
      throw err;
    }
  }

  markAsSynced(id) {
    return this.updateArticle(id, { obsidian_synced: true });
  }

  close() {
    if (this.db) {
      try {
        this.db.close();
        console.log('Database connection closed');
      } catch (err) {
        console.error('Error closing database:', err);
      }
    }
  }

  // Tag management methods
  addTagsToArticle(articleId, tagNames) {
    const transaction = this.db.transaction(() => {
      for (const tagName of tagNames) {
        let tagId;
        
        // Get or create tag
        const existingTag = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName);
        if (existingTag) {
          tagId = existingTag.id;
        } else {
          const tagInfo = this.db.prepare('INSERT INTO tags (name) VALUES (?)').run(tagName);
          tagId = tagInfo.lastInsertRowid;
        }
        
        // Link article to tag
        try {
          this.db.prepare('INSERT INTO article_tags (article_id, tag_id) VALUES (?, ?)').run(articleId, tagId);
        } catch (err) {
          // Ignore duplicate key errors
          if (!err.message.includes('UNIQUE constraint failed')) {
            throw err;
          }
        }
      }
    });
    
    return transaction();
  }

  removeTagsFromArticle(articleId, tagNames = null) {
    if (tagNames === null) {
      // Remove all tags
      const stmt = this.db.prepare('DELETE FROM article_tags WHERE article_id = ?');
      return stmt.run(articleId);
    } else {
      // Remove specific tags
      const transaction = this.db.transaction(() => {
        for (const tagName of tagNames) {
          const stmt = this.db.prepare(`
            DELETE FROM article_tags 
            WHERE article_id = ? AND tag_id IN (
              SELECT id FROM tags WHERE name = ?
            )
          `);
          stmt.run(articleId, tagName);
        }
      });
      return transaction();
    }
  }

  getArticleTags(articleId) {
    const stmt = this.db.prepare(`
      SELECT t.* FROM tags t
      JOIN article_tags at ON t.id = at.tag_id
      WHERE at.article_id = ?
    `);
    return stmt.all(articleId);
  }

  getAllTags() {
    const stmt = this.db.prepare('SELECT * FROM tags ORDER BY name');
    return stmt.all();
  }

  // Full-text search method
  searchArticles(query) {
    try {
      const stmt = this.db.prepare(`
        SELECT a.*, GROUP_CONCAT(t.name) as tag_names
        FROM articles_fts fts
        JOIN articles a ON a.id = fts.rowid
        LEFT JOIN article_tags at ON a.id = at.article_id
        LEFT JOIN tags t ON at.tag_id = t.id
        WHERE articles_fts MATCH ?
        GROUP BY a.id
        ORDER BY rank
      `);
      return stmt.all(query);
    } catch (err) {
      console.error('Error searching articles:', err);
      throw err;
    }
  }

  // Highlight management methods
  addHighlight(articleId, highlight) {
    const { text, context, position_start, position_end, note } = highlight;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO highlights (article_id, text, context, position_start, position_end, note)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(articleId, text, context, position_start, position_end, note);
      return { id: info.lastInsertRowid, ...highlight };
    } catch (err) {
      console.error('Error adding highlight:', err);
      throw err;
    }
  }

  getArticleHighlights(articleId) {
    const stmt = this.db.prepare('SELECT * FROM highlights WHERE article_id = ? ORDER BY position_start');
    return stmt.all(articleId);
  }

  deleteHighlight(highlightId) {
    const stmt = this.db.prepare('DELETE FROM highlights WHERE id = ?');
    return stmt.run(highlightId);
  }

  // Progress tracking
  updateReadingProgress(articleId, progress) {
    const stmt = this.db.prepare('UPDATE articles SET reading_progress = ?, last_read_at = CURRENT_TIMESTAMP WHERE id = ?');
    return stmt.run(progress, articleId);
  }

  // Health check method
  isHealthy() {
    try {
      const stmt = this.db.prepare('SELECT 1');
      stmt.get();
      return true;
    } catch (err) {
      console.error('Database health check failed:', err);
      return false;
    }
  }
}

module.exports = DatabaseService;