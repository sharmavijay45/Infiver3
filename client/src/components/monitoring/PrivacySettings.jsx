import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { 
  Shield, 
  Eye, 
  Camera, 
  Activity, 
  Clock, 
  Lock, 
  AlertTriangle,
  CheckCircle,
  Info
} from 'lucide-react';
import { useClientMonitoring } from '../../hooks/useClientMonitoring';
import { useToast } from '../../hooks/use-toast';

/**
 * Privacy Settings Component
 * Allows users to control monitoring preferences and view privacy information
 */
export function PrivacySettings() {
  const { 
    isActive, 
    isInitialized, 
    hasPermissions,
    startMonitoring, 
    stopMonitoring,
    getMonitoringStatus 
  } = useClientMonitoring();
  
  const { toast } = useToast();
  
  const [privacySettings, setPrivacySettings] = useState({
    allowScreenCapture: true,
    allowActivityTracking: true,
    allowUrlMonitoring: true,
    notifyOnViolations: true,
    dataRetentionDays: 30
  });

  const [showDataPolicy, setShowDataPolicy] = useState(false);

  useEffect(() => {
    // Load privacy settings from localStorage
    const savedSettings = localStorage.getItem('monitoringPrivacySettings');
    if (savedSettings) {
      try {
        setPrivacySettings(JSON.parse(savedSettings));
      } catch (error) {
        console.error('Failed to load privacy settings:', error);
      }
    }
  }, []);

  const handleSettingChange = (setting, value) => {
    const newSettings = { ...privacySettings, [setting]: value };
    setPrivacySettings(newSettings);
    
    // Save to localStorage
    localStorage.setItem('monitoringPrivacySettings', JSON.stringify(newSettings));
    
    toast({
      title: 'Privacy Setting Updated',
      description: `${setting.replace(/([A-Z])/g, ' $1').toLowerCase()} has been ${value ? 'enabled' : 'disabled'}.`,
    });
  };

  const handleToggleMonitoring = async () => {
    try {
      if (isActive) {
        await stopMonitoring();
      } else {
        await startMonitoring();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const getPrivacyLevel = () => {
    const enabledCount = Object.values(privacySettings).filter(v => v === true).length;
    if (enabledCount >= 4) return { level: 'Standard', color: 'bg-blue-500' };
    if (enabledCount >= 2) return { level: 'Moderate', color: 'bg-yellow-500' };
    return { level: 'Minimal', color: 'bg-green-500' };
  };

  const privacyLevel = getPrivacyLevel();

  return (
    <div className="space-y-6">
      {/* Privacy Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Privacy & Monitoring Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Status */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
              <div>
                <p className="font-medium">Monitoring Status</p>
                <p className="text-sm text-slate-600">
                  {isActive ? 'Active - Your activity is being monitored' : 'Inactive - No monitoring in progress'}
                </p>
              </div>
            </div>
            <Button
              variant={isActive ? "destructive" : "default"}
              onClick={handleToggleMonitoring}
              disabled={!isInitialized}
            >
              {isActive ? 'Stop Monitoring' : 'Start Monitoring'}
            </Button>
          </div>

          {/* Privacy Level */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              <span className="font-medium">Privacy Level</span>
            </div>
            <Badge className={`${privacyLevel.color} text-white`}>
              {privacyLevel.level}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Monitoring Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Monitoring Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Screen Capture */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Camera className="h-4 w-4 text-slate-600" />
              <div>
                <p className="font-medium">Screen Capture</p>
                <p className="text-sm text-slate-600">
                  Allow capturing screenshots for policy violations
                </p>
              </div>
            </div>
            <Switch
              checked={privacySettings.allowScreenCapture}
              onCheckedChange={(checked) => handleSettingChange('allowScreenCapture', checked)}
            />
          </div>

          <Separator />

          {/* Activity Tracking */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="h-4 w-4 text-slate-600" />
              <div>
                <p className="font-medium">Activity Tracking</p>
                <p className="text-sm text-slate-600">
                  Track window focus and application usage
                </p>
              </div>
            </div>
            <Switch
              checked={privacySettings.allowActivityTracking}
              onCheckedChange={(checked) => handleSettingChange('allowActivityTracking', checked)}
            />
          </div>

          <Separator />

          {/* URL Monitoring */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Eye className="h-4 w-4 text-slate-600" />
              <div>
                <p className="font-medium">Website Monitoring</p>
                <p className="text-sm text-slate-600">
                  Monitor visited websites and URLs
                </p>
              </div>
            </div>
            <Switch
              checked={privacySettings.allowUrlMonitoring}
              onCheckedChange={(checked) => handleSettingChange('allowUrlMonitoring', checked)}
            />
          </div>

          <Separator />

          {/* Violation Notifications */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-4 w-4 text-slate-600" />
              <div>
                <p className="font-medium">Violation Notifications</p>
                <p className="text-sm text-slate-600">
                  Receive notifications when policy violations are detected
                </p>
              </div>
            </div>
            <Switch
              checked={privacySettings.notifyOnViolations}
              onCheckedChange={(checked) => handleSettingChange('notifyOnViolations', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Data & Privacy Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Data & Privacy Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-blue-800">Data Protection</span>
              </div>
              <p className="text-sm text-blue-700">
                All monitoring data is encrypted and stored securely. Access is restricted to authorized personnel only.
              </p>
            </div>

            <div className="p-4 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-green-600" />
                <span className="font-medium text-green-800">Data Retention</span>
              </div>
              <p className="text-sm text-green-700">
                Monitoring data is automatically deleted after {privacySettings.dataRetentionDays} days.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => setShowDataPolicy(!showDataPolicy)}
            className="w-full"
          >
            {showDataPolicy ? 'Hide' : 'View'} Full Privacy Policy
          </Button>

          {showDataPolicy && (
            <div className="p-4 bg-slate-50 rounded-lg text-sm space-y-2">
              <h4 className="font-medium">Employee Monitoring Privacy Policy</h4>
              <p>
                <strong>Data Collection:</strong> We collect screen activity, website visits, and application usage data solely for productivity monitoring and security purposes.
              </p>
              <p>
                <strong>Data Usage:</strong> Collected data is used to ensure compliance with company policies, improve productivity, and maintain security standards.
              </p>
              <p>
                <strong>Data Sharing:</strong> Monitoring data is never shared with third parties and is accessible only to authorized management personnel.
              </p>
              <p>
                <strong>Your Rights:</strong> You have the right to request access to your monitoring data and can adjust privacy settings at any time.
              </p>
              <p>
                <strong>Contact:</strong> For privacy concerns, contact your HR department or system administrator.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default PrivacySettings;
