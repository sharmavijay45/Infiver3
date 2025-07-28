const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const screenshot = require('screenshot-desktop');
const ScreenCapture = require('../models/ScreenCapture');
const MonitoringAlert = require('../models/MonitoringAlert');
const { uploadRegularScreenshot } = require('../utils/cloudinary');

class ScreenCaptureService {
  constructor() {
    this.captureInterval = parseInt(process.env.SCREEN_CAPTURE_INTERVAL) || 300000; // 5 minutes
    this.compressionQuality = parseInt(process.env.COMPRESSION_QUALITY) || 80;
    this.maxFileSize = parseInt(process.env.MAX_SCREENSHOT_SIZE) || 5 * 1024 * 1024; // 5MB
    this.baseStoragePath = process.env.SCREENSHOT_STORAGE_PATH || './uploads/employee_data';
    this.activeCaptureSessions = new Map();
  }

  /**
   * Start screen capture for an employee (DISABLED - Only intelligent violations are captured)
   */
  async startCapture(employeeId, sessionId) {
    if (this.activeCaptureSessions.has(employeeId)) {
      console.log(`Screen capture already active for employee ${employeeId}`);
      return;
    }

    console.log(`📸 Regular screen capture DISABLED for employee ${employeeId} - Only intelligent violation screenshots will be stored`);

    // Store session info but don't capture regular screenshots
    const captureConfig = {
      employeeId,
      sessionId,
      intervalId: null,
      lastCaptureHash: null,
      captureCount: 0,
      disabled: true // Mark as disabled
    };

    // NO regular captures - only intelligent violations will be captured
    // This saves storage space and focuses on policy violations only

    this.activeCaptureSessions.set(employeeId, captureConfig);
  }

  /**
   * Stop screen capture for an employee
   */
  stopCapture(employeeId) {
    const session = this.activeCaptureSessions.get(employeeId);
    if (session) {
      clearInterval(session.intervalId);
      this.activeCaptureSessions.delete(employeeId);
      console.log(`Stopped screen capture for employee ${employeeId}`);
    }
  }

  /**
   * Capture screen for specific trigger
   */
  async triggerCapture(employeeId, sessionId, trigger = 'manual', metadata = {}) {
    const captureConfig = {
      employeeId,
      sessionId,
      lastCaptureHash: null,
      captureCount: 0
    };

    return await this.captureScreen(captureConfig, trigger, metadata);
  }

