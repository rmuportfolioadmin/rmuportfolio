## Ownership Enforcement (Implemented)

The backend now enforces strict file ownership:

- **File Creation**: When a new portfolio is saved, the verified ID token email becomes the immutable owner (`uploadedBy` field).
- **File Updates**: When updating an existing portfolio, the backend compares the current user's email with the original owner stored in `appProperties.uploadedBy`.
- **Access Control**: If the emails don't match, a 403 Forbidden response is returned with details about the ownership mismatch.
- **Owner Preservation**: Original owner information is preserved during updates - only the file creator can ever modify their portfolio.

This ensures that students can only update their own portfolios, preventing unauthorized modifications.

## Frontend contract updates (RMU roll + ownership)

- Save endpoint accepts and trusts only the verified ID token email as the owner of a portfolio file.
- If a JSON with a given roll/email is already owned by another email, returns 403 Forbidden with ownership details.
- Filenames are generated client-side using FullName + normalized RMU roll (000-R00-X).
- Server stores an immutable `uploadedBy` (email) field alongside the record for ownership verification.
- Server maintains creation timestamp (`createdAt`) and update timestamp (`updatedAt`) for audit trails.

## Ephemeral backend for students

- The frontend only invokes the backend on "Save to server". Keep the API stateless; do not require persistent sessions.
- VC mode is allowed to use the list/download endpoints continuously; students only call save once per interaction.d contract updates (RMU roll + ownership)

- Save endpoint must accept and trust only the verified ID token email as the owner of a portfolio file. If a JSON with a given key is already owned by another email, return 403 Forbidden.
- Filenames are generated client-side using FullName + normalized RMU roll (000-R00-X), but the server should sanitize and store an immutable ownerId (email) alongside the record.
- Consider writing a lightweight server log (email, time, roll) for each save. The frontend also writes a user-local log in appData.

## Ephemeral backend for students

- The frontend only invokes the backend on “Save to server”. Keep the API stateless; do not require persistent sessions.
- VC mode is allowed to use the list/download endpoints continuously; students only call save once per interaction.
RMU Portfolio Backend (Cloud Run)

Purpose
- Verify Google ID tokens from your frontend.
- Enforce admin-only endpoints with exact email match.
- Save/list/download portfolio JSON files in a private Drive folder using a service account (Cloud Run runtime identity).

Endpoints
- POST /api/save: Any signed-in user. Saves or replaces a JSON file in the configured Drive folder using appProperties (roll, email, timestamps).
- GET /api/list: Admin-only. Returns an array of { id, file, roll, email, updatedAt }.
- GET /api/download: Admin-only. Streams a JSON file by id.
- GET /healthz: Health check.

Security
- CORS restricted to ORIGIN env.
- Google ID token verification against GOOGLE_CLIENT_ID.
- No tokens in URLs; Authorization header only.

Deploy to Cloud Run (free tier friendly)
1) Prerequisites
   - gcloud CLI installed and authenticated.
   - A Google Cloud project selected.
   - APIs enabled: Cloud Run, Google Drive API, IAM Service Account Credentials API (optional).

2) Create a Drive folder and share it with the Cloud Run service account
   - In Google Drive, create a folder for backend portfolios.
   - Copy its folder ID (in the URL).
   - You will share this folder with the Cloud Run service account email (shown after deploy) as Editor.

3) Build and deploy
   - From this backend directory:
     - Build container and deploy to Cloud Run:
       gcloud builds submit --tag gcr.io/$(gcloud config get-value project)/rmu-portfolio-backend
       gcloud run deploy rmu-portfolio-backend \
         --image gcr.io/$(gcloud config get-value project)/rmu-portfolio-backend \
         --platform managed \
         --region us-central1 \
         --allow-unauthenticated \
         --min-instances 0 \
         --max-instances 4 \
         --cpu-throttling \
         --args node,server.js

   - Set environment variables:
       gcloud run services update rmu-portfolio-backend \
         --region us-central1 \
         --set-env-vars GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com \
         --set-env-vars ORIGIN=https://your-domain \
         --set-env-vars ADMIN_EMAIL=rmuportfolioa@gmail.com \
         --set-env-vars DRIVE_PARENT_FOLDER_ID=YOUR_DRIVE_FOLDER_ID

4) Share the Drive folder
   - In Drive, share the folder with the Cloud Run service account (visible in Cloud Run service details) as Editor.

5) Configure frontend
   - In your site’s config.js:
     window.RMU_CONFIG = {
       GOOGLE_CLIENT_ID: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
       VC_EMAIL: 'rmuportfolioa@gmail.com',
       BACKEND_BASE: 'https://<your-service>-<hash>-uc.a.run.app'
     };

Regions and free tier
- Choose a North America region like us-central1 or us-east1 to benefit from free egress. It works fine from Pakistan; you can deploy to those regions regardless of your location.
- Keep min-instances=0, CPU only during request, and memory small (256–512MiB) to stay within free tier.

Troubleshooting
- 403 CORS: Ensure ORIGIN matches your exact site origin including https scheme.
- 401 unauthorized: Verify the frontend sends Authorization: Bearer <ID token> and GOOGLE_CLIENT_ID matches.
- 500 Drive errors: Confirm DRIVE_PARENT_FOLDER_ID is set and shared with the service account.
# RMU Portfolio Backend (Cloud Run)

This backend verifies Google ID tokens, restricts CORS to your domain, and saves portfolio JSON files to a private Google Drive folder using a service account. Admin endpoints list and download files for the VC gallery. Python job triggers are stubbed for future wiring.

