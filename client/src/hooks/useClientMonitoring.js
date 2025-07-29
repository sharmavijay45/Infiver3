import { useState, useEffect, useCallback } from 'react';
import { useSocketContext } from '../context/socket-context';
import clientMonitoringService from '../services/clientMonitoring';
import { useToast } from './use-toast';

/**
 * React hook for client-side monitoring integration
 */
export function useClientMonitoring() {
  const { socket, isConnected } = useSocketContext();
  const { toast } = useToast();
  
  const [monitoringState, setMonitoringState] = useState({
    isActive: false,
    isInitialized: false,
    hasPermissions: false,
    employeeId: null,
    sessionId: null,
    lastActivity: null,
    error: null
  });

  /**
   * Initialize monitoring service
   */
  const initializeMonitoring = useCallback(async (employeeId) => {
    try {
      if (!socket || !isConnected) {
        throw new Error('Socket connection not available');
      }

      console.log('🔧 Initializing client monitoring for employee:', employeeId);

      const success = await clientMonitoringService.initialize(socket, employeeId);
      
      if (success) {
        setMonitoringState(prev => ({
          ...prev,
          isInitialized: true,
          hasPermissions: true,
          employeeId,
          sessionId: clientMonitoringService.sessionId,
          error: null
        }));

        toast({
          title: 'Monitoring Initialized',
          description: 'Client-side monitoring has been set up successfully.',
        });

        return true;
      } else {
        throw new Error('Failed to initialize monitoring service');
      }
    } catch (error) {
      console.error('❌ Failed to initialize monitoring:', error);
      
      setMonitoringState(prev => ({
        ...prev,
        isInitialized: false,
        hasPermissions: false,
        error: error.message
      }));

      toast({
        title: 'Monitoring Setup Failed',
        description: error.message,
        variant: 'destructive'
      });

      return false;
    }
  }, [socket, isConnected, toast]);

  /**
   * Start monitoring session
   */
  const startMonitoring = useCallback(async () => {
    try {
      if (!monitoringState.isInitialized) {
        throw new Error('Monitoring not initialized. Call initializeMonitoring first.');
      }

      await clientMonitoringService.startMonitoring();
      
      setMonitoringState(prev => ({
        ...prev,
        isActive: true,
        error: null
      }));

      toast({
        title: 'Monitoring Started',
        description: 'Your activity is now being monitored.',
      });

      return true;
    } catch (error) {
      console.error('❌ Failed to start monitoring:', error);
      
      setMonitoringState(prev => ({
        ...prev,
        error: error.message
      }));

      toast({
        title: 'Failed to Start Monitoring',
        description: error.message,
        variant: 'destructive'
      });

      return false;
    }
  }, [monitoringState.isInitialized, toast]);

  /**
   * Stop monitoring session
   */
  const stopMonitoring = useCallback(() => {
    try {
      clientMonitoringService.stopMonitoring();
      
      setMonitoringState(prev => ({
        ...prev,
        isActive: false,
        error: null
      }));

      toast({
        title: 'Monitoring Stopped',
        description: 'Activity monitoring has been stopped.',
      });

      return true;
    } catch (error) {
      console.error('❌ Failed to stop monitoring:', error);
      
      setMonitoringState(prev => ({
        ...prev,
        error: error.message
      }));

      return false;
    }
  }, [toast]);

  /**
   * Trigger violation screenshot
   */
  const triggerViolationScreenshot = useCallback(async (reason = 'policy_violation') => {
    try {
      if (!monitoringState.isActive) {
        throw new Error('Monitoring is not active');
      }

      const screenshot = await clientMonitoringService.triggerViolationScreenshot(reason);
      
      if (screenshot) {
        toast({
          title: 'Violation Detected',
          description: 'A policy violation screenshot has been captured.',
          variant: 'destructive'
        });
      }

      return screenshot;
    } catch (error) {
      console.error('❌ Failed to capture violation screenshot:', error);
      return null;
    }
  }, [monitoringState.isActive, toast]);

  /**
   * Get current monitoring status
   */
  const getMonitoringStatus = useCallback(() => {
    return {
      ...monitoringState,
      serviceStatus: clientMonitoringService.getStatus()
    };
  }, [monitoringState]);

  /**
   * Check if monitoring is supported in current browser
   */
  const isMonitoringSupported = useCallback(() => {
    const hasScreenCapture = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
    const hasVisibilityAPI = typeof document.hidden !== 'undefined';
    const hasHistoryAPI = !!(window.history && window.history.pushState);

    return {
      isSupported: hasScreenCapture && hasVisibilityAPI && hasHistoryAPI,
      features: {
        screenCapture: hasScreenCapture,
        visibilityAPI: hasVisibilityAPI,
        historyAPI: hasHistoryAPI
      }
    };
  }, []);

  /**
   * Auto-initialize monitoring when socket connects and user is available
   */
  useEffect(() => {
    const autoInitialize = async () => {
      if (socket && isConnected && !monitoringState.isInitialized) {
        // Get user data from localStorage
        const userData = localStorage.getItem('WorkflowUser');
        if (userData) {
          try {
            const user = JSON.parse(userData);
            if (user.id) {
              console.log('🔄 Auto-initializing monitoring for user:', user.id);
              await initializeMonitoring(user.id);
            }
          } catch (error) {
            console.error('❌ Failed to parse user data for auto-initialization:', error);
          }
        }
      }
    };

    autoInitialize();
  }, [socket, isConnected, monitoringState.isInitialized, initializeMonitoring]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (monitoringState.isActive) {
        clientMonitoringService.stopMonitoring();
      }
      clientMonitoringService.cleanup();
    };
  }, []);

  /**
   * Listen for server-side monitoring requests
   */
  useEffect(() => {
    if (!socket) return;

    const handleMonitoringRequest = (data) => {
      console.log('📡 Received monitoring request from server:', data);
      
      if (data.action === 'start' && !monitoringState.isActive) {
        startMonitoring();
      } else if (data.action === 'stop' && monitoringState.isActive) {
        stopMonitoring();
      } else if (data.action === 'capture_violation') {
        triggerViolationScreenshot(data.reason);
      }
    };

    socket.on('monitoring-request', handleMonitoringRequest);

    return () => {
      socket.off('monitoring-request', handleMonitoringRequest);
    };
  }, [socket, monitoringState.isActive, startMonitoring, stopMonitoring, triggerViolationScreenshot]);

  return {
    // State
    ...monitoringState,
    
    // Actions
    initializeMonitoring,
    startMonitoring,
    stopMonitoring,
    triggerViolationScreenshot,
    
    // Utilities
    getMonitoringStatus,
    isMonitoringSupported
  };
}

export default useClientMonitoring;
