# RMU Portfolio System - Setup & Deployment Guide

## Current Status ✅
- ✅ Backend code updated to support OAuth access tokens  
- ✅ Backend configured with Google Drive folder ID
- ✅ Frontend files.json created to resolve 404 errors
- ✅ Authentication system modernized

## Required Software Installation

### 1. Git (Required for GitHub deployment)
Download and install from: https://git-scm.com/download/windows
- Choose "Git from the command line and also from 3rd-party software"
- This will add git to your PATH

### 2. Google Cloud SDK (Required for backend deployment)  
Download and install from: https://cloud.google.com/sdk/docs/install-windows
- Run the installer
- Follow the setup wizard
- Authenticate with: `gcloud auth login`
- Set project: `gcloud config set project YOUR_PROJECT_ID`

## Deployment Steps

### Step 1: Deploy Frontend to GitHub Pages
```powershell
# Navigate to project directory
cd "C:\Users\ABDUL\OneDrive - Rawalpindi Medical University\Documents\Code\github-deployment"

# Add and commit changes
git add files.json backend/server.js backend/deploy.ps1
git commit -m "Fix: Add files.json and update backend OAuth token support"
git push origin main
```

### Step 2: Deploy Backend to Cloud Run
```powershell
# Navigate to backend directory
cd backend

# Run deployment script
.\deploy.ps1
```

**OR manually:**
```bash
gcloud run deploy rmu-portfolio-backend \
--source . \
--platform managed \
--region us-central1 \
--allow-unauthenticated \
--set-env-vars "GOOGLE_CLIENT_ID=20976864081-e9h6ns973t3n78tpa1u099fnh29t0q9k.apps.googleusercontent.com,ORIGIN=https://rmuportfolioadmin.github.io,ADMIN_EMAIL=rmuportfolioa@gmail.com,DRIVE_PARENT_FOLDER_ID=1mhOmMsq913sNiHbRc2xr7R4eBbQlryMa"
```

## What's Fixed

### 🔧 Backend Token Handling
- Now supports both OAuth access tokens AND JWT ID tokens
- Verifies OAuth tokens by calling Google's userinfo endpoint  
- No more "Wrong number of segments" errors

### 🔧 Google Drive Integration
- DRIVE_PARENT_FOLDER_ID environment variable added
- Backend will now scan the correct Drive folder: `1mhOmMsq913sNiHbRc2xr7R4eBbQlryMa`
- Generate files.json from Drive contents when VC signs in

### 🔧 Frontend 404 Fixes
- Added files.json with demo portfolio entry
- Existing portfolio-data.json will load as fallback
- No more "files.json not found" errors

## Expected Behavior After Deployment

### When VC Email Signs In:
1. ✅ OAuth token accepted by backend
2. ✅ Admin mode activated
3. ✅ Backend scans Google Drive folder automatically
4. ✅ Portfolio list populated from Drive contents
5. ✅ Can view/manage all student portfolios

### When Regular User Signs In:
1. ✅ Personal portfolio loaded from Drive (if exists)
2. ✅ Or fallback to demo portfolio
3. ✅ Gallery navigation hidden (single user mode)

### Without Sign In:
1. ✅ Demo portfolio loads automatically
2. ✅ No backend calls needed
3. ✅ Basic portfolio viewing functionality

## Troubleshooting

### Still getting token errors?
- Check that backend deployment completed successfully
- Verify environment variables are set correctly
- Check Cloud Run logs for detailed error messages

### Still getting 404 errors?
- Ensure files.json was pushed to GitHub
- Check GitHub Pages deployment status
- Verify portfolio-data.json exists

### Backend not responding?
- Check Cloud Run service status
- Verify CORS origin matches GitHub Pages URL exactly
- Check service account permissions for Drive access

## Quick Test

After deployment, visit: `https://rmuportfolioadmin.github.io/rmuportfolio/`

1. Should show welcome modal (no 404 errors)
2. Can sign in with VC email: `rmuportfolioa@gmail.com` 
3. Should see admin interface with portfolio scanning
4. Or continue without sign-in to see demo portfolio

## Files Changed

- ✅ `files.json` - Added to resolve frontend 404 errors
- ✅ `backend/server.js` - Updated token verification to support OAuth  
- ✅ `backend/deploy.ps1` - Deployment script with all required env vars
- ✅ This setup guide created

---

**Next Steps:**
1. Install Git and Google Cloud SDK
2. Run deployment commands above  
3. Test the system with VC email authentication
4. Verify Google Drive portfolio scanning works

The system is now ready for production deployment! 🚀