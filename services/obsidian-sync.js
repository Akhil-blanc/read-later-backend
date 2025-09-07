const fs = require('fs').promises;
const path = require('path');

class ObsidianSync {
  constructor(database, config = {}) {
    this.db = database;
    this.config = {
      enabled: true,
      vaultPath: config.vaultPath || '',
      folderPath: config.folderPath || 'Reading List',
      subfolderStructure: config.subfolderStructure || 'date', // date, domain, none
      template: config.template || 'default',
      autoArchive: config.autoArchive || true,
      syncDirection: config.syncDirection || 'both', // import, export, both
      conflictResolution: config.conflictResolution || 'obsidian_wins', // obsidian_wins, app_wins, merge, ask
      backupBeforeSync: config.backupBeforeSync || true,
      ...config
    };
    this.conflicts = [];
  }

  async performFullSync() {
    if (!this.config.enabled || !this.config.vaultPath) {
      throw new Error('Obsidian sync not configured');
    }

    try {
      this.conflicts = [];
      const results = {
        export: { synced: 0, failed: 0, conflicts: 0 },
        import: { synced: 0, failed: 0, conflicts: 0 },
        details: [],
        conflicts: []
      };

      // Create backup if enabled
      if (this.config.backupBeforeSync) {
        await this.createBackup();
      }

      // Export to Obsidian (app -> obsidian)
      if (this.config.syncDirection === 'export' || this.config.syncDirection === 'both') {
        const exportResults = await this.syncToObsidian();
        results.export = exportResults;
        results.details.push(...exportResults.details);
      }

      // Import from Obsidian (obsidian -> app)
      if (this.config.syncDirection === 'import' || this.config.syncDirection === 'both') {
        const importResults = await this.syncFromObsidian();
        results.import = importResults;
        results.details.push(...importResults.details);
      }

      // Handle conflicts
      if (this.conflicts.length > 0) {
        const conflictResults = await this.resolveConflicts();
        results.conflicts = conflictResults;
      }

      return {
        success: true,
        results,
        total_conflicts: this.conflicts.length
      };

    } catch (error) {
      throw new Error(`Full sync failed: ${error.message}`);
    }
  }

  async syncToObsidian() {
    try {
      const unsyncedArticles = this.db.getUnsyncedArticles();
      const results = [];

      for (const article of unsyncedArticles) {
        try {
          const filePath = await this.createMarkdownFile(article);
          this.db.updateArticle(article.id, { 
            obsidian_path: filePath,
            obsidian_synced_at: new Date().toISOString()
          });
          
          results.push({
            success: true,
            article: article.title,
            path: filePath,
            action: 'exported'
          });
        } catch (error) {
          results.push({
            success: false,
            article: article.title,
            error: error.message,
            action: 'export_failed'
          });
        }
      }

      return {
        synced: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        details: results
      };

    } catch (error) {
      throw new Error(`Export sync failed: ${error.message}`);
    }
  }

  async syncFromObsidian() {
    try {
      const obsidianFiles = await this.scanObsidianFiles();
      const results = [];

      for (const file of obsidianFiles) {
        try {
          const result = await this.processObsidianFile(file);
          results.push(result);
        } catch (error) {
          results.push({
            success: false,
            file: file.path,
            error: error.message,
            action: 'import_failed'
          });
        }
      }

      return {
        synced: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        details: results
      };

    } catch (error) {
      throw new Error(`Import sync failed: ${error.message}`);
    }
  }

