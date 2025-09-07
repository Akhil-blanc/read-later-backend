const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const ImportService = require('../services/import-service');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        // Ensure upload directory exists
        require('fs').mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.html', '.csv', '.json', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Allowed: HTML, CSV, JSON, TXT'));
        }
    }
});

// Get supported import formats
router.get('/formats', (req, res) => {
    try {
        const importService = new ImportService(req.db);
        const formats = importService.getSupportedImportFormats();
        
        res.json({
            success: true,
            data: formats
        });
    } catch (error) {
        console.error('Error getting import formats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Import articles from file
router.post('/import', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        const { format } = req.body;
        if (!format) {
            return res.status(400).json({
                success: false,
                error: 'Import format is required'
            });
        }

        const importService = new ImportService(req.db);
        const filePath = req.file.path;

        let result;
        switch (format.toLowerCase()) {
            case 'pocket':
                result = await importService.importFromPocket(filePath);
                break;
            case 'instapaper':
                result = await importService.importFromInstapaper(filePath);
                break;
            case 'readwise':
                result = await importService.importFromReadwise(filePath);
                break;
            case 'csv':
                result = await importService.importFromCSV(filePath);
                break;
            case 'json':
                result = await importService.importFromJSON(filePath);
                break;
            default:
                throw new Error('Unsupported import format');
        }

        // Clean up uploaded file
        try {
            await fs.unlink(filePath);
        } catch (cleanupError) {
            console.warn('Failed to delete uploaded file:', cleanupError);
        }

        res.json({
            success: true,
            data: result,
            message: `Import completed: ${result.imported} imported, ${result.skipped} skipped, ${result.errors} errors`
        });

    } catch (error) {
        console.error('Import error:', error);
        
        // Clean up uploaded file on error
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            } catch (cleanupError) {
                console.warn('Failed to delete uploaded file:', cleanupError);
            }
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Preview import (analyze file without importing)
router.post('/preview', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        const { format } = req.body;
        const filePath = req.file.path;
        const fileStats = await fs.stat(filePath);

        let preview = {
            filename: req.file.originalname,
            size: fileStats.size,
            format: format,
            estimated_articles: 0,
            sample_articles: []
        };

        try {
            const importService = new ImportService(req.db);
            let articles = [];

            // Parse articles based on format
            switch (format?.toLowerCase()) {
                case 'pocket':
                    const pocketData = await fs.readFile(filePath, 'utf8');
                    articles = importService.parsePocketHTML(pocketData);
                    break;
                case 'instapaper':
                    const instapaperData = await fs.readFile(filePath, 'utf8');
                    articles = await importService.parseInstapaperCSV(instapaperData);
                    break;
                case 'csv':
                    const csvData = await fs.readFile(filePath, 'utf8');
                    articles = await importService.parseGenericCSV(csvData);
                    break;
                case 'json':
                    const jsonData = await fs.readFile(filePath, 'utf8');
                    articles = JSON.parse(jsonData);
                    if (!Array.isArray(articles)) {
                        articles = articles.articles || [articles];
                    }
                    break;
                default:
                    throw new Error('Unsupported format for preview');
            }

            preview.estimated_articles = articles.length;
            preview.sample_articles = articles.slice(0, 5).map(article => ({
                url: article.url,
                title: article.title,
                source: article.source || format,
                tags: article.tags || [],
                created_at: article.created_at
            }));

            // Check for duplicates
            const existingUrls = articles.filter(article => {
                return req.db.getArticleByUrl(article.url);
            }).length;

            preview.duplicate_count = existingUrls;
            preview.new_articles = articles.length - existingUrls;

        } catch (parseError) {
            preview.error = parseError.message;
        }

        // Clean up uploaded file
        try {
            await fs.unlink(filePath);
        } catch (cleanupError) {
            console.warn('Failed to delete uploaded file:', cleanupError);
        }

        res.json({
            success: true,
            data: preview
        });

    } catch (error) {
        console.error('Preview error:', error);
        
        // Clean up uploaded file on error
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            } catch (cleanupError) {
                console.warn('Failed to delete uploaded file:', cleanupError);
            }
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Export articles to JSON
router.get('/export/json', async (req, res) => {
    try {
        const importService = new ImportService(req.db);
        const jsonData = await importService.exportToJSON();
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="read-later-export-${Date.now()}.json"`);
        res.send(jsonData);

    } catch (error) {
        console.error('JSON export error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Export articles to CSV
router.get('/export/csv', async (req, res) => {
    try {
        const importService = new ImportService(req.db);
        const csvData = await importService.exportToCSV();
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="read-later-export-${Date.now()}.csv"`);
        res.send(csvData);

    } catch (error) {
        console.error('CSV export error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get import/export statistics
router.get('/stats', (req, res) => {
    try {
        const totalArticles = req.db.getAllArticles().length;
        const totalTags = req.db.getAllTags().length;
        
        // Get articles by source if available
        const articlesBySource = {};
        req.db.getAllArticles().forEach(article => {
            const source = article.source || 'manual';
            articlesBySource[source] = (articlesBySource[source] || 0) + 1;
        });

        res.json({
            success: true,
            data: {
                total_articles: totalArticles,
                total_tags: totalTags,
                articles_by_source: articlesBySource,
                export_formats: ['json', 'csv'],
                import_formats: ['pocket', 'instapaper', 'readwise', 'csv', 'json']
            }
        });

    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;