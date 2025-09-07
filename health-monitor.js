const axios = require('axios');
const { exec } = require('child_process');

class HealthMonitor {
  constructor(config = {}) {
    this.apiUrl = config.apiUrl || 'http://localhost:3000/api/health';
    this.checkInterval = config.checkInterval || 30000; // 30 seconds
    this.timeoutMs = config.timeout || 5000; // 5 seconds
    this.maxFailures = config.maxFailures || 3;
    this.failureCount = 0;
    this.isMonitoring = false;
    this.lastHealthy = Date.now();
  }

  start() {
    console.log(`🔍 Starting health monitor for ${this.apiUrl}`);
    console.log(`📊 Check interval: ${this.checkInterval/1000}s, Timeout: ${this.timeoutMs/1000}s`);
    
    this.isMonitoring = true;
    this.monitor();
  }

  stop() {
    console.log('⏹️  Stopping health monitor...');
    this.isMonitoring = false;
  }

  async monitor() {
    while (this.isMonitoring) {
      try {
        const startTime = Date.now();
        const response = await axios.get(this.apiUrl, {
          timeout: this.timeoutMs
        });

        const responseTime = Date.now() - startTime;
        const isHealthy = response.status === 200 && response.data.success;

        if (isHealthy) {
          this.onHealthy(response.data, responseTime);
        } else {
          this.onUnhealthy('Invalid health response', response);
        }

      } catch (error) {
        this.onUnhealthy('Health check failed', error);
      }

      // Wait before next check
      await this.sleep(this.checkInterval);
    }
  }

  onHealthy(healthData, responseTime) {
    this.failureCount = 0;
    this.lastHealthy = Date.now();
    
    const timestamp = new Date().toLocaleTimeString();
    console.log(`✅ [${timestamp}] Server healthy - Response: ${responseTime}ms`);
    
    if (healthData.database === 'connected') {
      console.log(`📊 Database: ${healthData.database}, Obsidian: ${healthData.obsidian}`);
    }
  }

  onUnhealthy(reason, details) {
    this.failureCount++;
    const timestamp = new Date().toLocaleTimeString();
    
    console.log(`❌ [${timestamp}] Health check failed (${this.failureCount}/${this.maxFailures}): ${reason}`);
    
    if (details.code) {
      console.log(`🔍 Error code: ${details.code}`);
    }
    
    if (details.message) {
      console.log(`💬 Message: ${details.message}`);
    }

    if (this.failureCount >= this.maxFailures) {
      this.handleCriticalFailure();
    }
  }

  handleCriticalFailure() {
    const downtime = Date.now() - this.lastHealthy;
    console.log(`💀 CRITICAL: Server has been unhealthy for ${Math.round(downtime/1000)} seconds`);
    console.log('🚨 Taking emergency actions...');

    // Log system information
    this.logSystemInfo();
    
    // Attempt to restart the server (if we have restart script)
    this.attemptRestart();
  }

  logSystemInfo() {
    console.log('\n📋 System Information:');
    
    exec('node --version', (error, stdout) => {
      console.log(`Node.js: ${stdout.trim()}`);
    });

    exec('tasklist /fi "imagename eq node.exe"', (error, stdout) => {
      if (!error) {
        const processes = stdout.split('\n').filter(line => line.includes('node.exe'));
        console.log(`Active Node processes: ${processes.length}`);
      }
    });

    exec('netstat -an | findstr :3000', (error, stdout) => {
      if (stdout) {
        console.log('Port 3000 status:', stdout.trim());
      } else {
        console.log('❌ Port 3000 is not listening');
      }
    });
  }

  attemptRestart() {
    console.log('🔄 Attempting to restart server...');
    
    // Kill existing processes on port 3001
    exec('for /f "tokens=5" %a in (\'netstat -ano ^| findstr :3000\') do taskkill /pid %a /f', (error) => {
      if (!error) {
        console.log('✅ Killed processes on port 3000');
      }
      
      // Wait a bit then try to start server
      setTimeout(() => {
        exec('npm start', { cwd: __dirname }, (error, stdout, stderr) => {
          if (error) {
            console.log('❌ Failed to restart server automatically');
            console.log('🔧 Manual intervention required');
          } else {
            console.log('✅ Server restart initiated');
            this.failureCount = 0; // Reset failure count
          }
        });
      }, 3000);
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get current status
  getStatus() {
    const uptime = Date.now() - this.lastHealthy;
    return {
      isMonitoring: this.isMonitoring,
      failureCount: this.failureCount,
      lastHealthy: this.lastHealthy,
      uptimeMs: uptime,
      status: this.failureCount === 0 ? 'healthy' : 'unhealthy'
    };
  }
}

// Run directly if called
if (require.main === module) {
  const monitor = new HealthMonitor({
    apiUrl: process.env.API_URL || 'http://localhost:3000/api/health',
    checkInterval: parseInt(process.env.CHECK_INTERVAL) || 30000,
    timeout: parseInt(process.env.TIMEOUT) || 5000,
    maxFailures: parseInt(process.env.MAX_FAILURES) || 3
  });

  monitor.start();

  // Handle shutdown
  process.on('SIGINT', () => {
    monitor.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    monitor.stop();
    process.exit(0);
  });
}

module.exports = HealthMonitor;