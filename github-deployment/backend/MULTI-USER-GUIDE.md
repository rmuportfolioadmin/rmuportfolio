# Multi-User Portfolio System

## Overview

The RMU Portfolio Backend now supports multiple users with secure, isolated storage for each user. Each authenticated user gets their own dedicated storage space within the admin's Google Drive.

## Key Features

### 🔐 **User Authentication & Security**
- Each user must authenticate via Google Sign-In
- JWT token validation ensures secure access
- User-specific storage folders prevent data conflicts
- Only authenticated users can access/modify their own portfolios

### 📁 **Storage Architecture**

```
Admin Drive (rmuportfolioa@gmail.com)
└── student-portfolios/
    ├── user_student1_example_com/
    │   ├── portfolio1_123-R52-B.json
    │   └── portfolio2_124-R52-B.json
    ├── user_doctor_calipso_gmail_com/
    │   └── abdul-haseeb-ahmad_123-R52-B.json
    └── user_sattar89706_gmail_com/
        └── sattars-portfolio_280-R52.json
```

### 🔄 **Two-Tier Storage Process**

1. **Temporary Storage**: Files saved to service account (15GB quota)
2. **Validation**: Portfolio data integrity checks
3. **Transfer**: Move to user-specific folder in admin drive
4. **Cleanup**: Remove temporary files automatically

## API Endpoints

### User Endpoints

#### Save Portfolio
```http
POST /api/save
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "email": "user@example.com",
  "filename": "my-portfolio",
  "portfolio": { ... },
  "metadata": { ... }
}
```

#### List User's Portfolios
```http
GET /api/user-portfolios
Authorization: Bearer {jwt_token}
```

#### Get User's Portfolio
```http
GET /api/user-portfolio?filename=my-portfolio
Authorization: Bearer {jwt_token}
```

#### Delete User's Portfolio
```http
DELETE /api/user-portfolio/{fileId}
Authorization: Bearer {jwt_token}
```

### Admin Endpoints

#### List All Portfolios
```http
GET /api/list
Authorization: Bearer {admin_jwt_token}
```

#### Storage Status with User Stats
```http
GET /api/storage-status
Authorization: Bearer {admin_jwt_token}
```

## User Isolation Features

### 🛡️ **Security Measures**
- **Folder Isolation**: Each user has their own subfolder
- **Ownership Tracking**: Files tagged with authenticated user's email
- **Access Control**: Users can only access their own portfolios
- **Filename Uniqueness**: User-specific filenames prevent conflicts

### 📊 **File Management**
- **Version Control**: Files updated in-place with version tracking
- **Metadata Preservation**: Original creation dates and upload history
- **Conflict Resolution**: No filename conflicts between users
- **Data Integrity**: Portfolio email preserved in data, ownership by authenticated user

## Usage Examples

### Scenario 1: Student Saves Portfolio
```javascript
// Student: john.doe@student.rmu.edu.pk
// Portfolio email: john.doe@student.rmu.edu.pk
// Result: Saved to user_john_doe_student_rmu_edu_pk/
```

### Scenario 2: Doctor Saves Student Portfolio
```javascript
// Doctor: dr.smith@rmu.edu.pk (authenticated)
// Portfolio email: student123@student.rmu.edu.pk (in data)
// Result: Saved to user_dr_smith_rmu_edu_pk/ but preserves student email in portfolio data
```

### Scenario 3: Multiple Users, Same Filename
```javascript
// User A: alice@example.com saves "my-portfolio"
// User B: bob@example.com saves "my-portfolio"
// Result: Both saved successfully in separate user folders
```

## Monitoring & Administration

### Storage Status Response
```json
{
  "storage": {
    "usedGB": 2.5,
    "limitGB": 15.0,
    "usagePercent": 16.7,
    "isNearLimit": false
  },
  "files": {
    "temporary": 0,
    "final": 150,
    "userPortfolios": 145,
    "legacyFiles": 5,
    "total": 150
  },
  "users": {
    "totalUsers": 12,
    "activeUsers": 10,
    "userStats": [
      {
        "userFolder": "user_john_doe_example_com",
        "email": "john.doe@example.com",
        "portfolioCount": 3
      }
    ]
  }
}
```

### Cleanup & Maintenance
- **Automatic Cleanup**: Temporary files removed after successful transfer
- **Storage Monitoring**: Real-time usage tracking and alerts
- **User Statistics**: Track active users and portfolio counts
- **Legacy Support**: Backward compatibility with existing files

## Error Handling

### Common Scenarios

#### Access Denied
```json
{
  "error": "Access denied. Please ensure you are using the correct account and try again.",
  "details": "You can only save and update portfolios under your own authenticated account."
}
```

#### Storage Full
```json
{
  "error": "Storage temporarily full. Please contact the administrator.",
  "details": "The temporary storage is at capacity. This will be resolved shortly."
}
```

#### Authentication Failed
```json
{
  "error": "Authentication failed. Please sign in again.",
  "details": "Your authentication token may have expired. Please refresh the page and sign in again."
}
```

## Migration from Single-User System

### Backward Compatibility
- Existing portfolios remain accessible via admin interface
- Legacy files marked as "legacy" in storage status
- No data loss during transition

### Migration Process
1. Deploy new backend with multi-user support
2. Existing files continue to work via admin interface
3. New saves automatically use user-specific folders
4. Optional: Migrate legacy files to user folders based on email metadata

## Best Practices

### For Users
- Always sign in before saving portfolios
- Use consistent email addresses for your portfolios
- Check portfolio data before saving
- Contact admin if you can't access your files

### For Administrators
- Monitor storage usage regularly via `/api/storage-status`
- Run cleanup operations during low-usage periods
- Back up important portfolios regularly
- Monitor user statistics for system health

### For Developers
- Always validate JWT tokens before file operations
- Use authenticated user's email for ownership, not portfolio email
- Implement proper error handling for all scenarios
- Test with multiple users to ensure isolation works

## Scaling Considerations

### Current Limits
- **Storage**: 15GB service account + unlimited admin drive
- **Users**: No hard limit (folder-based isolation scales well)
- **Files per User**: No enforced limit
- **Concurrent Users**: Limited by Google Drive API quotas

### Optimization Tips
- Regular cleanup of temporary files
- Monitor API usage and implement rate limiting if needed
- Consider archiving old portfolios for very active systems
- Use batch operations for bulk administrative tasks

## Troubleshooting

### User Can't Save Portfolio
1. Check authentication token validity
2. Verify user has Google account access
3. Check backend logs for specific error
4. Ensure storage isn't full

### User Can't See Their Portfolios
1. Verify user is signed in with correct account
2. Check user folder exists and has correct permissions
3. Look for portfolios in admin interface
4. Check for case sensitivity in email addresses

### Performance Issues
1. Monitor storage status for quota usage
2. Check temporary file cleanup frequency
3. Review user folder count and organization
4. Consider API rate limiting adjustments

This multi-user system provides secure, scalable portfolio management for educational institutions while maintaining the simplicity and reliability of the original system.