/**
 * Client-Side Monitoring Service
 * Captures real user browser activity and sends to server
 */

class ClientMonitoringService {
  constructor() {
    this.isActive = false;
    this.socket = null;
    this.employeeId = null;
    this.sessionId = null;
    this.activityInterval = null;
    this.screenshotInterval = null;
    this.mediaStream = null;
    
    // Configuration
    this.config = {
      activityCheckInterval: 5000, // Check activity every 5 seconds
      screenshotInterval: 30000,   // Take screenshots every 30 seconds
      violationScreenshotDelay: 2000, // Delay before violation screenshot
    };

    // Activity tracking
    this.lastActivity = {
      url: '',
      title: '',
      timestamp: null,
      isActive: true
    };

    // Bind methods
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleFocusChange = this.handleFocusChange.bind(this);
    this.handleUrlChange = this.handleUrlChange.bind(this);
  }

  /**
   * Initialize monitoring service
   */
  async initialize(socket, employeeId) {
    try {
      this.socket = socket;
      this.employeeId = employeeId;
      this.sessionId = `client_session_${employeeId}_${Date.now()}`;

      console.log('🔧 Initializing client-side monitoring for employee:', employeeId);

      // Request necessary permissions
      await this.requestPermissions();

      // Set up event listeners
      this.setupEventListeners();

      console.log('✅ Client monitoring service initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize client monitoring:', error);
      return false;
    }
  }

  /**
   * Request necessary permissions for monitoring
   */
  async requestPermissions() {
    try {
      // Request screen capture permission (for screenshots)
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        console.log('📋 Requesting screen capture permission...');
        
        // Show user-friendly permission dialog
        const userConsent = await this.showPermissionDialog();
        
        if (!userConsent) {
          throw new Error('User denied monitoring permissions');
        }

        // Request screen capture access
        this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            mediaSource: 'screen',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });

