import React from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Eye, EyeOff, Camera, Activity, Shield, AlertTriangle } from 'lucide-react';
import { useClientMonitoring } from '../../hooks/useClientMonitoring';
import { useToast } from '../../hooks/use-toast';

/**
 * Monitoring Status Indicator Component
 * Shows current monitoring status and allows user control
 */
export function MonitoringStatusIndicator({ className = "" }) {
  const { 
    isActive, 
    isInitialized, 
    hasPermissions, 
    error,
    startMonitoring, 
    stopMonitoring,
    getMonitoringStatus,
    isMonitoringSupported
  } = useClientMonitoring();
  
  const { toast } = useToast();
  const supportInfo = isMonitoringSupported();

  const handleToggleMonitoring = async () => {
    try {
      if (isActive) {
        await stopMonitoring();
      } else {
        await startMonitoring();
      }
    } catch (error) {
      toast({
        title: 'Monitoring Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const getStatusColor = () => {
    if (error) return 'destructive';
    if (isActive) return 'default';
    if (isInitialized) return 'secondary';
    return 'outline';
  };

  const getStatusText = () => {
    if (error) return 'Error';
    if (isActive) return 'Active';
    if (isInitialized) return 'Ready';
    return 'Inactive';
  };

  const getStatusIcon = () => {
    if (error) return <AlertTriangle className="h-4 w-4" />;
    if (isActive) return <Eye className="h-4 w-4" />;
    return <EyeOff className="h-4 w-4" />;
  };

  // Don't show for unsupported browsers
  if (!supportInfo.isSupported) {
    return (
      <Card className={`border-yellow-200 bg-yellow-50 ${className}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-yellow-800">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">
              Monitoring not supported in this browser
            </span>
          </div>
          <div className="mt-2 text-xs text-yellow-600">
            Missing features: {Object.entries(supportInfo.features)
              .filter(([, supported]) => !supported)
              .map(([feature]) => feature)
              .join(', ')}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border-slate-200 ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <span className="text-sm font-medium">Employee Monitoring</span>
            </div>
            
            <Badge variant={getStatusColor()} className="text-xs">
              {getStatusText()}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {/* Monitoring features indicators */}
            <div className="flex items-center gap-1">
              {hasPermissions && (
                <div className="flex items-center gap-1 text-xs text-green-600">
                  <Camera className="h-3 w-3" />
                  <span>Screen</span>
                </div>
              )}
              
              {isActive && (
                <div className="flex items-center gap-1 text-xs text-blue-600">
                  <Activity className="h-3 w-3" />
                  <span>Activity</span>
                </div>
              )}
            </div>

            {/* Control button */}
            {isInitialized && (
              <Button
                size="sm"
                variant={isActive ? "destructive" : "default"}
                onClick={handleToggleMonitoring}
                className="text-xs"
              >
                {isActive ? 'Stop' : 'Start'}
              </Button>
            )}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Status details */}
        {isActive && (
          <div className="mt-3 text-xs text-slate-600">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Shield className="h-3 w-3" />
                <span>Privacy protected</span>
              </div>
              <div className="flex items-center gap-1">
                <Activity className="h-3 w-3" />
                <span>Real-time tracking</span>
              </div>
            </div>
          </div>
        )}

        {/* Information for inactive state */}
        {!isActive && isInitialized && (
          <div className="mt-2 text-xs text-slate-500">
            Click "Start" to begin activity monitoring. Your privacy is protected.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Compact monitoring status indicator for header/navbar
 */
export function CompactMonitoringIndicator({ className = "" }) {
  const { isActive, error } = useClientMonitoring();

  if (error) {
    return (
      <Badge variant="destructive" className={`text-xs ${className}`}>
        <AlertTriangle className="h-3 w-3 mr-1" />
        Monitor Error
      </Badge>
    );
  }

  if (isActive) {
    return (
      <Badge variant="default" className={`text-xs bg-green-600 ${className}`}>
        <Eye className="h-3 w-3 mr-1" />
        Monitoring
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={`text-xs ${className}`}>
      <EyeOff className="h-3 w-3 mr-1" />
      Inactive
    </Badge>
  );
}

export default MonitoringStatusIndicator;
