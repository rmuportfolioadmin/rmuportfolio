# Improved Backend Configuration Guide

## Architecture Overview

The new system uses a **two-tier storage approach**:

1. **Temporary Storage**: Service account drive (15GB free quota)
2. **Final Storage**: Your personal drive (`rmuportfolioa@gmail.com`)

## How It Works

```
User Submits Portfolio
        ↓
1. Save to Service Account Drive (temporary)
        ↓
2. Validate Content & User Authentication
        ↓
3. Transfer to Admin Drive (rmuportfolioa@gmail.com)
        ↓
4. Clean up Temporary Storage
        ↓
5. Update files.json manifest
```

## Benefits

✅ **Security**: All files go through your backend validation
✅ **Control**: You maintain complete control over what gets saved
✅ **Quota**: Service account's 15GB is used for temporary storage only
✅ **Clean**: Temporary files are automatically cleaned up
✅ **Scalable**: Can handle multiple concurrent uploads

## Setup Requirements

### 1. Service Account Setup (for temporary storage)
```bash
# Create a service account with Drive API access
# Download the service account key file
# Set environment variable
export GOOGLE_SERVICE_ACCOUNT_KEY_FILE="/path/to/service-account-key.json"
```

### 2. Admin Account Setup (for final storage)
You have two options:

**Option A: Use OAuth for Admin Account**
```bash
# Create OAuth credentials for rmuportfolioa@gmail.com
# Download the OAuth key file
export GOOGLE_ADMIN_KEY_FILE="/path/to/admin-oauth-key.json"
```

**Option B: Share Admin Drive with Service Account**
```bash
# Share the 'student-portfolios' folder in rmuportfolioa@gmail.com 
# with the service account email (with Editor permissions)
# Use the same service account for both operations
```

### 3. Environment Variables
```bash
# Required
GOOGLE_SERVICE_ACCOUNT_KEY_FILE="/path/to/service-key.json"

# Option A: Separate admin key
GOOGLE_ADMIN_KEY_FILE="/path/to/admin-key.json"

# Option B: Use service account for both (requires shared folder)
# No additional variable needed
```

## Code Integration

### Replace your existing save endpoint with:
```javascript
// In your server.js, replace the /api/save endpoint
const { saveToTemporaryStorage, validatePortfolioFile, transferToAdminDrive, cleanupTempFile } = require('./improved-save-endpoint.js');

// The endpoint code is in improved-save-endpoint.js
```

### Error Handling

The new system handles these scenarios:

1. **Service Account Quota Full**: 
   - Error: "Storage temporarily full"
   - Solution: Automatic cleanup + user retry

2. **Transfer Failure**:
   - Temporary file is preserved for manual recovery
   - User gets clear error message

3. **Validation Failure**:
   - Temporary file is cleaned up immediately
   - User gets specific validation error

## Monitoring & Maintenance

### Cleanup Script (run daily)
```javascript
// cleanup-old-temp-files.js
const { google } = require('googleapis');

async function cleanupOldTempFiles() {
    const drive = google.drive({ version: 'v3', auth: serviceAuth });
    
    // Find temp files older than 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const query = `name contains '-temp-' and createdTime < '${oneDayAgo}' and trashed=false`;
    
    const files = await drive.files.list({ q: query });
    
    for (const file of files.data.files || []) {
        try {
            await drive.files.delete({ fileId: file.id });
            console.log(`Cleaned up old temp file: ${file.name}`);
        } catch (error) {
            console.warn(`Failed to cleanup ${file.name}:`, error);
        }
    }
}

// Run this via cron job: 0 2 * * * node cleanup-old-temp-files.js
```

### Storage Monitoring
```javascript
// monitor-storage.js
async function checkStorageUsage() {
    const drive = google.drive({ version: 'v3', auth: serviceAuth });
    
    const about = await drive.about.get({
        fields: 'storageQuota'
    });
    
    const quota = about.data.storageQuota;
    const usedGB = parseInt(quota.usage) / (1024 ** 3);
    const limitGB = parseInt(quota.limit) / (1024 ** 3);
    const usagePercent = (usedGB / limitGB) * 100;
    
    console.log(`Storage Usage: ${usedGB.toFixed(2)}GB / ${limitGB}GB (${usagePercent.toFixed(1)}%)`);
    
    if (usagePercent > 80) {
        console.warn('⚠️ Service account storage usage above 80%!');
        // Send alert email or notification
    }
    
    return { usedGB, limitGB, usagePercent };
}
```

## Deployment Steps

1. **Update Backend Code**:
   ```bash
   cp improved-save-endpoint.js backend/
   # Update your server.js to use the new endpoint
   ```

2. **Set Environment Variables**:
   ```bash
   # On your hosting platform (Cloud Run, etc.)
   export GOOGLE_SERVICE_ACCOUNT_KEY_FILE="..."
   export GOOGLE_ADMIN_KEY_FILE="..." # if using Option A
   ```

3. **Test the Flow**:
   ```bash
   # Test with a sample portfolio submission
   curl -X POST your-backend.com/api/save \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d @test-portfolio.json
   ```

4. **Deploy Frontend Changes**:
   ```bash
   git add portfolio.html
   git commit -m "Restore proper backend save with improved error handling"
   git push origin main
   ```

## Troubleshooting

### Common Issues:

1. **"Storage quota exceeded"**
   - Check service account storage usage
   - Run cleanup script
   - Consider upgrading service account to paid plan

2. **"Permission denied"**
   - Verify service account has Drive API enabled
   - Check folder sharing permissions
   - Validate OAuth scopes

3. **"Transfer failed"**
   - Check admin account authentication
   - Verify folder exists in admin drive
   - Check network connectivity

### Logs to Monitor:
```
[Save] Processing save request...
[Save] Validated request for user@email.com
[Save] Saved to temporary storage: file_id
[Save] Transferred to admin drive: final_file_id
[Save] Cleaned up temporary file: temp_file_id
```

This approach maintains your security model while properly handling the service account quota limitations!