  /**
   * Main screen capture logic
   */
  async captureScreen(captureConfig, trigger = 'scheduled', metadata = {}) {
    try {
      const { employeeId, sessionId } = captureConfig;



      // Take screenshot with error handling for headless environments
      let screenshotBuffer;
      let isPlaceholder = false;

      try {
        // Check if we're in a headless environment
        const isHeadless = !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY && process.platform === 'linux';

        if (isHeadless) {
          console.log('📸 Headless environment detected, creating placeholder screenshot');
          screenshotBuffer = await this.createPlaceholderScreenshot();
          isPlaceholder = true;
        } else {
          screenshotBuffer = await screenshot({ format: 'png' });
        }
      } catch (screenshotError) {
        console.log('📸 Screenshot failed, creating placeholder:', screenshotError.message);
        screenshotBuffer = await this.createPlaceholderScreenshot();
        isPlaceholder = true;
      }

      // Calculate hash for delta detection
      const currentHash = crypto.createHash('md5').update(screenshotBuffer).digest('hex');
      
      // Check if screen content has changed
      if (captureConfig.lastCaptureHash === currentHash && trigger === 'scheduled') {
        console.log(`No screen change detected for employee ${employeeId}, skipping capture`);
        return null;
      }

      // Compress image first
      const compressedBuffer = await this.compressImage(screenshotBuffer);
      const compressionRatio = screenshotBuffer.length / compressedBuffer.length;

      // Upload to Cloudinary
      const cloudinaryResult = await uploadRegularScreenshot(compressedBuffer, employeeId, {
        application: metadata?.active_application?.name || 'unknown'
      });

      // Also save locally as backup (optional - can be disabled in production)
      let filePath = null;
      if (process.env.ENABLE_LOCAL_BACKUP !== 'false') {
        const storageDir = await this.createStorageDirectory(employeeId);
        const timestamp = new Date();
        const filename = `screen_${timestamp.getTime()}_${captureConfig.captureCount}.jpg`;
        filePath = path.join(storageDir, filename);
        await fs.writeFile(filePath, compressedBuffer);
      }

      // Get screen resolution
      const metadata_enhanced = {
        ...metadata,
        screen_resolution: await this.getScreenResolution(),
        compression_ratio: compressionRatio
      };

      // Find previous capture for delta reference
      const previousCapture = await ScreenCapture.findOne({
        employee: employeeId,
        session_id: sessionId
      }).sort({ timestamp: -1 });

      // Save to database with Cloudinary information
      const timestamp = new Date();
      const screenCapture = new ScreenCapture({
        employee: employeeId,
        timestamp,
        file_path: filePath || cloudinaryResult.cloudinary_url, // Use Cloudinary URL if no local backup
        file_size: cloudinaryResult.file_size,
        file_hash: currentHash,
        compression_ratio: compressionRatio,
        screen_resolution: metadata_enhanced.screen_resolution,
        is_delta: !!previousCapture,
        previous_capture: previousCapture?._id,
        active_application: metadata.active_application,
        session_id: sessionId,
        capture_trigger: trigger,
        is_flagged: trigger === 'unauthorized_site' || metadata.is_flagged,
        flag_reason: metadata.flag_reason,
        metadata: {
          blur_applied: false,
          privacy_level: 'full',
          encryption_key: await this.generateEncryptionKey(),
          // Cloudinary metadata
          cloudinary_url: cloudinaryResult.cloudinary_url,
          cloudinary_public_id: cloudinaryResult.cloudinary_public_id,
          cloudinary_version: cloudinaryResult.cloudinary_version,
          storage_type: 'cloudinary',
          local_backup_enabled: process.env.ENABLE_LOCAL_BACKUP !== 'false'
        }
      });

      await screenCapture.save();

      // Update capture config
      captureConfig.lastCaptureHash = currentHash;
      captureConfig.captureCount++;

      // Check file size and create alert if too large
      if (cloudinaryResult.file_size > this.maxFileSize) {
        await MonitoringAlert.createAlert({
          employee: employeeId,
          alert_type: 'suspicious_activity',
          severity: 'medium',
          title: 'Large Screenshot File',
          description: `Screenshot file size (${Math.round(cloudinaryResult.file_size / 1024 / 1024)}MB) exceeds normal threshold`,
          data: {
            screenshot_id: screenCapture._id,
            file_size: cloudinaryResult.file_size,
            cloudinary_public_id: cloudinaryResult.cloudinary_public_id
          },
          session_id: sessionId
        });
      }

      console.log(`Screen captured for employee ${employeeId}: ${filePath || 'cloudinary-only'}`);
      return screenCapture;

    } catch (error) {
      console.error('Screen capture error:', error);
      
      // Create alert for capture failure
      await MonitoringAlert.createAlert({
        employee: captureConfig.employeeId,
        alert_type: 'suspicious_activity',
        severity: 'high',
        title: 'Screen Capture Failed',
        description: `Failed to capture screen: ${error.message}`,
        data: {
          error_message: error.message,
          capture_trigger: trigger
        },
        session_id: captureConfig.sessionId
      });
      
      throw error;
    }
  }

  /**
   * Create storage directory structure
   */
  async createStorageDirectory(employeeId) {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    
    const dirPath = path.join(
      this.baseStoragePath,
      employeeId.toString(),
      'screens',
      dateStr
    );

    await fs.mkdir(dirPath, { recursive: true });
    return dirPath;
  }

