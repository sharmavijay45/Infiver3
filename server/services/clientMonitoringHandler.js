/**
 * Server-side handler for client monitoring data
 * Processes real-time data from client-side monitoring service
 */

const EmployeeActivity = require('../models/EmployeeActivity');
const ScreenCapture = require('../models/ScreenCapture');
const MonitoringAlert = require('../models/MonitoringAlert');
const WebsiteWhitelist = require('../models/WebsiteWhitelist');
const { uploadViolationScreenshot, uploadRegularScreenshot } = require('../utils/cloudinary');
const groqAIService = require('./groqAIService');
const ocrAnalysisService = require('./ocrAnalysisService');

class ClientMonitoringHandler {
  constructor() {
    this.activeSessions = new Map(); // employeeId -> session data
    this.activityBuffer = new Map(); // employeeId -> activity array
    this.violationSessions = new Map(); // employeeId -> violation session data
    
    // Configuration
    this.config = {
      activityFlushInterval: 30000, // Flush activities every 30 seconds
      violationCooldown: 60000, // 1 minute cooldown between violations
      maxActivityBuffer: 100, // Max activities to buffer before force flush
    };

    // Start periodic activity flushing
    this.startActivityFlushing();
  }

  /**
   * Initialize Socket.io event handlers
   */
  initializeSocketHandlers(io) {
    io.on('connection', (socket) => {
      console.log('🔌 Client connected for monitoring:', socket.id);

      // Client monitoring started
      socket.on('client-monitoring-started', (data) => {
        this.handleMonitoringStarted(socket, data);
      });

      // Client monitoring stopped
      socket.on('client-monitoring-stopped', (data) => {
        this.handleMonitoringStopped(socket, data);
      });

      // Activity updates
      socket.on('client-activity-update', (data) => {
        this.handleActivityUpdate(socket, data);
      });

      // Screenshot captured
      socket.on('client-screenshot-captured', (data) => {
        this.handleScreenshotCaptured(socket, data);
      });

      // Visibility changes
      socket.on('client-visibility-change', (data) => {
        this.handleVisibilityChange(socket, data);
      });

      // Focus changes
      socket.on('client-focus-change', (data) => {
        this.handleFocusChange(socket, data);
      });

      // Disconnect handling
      socket.on('disconnect', () => {
        this.handleClientDisconnect(socket);
      });
    });

    console.log('✅ Client monitoring Socket.io handlers initialized');
  }

  /**
   * Handle monitoring session started
   */
  async handleMonitoringStarted(socket, data) {
    try {
      const { employeeId, sessionId, capabilities } = data;
      
      console.log(`🚀 Client monitoring started for employee ${employeeId}`);

      // Store session data
      this.activeSessions.set(employeeId, {
        employeeId,
        sessionId,
        socketId: socket.id,
        startTime: new Date(),
        capabilities,
        lastActivity: null,
        violationCount: 0,
        lastViolationTime: null
      });

      // Initialize activity buffer
      if (!this.activityBuffer.has(employeeId)) {
        this.activityBuffer.set(employeeId, []);
      }

      // Join employee-specific room
      socket.join(`employee:${employeeId}`);

      // Send acknowledgment
      socket.emit('monitoring-started-ack', {
        success: true,
        sessionId,
        message: 'Client monitoring session started successfully'
      });

    } catch (error) {
      console.error('❌ Error handling monitoring started:', error);
      socket.emit('monitoring-error', {
        error: error.message,
        action: 'start'
      });
    }
  }

  /**
   * Handle monitoring session stopped
   */
  async handleMonitoringStopped(socket, data) {
    try {
      const { employeeId, sessionId } = data;
      
      console.log(`🛑 Client monitoring stopped for employee ${employeeId}`);

      // Flush remaining activities
      await this.flushActivities(employeeId);

      // Remove session data
      this.activeSessions.delete(employeeId);
      this.activityBuffer.delete(employeeId);

      // Leave employee room
      socket.leave(`employee:${employeeId}`);

      // Send acknowledgment
      socket.emit('monitoring-stopped-ack', {
        success: true,
        sessionId,
        message: 'Client monitoring session stopped successfully'
      });

    } catch (error) {
      console.error('❌ Error handling monitoring stopped:', error);
    }
  }

