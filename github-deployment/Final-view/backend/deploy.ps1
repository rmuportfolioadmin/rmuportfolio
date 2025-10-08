# PowerShell deployment script for RMU Portfolio Backend
# Run this after installing Google Cloud SDK

Write-Host "🚀 Deploying RMU Portfolio Backend to Google Cloud Run..." -ForegroundColor Green

# Check if gcloud is available
try {
    $gcloudVersion = & gcloud --version 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "gcloud not found"
    }
    Write-Host "✅ Google Cloud SDK found" -ForegroundColor Green
} catch {
    Write-Host "❌ Google Cloud SDK not found!" -ForegroundColor Red
    Write-Host "Please install Google Cloud SDK first:" -ForegroundColor Yellow
    Write-Host "https://cloud.google.com/sdk/docs/install" -ForegroundColor Cyan
    exit 1
}

# Deploy to Cloud Run
Write-Host "📦 Deploying to Cloud Run..." -ForegroundColor Blue

$deployCommand = @"
gcloud run deploy rmu-portfolio-backend \
--source . \
--platform managed \
--region us-central1 \
--allow-unauthenticated \
--set-env-vars "GOOGLE_CLIENT_ID=20976864081-e9h6ns973t3n78tpa1u099fnh29t0q9k.apps.googleusercontent.com,ORIGIN=https://rmuportfolioadmin.github.io,ADMIN_EMAIL=rmuportfolioa@gmail.com,DRIVE_PARENT_FOLDER_ID=1mhOmMsq913sNiHbRc2xr7R4eBbQlryMa"
"@

Write-Host $deployCommand -ForegroundColor Cyan

try {
    gcloud run deploy rmu-portfolio-backend `
    --source . `
    --platform managed `
    --region us-central1 `
    --allow-unauthenticated `
    --set-env-vars "GOOGLE_CLIENT_ID=20976864081-e9h6ns973t3n78tpa1u099fnh29t0q9k.apps.googleusercontent.com,ORIGIN=https://rmuportfolioadmin.github.io,ADMIN_EMAIL=rmuportfolioa@gmail.com,DRIVE_PARENT_FOLDER_ID=1mhOmMsq913sNiHbRc2xr7R4eBbQlryMa"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "🎉 Backend deployment successful!" -ForegroundColor Green
        Write-Host "Backend is now configured to:" -ForegroundColor Yellow
        Write-Host "  ✓ Support OAuth access tokens from frontend" -ForegroundColor Green
        Write-Host "  ✓ Scan Google Drive folder: 1mhOmMsq913sNiHbRc2xr7R4eBbQlryMa" -ForegroundColor Green
        Write-Host "  ✓ Allow requests from: https://rmuportfolioadmin.github.io" -ForegroundColor Green
    } else {
        Write-Host "❌ Deployment failed!" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Deployment error: $($_)" -ForegroundColor Red
    exit 1
}