  /**
   * Compress image using Sharp
   */
  async compressImage(buffer) {
    return await sharp(buffer)
      .jpeg({ 
        quality: this.compressionQuality,
        progressive: true,
        mozjpeg: true
      })
      .toBuffer();
  }

  /**
   * Create placeholder screenshot for headless environments
   */
  async createPlaceholderScreenshot() {
    const sharp = require('sharp');

    // Create a realistic-looking placeholder with some text
    const width = 1920;
    const height = 1080;

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#2d3748"/>
        <rect x="50" y="50" width="${width-100}" height="80" fill="#4a5568" rx="8"/>
        <text x="${width/2}" y="110" text-anchor="middle" fill="#e2e8f0" font-family="Arial" font-size="24">
          Monitoring System - Headless Environment
        </text>
        <text x="${width/2}" y="150" text-anchor="middle" fill="#a0aec0" font-family="Arial" font-size="16">
          Screenshot capture simulated for cloud deployment
        </text>
        <text x="${width/2}" y="180" text-anchor="middle" fill="#718096" font-family="Arial" font-size="14">
          Timestamp: ${new Date().toISOString()}
        </text>

        <!-- Simulate browser window -->
        <rect x="100" y="250" width="${width-200}" height="${height-350}" fill="#ffffff" rx="8"/>
        <rect x="100" y="250" width="${width-200}" height="40" fill="#f7fafc" rx="8 8 0 0"/>
        <circle cx="130" cy="270" r="6" fill="#fc8181"/>
        <circle cx="150" cy="270" r="6" fill="#f6e05e"/>
        <circle cx="170" cy="270" r="6" fill="#68d391"/>

        <text x="200" y="275" fill="#4a5568" font-family="Arial" font-size="12">
          Simulated Browser Activity
        </text>
      </svg>
    `;

    return await sharp(Buffer.from(svg))
      .png()
      .toBuffer();
  }

  /**
   * Get screen resolution
   */
  async getScreenResolution() {
    try {
      // Check if we're in a headless environment
      const isHeadless = !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY && process.platform === 'linux';

      if (isHeadless) {
        return { width: 1920, height: 1080 };
      }

      // Try to get actual screen resolution
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);

      try {
        const { stdout } = await execAsync('xrandr --current | grep "*" | head -1', { timeout: 3000 });
        const match = stdout.match(/(\d+)x(\d+)/);
        if (match) {
          return { width: parseInt(match[1]), height: parseInt(match[2]) };
        }
      } catch (error) {
        console.log('Could not get screen resolution, using default');
      }

      return { width: 1920, height: 1080 };
    } catch (error) {
      return { width: 1920, height: 1080 };
    }
  }

  /**
   * Generate encryption key for sensitive screenshots
   */
  async generateEncryptionKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Clean up old screenshots based on retention policy
   */
  async cleanupOldScreenshots(retentionDays = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      // Find old screenshots
      const oldScreenshots = await ScreenCapture.find({
        timestamp: { $lt: cutoffDate }
      });

      // Delete files and database records
      for (const screenshot of oldScreenshots) {
        try {
          await fs.unlink(screenshot.file_path);
        } catch (fileError) {
          console.warn(`Could not delete file ${screenshot.file_path}:`, fileError.message);
        }
      }

      // Remove database records
      const deleteResult = await ScreenCapture.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      console.log(`Cleaned up ${deleteResult.deletedCount} old screenshots`);
      return deleteResult.deletedCount;

    } catch (error) {
      console.error('Screenshot cleanup error:', error);
      throw error;
    }
  }

  /**
   * Get capture statistics
   */
  async getCaptureStats(employeeId, startDate, endDate) {
    return await ScreenCapture.getDailySummary(employeeId, startDate);
  }

  /**
   * Stop all active captures (for shutdown)
   */
  stopAllCaptures() {
    for (const [employeeId, session] of this.activeCaptureSessions) {
      clearInterval(session.intervalId);
    }
    this.activeCaptureSessions.clear();
    console.log('Stopped all screen capture sessions');
  }
}

module.exports = new ScreenCaptureService();
