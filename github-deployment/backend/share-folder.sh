#!/bin/bash

# Script to share Google Drive folder with service account using Drive API

FOLDER_ID="1mhOmMsq913sNiHbRc2xr7R4eBbQlryMa"
SERVICE_ACCOUNT_EMAIL="rmu-portfolio-backend@rmu-portfolio-admin.iam.gserviceaccount.com"

echo "Sharing folder ${FOLDER_ID} with service account..."

# Get access token for the current user
ACCESS_TOKEN=$(gcloud auth print-access-token)

if [ -z "$ACCESS_TOKEN" ]; then
    echo "Error: Could not get access token. Please run 'gcloud auth login' first."
    exit 1
fi

echo "Access token obtained. Making API request..."

# Create permission for the service account
RESPONSE=$(curl -s -X POST \
  "https://www.googleapis.com/drive/v3/files/${FOLDER_ID}/permissions" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"role\": \"writer\",
    \"type\": \"user\",
    \"emailAddress\": \"${SERVICE_ACCOUNT_EMAIL}\"
  }")

echo "API Response: $RESPONSE"

# Check if the request was successful
if echo "$RESPONSE" | grep -q "\"id\""; then
    echo "✓ Folder shared successfully with service account!"
    echo "Permission ID: $(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)"
else
    echo "✗ Failed to share folder. Response: $RESPONSE"
    exit 1
fi