const fs = require('fs').promises;
const csv = require('csv-parse');
const ContentExtractor = require('./simple-extractor');

class ImportService {
    constructor(database) {
        this.db = database;
        this.extractor = new ContentExtractor();
    }

    async importFromPocket(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const articles = this.parsePocketHTML(data);
            return await this.processImportedArticles(articles, 'pocket');
        } catch (error) {
            throw new Error(`Pocket import failed: ${error.message}`);
        }
    }

    async importFromInstapaper(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const articles = this.parseInstapaperCSV(data);
            return await this.processImportedArticles(articles, 'instapaper');
        } catch (error) {
            throw new Error(`Instapaper import failed: ${error.message}`);
        }
    }

    async importFromReadwise(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const articles = JSON.parse(data);
            return await this.processImportedArticles(articles, 'readwise');
        } catch (error) {
            throw new Error(`Readwise import failed: ${error.message}`);
        }
    }

    async importFromCSV(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const articles = await this.parseGenericCSV(data);
            return await this.processImportedArticles(articles, 'csv');
        } catch (error) {
            throw new Error(`CSV import failed: ${error.message}`);
        }
    }

    async importFromJSON(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const articles = JSON.parse(data);
            return await this.processImportedArticles(articles, 'json');
        } catch (error) {
            throw new Error(`JSON import failed: ${error.message}`);
        }
    }

    parsePocketHTML(htmlContent) {
        const articles = [];
        const urlRegex = /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
        let match;

        while ((match = urlRegex.exec(htmlContent)) !== null) {
            const [, url, title] = match;
            
            // Extract additional metadata from HTML context
            const timeRegex = new RegExp(`time_added="([^"]+)".*?${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
            const tagRegex = new RegExp(`tags="([^"]+)".*?${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
            
            const timeMatch = htmlContent.match(timeRegex);
            const tagMatch = htmlContent.match(tagRegex);

            articles.push({
                url: url.trim(),
                title: title.trim(),
                source: 'pocket',
                created_at: timeMatch ? new Date(parseInt(timeMatch[1]) * 1000).toISOString() : new Date().toISOString(),
                tags: tagMatch ? tagMatch[1].split(',').map(t => t.trim()).filter(t => t) : [],
                is_favorite: htmlContent.includes(`favorite="1".*?${url}`)
            });
        }

        return articles;
    }

    parseInstapaperCSV(csvContent) {
        return new Promise((resolve, reject) => {
            const articles = [];
            
            csv.parse(csvContent, {
                columns: true,
                skip_empty_lines: true
            }, (err, records) => {
                if (err) {
                    reject(err);
                    return;
                }

                for (const record of records) {
                    articles.push({
                        url: record.URL || record.url,
                        title: record.Title || record.title,
                        excerpt: record.Summary || record.summary || '',
                        created_at: record.Timestamp ? new Date(record.Timestamp).toISOString() : new Date().toISOString(),
                        is_favorite: (record.Starred || record.starred) === '1' || (record.Starred || record.starred) === 'true',
                        source: 'instapaper',
                        tags: []
                    });
                }

                resolve(articles);
            });
        });
    }

    async parseGenericCSV(csvContent) {
        return new Promise((resolve, reject) => {
            const articles = [];
            
            csv.parse(csvContent, {
                columns: true,
                skip_empty_lines: true
            }, (err, records) => {
                if (err) {
                    reject(err);
                    return;
                }

                for (const record of records) {
                    // Map common column names
                    const url = record.url || record.URL || record.link || record.Link;
                    const title = record.title || record.Title || record.name || record.Name;
                    
                    if (!url) continue; // Skip records without URLs

                    articles.push({
                        url: url.trim(),
                        title: (title || '').trim() || 'Untitled',
                        excerpt: (record.excerpt || record.description || record.summary || '').trim(),
                        author: (record.author || record.Author || '').trim(),
                        created_at: record.date || record.created_at ? new Date(record.date || record.created_at).toISOString() : new Date().toISOString(),
                        is_favorite: (record.favorite || record.starred) === '1' || (record.favorite || record.starred) === 'true',
                        is_read: (record.read || record.is_read) === '1' || (record.read || record.is_read) === 'true',
                        tags: record.tags ? record.tags.split(',').map(t => t.trim()).filter(t => t) : [],
                        source: 'csv'
                    });
                }

                resolve(articles);
            });
        });
    }

    async processImportedArticles(articles, source) {
        const results = {
            total: articles.length,
            imported: 0,
            skipped: 0,
            errors: 0,
            details: []
        };

        for (const article of articles) {
            try {
                // Check if article already exists
                const existing = this.db.getArticleByUrl(article.url);
                if (existing) {
                    results.skipped++;
                    results.details.push({
                        url: article.url,
                        status: 'skipped',
                        reason: 'Already exists'
                    });
                    continue;
                }

                // Extract content if missing
                let articleData = { ...article };
                if (!articleData.content || !articleData.excerpt) {
                    try {
                        const extracted = await this.extractor.extractFromUrl(article.url);
                        articleData = {
                            ...articleData,
                            content: articleData.content || extracted.content,
                            excerpt: articleData.excerpt || extracted.excerpt,
                            author: articleData.author || extracted.author,
                            domain: extracted.domain,
                            word_count: extracted.word_count,
                            reading_time: extracted.reading_time,
                            tags: [...(articleData.tags || []), ...(extracted.tags || [])]
                        };
                    } catch (extractError) {
                        console.warn(`Failed to extract content for ${article.url}:`, extractError.message);
                        // Continue with available data
                        articleData.domain = new URL(article.url).hostname;
                    }
                }

                // Import article
                const savedArticle = this.db.createArticle(articleData);
                results.imported++;
                results.details.push({
                    url: article.url,
                    status: 'imported',
                    id: savedArticle.id
                });

            } catch (error) {
                results.errors++;
                results.details.push({
                    url: article.url,
                    status: 'error',
                    reason: error.message
                });
                console.error(`Error importing article ${article.url}:`, error);
            }

            // Add small delay to avoid overwhelming the system
            if (results.imported % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        await this.extractor.close();
        return results;
    }

    async exportToJSON() {
        try {
            const articles = this.db.getAllArticles();
            const exportData = {
                export_date: new Date().toISOString(),
                export_type: 'read_later_full',
                version: '1.0',
                total_articles: articles.length,
                articles: articles.map(article => ({
                    ...article,
                    tags: this.parseArticleTags(article),
                    highlights: this.db.getArticleHighlights(article.id)
                }))
            };

            return JSON.stringify(exportData, null, 2);
        } catch (error) {
            throw new Error(`Export failed: ${error.message}`);
        }
    }

    async exportToCSV() {
        try {
            const articles = this.db.getAllArticles();
            const csvHeaders = [
                'id', 'url', 'title', 'author', 'domain', 'excerpt', 
                'word_count', 'reading_time', 'created_at', 'updated_at',
                'is_read', 'is_favorite', 'is_archived', 'reading_progress', 'tags'
            ];

            let csvContent = csvHeaders.join(',') + '\n';

            for (const article of articles) {
                const tags = this.parseArticleTags(article);
                const row = [
                    article.id,
                    `"${(article.url || '').replace(/"/g, '""')}"`,
                    `"${(article.title || '').replace(/"/g, '""')}"`,
                    `"${(article.author || '').replace(/"/g, '""')}"`,
                    `"${(article.domain || '').replace(/"/g, '""')}"`,
                    `"${(article.excerpt || '').replace(/"/g, '""')}"`,
                    article.word_count || 0,
                    article.reading_time || 0,
                    article.created_at || '',
                    article.updated_at || '',
                    article.is_read ? 'true' : 'false',
                    article.is_favorite ? 'true' : 'false',
                    article.is_archived ? 'true' : 'false',
                    article.reading_progress || 0,
                    `"${tags.join(', ')}"`
                ];

                csvContent += row.join(',') + '\n';
            }

            return csvContent;
        } catch (error) {
            throw new Error(`CSV export failed: ${error.message}`);
        }
    }

    parseArticleTags(article) {
        try {
            if (Array.isArray(article.tags)) return article.tags;
            return JSON.parse(article.tags || '[]');
        } catch {
            return [];
        }
    }

    getSupportedImportFormats() {
        return [
            {
                name: 'Pocket Export',
                extension: '.html',
                description: 'HTML export file from Pocket (getpocket.com)',
                method: 'importFromPocket'
            },
            {
                name: 'Instapaper Export',
                extension: '.csv',
                description: 'CSV export file from Instapaper',
                method: 'importFromInstapaper'
            },
            {
                name: 'Readwise Export',
                extension: '.json',
                description: 'JSON export file from Readwise',
                method: 'importFromReadwise'
            },
            {
                name: 'Generic CSV',
                extension: '.csv',
                description: 'CSV file with url, title, and optional metadata columns',
                method: 'importFromCSV'
            },
            {
                name: 'JSON Import',
                extension: '.json',
                description: 'JSON file with articles array',
                method: 'importFromJSON'
            }
        ];
    }
}

module.exports = ImportService;