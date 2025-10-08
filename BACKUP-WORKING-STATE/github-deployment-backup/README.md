# 🎓 RMU Portfolio System

A comprehensive digital portfolio system for Rawalpindi Medical University students with secure Google Drive integration and modern authentication.

## 🚀 **Backend Deployment Commands**

```bash
# Navigate to backend directory  
cd "c:\Users\ABDUL\OneDrive - Rawalpindi Medical University\Documents\Code\github-deployment\backend"

# Deploy to Google Cloud Run
gcloud run deploy rmu-portfolio-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,ORIGIN=https://rmuportfolioadmin.github.io,ADMIN_EMAIL=rmuportfolioa@gmail.com" \
  --max-instances=10 \
  --memory=1Gi \
  --cpu=1 \
  --timeout=300 \
  --port=8080 \
  --quiet
```

## ✅ **Issues Fixed & Improvements**

### **Critical Fixes Applied**
- ✅ **Dockerfile**: Fixed duplicate FROM statements and security hardening
- ✅ **Authentication**: Added rate limiting to prevent excessive calls  
- ✅ **Backend**: Enhanced JWT token verification with proper error handling
- ✅ **Frontend**: Fixed `isValidRollNoFormat` function scope issues
- ✅ **CORS**: Properly configured cross-origin resource sharing
- ✅ **Performance**: Reduced console spam and optimized logging

### **Key Features**
- **Privacy Compliant** - Uses minimal Google Drive permissions (appdata scope only)
- **Modern Authentication** - Google Identity Services (GIS) implementation
- **VC Admin Mode** - Special administrative access for portfolio management  
- **RMU Roll Validation** - XXX-RXX-X format enforcement
- **Hybrid Data Sources** - Local files + Google Drive synchronization
- **Responsive Design** - Mobile-first with university branding

## 🧪 **Testing**

Run comprehensive tests by opening `system-test.html` in your browser to validate:
- Configuration settings
- Backend connectivity  
- Authentication system
- File structure integrity
- Performance metrics

## 📋 **Environment Variables**

Required for Cloud Run backend:
```
GOOGLE_CLIENT_ID=738776771863-5558mme9unmotsk8bnhlrmb5sq4b2qnr.apps.googleusercontent.com
ORIGIN=https://rmuportfolioadmin.github.io  
ADMIN_EMAIL=rmuportfolioa@gmail.com
``` 
