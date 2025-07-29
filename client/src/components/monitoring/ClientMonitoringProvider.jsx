import React, { useEffect } from 'react';
import { useClientMonitoring } from '../../hooks/useClientMonitoring';

/**
 * Client Monitoring Provider Component
 * Handles automatic initialization and startup of client monitoring
 * Must be rendered inside SocketProvider and AuthProvider
 */
export function ClientMonitoringProvider({ children }) {
  const {
    isActive: isMonitoringActive,
    isInitialized: isMonitoringInitialized,
    initializeMonitoring,
    startMonitoring
  } = useClientMonitoring();

  // Auto-start client monitoring for employees (not admins)
  useEffect(() => {
    const autoStartMonitoring = async () => {
      // Get user data from localStorage
      const userData = localStorage.getItem('WorkflowUser');
      if (!userData) {
        console.log('📋 No user data available, skipping monitoring initialization');
        return;
      }

      try {
        const user = JSON.parse(userData);

        // Only start monitoring for employees, not admins
        if (user?.id && user?.role !== 'Admin') {
          if (isMonitoringInitialized && !isMonitoringActive) {
            console.log('🚀 Auto-starting client monitoring for employee:', user.id);
            try {
              await startMonitoring();
              console.log('✅ Client monitoring started automatically');
            } catch (error) {
              console.error('❌ Failed to auto-start monitoring:', error);
            }
          } else if (!isMonitoringInitialized) {
            console.log('⏳ Waiting for monitoring to initialize for employee:', user.id);
          }
        } else if (user?.role === 'Admin') {
          console.log('👑 Admin user detected, skipping client monitoring');
        } else {
          console.log('❓ User role not recognized, skipping monitoring');
        }
      } catch (error) {
        console.error('❌ Failed to parse user data for monitoring:', error);
      }
    };

    autoStartMonitoring();
  }, [isMonitoringInitialized, isMonitoringActive, startMonitoring]);

  // Just render children - this component only handles monitoring logic
  return <>{children}</>;
}

export default ClientMonitoringProvider;
