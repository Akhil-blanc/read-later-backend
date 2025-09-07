const express = require('express');
const ContentExtractor = require('../services/simple-extractor');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const articles = req.db.getAllArticles();
    res.json({
      success: true,
      data: articles,
      count: articles.length
    });
  } catch (error) {
    console.error('Error fetching articles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch articles'
    });
  }
});

router.get('/:id', (req, res) => {
  try {
    const article = req.db.getArticleById(req.params.id);
    if (!article) {
      return res.status(404).json({
        success: false,
        error: 'Article not found'
      });
    }
    res.json({
      success: true,
      data: article
    });
  } catch (error) {
    console.error('Error fetching article:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch article'
    });
  }
});

router.post('/', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    const existingArticle = req.db.getArticleByUrl(url);
    if (existingArticle) {
      return res.status(409).json({
        success: false,
        error: 'Article already exists',
        data: existingArticle
      });
    }

    let articleData;
    if (req.body.title && req.body.content) {
      articleData = req.body;
    } else {
      const extractor = new ContentExtractor();
      try {
        articleData = await extractor.extractFromUrl(url);
        await extractor.close();
      } catch (extractError) {
        await extractor.close();
        throw extractError;
      }
    }

    const article = req.db.createArticle(articleData);
    res.status(201).json({
      success: true,
      data: article,
      message: 'Article saved successfully'
    });

  } catch (error) {
    console.error('Error creating article:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save article'
    });
  }
});

router.post('/extract', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    const extractor = new ContentExtractor();
    try {
      const articleData = await extractor.extractFromUrl(url);
      await extractor.close();

      res.json({
        success: true,
        data: articleData,
        message: 'Content extracted successfully'
      });
    } catch (extractError) {
      await extractor.close();
      throw extractError;
    }

  } catch (error) {
    console.error('Error extracting content:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to extract content'
    });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.created_at;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    const result = req.db.updateArticle(id, updates);
    
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Article not found'
      });
    }

    const updatedArticle = req.db.getArticleById(id);
    res.json({
      success: true,
      data: updatedArticle,
      message: 'Article updated successfully'
    });

  } catch (error) {
    console.error('Error updating article:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update article'
    });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = req.db.deleteArticle(id);
    
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Article not found'
      });
    }

    res.json({
      success: true,
      message: 'Article deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting article:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete article'
    });
  }
});

router.get('/search/:query', (req, res) => {
  try {
    const { query } = req.params;
    const results = req.db.searchArticles(query);

    res.json({
      success: true,
      data: results,
      count: results.length,
      query: query
    });

  } catch (error) {
    console.error('Error searching articles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search articles'
    });
  }
});

// Tag management routes
router.get('/tags', (req, res) => {
  try {
    const tags = req.db.getAllTags();
    res.json({
      success: true,
      data: tags,
      count: tags.length
    });
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tags'
    });
  }
});

router.get('/:id/tags', (req, res) => {
  try {
    const tags = req.db.getArticleTags(req.params.id);
    res.json({
      success: true,
      data: tags,
      count: tags.length
    });
  } catch (error) {
    console.error('Error fetching article tags:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch article tags'
    });
  }
});

router.post('/:id/tags', (req, res) => {
  try {
    const { tags } = req.body;
    if (!Array.isArray(tags)) {
      return res.status(400).json({
        success: false,
        error: 'Tags must be an array'
      });
    }

    req.db.addTagsToArticle(req.params.id, tags);
    const updatedTags = req.db.getArticleTags(req.params.id);
    
    res.json({
      success: true,
      data: updatedTags,
      message: 'Tags added successfully'
    });
  } catch (error) {
    console.error('Error adding tags:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add tags'
    });
  }
});

// Highlights routes
router.get('/:id/highlights', (req, res) => {
  try {
    const highlights = req.db.getArticleHighlights(req.params.id);
    res.json({
      success: true,
      data: highlights,
      count: highlights.length
    });
  } catch (error) {
    console.error('Error fetching highlights:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch highlights'
    });
  }
});

router.post('/:id/highlights', (req, res) => {
  try {
    const highlight = req.db.addHighlight(req.params.id, req.body);
    res.status(201).json({
      success: true,
      data: highlight,
      message: 'Highlight added successfully'
    });
  } catch (error) {
    console.error('Error adding highlight:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add highlight'
    });
  }
});

router.delete('/highlights/:id', (req, res) => {
  try {
    const result = req.db.deleteHighlight(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Highlight not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Highlight deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting highlight:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete highlight'
    });
  }
});

// Reading progress route
router.put('/:id/progress', (req, res) => {
  try {
    const { progress } = req.body;
    if (typeof progress !== 'number' || progress < 0 || progress > 1) {
      return res.status(400).json({
        success: false,
        error: 'Progress must be a number between 0 and 1'
      });
    }

    req.db.updateReadingProgress(req.params.id, progress);
    res.json({
      success: true,
      message: 'Reading progress updated'
    });
  } catch (error) {
    console.error('Error updating progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update progress'
    });
  }
});

module.exports = router;