  /**
   * Handle activity updates from client
   */
  async handleActivityUpdate(socket, data) {
    try {
      const { employeeId, sessionId, activity, previousActivity } = data;
      
      const session = this.activeSessions.get(employeeId);
      if (!session) {
        console.warn(`⚠️ No active session for employee ${employeeId}`);
        return;
      }

      console.log(`🌐 Activity update for employee ${employeeId}:`, {
        url: activity.url,
        title: activity.title,
        isActive: activity.isActive
      });

      // Update session last activity
      session.lastActivity = activity;

      // Add to activity buffer
      const activityRecord = {
        employee: employeeId, // Use 'employee' field name as required by schema
        session_id: sessionId, // Use 'session_id' field name as required by schema
        timestamp: new Date(activity.timestamp),
        active_application: {
          url: activity.url,
          title: activity.title,
          name: activity.userAgent
        },
        metadata: {
          domain: activity.domain,
          path: activity.path,
          isActive: activity.isActive,
          userAgent: activity.userAgent,
          activityType: 'browser_activity',
          source: 'client_monitoring'
        }
      };

      this.activityBuffer.get(employeeId).push(activityRecord);

      // Check if activity buffer is full
      if (this.activityBuffer.get(employeeId).length >= this.config.maxActivityBuffer) {
        await this.flushActivities(employeeId);
      }

      // Perform compliance check
      await this.checkActivityCompliance(employeeId, activity);

    } catch (error) {
      console.error('❌ Error handling activity update:', error);
    }
  }

  /**
   * Handle screenshot captured from client
   */
  async handleScreenshotCaptured(socket, data) {
    try {
      const { employeeId, sessionId, trigger, imageData, metadata } = data;

      console.log(`📸 Screenshot received from employee ${employeeId} (${trigger})`);

      // Validate required data
      if (!employeeId || !sessionId || !imageData || !metadata) {
        throw new Error('Missing required screenshot data');
      }

      // Convert base64 to buffer
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');

      // Prepare metadata for upload
      const uploadMetadata = {
        application: metadata.title || 'Unknown Application',
        url: metadata.url || 'unknown',
        violationType: trigger === 'violation' ? 'unauthorized_access' : undefined,
        aiConfidence: 0.8
      };

      // Upload to Cloudinary using appropriate function
      let uploadResult;
      if (trigger === 'violation') {
        uploadResult = await uploadViolationScreenshot(imageBuffer, employeeId, uploadMetadata);
      } else {
        uploadResult = await uploadRegularScreenshot(imageBuffer, employeeId, uploadMetadata);
      }

      console.log(`📤 Screenshot uploaded to Cloudinary: ${uploadResult.cloudinary_public_id}`);

      // Ensure timestamp is valid
      let validTimestamp;
      try {
        validTimestamp = metadata.timestamp ? new Date(metadata.timestamp) : new Date();
        if (isNaN(validTimestamp.getTime())) {
          validTimestamp = new Date();
        }
      } catch (error) {
        validTimestamp = new Date();
      }

      // Save to database
      const screenCapture = new ScreenCapture({
        employee: employeeId, // Use 'employee' field name as required by schema
        session_id: sessionId, // Use 'session_id' field name as required by schema
        file_path: uploadResult.cloudinary_url, // Use 'file_path' for the image URL
        file_size: uploadResult.file_size || imageBuffer.length, // Use 'file_size' as required
        file_hash: uploadResult.cloudinary_public_id, // Use 'file_hash' as required (using cloudinary ID as hash)
        capture_trigger: trigger === 'violation' ? 'unauthorized_access' : 'manual', // Map to valid enum values
        timestamp: validTimestamp,
        active_application: {
          url: metadata.url || 'unknown',
          title: metadata.title || 'Unknown Application',
          name: 'Browser'
        },
        screen_resolution: {
          width: uploadResult.width || metadata.width || 1920,
          height: uploadResult.height || metadata.height || 1080
        },
        metadata: {
          ...metadata,
          imageUrl: uploadResult.cloudinary_url, // Add imageUrl for backward compatibility
          cloudinary: {
            public_id: uploadResult.cloudinary_public_id,
            version: uploadResult.cloudinary_version,
            format: uploadResult.format,
            width: uploadResult.width,
            height: uploadResult.height,
            bytes: uploadResult.file_size
          },
          source: 'client_capture',
          intelligent_capture: true
        }
      });

      await screenCapture.save();

      // If this is a violation screenshot, perform AI analysis
      if (trigger === 'violation') {
        await this.analyzeViolationScreenshot(employeeId, screenCapture, metadata);
      }

      // Send acknowledgment
      socket.emit('screenshot-processed', {
        success: true,
        screenshotId: screenCapture._id,
        cloudinaryId: uploadResult.cloudinary_public_id,
        trigger
      });

    } catch (error) {
      console.error('❌ Error handling screenshot:', error);

      // Send detailed error information for debugging
      socket.emit('screenshot-error', {
        error: error.message,
        trigger: data?.trigger || 'unknown',
        details: {
          hasEmployeeId: !!data?.employeeId,
          hasSessionId: !!data?.sessionId,
          hasImageData: !!data?.imageData,
          hasMetadata: !!data?.metadata,
          metadataKeys: data?.metadata ? Object.keys(data.metadata) : []
        }
      });
    }
  }

