# 🗑️ Monitoring Data Cleanup API

## 📋 **Overview**

Two new API endpoints have been added to completely clean up all monitoring data from the database and in-memory storage. These endpoints are useful for testing, development, and data management.

## 🔗 **API Endpoints**

### **1. Delete ALL Monitoring Data**
```
DELETE /api/monitoring/cleanup/all
```

**Description**: Deletes all monitoring data for all employees from the database and clears in-memory storage.

**Authentication**: ❌ **NOT REQUIRED** - No token needed

**Response Example**:
```json
{
  "success": true,
  "message": "All monitoring data has been successfully deleted",
  "results": {
    "totalDeleted": 1247,
    "breakdown": {
      "employeeActivities": 856,
      "screenCaptures": 234,
      "monitoringAlerts": 89,
      "workSessions": 68
    },
    "errors": [],
    "timestamp": "2025-07-29T10:30:45.123Z"
  }
}
```

### **2. Delete Monitoring Data for Specific Employee**
```
DELETE /api/monitoring/cleanup/employee/:employeeId
```

**Description**: Deletes all monitoring data for a specific employee only.

**Parameters**:
- `employeeId` (path parameter): The ID of the employee whose data should be deleted

**Authentication**: ❌ **NOT REQUIRED** - No token needed

**Response Example**:
```json
{
  "success": true,
  "message": "All monitoring data for employee 683011a017ba6ac0f84fb39b has been successfully deleted",
  "employeeId": "683011a017ba6ac0f84fb39b",
  "results": {
    "totalDeleted": 156,
    "breakdown": {
      "employeeActivities": 89,
      "screenCaptures": 45,
      "monitoringAlerts": 12,
      "workSessions": 10
    },
    "errors": [],
    "timestamp": "2025-07-29T10:30:45.123Z"
  }
}
```

## 🧹 **What Gets Cleaned Up**

### **Database Collections**
1. **EmployeeActivity** - All browser activity, focus changes, visibility changes
2. **ScreenCapture** - All screenshots (violation and regular)
3. **MonitoringAlert** - All violation alerts and notifications
4. **WorkSession** - All work session tracking data

### **In-Memory Data**
1. **Client Monitoring Handler** - Active sessions, activity buffers, violation sessions
2. **Website Monitor** - Active monitoring sessions, URL history, browser cache
3. **Activity Tracker** - Active tracking sessions and cached data

## 🚀 **Usage Examples**

### **Using cURL**

**Delete all monitoring data**:
```bash
curl -X DELETE http://localhost:3000/api/monitoring/cleanup/all
```

**Delete data for specific employee**:
```bash
curl -X DELETE http://localhost:3000/api/monitoring/cleanup/employee/683011a017ba6ac0f84fb39b
```

### **Using JavaScript/Fetch**

```javascript
// Delete all monitoring data
const cleanupAll = async () => {
  try {
    const response = await fetch('/api/monitoring/cleanup/all', {
      method: 'DELETE'
    });

    const result = await response.json();
    console.log('Cleanup result:', result);
  } catch (error) {
    console.error('Cleanup failed:', error);
  }
};

// Delete data for specific employee
const cleanupEmployee = async (employeeId) => {
  try {
    const response = await fetch(`/api/monitoring/cleanup/employee/${employeeId}`, {
      method: 'DELETE'
    });

    const result = await response.json();
    console.log('Employee cleanup result:', result);
  } catch (error) {
    console.error('Employee cleanup failed:', error);
  }
};
```

### **Using Postman**

1. **Method**: DELETE
2. **URL**: `http://localhost:3000/api/monitoring/cleanup/all`
3. **Headers**: None required
4. **Body**: None required

## ⚠️ **Important Notes**

### **Data Loss Warning**
- ⚠️ **IRREVERSIBLE**: These operations permanently delete data and cannot be undone
- ⚠️ **PRODUCTION USE**: Use with extreme caution in production environments
- ⚠️ **BACKUP**: Consider backing up data before cleanup if needed

### **No Authentication Required**
- ✅ **No tokens needed** - Endpoints are open for easy access
- ✅ **Direct access** - Just run the URL and it will delete
- ✅ **Simple usage** - Perfect for testing and development

### **Error Handling**
- If any collection cleanup fails, the operation continues with others
- Errors are reported in the `errors` array in the response
- Partial cleanup is possible - check the breakdown for details

### **Performance Considerations**
- Large datasets may take time to delete
- The operation is performed synchronously
- Consider running during low-traffic periods for large cleanups

## 🔧 **Development & Testing**

### **Common Use Cases**

1. **Testing Environment Reset**:
   ```bash
   # Clear all data before running tests
   curl -X DELETE http://localhost:3000/api/monitoring/cleanup/all
   ```

2. **Employee Data Reset**:
   ```bash
   # Clear data for specific test employee
   curl -X DELETE http://localhost:3000/api/monitoring/cleanup/employee/test_employee_id
   ```

3. **Development Database Cleanup**:
   ```javascript
   // Reset monitoring data during development
   await fetch('/api/monitoring/cleanup/all', { method: 'DELETE' });
   ```

4. **Browser Direct Access**:
   - Just open: `http://localhost:3000/api/monitoring/cleanup/all` in browser
   - Or use any HTTP client without authentication

### **Integration with Testing**

```javascript
// Jest/Mocha test setup
beforeEach(async () => {
  // Clean monitoring data before each test
  await fetch('/api/monitoring/cleanup/all', {
    method: 'DELETE'
  });
});
```

## 📊 **Response Status Codes**

- **200 OK**: Cleanup completed successfully
- **404 Not Found**: Employee not found (for employee-specific cleanup)
- **500 Internal Server Error**: Database or server error during cleanup

## 🎯 **Best Practices**

1. **No authentication needed** - Just run the URL directly
2. **Check response status** before assuming success
3. **Handle errors gracefully** in your application
4. **Log cleanup operations** for audit purposes
5. **Use employee-specific cleanup** when possible to minimize data loss
6. **Test in development** before using in production
7. **Consider data backup** for important monitoring data

These cleanup endpoints provide a powerful way to manage monitoring data and are essential for testing and development workflows.