        console.log('✅ Screen capture permission granted');
      } else {
        console.warn('⚠️ Screen capture API not available in this browser');
      }

      return true;
    } catch (error) {
      console.error('❌ Permission request failed:', error);
      throw error;
    }
  }

  /**
   * Show user-friendly permission dialog
   */
  async showPermissionDialog() {
    return new Promise((resolve) => {
      const dialog = document.createElement('div');
      dialog.innerHTML = `
        <div style="
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.8);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 10000;
          font-family: Arial, sans-serif;
        ">
          <div style="
            background: white;
            padding: 30px;
            border-radius: 10px;
            max-width: 500px;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          ">
            <h3 style="margin-top: 0; color: #333;">🔒 Employee Monitoring Permission</h3>
            <p style="color: #666; line-height: 1.5;">
              This application requires permission to monitor your screen activity for productivity tracking.
              Your privacy is important - monitoring data is used only for work-related analysis.
            </p>
            <div style="margin-top: 20px;">
              <button id="allow-monitoring" style="
                background: #4CAF50;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 5px;
                margin-right: 10px;
                cursor: pointer;
                font-size: 16px;
              ">Allow Monitoring</button>
              <button id="deny-monitoring" style="
                background: #f44336;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
              ">Deny</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);

      dialog.querySelector('#allow-monitoring').onclick = () => {
        document.body.removeChild(dialog);
        resolve(true);
      };

      dialog.querySelector('#deny-monitoring').onclick = () => {
        document.body.removeChild(dialog);
        resolve(false);
      };
    });
  }

  /**
   * Set up event listeners for activity tracking
   */
  setupEventListeners() {
    // Page visibility changes
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    
    // Window focus changes
    window.addEventListener('focus', this.handleFocusChange);
    window.addEventListener('blur', this.handleFocusChange);
    
    // URL changes (for SPAs)
    window.addEventListener('popstate', this.handleUrlChange);
    
    // Override pushState and replaceState to catch programmatic navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.handleUrlChange();
    };
    
    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      this.handleUrlChange();
    };

    console.log('📡 Event listeners set up for activity tracking');
  }

  /**
   * Start monitoring session
   */
  async startMonitoring() {
    if (this.isActive) {
      console.log('⚠️ Monitoring already active');
      return;
    }

    try {
      this.isActive = true;
      console.log('🚀 Starting client-side monitoring...');

      // Start activity tracking
      this.startActivityTracking();

      // Start screenshot capture if permission granted
      if (this.mediaStream) {
        this.startScreenshotCapture();
      }

      // Notify server that client monitoring started
      this.socket?.emit('client-monitoring-started', {
        employeeId: this.employeeId,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        capabilities: {
          screenCapture: !!this.mediaStream,
          activityTracking: true
        }
      });

      console.log('✅ Client monitoring started successfully');
    } catch (error) {
      console.error('❌ Failed to start monitoring:', error);
      this.isActive = false;
    }
  }

  /**
   * Stop monitoring session
   */
  stopMonitoring() {
    if (!this.isActive) {
      return;
    }

    console.log('🛑 Stopping client-side monitoring...');

    this.isActive = false;

    // Clear intervals
    if (this.activityInterval) {
      clearInterval(this.activityInterval);
      this.activityInterval = null;
    }

    if (this.screenshotInterval) {
      clearInterval(this.screenshotInterval);
      this.screenshotInterval = null;
    }

    // Stop media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Notify server
    this.socket?.emit('client-monitoring-stopped', {
      employeeId: this.employeeId,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString()
    });

    console.log('✅ Client monitoring stopped');
  }

  /**
   * Start activity tracking
   */
  startActivityTracking() {
    this.activityInterval = setInterval(() => {
      this.trackCurrentActivity();
    }, this.config.activityCheckInterval);

    // Initial activity check
    this.trackCurrentActivity();
  }

  /**
   * Track current browser activity
   */
  trackCurrentActivity() {
    try {
      const currentActivity = {
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
        isActive: !document.hidden,
        domain: window.location.hostname,
        path: window.location.pathname,
        userAgent: navigator.userAgent
      };

      // Check if activity changed
      const hasChanged = (
        currentActivity.url !== this.lastActivity.url ||
        currentActivity.title !== this.lastActivity.title ||
        currentActivity.isActive !== this.lastActivity.isActive
      );

      if (hasChanged) {
        console.log('🌐 Activity changed:', {
          url: currentActivity.url,
          title: currentActivity.title,
          isActive: currentActivity.isActive
        });

        // Send activity to server
        this.socket?.emit('client-activity-update', {
          employeeId: this.employeeId,
          sessionId: this.sessionId,
          activity: currentActivity,
          previousActivity: this.lastActivity
        });

        this.lastActivity = currentActivity;
      }
    } catch (error) {
      console.error('❌ Error tracking activity:', error);
    }
  }

  /**
   * Start screenshot capture
   */
  startScreenshotCapture() {
    if (!this.mediaStream) {
      console.warn('⚠️ No media stream available for screenshots');
      return;
    }

    this.screenshotInterval = setInterval(() => {
      this.captureScreenshot('scheduled');
    }, this.config.screenshotInterval);

    console.log('📸 Screenshot capture started');
  }

  /**
   * Capture screenshot
   */
  async captureScreenshot(trigger = 'manual', metadata = {}) {
    try {
      if (!this.mediaStream) {
        console.warn('⚠️ Cannot capture screenshot - no media stream');
        return null;
      }

      // Create video element to capture frame
      const video = document.createElement('video');
      video.srcObject = this.mediaStream;
      video.play();

      // Wait for video to load
      await new Promise((resolve) => {
        video.onloadedmetadata = resolve;
      });

      // Create canvas and capture frame
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);

      // Convert to blob
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/png', 0.8);
      });

      // Convert blob to base64
      const base64 = await this.blobToBase64(blob);

      const screenshotData = {
        employeeId: this.employeeId,
        sessionId: this.sessionId,
        trigger,
        timestamp: new Date().toISOString(),
        imageData: base64,
        metadata: {
          ...metadata,
          url: window.location.href,
          title: document.title,
          width: canvas.width,
          height: canvas.height,
          fileSize: blob.size
        }
      };

      // Send screenshot to server
      this.socket?.emit('client-screenshot-captured', screenshotData);

      console.log(`📸 Screenshot captured (${trigger}):`, {
        size: `${canvas.width}x${canvas.height}`,
        fileSize: `${(blob.size / 1024).toFixed(1)}KB`,
        trigger
      });

      return screenshotData;
    } catch (error) {
      console.error('❌ Screenshot capture failed:', error);
      return null;
    }
  }

  /**
   * Convert blob to base64
   */
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Handle visibility change events
   */
  handleVisibilityChange() {
    const isVisible = !document.hidden;
    console.log(`👁️ Page visibility changed: ${isVisible ? 'visible' : 'hidden'}`);

    this.socket?.emit('client-visibility-change', {
      employeeId: this.employeeId,
      sessionId: this.sessionId,
      isVisible,
      timestamp: new Date().toISOString()
    });

    // Track activity change
    this.trackCurrentActivity();
  }

  /**
   * Handle focus change events
   */
  handleFocusChange(event) {
    const hasFocus = event.type === 'focus';
    console.log(`🎯 Window focus changed: ${hasFocus ? 'focused' : 'blurred'}`);

    this.socket?.emit('client-focus-change', {
      employeeId: this.employeeId,
      sessionId: this.sessionId,
      hasFocus,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle URL change events
   */
  handleUrlChange() {
    console.log('🔄 URL changed to:', window.location.href);

    // Track activity change immediately
    this.trackCurrentActivity();

    // Capture screenshot after URL change (with delay)
    setTimeout(() => {
      if (this.isActive) {
        this.captureScreenshot('url_change', {
          previousUrl: this.lastActivity.url,
          newUrl: window.location.href
        });
      }
    }, this.config.violationScreenshotDelay);
  }

  /**
   * Trigger violation screenshot
   */
  async triggerViolationScreenshot(reason = 'policy_violation') {
    console.log('🚨 Triggering violation screenshot:', reason);

    return await this.captureScreenshot('violation', {
      reason,
      violationTime: new Date().toISOString()
    });
  }

  /**
   * Get current monitoring status
   */
  getStatus() {
    return {
      isActive: this.isActive,
      employeeId: this.employeeId,
      sessionId: this.sessionId,
      hasScreenCapture: !!this.mediaStream,
      lastActivity: this.lastActivity
    };
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.stopMonitoring();

    // Remove event listeners
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('focus', this.handleFocusChange);
    window.removeEventListener('blur', this.handleFocusChange);
    window.removeEventListener('popstate', this.handleUrlChange);

    console.log('🧹 Client monitoring service cleaned up');
  }
}

// Export singleton instance
export const clientMonitoringService = new ClientMonitoringService();
export default clientMonitoringService;