  /**
   * Handle visibility changes
   */
  handleVisibilityChange(socket, data) {
    const { employeeId, isVisible, timestamp } = data;
    
    console.log(`👁️ Visibility change for employee ${employeeId}: ${isVisible ? 'visible' : 'hidden'}`);

    // Add to activity buffer
    const activityRecord = {
      employee: employeeId, // Use 'employee' field name as required by schema
      session_id: this.activeSessions.get(employeeId)?.sessionId || 'unknown', // Use 'session_id' field name
      timestamp: new Date(timestamp),
      metadata: {
        activityType: 'visibility_change',
        isVisible,
        source: 'client_monitoring'
      }
    };

    if (this.activityBuffer.has(employeeId)) {
      this.activityBuffer.get(employeeId).push(activityRecord);
    }
  }

  /**
   * Handle focus changes
   */
  handleFocusChange(socket, data) {
    const { employeeId, hasFocus, timestamp } = data;
    
    console.log(`🎯 Focus change for employee ${employeeId}: ${hasFocus ? 'focused' : 'blurred'}`);

    // Add to activity buffer
    const activityRecord = {
      employee: employeeId, // Use 'employee' field name as required by schema
      session_id: this.activeSessions.get(employeeId)?.sessionId || 'unknown', // Use 'session_id' field name
      timestamp: new Date(timestamp),
      metadata: {
        activityType: 'focus_change',
        hasFocus,
        source: 'client_monitoring'
      }
    };

    if (this.activityBuffer.has(employeeId)) {
      this.activityBuffer.get(employeeId).push(activityRecord);
    }
  }

  /**
   * Handle client disconnect
   */
  handleClientDisconnect(socket) {
    console.log('🔌 Client disconnected:', socket.id);

    // Find and clean up any sessions for this socket
    for (const [employeeId, session] of this.activeSessions.entries()) {
      if (session.socketId === socket.id) {
        console.log(`🧹 Cleaning up session for employee ${employeeId}`);
        this.flushActivities(employeeId);
        this.activeSessions.delete(employeeId);
        break;
      }
    }
  }

  /**
   * Check activity compliance against whitelist
   */
  async checkActivityCompliance(employeeId, activity) {
    try {
      // Check against whitelist first
      const whitelistEntry = await WebsiteWhitelist.findOne({
        $or: [
          { url: activity.url },
          { domain: activity.domain },
          { url: new RegExp(activity.domain.replace(/\./g, '\\.'), 'i') }
        ]
      });

      const isWhitelisted = !!whitelistEntry;

      // If whitelisted, allow it
      if (isWhitelisted) {
        console.log(`✅ Whitelisted activity: ${activity.url}`);
        return;
      }

      // Check if it's explicitly a violation (social media, games, entertainment)
      const isExplicitViolation = this.isExplicitViolation(activity);

      // Check if it's work-related
      const isWorkRelated = this.isWorkRelatedActivity(activity);

      // Trigger violation if it's explicitly a violation OR if it's not work-related
      if (isExplicitViolation || !isWorkRelated) {
        const violationType = isExplicitViolation ? 'explicit_violation' : 'non_work_activity';
        await this.handlePotentialViolation(employeeId, activity, violationType);
      } else {
        console.log(`✅ Work-related activity allowed: ${activity.url}`);
      }

    } catch (error) {
      console.error('❌ Error checking activity compliance:', error);
    }
  }