## What you get
- POST /api/save: Save student portfolio JSON to a Drive folder (private). Adds appProperties for roll/email.
- GET /api/list: Admin-only manifest for the gallery, returns a list of files with roll and updatedAt.
- GET /api/download: Admin-only download of a portfolio by Drive file ID.
- POST /api/run-make-manifest, POST /api/run-json2excel: Stubs to be connected to Cloud Run jobs or Cloud Scheduler.

Auth and security:
- Authorization: Bearer <Google ID token> (same OAuth Client ID as the frontend)
- CORS restricted via ORIGIN env (e.g., https://haseebqureshi.site)
- Admin email enforcement via ADMIN_EMAIL env (default rmuportfolioa@gmail.com)

## Prerequisites
- Google Cloud project (owner/editor access)
- Billing enabled (for Cloud Run)
- Domain for frontend, e.g., https://haseebqureshi.site

## Step-by-step setup (beginner friendly)

1) Create OAuth Client (Google Cloud Console)
- Go to APIs & Services > Credentials > Create Credentials > OAuth client ID.
- Application type: Web application.
- Authorized JavaScript origins: your domain, e.g., https://haseebqureshi.site
- Authorized redirect URIs: not required for implicit flows here.
- Copy the Client ID. You will set it:
	- In frontend config.js as window.RMU_CONFIG.GOOGLE_CLIENT_ID
	- In Cloud Run env GOOGLE_CLIENT_ID

2) Enable APIs
- Enable: Google Drive API, Cloud Run API, Secret Manager API (optional if you need secrets), Cloud Build API.

3) Create a Drive parent folder
- In Google Drive, create a folder to hold portfolios (e.g., RMU-Portfolios).
- Copy the folder ID from the URL.
- You will share this folder with your Cloud Run service account (later) with Editor access.

4) Prepare backend env vars
- GOOGLE_CLIENT_ID: Your OAuth client ID
- ORIGIN: https://haseebqureshi.site (your frontend origin)
- ADMIN_EMAIL: rmuportfolioa@gmail.com (or your admin email)
- DRIVE_PARENT_FOLDER_ID: The folder ID from step 3

5) Deploy to Cloud Run
- From the backend directory, build and deploy.
- Example (replace values accordingly):

```powershell
# From backend directory
$env:GOOGLE_CLIENT_ID = "YOUR_CLIENT_ID.apps.googleusercontent.com"
$env:ORIGIN = "https://haseebqureshi.site"
$env:ADMIN_EMAIL = "rmuportfolioa@gmail.com"
$env:DRIVE_PARENT_FOLDER_ID = "<your_drive_folder_id>"
$env:GCP_PROJECT_ID = "<your-project-id>"

# Build and deploy from source with Cloud Build
gcloud run deploy rmu-portfolio-backend `
	--source . `
	--project $env:GCP_PROJECT_ID `
	--region us-central1 `
	--allow-unauthenticated `
	--set-env-vars GOOGLE_CLIENT_ID=$env:GOOGLE_CLIENT_ID,ORIGIN=$env:ORIGIN,ADMIN_EMAIL=$env:ADMIN_EMAIL,DRIVE_PARENT_FOLDER_ID=$env:DRIVE_PARENT_FOLDER_ID
```

6) Grant Drive access to the service principal
- Find the Cloud Run runtime service account in the deploy output (e.g., <project-number>-compute@developer.gserviceaccount.com or a custom one).
- Share your Drive parent folder with that service account (Editor). In Google Drive, right-click folder > Share > Add the service account email.

7) Connect frontend and backend
- In your site’s config.js (copied from config.example.js):

```js
window.RMU_CONFIG = {
	GOOGLE_CLIENT_ID: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
	VC_EMAIL: 'rmuportfolioa@gmail.com',
	BACKEND_BASE: 'https://<cloud-run-service>-<hash>-uc.a.run.app'
};
```

- Ensure index.html CSP allows connect-src to https://*.run.app (already added).

8) Test
- Student mode (default): Open portfolio.html and ensure Drive appData flow still works. Save/Load to Drive should remain private per user.
- Save to server: Click the Save to server button in index.html. It should prompt sign-in and then POST to /api/save; verify a JSON file appears in the Drive folder.
- Admin mode: Sign in with the admin account; ensure localStorage.vcMode is 1 and the session has an ID token (handled by the overlay flow). Verify you can later use /api/list and /api/download from the gallery integration.

## Backend environment variables
- GOOGLE_CLIENT_ID: OAuth client for ID token verification
- ORIGIN: Frontend origin for CORS, e.g., https://haseebqureshi.site
- ADMIN_EMAIL: Exact admin email for admin endpoints
- DRIVE_PARENT_FOLDER_ID: Google Drive folder ID where JSON files are stored
- GCP_PROJECT_ID: Your project (optional, for reference)

## Notes on Python jobs
- /api/run-make-manifest and /api/run-json2excel are placeholders.
- Recommended: create separate Cloud Run services (Python) or Cloud Workflows connected to these endpoints. The Node service can invoke them via HTTP with appropriate auth.

## Security checklist
- CORS restricted to your domain (ORIGIN).
- No tokens in URLs; only Authorization: Bearer headers.
- Admin endpoints require exact ADMIN_EMAIL.
- Drive files are created in a private folder accessible only to the Cloud Run service account and folder collaborators you add explicitly.
- CSP in the frontend includes minimal sources and allows connect only to your Cloud Run domain.