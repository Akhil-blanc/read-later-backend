const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const Database = require('./database-json');
const ObsidianSync = require('./services/obsidian-sync');
const articlesRouter = require('./routes/articles');
const importExportRouter = require('./routes/import-export');
const analyticsRouter = require('./routes/analytics');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;

const db = new Database();
let obsidianSync = null;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      imgSrc: ["'self'", "data:"],
    },
  },
}));
app.use(cors({
  origin: ['chrome-extension://*', 'moz-extension://*', 'http://localhost:*', 'app://obsidian.md'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { 
    ip: req.ip, 
    userAgent: req.get('User-Agent') 
  });
  req.db = db;
  req.obsidianSync = obsidianSync;
  next();
});

app.get('/', (req, res) => {
  res.json({
    name: 'Read Later API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      articles: '/api/articles',
      sync: '/api/sync'
    }
  });
});

app.use('/api/articles', articlesRouter);
app.use('/api/import-export', importExportRouter);
app.use('/api/analytics', analyticsRouter);

app.get('/api/sync/obsidian', async (req, res) => {
  try {
    if (!obsidianSync) {
      return res.status(400).json({
        success: false,
        error: 'Obsidian sync not configured'
      });
    }

    const syncType = req.query.type || 'export'; // export, import, full
    let result;

    switch (syncType) {
      case 'export':
        result = await obsidianSync.syncToObsidian();
        break;
      case 'import':
        result = await obsidianSync.syncFromObsidian();
        break;
      case 'full':
        result = await obsidianSync.performFullSync();
        break;
      default:
        throw new Error('Invalid sync type. Use: export, import, or full');
    }

    res.json({
      success: true,
      sync_type: syncType,
      ...result
    });

  } catch (error) {
    logger.error('Sync error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/sync/status', (req, res) => {
  try {
    if (!obsidianSync) {
      return res.json({
        success: true,
        configured: false,
        status: null
      });
    }

    const status = obsidianSync.getSyncStatus();
    const conflicts = obsidianSync.getConflicts();

    res.json({
      success: true,
      configured: true,
      status: {
        ...status,
        active_conflicts: conflicts.length,
        conflicts: conflicts
      }
    });

  } catch (error) {
    logger.error('Sync status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/sync/resolve-conflicts', async (req, res) => {
  try {
    if (!obsidianSync) {
      return res.status(400).json({
        success: false,
        error: 'Obsidian sync not configured'
      });
    }

    const { resolution_strategy } = req.body;
    if (resolution_strategy) {
      obsidianSync.updateConfig({ conflictResolution: resolution_strategy });
    }

    const results = await obsidianSync.resolveConflicts();
    
    res.json({
      success: true,
      resolved_conflicts: results.filter(r => r.success).length,
      failed_resolutions: results.filter(r => !r.success).length,
      details: results
    });

  } catch (error) {
    logger.error('Conflict resolution error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/sync/obsidian', (req, res) => {
  try {
    const config = req.body;
    
    if (!config.vaultPath) {
      return res.status(400).json({
        success: false,
        error: 'Vault path is required'
      });
    }

    obsidianSync = new ObsidianSync(db, config);
    
    res.json({
      success: true,
      message: 'Obsidian sync configured',
      config: obsidianSync.getConfig()
    });

  } catch (error) {
    logger.error('Sync configuration error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/sync/config', (req, res) => {
  if (!obsidianSync) {
    return res.json({
      success: true,
      configured: false,
      config: null
    });
  }

  res.json({
    success: true,
    configured: true,
    config: obsidianSync.getConfig()
  });
});

app.get('/api/health', (req, res) => {
  try {
    const isDbHealthy = db.isHealthy();
    if (!isDbHealthy) {
      throw new Error('Database not responding');
    }
    
    res.json({
      success: true,
      status: 'healthy',
      database: 'connected',
      obsidian: obsidianSync ? 'configured' : 'not configured',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

async function startServer() {
  try {
    await db.init();
    
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Read Later API server running on http://localhost:${PORT}`);
      logger.info(`📚 Database: SQLite connected`);
      logger.info(`🔗 Obsidian sync: ${obsidianSync ? 'Configured' : 'Not configured'}`);
      console.log(`🚀 Read Later API server running on http://localhost:${PORT}`);
      console.log(`📚 Database: SQLite connected`);
      console.log(`🔗 Obsidian sync: ${obsidianSync ? 'Configured' : 'Not configured'}`);
    });

    const gracefulShutdown = (signal) => {
      logger.info(`🛑 Received ${signal} signal, closing server...`);
      console.log(`\n🛑 Received ${signal} signal, closing server...`);
      
      // Set a timeout to force exit if graceful shutdown takes too long
      const forceExitTimeout = setTimeout(() => {
        logger.error('❌ Graceful shutdown timeout, forcing exit...');
        console.log('❌ Graceful shutdown timeout, forcing exit...');
        process.exit(1);
      }, 10000); // 10 seconds timeout
      
      server.close((err) => {
        clearTimeout(forceExitTimeout);
        
        if (err) {
          logger.error('❌ Error during server shutdown:', err);
          console.log('❌ Error during server shutdown:', err);
        }
        
        db.close();
        logger.info('✅ Server closed gracefully');
        console.log('✅ Server closed gracefully');
        process.exit(0);
      });
      
      // Close all active connections
      server.closeAllConnections?.();
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Handle uncaught exceptions and unhandled rejections
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught Exception:', error);
      console.log('💥 Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      console.log('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('unhandledRejection');
    });

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;