  /**
   * Check if activity is explicitly a policy violation
   * (Social media, gaming, entertainment, etc.)
   */
  isExplicitViolation(activity) {
    const violationDomains = [
      // Social Media
      'facebook.com',
      'instagram.com',
      'twitter.com',
      'x.com',
      'tiktok.com',
      'snapchat.com',
      'linkedin.com', // Can be work-related but often personal
      'pinterest.com',
      'reddit.com',
      'tumblr.com',
      'discord.com',
      'whatsapp.com',
      'telegram.org',

      // Entertainment & Video
      'youtube.com',
      'netflix.com',
      'hulu.com',
      'disney.com',
      'disneyplus.com',
      'amazon.com/prime',
      'twitch.tv',
      'vimeo.com',
      'dailymotion.com',
      'tiktok.com',

      // Gaming
      'steam.com',
      'steamcommunity.com',
      'epicgames.com',
      'battle.net',
      'blizzard.com',
      'roblox.com',
      'minecraft.net',
      'ea.com',
      'ubisoft.com',
      'rockstargames.com',
      'playstation.com',
      'xbox.com',
      'nintendo.com',
      'itch.io',
      'gog.com',

      // News & Entertainment (non-work)
      'buzzfeed.com',
      '9gag.com',
      'imgur.com',
      'meme',
      'funny',

      // Shopping (personal)
      'amazon.com', // General Amazon (not AWS)
      'ebay.com',
      'etsy.com',
      'alibaba.com',
      'aliexpress.com',
      'walmart.com',
      'target.com',
      'bestbuy.com',

      // Dating
      'tinder.com',
      'bumble.com',
      'match.com',
      'okcupid.com',
      'pof.com',

      // Adult Content (add more as needed)
      'pornhub.com',
      'xvideos.com',
      'xhamster.com',
      'redtube.com',
      'youporn.com'
    ];

    const violationKeywords = [
      'game', 'gaming', 'play', 'casino', 'bet', 'gambling',
      'social', 'chat', 'dating', 'meme', 'funny', 'entertainment',
      'stream', 'video', 'movie', 'tv', 'series', 'anime',
      'shop', 'buy', 'sale', 'deal', 'coupon', 'fashion',
      'adult', 'xxx', 'porn', 'sex'
    ];

    // Check domain against violation list
    const domain = activity.domain.toLowerCase();
    const url = activity.url.toLowerCase();
    const title = (activity.title || '').toLowerCase();

    // Direct domain match
    if (violationDomains.some(vDomain => domain.includes(vDomain))) {
      console.log(`🚨 Explicit violation detected - Domain: ${domain}`);
      return true;
    }

    // URL path check for specific patterns
    if (url.includes('youtube.com/watch') ||
        url.includes('facebook.com/') ||
        url.includes('instagram.com/') ||
        url.includes('twitter.com/') ||
        url.includes('x.com/') ||
        url.includes('tiktok.com/') ||
        url.includes('reddit.com/r/') ||
        url.includes('twitch.tv/') ||
        url.includes('netflix.com/watch') ||
        url.includes('amazon.com/gp/video') ||
        url.includes('steam.com/app/')) {
      console.log(`🚨 Explicit violation detected - URL pattern: ${url}`);
      return true;
    }

    // Keyword check in URL or title
    if (violationKeywords.some(keyword =>
        url.includes(keyword) || title.includes(keyword))) {
      console.log(`🚨 Explicit violation detected - Keyword match: ${url} | ${title}`);
      return true;
    }

    return false;
  }

