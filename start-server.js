const { spawn } = require('child_process');
const path = require('path');

class ServerManager {
  constructor() {
    this.server = null;
    this.restartCount = 0;
    this.maxRestarts = 10;
    this.restartDelay = 5000; // 5 seconds
    this.lastRestart = Date.now();
  }

  start() {
    console.log('🚀 Starting Read Later API Server...');
    
    this.server = spawn('node', ['server.js'], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.server.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    this.server.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    this.server.on('close', (code) => {
      console.log(`\n💥 Server process exited with code ${code}`);
      
      if (code !== 0) {
        this.handleCrash();
      }
    });

    this.server.on('error', (error) => {
      console.error('❌ Failed to start server process:', error);
      this.handleCrash();
    });

    // Reset restart count after successful run
    setTimeout(() => {
      this.restartCount = 0;
      console.log('✅ Server has been running successfully for 30 seconds');
    }, 30000);
  }

  handleCrash() {
    const timeSinceLastRestart = Date.now() - this.lastRestart;
    
    if (this.restartCount >= this.maxRestarts) {
      console.error(`💀 Server has crashed ${this.maxRestarts} times. Giving up.`);
      console.error('🔧 Please check the logs and fix the issues before restarting.');
      process.exit(1);
    }

    if (timeSinceLastRestart < 60000) { // Less than 1 minute
      this.restartCount++;
    } else {
      this.restartCount = 1; // Reset if it's been a while
    }

    console.log(`🔄 Attempting restart ${this.restartCount}/${this.maxRestarts} in ${this.restartDelay/1000} seconds...`);
    
    setTimeout(() => {
      this.lastRestart = Date.now();
      this.start();
    }, this.restartDelay);

    // Increase delay for rapid restarts
    if (this.restartCount > 3) {
      this.restartDelay = Math.min(this.restartDelay * 1.5, 30000);
    }
  }

  stop() {
    console.log('\n🛑 Shutting down server manager...');
    if (this.server) {
      this.server.kill('SIGTERM');
      
      // Force kill after 10 seconds
      setTimeout(() => {
        if (this.server && !this.server.killed) {
          console.log('💥 Force killing server process...');
          this.server.kill('SIGKILL');
        }
      }, 10000);
    }
    process.exit(0);
  }
}

const serverManager = new ServerManager();

// Handle shutdown signals
process.on('SIGINT', () => serverManager.stop());
process.on('SIGTERM', () => serverManager.stop());

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  serverManager.stop();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  serverManager.stop();
});

// Start the server
serverManager.start();