#!/bin/bash

# RMU Portfolio Backend Deployment Script for Google Cloud Run
# This script automates the deployment of the multi-user backend system

set -e  # Exit on any error

# Configuration
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-rmu-portfolio-backend}"
SERVICE_NAME="rmu-portfolio-backend"
REGION="us-central1"
MEMORY="1Gi"
CPU="1"
MAX_INSTANCES="100"
MIN_INSTANCES="0"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

echo_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

echo_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    echo_info "Checking prerequisites..."
    
    if ! command_exists gcloud; then
        echo_error "Google Cloud SDK is not installed. Please install it first."
        echo_info "Visit: https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    
    if ! command_exists docker; then
        echo_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check if authenticated
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
        echo_error "Not authenticated with Google Cloud. Please run: gcloud auth login"
        exit 1
    fi
    
    echo_success "Prerequisites check passed"
}

# Set up Google Cloud project
setup_project() {
    echo_info "Setting up Google Cloud project..."
    
    # Set project
    echo_info "Setting project to: $PROJECT_ID"
    gcloud config set project $PROJECT_ID
    
    # Enable required APIs
    echo_info "Enabling required APIs..."
    gcloud services enable cloudbuild.googleapis.com
    gcloud services enable run.googleapis.com
    gcloud services enable drive.googleapis.com
    
    echo_success "Project setup completed"
}

# Deploy to Cloud Run
deploy_service() {
    echo_info "Deploying RMU Portfolio Backend to Cloud Run..."
    
    # Build and deploy
    echo_info "Building and deploying service: $SERVICE_NAME"
    
    gcloud run deploy $SERVICE_NAME \
        --source . \
        --platform managed \
        --region $REGION \
        --memory $MEMORY \
        --cpu $CPU \
        --max-instances $MAX_INSTANCES \
        --min-instances $MIN_INSTANCES \
        --port 8080 \
        --allow-unauthenticated \
        --set-env-vars "NODE_ENV=production" \
        --execution-environment gen2 \
        --service-account="${SERVICE_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
    
    # Get service URL
    SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.url)")
    
    echo_success "Deployment completed!"
    echo_info "Service URL: $SERVICE_URL"
    
    # Test the deployment
    echo_info "Testing deployment..."
    if curl -f "$SERVICE_URL/healthz" >/dev/null 2>&1; then
        echo_success "Health check passed ✓"
    else
        echo_warning "Health check failed - service may still be starting up"
    fi
    
    return 0
}

# Set up environment variables
setup_environment() {
    echo_info "Setting up environment variables..."
    
    # Check if variables are set
    if [ -z "$GOOGLE_CLIENT_ID" ]; then
        echo_error "GOOGLE_CLIENT_ID environment variable is not set"
        echo_info "Please set it with: export GOOGLE_CLIENT_ID=your_client_id"
        exit 1
    fi
    
    if [ -z "$ORIGIN" ]; then
        echo_error "ORIGIN environment variable is not set"
        echo_info "Please set it with: export ORIGIN=https://your-frontend-domain.com"
        exit 1
    fi
    
    if [ -z "$DRIVE_PARENT_FOLDER_ID" ]; then
        echo_error "DRIVE_PARENT_FOLDER_ID environment variable is not set"
        echo_info "Please set it with: export DRIVE_PARENT_FOLDER_ID=your_folder_id"
        exit 1
    fi
    
    # Update Cloud Run service with environment variables
    echo_info "Updating service with environment variables..."
    
    gcloud run services update $SERVICE_NAME \
        --region $REGION \
        --set-env-vars "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,ORIGIN=$ORIGIN,DRIVE_PARENT_FOLDER_ID=$DRIVE_PARENT_FOLDER_ID,ADMIN_EMAIL=rmuportfolioa@gmail.com,TEMP_FOLDER_NAME=portfolio-temp-storage,FINAL_FOLDER_NAME=student-portfolios"
    
    echo_success "Environment variables configured"
}

# Create service account if it doesn't exist
setup_service_account() {
    echo_info "Setting up service account..."
    
    SERVICE_ACCOUNT_EMAIL="${SERVICE_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
    
    # Check if service account exists
    if gcloud iam service-accounts describe $SERVICE_ACCOUNT_EMAIL >/dev/null 2>&1; then
        echo_info "Service account already exists: $SERVICE_ACCOUNT_EMAIL"
    else
        echo_info "Creating service account: $SERVICE_ACCOUNT_EMAIL"
        gcloud iam service-accounts create $SERVICE_NAME \
            --display-name "RMU Portfolio Backend Service Account" \
            --description "Service account for RMU Portfolio multi-user backend"
    fi
    
    # Grant necessary permissions
    echo_info "Granting necessary permissions..."
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
        --role="roles/drive.file"
    
    echo_success "Service account configured"
}

# Main deployment function
main() {
    echo_info "Starting RMU Portfolio Backend Deployment"
    echo_info "========================================="
    
    check_prerequisites
    setup_project
    setup_service_account
    deploy_service
    setup_environment
    
    echo_success "========================================="
    echo_success "🎉 Deployment completed successfully!"
    echo_info "Service: $SERVICE_NAME"
    echo_info "Region: $REGION"
    echo_info "URL: $(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.url)")"
    echo_info ""
    echo_info "Next steps:"
    echo_info "1. Update your frontend config.js with the new backend URL"
    echo_info "2. Test the multi-user functionality"
    echo_info "3. Monitor logs with: gcloud run logs tail $SERVICE_NAME --region=$REGION"
    echo_info "4. Check monitoring at: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME"
}

# Handle script arguments
case "${1:-}" in
    "deploy")
        main
        ;;
    "update-env")
        setup_environment
        ;;
    "logs")
        echo_info "Showing recent logs..."
        gcloud run logs tail $SERVICE_NAME --region=$REGION
        ;;
    "status")
        echo_info "Service status:"
        gcloud run services describe $SERVICE_NAME --region=$REGION --format="table(status.conditions[].type:label=TYPE,status.conditions[].status:label=STATUS,status.conditions[].reason:label=REASON)"
        ;;
    *)
        echo "RMU Portfolio Backend Deployment Script"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  deploy     - Full deployment (default)"
        echo "  update-env - Update environment variables only"
        echo "  logs       - Show service logs"
        echo "  status     - Show service status"
        echo ""
        echo "Environment variables required:"
        echo "  GOOGLE_CLIENT_ID - Your Google OAuth client ID"
        echo "  ORIGIN - Your frontend domain (e.g., https://rmuportfolioadmin.github.io)"
        echo "  DRIVE_PARENT_FOLDER_ID - Google Drive parent folder ID"
        echo ""
        echo "Example:"
        echo "  export GOOGLE_CLIENT_ID=your_client_id"
        echo "  export ORIGIN=https://rmuportfolioadmin.github.io/rmuportfolio"
        echo "  export DRIVE_PARENT_FOLDER_ID=1abc123def456"
        echo "  $0 deploy"
        exit 0
        ;;
esac