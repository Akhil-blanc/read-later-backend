const fs = require('fs');
const path = require('path');

class JsonDatabase {
    constructor() {
        this.dataFile = path.join(__dirname, 'articles.json');
        this.articles = [];
        this.nextId = 1;
        this.loadData();
    }

    loadData() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const data = fs.readFileSync(this.dataFile, 'utf8');
                const parsed = JSON.parse(data);
                this.articles = parsed.articles || [];
                this.nextId = parsed.nextId || 1;
            }
        } catch (error) {
            console.warn('Could not load existing data:', error.message);
            this.articles = [];
            this.nextId = 1;
        }
    }

    saveData() {
        try {
            const data = {
                articles: this.articles,
                nextId: this.nextId
            };
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Failed to save data:', error.message);
        }
    }

    getAllArticles() {
        return this.articles;
    }

    getArticleById(id) {
        return this.articles.find(article => article.id == id);
    }

    getArticleByUrl(url) {
        return this.articles.find(article => article.url === url);
    }

    createArticle(articleData) {
        const now = new Date().toISOString();
        const article = {
            id: this.nextId++,
            url: articleData.url,
            title: articleData.title || 'Untitled',
            content: articleData.content || '',
            excerpt: articleData.excerpt || '',
            author: articleData.author || '',
            domain: articleData.domain || '',
            word_count: articleData.word_count || 0,
            reading_time: articleData.reading_time || 0,
            publish_date: articleData.publish_date || '',
            is_read: false,
            is_favorite: false,
            is_archived: false,
            reading_progress: 0,
            created_at: now,
            updated_at: now,
            last_read_at: '',
            obsidian_path: '',
            obsidian_synced_at: ''
        };

        this.articles.push(article);
        this.saveData();
        return article;
    }

    updateArticle(id, updates) {
        const index = this.articles.findIndex(article => article.id == id);
        if (index === -1) {
            return { changes: 0 };
        }

        updates.updated_at = new Date().toISOString();
        Object.assign(this.articles[index], updates);
        this.saveData();
        return { changes: 1 };
    }

    deleteArticle(id) {
        const index = this.articles.findIndex(article => article.id == id);
        if (index === -1) {
            return { changes: 0 };
        }

        this.articles.splice(index, 1);
        this.saveData();
        return { changes: 1 };
    }

    searchArticles(query) {
        const lowerQuery = query.toLowerCase();
        return this.articles.filter(article => 
            article.title.toLowerCase().includes(lowerQuery) ||
            article.content.toLowerCase().includes(lowerQuery) ||
            article.author.toLowerCase().includes(lowerQuery) ||
            article.domain.toLowerCase().includes(lowerQuery)
        );
    }

    // Placeholder methods for compatibility
    getAllTags() { return []; }
    getArticleTags() { return []; }
    addTagsToArticle() {}
    getArticleHighlights() { return []; }
    addHighlight() { return {}; }
    deleteHighlight() { return { changes: 0 }; }
    updateReadingProgress(id, progress) {
        return this.updateArticle(id, { 
            reading_progress: progress,
            last_read_at: new Date().toISOString()
        });
    }

    isHealthy() {
        return true;
    }

    close() {
        // Nothing to close for file-based storage
    }
}

module.exports = JsonDatabase;