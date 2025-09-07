const express = require('express');
const AnalyticsService = require('../services/analytics-service');

const router = express.Router();

// Get overall statistics
router.get('/stats', (req, res) => {
    try {
        const analytics = new AnalyticsService(req.db);
        const stats = analytics.getOverallStats();
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error getting analytics stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get reading trends
router.get('/trends', (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const analytics = new AnalyticsService(req.db);
        const trends = analytics.getReadingTrends(days);
        
        res.json({
            success: true,
            data: trends
        });
    } catch (error) {
        console.error('Error getting reading trends:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get top domains
router.get('/domains', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const analytics = new AnalyticsService(req.db);
        const domains = analytics.getTopDomains(limit);
        
        res.json({
            success: true,
            data: domains
        });
    } catch (error) {
        console.error('Error getting top domains:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get top tags
router.get('/tags', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 15;
        const analytics = new AnalyticsService(req.db);
        const tags = analytics.getTopTags(limit);
        
        res.json({
            success: true,
            data: tags
        });
    } catch (error) {
        console.error('Error getting top tags:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get reading patterns
router.get('/patterns', (req, res) => {
    try {
        const analytics = new AnalyticsService(req.db);
        const patterns = analytics.getReadingPatterns();
        
        res.json({
            success: true,
            data: patterns
        });
    } catch (error) {
        console.error('Error getting reading patterns:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get productivity metrics
router.get('/productivity', (req, res) => {
    try {
        const analytics = new AnalyticsService(req.db);
        const metrics = analytics.getProductivityMetrics();
        
        res.json({
            success: true,
            data: metrics
        });
    } catch (error) {
        console.error('Error getting productivity metrics:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get content analysis
router.get('/content', (req, res) => {
    try {
        const analytics = new AnalyticsService(req.db);
        const analysis = analytics.getContentAnalysis();
        
        res.json({
            success: true,
            data: analysis
        });
    } catch (error) {
        console.error('Error getting content analysis:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get highlight analysis
router.get('/highlights', (req, res) => {
    try {
        const analytics = new AnalyticsService(req.db);
        const analysis = analytics.getHighlightAnalysis();
        
        res.json({
            success: true,
            data: analysis
        });
    } catch (error) {
        console.error('Error getting highlight analysis:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Generate comprehensive report
router.get('/report', (req, res) => {
    try {
        const type = req.query.type || 'comprehensive';
        const analytics = new AnalyticsService(req.db);
        const report = analytics.generateReport(type);
        
        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Export report as JSON
router.get('/report/export', (req, res) => {
    try {
        const type = req.query.type || 'comprehensive';
        const analytics = new AnalyticsService(req.db);
        const report = analytics.generateReport(type);
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="read-later-analytics-report-${Date.now()}.json"`);
        res.send(JSON.stringify(report, null, 2));
        
    } catch (error) {
        console.error('Error exporting report:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get dashboard data (summary of key metrics)
router.get('/dashboard', (req, res) => {
    try {
        const analytics = new AnalyticsService(req.db);
        
        const dashboard = {
            overview: analytics.getOverallStats(),
            recent_trends: analytics.getReadingTrends(7), // Last 7 days
            top_domains: analytics.getTopDomains(5),
            top_tags: analytics.getTopTags(8),
            productivity: analytics.getProductivityMetrics()
        };
        
        res.json({
            success: true,
            data: dashboard
        });
    } catch (error) {
        console.error('Error getting dashboard data:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;