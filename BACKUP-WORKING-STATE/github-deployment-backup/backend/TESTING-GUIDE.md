# Testing Guide for Improved Backend

## Local Testing

### 1. Test Backend Endpoints Locally

```bash
# Start the backend
cd backend
npm install
npm run dev

# Test in another terminal
curl http://localhost:8080/
curl http://localhost:8080/healthz
```

### 2. Test Save Endpoint (requires authentication)

```bash
# You'll need a valid JWT token from your frontend
TOKEN="your_jwt_token_here"

curl -X POST http://localhost:8080/api/save \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "email": "test@example.com",
    "filename": "test-portfolio-123-R52",
    "portfolio": {
      "personalInfo": {
        "studentName": "Test Student",
        "rollNo": "123-R52-B",
        "email": "test@example.com"
      },
      "achievements": [],
      "reflections": []
    },
    "metadata": {
      "userAgent": "test",
      "timestamp": "2024-01-01T00:00:00.000Z",
      "source": "test"
    }
  }'
```

### 3. Test Admin Endpoints

```bash
# List portfolios (admin only)
ADMIN_TOKEN="admin_jwt_token_here"

curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     http://localhost:8080/api/list

# Check storage status
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     http://localhost:8080/api/storage-status

# Run cleanup
curl -X POST \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     http://localhost:8080/api/cleanup-temp-files
```

## Production Testing

### 1. Deploy and Test

```bash
# Deploy to Cloud Run
gcloud run deploy rmu-portfolio-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --set-env-vars TEMP_FOLDER_NAME=portfolio-temp-storage \
  --set-env-vars FINAL_FOLDER_NAME=student-portfolios

# Get the deployed URL
BACKEND_URL=$(gcloud run services describe rmu-portfolio-backend \
  --region us-central1 --format "value(status.url)")

echo "Backend deployed at: $BACKEND_URL"
```

### 2. Test Production Endpoints

```bash
# Health check
curl $BACKEND_URL/healthz

# Test with real authentication from frontend
# (Use browser dev tools to get a real token)
```

## Frontend Integration Testing

### 1. Update Frontend Configuration

Make sure your `config.js` points to the new backend:

```javascript
const RMU_CONFIG = {
  BACKEND_BASE: 'https://your-backend-url',
  // ... other config
};
```

### 2. Test Save Flow

1. **Open Portfolio Page**: Navigate to your portfolio site
2. **Sign In**: Use Google Sign-In
3. **Fill Portfolio**: Add some test data
4. **Save to Server**: Click "Save to Server" button
5. **Check Result**: Should see success message

### 3. Test Admin Flow

1. **Sign in as Admin**: Use `rmuportfolioa@gmail.com`
2. **View Gallery**: Should see admin mode activated
3. **Check Remote Files**: Should see portfolios from Drive
4. **Open Portfolio**: Click on a remote portfolio

## Expected Behavior

### Save Flow Success

```
[Save] Processing save request...
[Save] Validated request for test@example.com, filename: test-portfolio
[Save] Saved to temporary storage: 1abc123...
[Validate] Validating portfolio file...
[Save] Transferred to final storage: 1def456...
[Save] Cleaned up temporary file: 1abc123...
```

### Save Flow with Validation Error

```
[Save] Processing save request...
[Save] Saved to temporary storage: 1abc123...
[Validate] Validating portfolio file...
[Cleanup] Deleted temporary file: 1abc123...
Response: 400 Bad Request
{
  "error": "Portfolio validation failed: Invalid roll number format"
}
```

### Storage Monitoring

```json
{
  "storage": {
    "usedGB": 1.2,
    "limitGB": 15.0,
    "usagePercent": 8.0,
    "isNearLimit": false
  },
  "files": {
    "temporary": 0,
    "final": 23,
    "total": 23
  }
}
```

## Troubleshooting Common Issues

### Issue: "Missing required fields"

**Cause**: Frontend not sending required data
**Fix**: Check frontend payload includes `email`, `filename`, `portfolio`

### Issue: "Failed to create/access folder"

**Cause**: Service account permissions
**Fix**: 
1. Verify service account has Drive API enabled
2. Check parent folder ID is correct
3. Ensure service account has Editor access

### Issue: "Storage temporarily full"

**Cause**: Service account quota exceeded
**Fix**:
1. Run cleanup: `npm run cleanup`
2. Monitor storage: `npm run monitor`
3. Consider upgrading service account

### Issue: "Token verification failed"

**Cause**: Invalid or expired JWT token
**Fix**:
1. Check frontend auth implementation
2. Verify token is being sent correctly
3. Check token expiration

## Validation Testing

Test these scenarios to ensure validation works:

### Valid Portfolio
```json
{
  "personalInfo": {
    "studentName": "John Doe",
    "rollNo": "123-R52-B",
    "email": "john@example.com"
  },
  "achievements": [
    {"title": "Test Achievement", "description": "Test"}
  ],
  "reflections": [
    {"title": "Test Reflection", "content": "Test"}
  ]
}
```

### Invalid Portfolio (should fail)
```json
{
  "personalInfo": {
    "rollNo": "invalid-roll"  // Invalid format
  },
  "achievements": "not-an-array",  // Should be array
  "reflections": null  // Should be array or undefined
}
```

## Performance Testing

### Load Testing with Artillery

```bash
npm install -g artillery

# Create artillery-test.yml
artillery run artillery-test.yml
```

### Concurrent Save Testing

```bash
# Test multiple saves at once
for i in {1..5}; do
  curl -X POST $BACKEND_URL/api/save \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{...test data...}" &
done
wait
```

## Monitoring in Production

### Set up Logging

The backend logs all operations. Monitor for:

- `[Save]` - Save operations
- `[Transfer]` - File transfers to final storage
- `[Cleanup]` - Temporary file cleanup
- `[Validate]` - Portfolio validation

### Set up Alerts

Monitor these metrics:
- Storage usage > 80%
- High temporary file count
- Frequent validation failures
- Error rate increases

### Regular Maintenance

Run these commands regularly:

```bash
# Daily cleanup (via cron)
npm run cleanup

# Weekly monitoring
npm run monitor

# Monthly full maintenance
npm run maintenance
```

This comprehensive setup ensures your backend is robust, secure, and maintainable! 🚀