  /**
   * Determine if activity is work-related
   */
  isWorkRelatedActivity(activity) {
    const workDomains = [
      // Development & Programming
      'github.com',
      'gitlab.com',
      'bitbucket.org',
      'stackoverflow.com',
      'stackexchange.com',
      'developer.mozilla.org',
      'w3schools.com',
      'codepen.io',
      'jsfiddle.net',

      // Communication & Collaboration
      'slack.com',
      'teams.microsoft.com',
      'zoom.us',
      'meet.google.com',
      'webex.com',
      'gotomeeting.com',
      'skype.com',

      // Google Workspace (specific work tools)
      'docs.google.com',
      'sheets.google.com',
      'slides.google.com',
      'drive.google.com',
      'calendar.google.com',
      'gmail.com',

      // Microsoft Office
      'office.com',
      'outlook.com',
      'onedrive.com',
      'sharepoint.com',

      // Cloud Services & Tools
      'aws.amazon.com',
      'console.aws.amazon.com',
      'azure.microsoft.com',
      'cloud.google.com',
      'heroku.com',
      'vercel.com',
      'netlify.com',

      // Design & Creative Tools
      'figma.com',
      'canva.com',
      'adobe.com',
      'sketch.com',

      // Project Management
      'trello.com',
      'asana.com',
      'monday.com',
      'notion.so',
      'airtable.com',
      'jira.atlassian.com',

      // Documentation & Learning
      'confluence.atlassian.com',
      'wiki.',
      'documentation',
      'docs.',
      'api.',

      // Development environments
      'localhost',
      '127.0.0.1',
      'infiverse',
      'workflowmanager',
      'vercel.app'
    ];

    const workKeywords = [
      'api', 'documentation', 'docs', 'tutorial', 'guide',
      'development', 'programming', 'code', 'software',
      'project', 'task', 'meeting', 'conference', 'webinar',
      'dashboard', 'admin', 'management', 'analytics',
      'business', 'enterprise', 'corporate', 'professional'
    ];

    const domain = activity.domain.toLowerCase();
    const url = activity.url.toLowerCase();
    const title = (activity.title || '').toLowerCase();

    // Check if it's the application itself
    if (activity.url && (
      activity.url.includes('localhost') ||
      activity.url.includes('127.0.0.1') ||
      activity.url.includes('infiverse') ||
      activity.url.includes('workflowmanager') ||
      activity.url.includes('vercel.app')
    )) {
      return true;
    }

    // Direct domain match
    if (workDomains.some(wDomain => domain.includes(wDomain))) {
      return true;
    }

    // Keyword check in URL or title
    if (workKeywords.some(keyword =>
        url.includes(keyword) || title.includes(keyword))) {
      return true;
    }

    // Special case for Google - only allow specific work-related paths
    if (domain.includes('google.com')) {
      if (url.includes('docs.google.com') ||
          url.includes('sheets.google.com') ||
          url.includes('slides.google.com') ||
          url.includes('drive.google.com') ||
          url.includes('calendar.google.com') ||
          url.includes('gmail.com') ||
          url.includes('meet.google.com') ||
          url.includes('cloud.google.com') ||
          url.includes('console.cloud.google.com')) {
        return true;
      }
      // Regular google.com searches might be work-related, allow them
      if (url.includes('google.com/search')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Handle potential policy violation
   */
  async handlePotentialViolation(employeeId, activity, violationType = 'unauthorized_website') {
    try {
      const session = this.activeSessions.get(employeeId);
      if (!session) return;

      // Check violation cooldown
      const now = Date.now();
      if (session.lastViolationTime &&
          (now - session.lastViolationTime) < this.config.violationCooldown) {
        console.log(`⏰ Employee ${employeeId} in violation cooldown, skipping`);
        return;
      }

      console.log(`🚨 ${violationType.toUpperCase()} violation detected for employee ${employeeId}: ${activity.url}`);

      // Update violation tracking
      session.violationCount++;
      session.lastViolationTime = now;

      // Request violation screenshot from client
      const socket = global.io?.to(`employee:${employeeId}`);
      if (socket) {
        socket.emit('monitoring-request', {
          action: 'capture_violation',
          reason: violationType,
          url: activity.url,
          domain: activity.domain,
          title: activity.title,
          timestamp: new Date().toISOString()
        });
      }

      // Create monitoring alert with appropriate type and severity
      const alertConfig = this.getAlertConfig(violationType, activity);

      const alert = new MonitoringAlert({
        employee: employeeId, // Use 'employee' field name as required by schema
        alert_type: alertConfig.type, // Use 'alert_type' field name as required by schema
        title: alertConfig.title, // Add required 'title' field
        description: alertConfig.description,
        severity: alertConfig.severity,
        session_id: session.sessionId,
        data: {
          website_url: activity.url,
          violation_type: violationType,
          activity_data: {
            url: activity.url,
            title: activity.title,
            domain: activity.domain,
            timestamp: activity.timestamp,
            source: 'client_monitoring'
          }
        }
      });

      await alert.save();

    } catch (error) {
      console.error('❌ Error handling potential violation:', error);
    }
  }

  /**
   * Get alert configuration based on violation type
   */
  getAlertConfig(violationType, activity) {
    const domain = activity.domain.toLowerCase();
    const url = activity.url.toLowerCase();

    // Social Media violations
    if (domain.includes('facebook.com') || domain.includes('instagram.com') ||
        domain.includes('twitter.com') || domain.includes('x.com') ||
        domain.includes('tiktok.com') || domain.includes('snapchat.com')) {
      return {
        type: 'social_media_access',
        title: 'Social Media Access Detected',
        description: `Employee accessed social media platform: ${activity.domain}`,
        severity: 'high'
      };
    }

    // Gaming violations
    if (domain.includes('steam.com') || domain.includes('epicgames.com') ||
        domain.includes('battle.net') || domain.includes('roblox.com') ||
        domain.includes('minecraft.net') || url.includes('game')) {
      return {
        type: 'gaming_access',
        title: 'Gaming Platform Access Detected',
        description: `Employee accessed gaming platform: ${activity.domain}`,
        severity: 'high'
      };
    }

    // Entertainment violations
    if (domain.includes('youtube.com') || domain.includes('netflix.com') ||
        domain.includes('twitch.tv') || domain.includes('hulu.com')) {
      return {
        type: 'entertainment_access',
        title: 'Entertainment Platform Access Detected',
        description: `Employee accessed entertainment platform: ${activity.domain}`,
        severity: 'medium'
      };
    }

    // Shopping violations
    if (domain.includes('amazon.com') || domain.includes('ebay.com') ||
        domain.includes('etsy.com') || domain.includes('walmart.com')) {
      return {
        type: 'shopping_access',
        title: 'Shopping Website Access Detected',
        description: `Employee accessed shopping website: ${activity.domain}`,
        severity: 'medium'
      };
    }

    // Adult content violations
    if (domain.includes('pornhub.com') || domain.includes('xvideos.com') ||
        url.includes('adult') || url.includes('xxx')) {
      return {
        type: 'inappropriate_content',
        title: 'Inappropriate Content Access Detected',
        description: `Employee accessed inappropriate content: ${activity.domain}`,
        severity: 'critical'
      };
    }

    // Default violation
    return {
      type: 'unauthorized_website',
      title: 'Unauthorized Website Access',
      description: `Employee accessed unauthorized website: ${activity.url}`,
      severity: 'medium'
    };
  }

  /**
   * Analyze violation screenshot with AI
   */
  async analyzeViolationScreenshot(employeeId, screenCapture, metadata) {
    try {
      console.log(`🤖 Analyzing violation screenshot for employee ${employeeId}`);

      // Perform OCR analysis if available
      let ocrText = '';
      try {
        if (ocrAnalysisService && typeof ocrAnalysisService.analyzeImage === 'function') {
          ocrText = await ocrAnalysisService.analyzeImage(screenCapture.file_path);
        }
      } catch (ocrError) {
        console.warn('⚠️ OCR analysis failed:', ocrError.message);
      }

      // Perform AI analysis if available
      let aiAnalysis = {
        confidence: 0.5,
        isViolation: true,
        violationType: 'unauthorized_access',
        description: 'Policy violation detected'
      };

      try {
        if (groqAIService && typeof groqAIService.analyzeViolationScreenshot === 'function') {
          aiAnalysis = await groqAIService.analyzeViolationScreenshot({
            imageUrl: screenCapture.file_path, // Use file_path which contains the image URL
            ocrText,
            metadata: {
              url: metadata.url,
              title: metadata.title,
              timestamp: metadata.timestamp,
              employeeId
            }
          });
        }
      } catch (aiError) {
        console.warn('⚠️ AI analysis failed:', aiError.message);
      }

      // Update screen capture with analysis results
      screenCapture.metadata.ai_analysis = {
        confidence: aiAnalysis.confidence,
        activityType: aiAnalysis.isViolation ? 'violation' : 'normal',
        activityDescription: aiAnalysis.description,
        alertReason: aiAnalysis.violationType
      };

      screenCapture.metadata.ocr_analysis = {
        text: ocrText,
        confidence: 0.8, // Default confidence
        extractedAt: new Date()
      };

      await screenCapture.save();

      console.log(`✅ AI analysis completed for employee ${employeeId}:`, {
        confidence: aiAnalysis.confidence,
        isViolation: aiAnalysis.isViolation,
        violationType: aiAnalysis.violationType
      });

    } catch (error) {
      console.error('❌ Error analyzing violation screenshot:', error);
    }
  }

  /**
   * Flush activities to database
   */
  async flushActivities(employeeId) {
    try {
      const activities = this.activityBuffer.get(employeeId);
      if (!activities || activities.length === 0) {
        return;
      }

      console.log(`💾 Flushing ${activities.length} activities for employee ${employeeId}`);

      // Save activities to database
      await EmployeeActivity.insertMany(activities);

      // Clear buffer
      this.activityBuffer.set(employeeId, []);

      console.log(`✅ Flushed ${activities.length} activities for employee ${employeeId}`);

    } catch (error) {
      console.error('❌ Error flushing activities:', error);
    }
  }

  /**
   * Start periodic activity flushing
   */
  startActivityFlushing() {
    setInterval(async () => {
      for (const employeeId of this.activityBuffer.keys()) {
        await this.flushActivities(employeeId);
      }
    }, this.config.activityFlushInterval);

    console.log('⏰ Periodic activity flushing started');
  }

  /**
   * Get active monitoring sessions
   */
  getActiveSessions() {
    const sessions = [];
    for (const [employeeId, session] of this.activeSessions.entries()) {
      sessions.push({
        employeeId,
        sessionId: session.sessionId,
        startTime: session.startTime,
        capabilities: session.capabilities,
        lastActivity: session.lastActivity,
        violationCount: session.violationCount,
        activityBufferSize: this.activityBuffer.get(employeeId)?.length || 0
      });
    }
    return sessions;
  }

  /**
   * Send monitoring request to specific employee
   */
  sendMonitoringRequest(employeeId, action, data = {}) {
    try {
      const socket = global.io?.to(`employee:${employeeId}`);
      if (socket) {
        socket.emit('monitoring-request', {
          action,
          ...data,
          timestamp: new Date().toISOString()
        });
        console.log(`📡 Sent monitoring request to employee ${employeeId}:`, action);
        return true;
      } else {
        console.warn(`⚠️ No socket connection for employee ${employeeId}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Error sending monitoring request:', error);
      return false;
    }
  }

  /**
   * Get monitoring statistics
   */
  getStatistics() {
    const stats = {
      activeSessions: this.activeSessions.size,
      totalActivityBuffer: 0,
      sessionDetails: []
    };

    for (const [employeeId, session] of this.activeSessions.entries()) {
      const bufferSize = this.activityBuffer.get(employeeId)?.length || 0;
      stats.totalActivityBuffer += bufferSize;

      stats.sessionDetails.push({
        employeeId,
        sessionDuration: Date.now() - session.startTime.getTime(),
        violationCount: session.violationCount,
        activityBufferSize: bufferSize,
        hasScreenCapture: session.capabilities?.screenCapture || false
      });
    }

    return stats;
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    // Flush all remaining activities
    for (const employeeId of this.activityBuffer.keys()) {
      this.flushActivities(employeeId);
    }

    // Clear all data
    this.activeSessions.clear();
    this.activityBuffer.clear();
    this.violationSessions.clear();

    console.log('🧹 Client monitoring handler cleaned up');
  }
}

// Export singleton instance
const clientMonitoringHandler = new ClientMonitoringHandler();
module.exports = clientMonitoringHandler;
