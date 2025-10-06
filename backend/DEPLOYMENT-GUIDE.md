# Environment Configuration for Improved Backend

## Required Environment Variables

Add these to your deployment environment (Cloud Run, etc.):

```bash
# Existing variables (keep these)
GOOGLE_CLIENT_ID=your_google_client_id
ORIGIN=https://rmuportfolioadmin.github.io/rmuportfolio
ADMIN_EMAIL=rmuportfolioa@gmail.com
DRIVE_PARENT_FOLDER_ID=your_parent_folder_id

# New variables for two-tier storage
TEMP_FOLDER_NAME=portfolio-temp-storage
FINAL_FOLDER_NAME=student-portfolios

# Optional - for development/debugging
NODE_ENV=production
```

## Folder Structure in Google Drive

The system will create this structure:

```
Your Drive Parent Folder (DRIVE_PARENT_FOLDER_ID)
├── student-portfolios/          # Final storage folder
│   ├── student-name-123-R52.json
│   ├── another-student-456-R51.json
│   └── ...
└── portfolio-temp-storage/      # Temporary storage folder
    ├── temp-files-during-processing.json
    └── (automatically cleaned up)
```

## Service Account Permissions

Your service account needs:
- ✅ **Google Drive API** access
- ✅ **Editor** access to the parent folder
- ✅ **Files.create** and **Files.delete** permissions

## Deployment Steps

### 1. Update Environment Variables
```bash
# In Cloud Run or your hosting platform
gcloud run services update rmu-portfolio-backend \
  --set-env-vars TEMP_FOLDER_NAME=portfolio-temp-storage \
  --set-env-vars FINAL_FOLDER_NAME=student-portfolios
```

### 2. Deploy New Backend Code
```bash
# From your backend directory
npm install
gcloud run deploy rmu-portfolio-backend \
  --source . \
  --platform managed \
  --region us-central1
```

### 3. Test the New Endpoints

**Test Save (with frontend):**
```javascript
// This should now use the improved two-tier system
await fetch('your-backend/api/save', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify({
    email: 'student@email.com',
    filename: 'student-name-123-R52',
    portfolio: { /* portfolio data */ }
  })
});
```

**Test Storage Status (admin only):**
```bash
curl -H "Authorization: Bearer ADMIN_TOKEN" \
     https://your-backend/api/storage-status
```

**Test Cleanup (admin only):**
```bash
curl -X POST \
     -H "Authorization: Bearer ADMIN_TOKEN" \
     https://your-backend/api/cleanup-temp-files
```

## Monitoring & Maintenance

### Daily Cleanup (Recommended)
Set up a cron job or Cloud Scheduler to run cleanup:

```bash
# Cloud Scheduler example
gcloud scheduler jobs create http portfolio-cleanup \
  --schedule="0 2 * * *" \
  --uri="https://your-backend/api/cleanup-temp-files" \
  --http-method=POST \
  --headers="Authorization=Bearer YOUR_ADMIN_TOKEN"
```

### Storage Monitoring
Monitor storage usage via the `/api/storage-status` endpoint:

```json
{
  "storage": {
    "usedGB": 2.4,
    "limitGB": 15.0,
    "usagePercent": 16.0,
    "isNearLimit": false
  },
  "files": {
    "temporary": 0,
    "final": 45,
    "total": 45
  },
  "folders": {
    "tempFolderId": "1abc...",
    "finalFolderId": "1def...",
    "parentFolderId": "1ghi..."
  }
}
```

## Error Handling

The new system provides better error messages:

### Storage Quota Error
```json
{
  "error": "Storage temporarily full. Please contact the administrator.",
  "details": "The temporary storage is at capacity. This will be resolved shortly."
}
```

### Access Denied Error
```json
{
  "error": "Permission error. Please try signing out and signing in again.",
  "details": "Authentication token may have expired or you do not have permission to update this file."
}
```

### Validation Error
```json
{
  "error": "Portfolio validation failed: Invalid roll number format"
}
```

## Benefits of New System

✅ **Quota Management**: Service account's 15GB used efficiently  
✅ **Security**: All files validated before final storage  
✅ **Reliability**: Temporary files cleaned up automatically  
✅ **Monitoring**: Real-time storage and file count tracking  
✅ **Error Recovery**: Failed transfers can be retried  
✅ **Access Control**: Proper ownership checking maintained  

## Troubleshooting

### Issue: "Failed to create/access folder"
- Check service account has Drive API enabled
- Verify parent folder ID is correct
- Ensure service account has Editor access to parent folder

### Issue: "Storage temporarily full"
- Run manual cleanup: `POST /api/cleanup-temp-files`
- Check storage status: `GET /api/storage-status`
- Consider upgrading service account to paid plan

### Issue: "Access denied: File belongs to..."
- This is expected behavior - users can only update their own files
- Verify user email matches the file owner

## Migration from Old System

The new backend is backward compatible. Existing files in the parent folder will continue to work with the admin list/download endpoints. New saves will use the two-tier system automatically.

No data migration required! 🎉