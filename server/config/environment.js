/**
 * Environment configuration for cross-platform deployment
 * Handles headless server environments like Render, Heroku, etc.
 */

class EnvironmentConfig {
  constructor() {
    this.platform = process.platform;
    this.isHeadless = this.detectHeadlessEnvironment();
    this.capabilities = this.detectCapabilities();
  }

  /**
   * Detect if we're running in a headless environment
   */
  detectHeadlessEnvironment() {
    // Check for common headless environment indicators
    const headlessIndicators = [
      !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY, // No display server
      process.env.NODE_ENV === 'production' && !process.env.LOCAL_DEVELOPMENT, // Production without local flag
      process.env.RENDER || process.env.HEROKU || process.env.VERCEL, // Cloud platforms
      process.env.CI === 'true', // CI/CD environments
      process.env.DOCKER_CONTAINER === 'true' // Docker containers
    ];

    return headlessIndicators.some(indicator => indicator);
  }

  /**
   * Detect system capabilities
   */
  detectCapabilities() {
    const capabilities = {
      canTakeScreenshots: false,
      canDetectBrowsers: false,
      canAccessDisplay: false,
      hasX11Tools: false,
      simulationMode: false
    };

    if (this.isHeadless) {
      console.log('🔧 Headless environment detected - enabling simulation mode');
      capabilities.simulationMode = true;
      return capabilities;
    }

    // Check for actual capabilities in non-headless environments
    try {
      if (this.platform === 'linux') {
        capabilities.canAccessDisplay = !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
        // Note: We don't check for actual tools here to avoid blocking startup
        capabilities.canDetectBrowsers = true;
        capabilities.canTakeScreenshots = true;
      } else if (this.platform === 'win32') {
        capabilities.canDetectBrowsers = true;
        capabilities.canTakeScreenshots = true;
        capabilities.canAccessDisplay = true;
      } else if (this.platform === 'darwin') {
        capabilities.canDetectBrowsers = true;
        capabilities.canTakeScreenshots = true;
        capabilities.canAccessDisplay = true;
      }
    } catch (error) {
      console.log('⚠️ Error detecting capabilities:', error.message);
      capabilities.simulationMode = true;
    }

    return capabilities;
  }

  /**
   * Get monitoring configuration based on environment
   */
  getMonitoringConfig() {
    const baseConfig = {
      browserCheckInterval: parseInt(process.env.BROWSER_CHECK_INTERVAL) || 7000,
      websiteMonitoringInterval: parseInt(process.env.WEBSITE_MONITORING_INTERVAL) || 10000,
      activityFlushInterval: parseInt(process.env.ACTIVITY_FLUSH_INTERVAL) || 45000,
      screenshotEnabled: process.env.SCREENSHOT_ENABLED !== 'false',
      intelligentCaptureEnabled: process.env.INTELLIGENT_CAPTURE_ENABLED !== 'false'
    };

    if (this.isHeadless || this.capabilities.simulationMode) {
      return {
        ...baseConfig,
        simulationMode: true,
        screenshotEnabled: true, // Keep enabled but use placeholders
        browserDetectionMethod: 'simulation',
        violationDetectionEnabled: true, // Keep violation detection active
        alertsEnabled: true,
        // Increase intervals for better performance in cloud environments
        browserCheckInterval: Math.max(baseConfig.browserCheckInterval, 10000),
        websiteMonitoringInterval: Math.max(baseConfig.websiteMonitoringInterval, 15000)
      };
    }

    return {
      ...baseConfig,
      simulationMode: false,
      browserDetectionMethod: this.getBrowserDetectionMethod(),
      violationDetectionEnabled: true,
      alertsEnabled: true
    };
  }

  /**
   * Get appropriate browser detection method for platform
   */
  getBrowserDetectionMethod() {
    if (this.capabilities.simulationMode) {
      return 'simulation';
    }

    switch (this.platform) {
      case 'win32':
        return 'tasklist';
      case 'linux':
        return this.capabilities.hasX11Tools ? 'x11' : 'process';
      case 'darwin':
        return 'applescript';
      default:
        return 'simulation';
    }
  }

  /**
   * Check if feature is available in current environment
   */
  isFeatureAvailable(feature) {
    const featureMap = {
      'screenshots': this.capabilities.canTakeScreenshots || this.capabilities.simulationMode,
      'browser-detection': this.capabilities.canDetectBrowsers || this.capabilities.simulationMode,
      'display-access': this.capabilities.canAccessDisplay,
      'x11-tools': this.capabilities.hasX11Tools,
      'simulation': this.capabilities.simulationMode
    };

    return featureMap[feature] || false;
  }

  /**
   * Get environment info for debugging
   */
  getEnvironmentInfo() {
    return {
      platform: this.platform,
      isHeadless: this.isHeadless,
      capabilities: this.capabilities,
      nodeEnv: process.env.NODE_ENV,
      display: process.env.DISPLAY || 'not set',
      waylandDisplay: process.env.WAYLAND_DISPLAY || 'not set',
      cloudPlatform: this.getCloudPlatform(),
      monitoringConfig: this.getMonitoringConfig()
    };
  }

  /**
   * Detect cloud platform
   */
  getCloudPlatform() {
    if (process.env.RENDER) return 'render';
    if (process.env.HEROKU) return 'heroku';
    if (process.env.VERCEL) return 'vercel';
    if (process.env.NETLIFY) return 'netlify';
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) return 'aws-lambda';
    if (process.env.GOOGLE_CLOUD_PROJECT) return 'google-cloud';
    if (process.env.DOCKER_CONTAINER) return 'docker';
    return 'unknown';
  }

  /**
   * Log environment status
   */
  logEnvironmentStatus() {
    const info = this.getEnvironmentInfo();
    console.log('🌍 Environment Configuration:');
    console.log(`   Platform: ${info.platform}`);
    console.log(`   Headless: ${info.isHeadless}`);
    console.log(`   Cloud Platform: ${info.cloudPlatform}`);
    console.log(`   Simulation Mode: ${info.capabilities.simulationMode}`);
    console.log(`   Screenshots: ${info.capabilities.canTakeScreenshots ? 'Available' : 'Simulated'}`);
    console.log(`   Browser Detection: ${info.capabilities.canDetectBrowsers ? 'Available' : 'Simulated'}`);
    
    if (info.isHeadless) {
      console.log('📋 Headless deployment detected - monitoring will use simulation mode');
      console.log('   ✅ Violation detection: Active');
      console.log('   ✅ Alert system: Active');
      console.log('   ✅ Activity tracking: Active');
      console.log('   📸 Screenshots: Placeholder mode');
      console.log('   🌐 Browser detection: Simulation mode');
    }
  }
}

// Export singleton instance
module.exports = new EnvironmentConfig();