  async createMarkdownFile(article) {
    const fileName = this.sanitizeFileName(article.title) + '.md';
    const folderPath = this.getFolderPath(article);
    const fullFolderPath = path.join(this.config.vaultPath, folderPath);
    
    await fs.mkdir(fullFolderPath, { recursive: true });

    const content = this.generateMarkdownContent(article);
    const filePath = path.join(fullFolderPath, fileName);

    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  getFolderPath(article) {
    let folderPath = this.config.folderPath;

    switch (this.config.subfolderStructure) {
      case 'date':
        const date = new Date(article.created_at);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        folderPath = path.join(folderPath, `${year}`, `${month}`);
        break;

      case 'domain':
        folderPath = path.join(folderPath, article.domain);
        break;

      case 'none':
      default:
        break;
    }

    return folderPath;
  }

  generateMarkdownContent(article) {
    const template = this.getTemplate();
    const tags = JSON.parse(article.tags || '[]');
    
    const data = {
      title: article.title || 'Untitled',
      url: article.url,
      domain: article.domain || '',
      author: article.author || '',
      created_at: new Date(article.created_at).toLocaleDateString(),
      reading_time: article.reading_time || 0,
      tags: tags.map(tag => `#${tag}`).join(' '),
      content: this.htmlToMarkdown(article.content || ''),
      excerpt: article.excerpt || '',
      is_read: article.is_read ? '✅' : '⬜',
      is_favorite: article.is_favorite ? '⭐' : ''
    };

    return this.fillTemplate(template, data);
  }

  getTemplate() {
    switch (this.config.template) {
      case 'minimal':
        return `# {{title}}

**Source**: [{{domain}}]({{url}})
**Added**: {{created_at}}
{{tags}}

{{content}}

---
## Notes

`;

      case 'detailed':
        return `# {{title}}

## Metadata
- **URL**: {{url}}
- **Domain**: {{domain}}
- **Author**: {{author}}
- **Added**: {{created_at}}
- **Reading Time**: {{reading_time}} min
- **Status**: {{is_read}} Read {{is_favorite}} Favorite
- **Tags**: {{tags}}

## Summary
{{excerpt}}

## Content

{{content}}

---

## My Notes


## Related Articles


## Action Items

`;

      case 'default':
      default:
        return `# {{title}}

**URL**: {{url}}
**Domain**: {{domain}}
**Author**: {{author}}
**Added**: {{created_at}}
**Reading Time**: {{reading_time}} min
**Tags**: {{tags}}

---

{{content}}

---

## My Notes


## Related Articles

`;
    }
  }

  fillTemplate(template, data) {
    let content = template;
    Object.entries(data).forEach(([key, value]) => {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      content = content.replace(placeholder, value || '');
    });
    return content;
  }

  htmlToMarkdown(html) {
    if (!html) return '';

    return html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
      .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n')
      .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '_$1_')
      .replace(/<i[^>]*>(.*?)<\/i>/gi, '_$1_')
      .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
      .replace(/<pre[^>]*>(.*?)<\/pre>/gi, '```\n$1\n```\n\n')
      .replace(/<a[^>]*href=['"]([^'"]*)['"][^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      .replace(/<img[^>]*src=['"]([^'"]*)['"][^>]*alt=['"]([^'"]*?)['"][^>]*>/gi, '![$2]($1)')
      .replace(/<img[^>]*src=['"]([^'"]*?)['"][^>]*>/gi, '![]($1)')
      .replace(/<ul[^>]*>/gi, '')
      .replace(/<\/ul>/gi, '\n')
      .replace(/<ol[^>]*>/gi, '')
      .replace(/<\/ol>/gi, '\n')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
  }

  sanitizeFileName(name) {
    if (!name) return 'untitled';
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);
  }

  async scanObsidianFiles() {
    try {
      const folderPath = path.join(this.config.vaultPath, this.config.folderPath);
      const files = [];

      async function scanDirectory(dirPath) {
        try {
          const items = await fs.readdir(dirPath);
          
          for (const item of items) {
            const itemPath = path.join(dirPath, item);
            const stats = await fs.stat(itemPath);
            
            if (stats.isDirectory()) {
              await scanDirectory(itemPath);
            } else if (item.endsWith('.md')) {
              const content = await fs.readFile(itemPath, 'utf8');
              const metadata = this.extractMetadataFromMarkdown(content);
              
              files.push({
                path: itemPath,
                relativePath: path.relative(folderPath, itemPath),
                content,
                metadata,
                stats
              });
            }
          }
        } catch (error) {
          // Directory might not exist, skip silently
        }
      }

      await scanDirectory(folderPath);
      return files;
    } catch (error) {
      throw new Error(`Failed to scan Obsidian files: ${error.message}`);
    }
  }

  async processObsidianFile(file) {
    try {
      const metadata = file.metadata;
      
      // Check if this is a read-later article
      if (!metadata.url || !metadata.read_later_id) {
        return {
          success: false,
          file: file.relativePath,
          reason: 'Not a read-later article',
          action: 'skipped'
        };
      }

      const articleId = metadata.read_later_id;
      const existingArticle = this.db.getArticleById(articleId);

      if (!existingArticle) {
        // Article doesn't exist in database, might have been deleted
        return {
          success: false,
          file: file.relativePath,
          reason: 'Article not found in database',
          action: 'orphaned'
        };
      }

      // Check for conflicts
      const obsidianModified = new Date(file.stats.mtime);
      const dbModified = new Date(existingArticle.updated_at);

      if (obsidianModified > dbModified) {
        // Obsidian file is newer, potential conflict
        const conflict = this.detectChanges(existingArticle, metadata, file.content);
        
        if (conflict.hasChanges) {
          this.conflicts.push({
            type: 'content_conflict',
            articleId,
            obsidianFile: file.path,
            obsidianModified,
            dbModified,
            changes: conflict.changes
          });
          
          return {
            success: false,
            file: file.relativePath,
            reason: 'Content conflict detected',
            action: 'conflict'
          };
        }
      }

      // Update article from Obsidian
      const updates = this.extractUpdatesFromObsidian(metadata, file.content);
      if (Object.keys(updates).length > 0) {
        this.db.updateArticle(articleId, updates);
        
        return {
          success: true,
          file: file.relativePath,
          action: 'imported',
          updates: Object.keys(updates)
        };
      }

      return {
        success: true,
        file: file.relativePath,
        action: 'no_changes'
      };

    } catch (error) {
      throw new Error(`Failed to process Obsidian file: ${error.message}`);
    }
  }

  extractMetadataFromMarkdown(content) {
    const metadata = {};
    
    // Extract YAML frontmatter
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (yamlMatch) {
      const yamlContent = yamlMatch[1];
      const lines = yamlContent.split('\n');
      
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim().replace(/^["']|["']$/g, '');
          
          // Parse boolean and numeric values
          if (value === 'true') metadata[key] = true;
          else if (value === 'false') metadata[key] = false;
          else if (!isNaN(value) && value !== '') metadata[key] = Number(value);
          else metadata[key] = value;
        }
      }
    }

    return metadata;
  }

  extractUpdatesFromObsidian(metadata, content) {
    const updates = {};
    
    // Map Obsidian metadata back to database fields
    if (metadata.read !== undefined) updates.is_read = metadata.read;
    if (metadata.favorite !== undefined) updates.is_favorite = metadata.favorite;
    if (metadata.archived !== undefined) updates.is_archived = metadata.archived;
    if (metadata.progress !== undefined) updates.reading_progress = metadata.progress;
    
    // Extract notes from markdown content
    const notesMatch = content.match(/## My Notes\n\n([\s\S]*?)(?=\n## |$)/);
    if (notesMatch && notesMatch[1].trim()) {
      updates.notes = notesMatch[1].trim();
    }

    return updates;
  }

  detectChanges(dbArticle, obsidianMetadata, obsidianContent) {
    const changes = [];
    let hasChanges = false;

    // Check metadata changes
    if (obsidianMetadata.read !== dbArticle.is_read) {
      changes.push({
        field: 'is_read',
        db_value: dbArticle.is_read,
        obsidian_value: obsidianMetadata.read
      });
      hasChanges = true;
    }

    if (obsidianMetadata.favorite !== dbArticle.is_favorite) {
      changes.push({
        field: 'is_favorite',
        db_value: dbArticle.is_favorite,
        obsidian_value: obsidianMetadata.favorite
      });
      hasChanges = true;
    }

    // Check content changes (notes section)
    const notesMatch = obsidianContent.match(/## My Notes\n\n([\s\S]*?)(?=\n## |$)/);
    const obsidianNotes = notesMatch ? notesMatch[1].trim() : '';
    const dbNotes = dbArticle.notes || '';

    if (obsidianNotes !== dbNotes) {
      changes.push({
        field: 'notes',
        db_value: dbNotes,
        obsidian_value: obsidianNotes
      });
      hasChanges = true;
    }

    return { hasChanges, changes };
  }

  async resolveConflicts() {
    const resolvedConflicts = [];

    for (const conflict of this.conflicts) {
      try {
        const resolution = await this.resolveConflict(conflict);
        resolvedConflicts.push(resolution);
      } catch (error) {
        resolvedConflicts.push({
          success: false,
          conflict: conflict.type,
          error: error.message
        });
      }
    }

    return resolvedConflicts;
  }

  async resolveConflict(conflict) {
    switch (this.config.conflictResolution) {
      case 'obsidian_wins':
        return await this.resolveConflictObsidianWins(conflict);
      case 'app_wins':
        return await this.resolveConflictAppWins(conflict);
      case 'merge':
        return await this.resolveConflictMerge(conflict);
      default:
        // 'ask' or unknown - mark as unresolved
        return {
          success: false,
          conflict: conflict.type,
          reason: 'Manual resolution required'
        };
    }
  }

  async resolveConflictObsidianWins(conflict) {
    try {
      const obsidianFile = await fs.readFile(conflict.obsidianFile, 'utf8');
      const metadata = this.extractMetadataFromMarkdown(obsidianFile);
      const updates = this.extractUpdatesFromObsidian(metadata, obsidianFile);
      
      this.db.updateArticle(conflict.articleId, updates);
      
      return {
        success: true,
        conflict: conflict.type,
        resolution: 'obsidian_wins',
        updates: Object.keys(updates)
      };
    } catch (error) {
      throw new Error(`Failed to resolve conflict (Obsidian wins): ${error.message}`);
    }
  }

  async resolveConflictAppWins(conflict) {
    try {
      const article = this.db.getArticleById(conflict.articleId);
      await this.createMarkdownFile(article, conflict.obsidianFile);
      
      return {
        success: true,
        conflict: conflict.type,
        resolution: 'app_wins',
        action: 'overwrote_obsidian_file'
      };
    } catch (error) {
      throw new Error(`Failed to resolve conflict (App wins): ${error.message}`);
    }
  }

  async resolveConflictMerge(conflict) {
    try {
      // Implement intelligent merging
      const article = this.db.getArticleById(conflict.articleId);
      const obsidianFile = await fs.readFile(conflict.obsidianFile, 'utf8');
      const metadata = this.extractMetadataFromMarkdown(obsidianFile);
      
      // Merge strategy: take the most recent timestamp for boolean fields
      const updates = {};
      
      // For notes, append both if different
      const notesMatch = obsidianFile.match(/## My Notes\n\n([\s\S]*?)(?=\n## |$)/);
      const obsidianNotes = notesMatch ? notesMatch[1].trim() : '';
      const dbNotes = article.notes || '';
      
      if (obsidianNotes && dbNotes && obsidianNotes !== dbNotes) {
        updates.notes = `${dbNotes}\n\n--- Merged from Obsidian ---\n${obsidianNotes}`;
      } else if (obsidianNotes) {
        updates.notes = obsidianNotes;
      }
      
      // For boolean fields, use the most permissive value
      if (metadata.read || article.is_read) updates.is_read = true;
      if (metadata.favorite || article.is_favorite) updates.is_favorite = true;
      
      this.db.updateArticle(conflict.articleId, updates);
      
      return {
        success: true,
        conflict: conflict.type,
        resolution: 'merged',
        updates: Object.keys(updates)
      };
    } catch (error) {
      throw new Error(`Failed to resolve conflict (Merge): ${error.message}`);
    }
  }

  async createBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.config.vaultPath, `read-later-backup-${timestamp}.json`);
      
      const articles = this.db.getAllArticles();
      const backupData = {
        created_at: new Date().toISOString(),
        total_articles: articles.length,
        articles: articles
      };
      
      await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));
      
      return backupPath;
    } catch (error) {
      throw new Error(`Failed to create backup: ${error.message}`);
    }
  }

  getConflicts() {
    return this.conflicts;
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig() {
    return { ...this.config };
  }

  getSyncStatus() {
    const articles = this.db.getAllArticles();
    const syncedArticles = articles.filter(a => a.obsidian_synced_at);
    const unsyncedArticles = articles.filter(a => !a.obsidian_synced_at);
    
    return {
      total_articles: articles.length,
      synced_articles: syncedArticles.length,
      unsynced_articles: unsyncedArticles.length,
      last_sync: syncedArticles.length > 0 
        ? Math.max(...syncedArticles.map(a => new Date(a.obsidian_synced_at).getTime()))
        : null,
      sync_direction: this.config.syncDirection,
      conflict_resolution: this.config.conflictResolution
    };
  }
}

module.exports = ObsidianSync;