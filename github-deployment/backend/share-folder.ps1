# PowerShell script to share Google Drive folder with service account

$FOLDER_ID = "1mhOmMsq913sNiHbRc2xr7R4eBbQlryMa"
$SERVICE_ACCOUNT_EMAIL = "rmu-portfolio-backend@rmu-portfolio-admin.iam.gserviceaccount.com"

Write-Host "Sharing folder $FOLDER_ID with service account..."

# Get access token for the current user
$ACCESS_TOKEN = gcloud auth print-access-token

if ([string]::IsNullOrEmpty($ACCESS_TOKEN)) {
    Write-Host "Error: Could not get access token. Please run 'gcloud auth login' first." -ForegroundColor Red
    exit 1
}

Write-Host "Access token obtained. Making API request..."

# Prepare the request body
$requestBody = @{
    role = "writer"
    type = "user"
    emailAddress = $SERVICE_ACCOUNT_EMAIL
} | ConvertTo-Json

# Create permission for the service account
$headers = @{
    "Authorization" = "Bearer $ACCESS_TOKEN"
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-RestMethod -Uri "https://www.googleapis.com/drive/v3/files/$FOLDER_ID/permissions" -Method POST -Headers $headers -Body $requestBody
    
    Write-Host "✓ Folder shared successfully with service account!" -ForegroundColor Green
    Write-Host "Permission ID: $($response.id)"
} catch {
    Write-Host "✗ Failed to share folder. Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}