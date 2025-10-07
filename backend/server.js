import express from 'express';
import cors from 'cors';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { cleanupOldTempFiles } from './cleanup-script.js';

// Environment configuration
const PORT = process.env.PORT || 8080;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ORIGIN = process.env.ORIGIN || '';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'rmuportfolioa@gmail.com').toLowerCase();
const DRIVE_PARENT_FOLDER_ID = process.env.DRIVE_PARENT_FOLDER_ID || '';

if (!GOOGLE_CLIENT_ID) console.warn('[config] GOOGLE_CLIENT_ID is not set');
if (!ORIGIN) console.warn('[config] ORIGIN is not set');
if (!DRIVE_PARENT_FOLDER_ID) console.warn('[config] DRIVE_PARENT_FOLDER_ID is not set');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));

// Strict CORS (allow configured origin; also allow GitHub Pages domain root when ORIGIN is a subpath)
app.use(cors({
  origin: function(origin, cb){
    try{
      if (!origin) return cb(null, true);
      if (origin === ORIGIN) return cb(null, true);
      // Allow GitHub Pages org root if ORIGIN is a specific page path
      if (ORIGIN && ORIGIN.startsWith('https://') && ORIGIN.includes('github.io')){
        const root = ORIGIN.split('://')[1].split('/')[0];
        const allowed = `https://${root}`;
        if (origin === allowed) return cb(null, true);
      }
    }catch(_){ }
    return cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
  credentials: false
}));

// Health & Root routes
app.get('/', (req,res)=> res.status(200).json({ 
  service: 'RMU Portfolio Backend', 
  version: '2.0.0',
  status: 'running',
  endpoints: [
    '/healthz',
    '/api/list',
    '/api/save', 
    '/api/download',
    '/api/user-portfolios',
    '/api/user-portfolio',
    '/api/user-drive-portfolio',
    '/api/storage-status',
    '/api/cleanup-temp-files',
    '/api/generate-manifest'
  ],
  features: ['multi-user-support', 'two-tier-storage', 'user-isolation']
}));
app.get('/healthz', (req,res)=> res.status(200).json({ ok: true }));

// Token verifier supporting both OAuth access tokens and JWT ID tokens
const oidcClient = new OAuth2Client(GOOGLE_CLIENT_ID);
async function verifyToken(token){
  if (!token) throw new Error('missing token');
  
  try {
    // Check if it looks like a JWT (3 parts separated by dots)
    if (token.includes('.') && token.split('.').length === 3) {
      console.log('[Auth] Verifying JWT ID token...');
      const ticket = await oidcClient.verifyIdToken({ 
        idToken: token, 
        audience: GOOGLE_CLIENT_ID 
      });
      const payload = ticket.getPayload();
      
      if (!payload || !payload.email) {
        throw new Error('JWT token missing email claim');
      }
      
      console.log(`[Auth] JWT token verified for user: ${payload.email}`);
      return { 
        email: payload.email.toLowerCase(), 
        sub: payload.sub,
        name: payload.name,
        picture: payload.picture
      };
    } else {
      // Treat as OAuth access token - verify by calling Google's userinfo endpoint
      console.log('[Auth] Verifying OAuth access token...');
      
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error(`OAuth token verification failed: ${response.status} ${response.statusText}`);
      }
      
      const userInfo = await response.json();
      
      if (!userInfo || !userInfo.email) {
        throw new Error('OAuth token missing user email');
      }
      
      console.log(`[Auth] OAuth token verified for user: ${userInfo.email}`);
      return { 
        email: userInfo.email.toLowerCase(), 
        sub: userInfo.id,
        name: userInfo.name,
        picture: userInfo.picture
      };
    }
  } catch (error) {
    console.error('[Auth] Token verification failed:', error.message);
    throw new Error(`Token verification failed: ${error.message}`);
  }
}

// Google Drive client (service account / Cloud Run default SA)
async function getDrive(){
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive'] });
  const client = await auth.getClient();
  return google.drive({ version: 'v3', auth: client });
}

// Helpers
async function ensureFolderAccessible(drive){
  // Optional: verify folder exists and we can list it
  await drive.files.get({ fileId: DRIVE_PARENT_FOLDER_ID, fields: 'id,name' });
}

async function findExistingInFolder(drive, { roll, email }){
  const qParts = [
    `'${DRIVE_PARENT_FOLDER_ID}' in parents`,
    'trashed = false'
  ];
  // Prefer appProperties if previously set
  if (roll) qParts.push(`appProperties has { key='roll' and value='${roll.replace(/'/g, "\\'")}' }`);
  if (email) qParts.push(`appProperties has { key='email' and value='${email.replace(/'/g, "\\'")}' }`);
  const q = qParts.join(' and ');
  const resp = await drive.files.list({ q, fields: 'files(id,name,modifiedTime,appProperties)', pageSize: 10, spaces: 'drive' });
  if (resp.data.files && resp.data.files.length) return resp.data.files[0];
  // Fallback by name match
  const nameQ = [`'${DRIVE_PARENT_FOLDER_ID}' in parents`, 'trashed = false'];
  if (email) nameQ.push(`name contains '${email.replace(/'/g, "\\'")}'`);
  const r2 = await drive.files.list({ q: nameQ.join(' and '), fields: 'files(id,name,modifiedTime,appProperties)', pageSize: 1 });
  return (r2.data.files && r2.data.files[0]) || null;
}

// Configuration for two-tier storage system
const TEMP_FOLDER_NAME = process.env.TEMP_FOLDER_NAME || 'portfolio-temp-storage';
const FINAL_FOLDER_NAME = process.env.FINAL_FOLDER_NAME || 'student-portfolios';

// Helper functions for improved save system
async function getOrCreateFolder(drive, folderName, parentId = null) {
  try {
    // Check if folder exists
    const queryParts = [`name='${folderName}'`, `mimeType='application/vnd.google-apps.folder'`, `trashed=false`];
    if (parentId) queryParts.push(`'${parentId}' in parents`);
    
    const folderQuery = await drive.files.list({
      q: queryParts.join(' and '),
      fields: 'files(id,name)'
    });
    
    if (folderQuery.data.files && folderQuery.data.files.length > 0) {
      return folderQuery.data.files[0].id;
    }
    
    // Create folder if it doesn't exist
    const folderMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    };
    if (parentId) folderMetadata.parents = [parentId];
    
    const folder = await drive.files.create({
      resource: folderMetadata,
      fields: 'id'
    });
    
    console.log(`[Folder] Created folder: ${folderName} with ID: ${folder.data.id}`);
    return folder.data.id;
  } catch (error) {
    throw new Error(`Failed to create/access folder ${folderName}: ${error.message}`);
  }
}

async function saveToTemporaryStorage(drive, filename, portfolio, email, metadata) {
  try {
    // Ensure temporary folder exists
    let tempFolderId = await getOrCreateFolder(drive, TEMP_FOLDER_NAME);
    
    const content = JSON.stringify({
      portfolio,
      metadata: {
        ...metadata,
        email,
        uploadedAt: new Date().toISOString(),
        status: 'temporary'
      }
    }, null, 2);
    
    const fileMetadata = {
      name: `${filename}-temp-${Date.now()}.json`,
      parents: [tempFolderId],
      description: `Temporary portfolio file for ${email}`,
      appProperties: {
        originalFilename: filename,
        userEmail: email,
        status: 'temporary',
        createdAt: new Date().toISOString()
      }
    };
    
    const media = {
      mimeType: 'application/json',
      body: content
    };
    
    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id,name'
    });
    
    console.log(`[TempSave] Saved to temporary storage: ${response.data.id}`);
    return response.data.id;
  } catch (error) {
    console.error('[TempSave] Error saving to temporary storage:', error);
    throw new Error('Failed to save to temporary storage: ' + error.message);
  }
}

async function validatePortfolioFile(tempFileId, email, portfolio) {
  try {
    console.log('[Validate] Validating portfolio file...');
    
    // Basic validation checks
    const checks = {
      hasPersonalInfo: !!(portfolio.personalInfo && Object.keys(portfolio.personalInfo).length > 0),
      hasValidEmail: isValidEmail(email),
      hasAchievements: Array.isArray(portfolio.achievements),
      hasReflections: Array.isArray(portfolio.reflections),
      reasonableSize: JSON.stringify(portfolio).length < 10 * 1024 * 1024 // 10MB limit
    };
    
    const failedChecks = Object.entries(checks)
      .filter(([key, passed]) => !passed)
      .map(([key]) => key);
    
    if (failedChecks.length > 0) {
      return {
        isValid: false,
        error: `Validation failed: ${failedChecks.join(', ')}`
      };
    }
    
    // Additional content validation
    if (portfolio.personalInfo && portfolio.personalInfo.rollNo) {
      const rollPattern = /^\d{1,3}-?[RS]?\d{2}-?[A-Z]?$/i;
      if (!rollPattern.test(portfolio.personalInfo.rollNo)) {
        return {
          isValid: false,
          error: 'Invalid roll number format'
        };
      }
    }
    
    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: 'Validation process failed: ' + error.message
    };
  }
}

async function transferToFinalStorage(drive, tempFileId, filename, email, portfolio) {
  try {
    console.log(`[Transfer] Transferring ${tempFileId} to final storage for user: ${email}`);
    
    // Create user-specific folder structure: Final Folder -> User Folder
    let finalFolderId = await getOrCreateFolder(drive, FINAL_FOLDER_NAME, DRIVE_PARENT_FOLDER_ID);
    
    // Create user-specific subfolder to avoid filename conflicts (based on authenticated user)
    const userFolderName = `user_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
    let userFolderId = await getOrCreateFolder(drive, userFolderName, finalFolderId);
    
    console.log(`[Transfer] Using user folder: ${userFolderName} (${userFolderId})`);
    
    // Generate filename based on portfolio content but ensure uniqueness per user
    const rollNo = portfolio.personalInfo?.rollNo || 'unknown';
    const portfolioEmail = portfolio.personalInfo?.email || 'unknown';
    
    // Create a more descriptive but still unique filename
    const baseFilename = filename.replace(/[^a-zA-Z0-9\-_]/g, '_');
    const uniqueFilename = `${baseFilename}_${rollNo}`;
    
    // Create final file metadata with enhanced ownership tracking
    const fileMetadata = {
      name: `${uniqueFilename}.json`,
      parents: [userFolderId],
      description: `Portfolio for ${portfolioEmail} (${rollNo}) - Owned by ${email} - Uploaded ${new Date().toISOString()}`,
      appProperties: {
        roll: rollNo,
        portfolioEmail: portfolioEmail, // Email from portfolio data
        email: email, // Authenticated user's email (owner)
        uploadedBy: email, // Authenticated user's email
        originalFilename: filename,
        userId: email, // Primary ownership identifier (authenticated user)
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'final',
        version: '1.0'
      }
    };
    
    // Clean portfolio content - remove any temporary metadata
    const cleanContent = JSON.stringify(portfolio, null, 2);
    
    const media = {
      mimeType: 'application/json',
      body: cleanContent
    };
    
    // Check if user already has a portfolio with the same base filename
    console.log(`[Transfer] Checking for existing user portfolio with filename: ${filename}`);
    const existingFiles = await drive.files.list({
      q: `'${userFolderId}' in parents and trashed=false and mimeType='application/json'`,
      fields: 'files(id,name,appProperties,modifiedTime)'
    });
    
    // Look for files from this user with the same original filename
    let existingUserFile = null;
    if (existingFiles.data.files && existingFiles.data.files.length > 0) {
      existingUserFile = existingFiles.data.files.find(file => {
        const props = file.appProperties || {};
        return (
          props.userId === email && 
          props.originalFilename === filename
        );
      });
    }
    
    let response;
    if (existingUserFile) {
      console.log(`[Transfer] Updating existing user portfolio: ${existingUserFile.id}`);
      
      // Update existing file, preserving creation date and version history
      const preservedProps = {
        ...fileMetadata.appProperties,
        createdAt: existingUserFile.appProperties?.createdAt || new Date().toISOString(),
        uploadedBy: existingUserFile.appProperties?.uploadedBy || email,
        version: `${parseFloat(existingUserFile.appProperties?.version || '1.0') + 0.1}`.substring(0, 3)
      };
      
      response = await drive.files.update({
        fileId: existingUserFile.id,
        resource: { ...fileMetadata, appProperties: preservedProps },
        media: media,
        fields: 'id,name'
      });
      
      console.log(`[Transfer] Updated existing portfolio: ${response.data.id}`);
    } else {
      console.log(`[Transfer] Creating new portfolio file for user`);
      
      // Create new file in user's folder
      response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id,name'
      });
      
      console.log(`[Transfer] Created new portfolio: ${response.data.id}`);
    }
    
    console.log(`[Transfer] Successfully transferred to final storage: ${response.data.id}`);
    return response.data.id;
  } catch (error) {
    console.error('[Transfer] Error transferring to final storage:', error);
    throw new Error('Failed to transfer to final storage: ' + error.message);
  }
}

async function cleanupTempFile(drive, tempFileId) {
  try {
    await drive.files.delete({
      fileId: tempFileId
    });
    console.log(`[Cleanup] Deleted temporary file: ${tempFileId}`);
  } catch (error) {
    console.warn(`[Cleanup] Failed to delete temporary file ${tempFileId}:`, error.message);
    // Don't throw error - cleanup failure shouldn't fail the whole operation
  }
}

// After successful final write: prune any duplicate/backup files for this user+filename
// and remove older revisions so only the latest revision remains
async function pruneFinalBackupsAndRevisions(drive, ownerEmail, filename, keptFileId) {
  try {
    // Locate the user's folder under the final folder
    const finalFolderId = await getOrCreateFolder(drive, FINAL_FOLDER_NAME, DRIVE_PARENT_FOLDER_ID);
    const userFolderName = `user_${ownerEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const userFolderId = await getOrCreateFolder(drive, userFolderName, finalFolderId);

    // Find all files for this user+originalFilename
    const listResp = await drive.files.list({
      q: `'${userFolderId}' in parents and trashed=false and mimeType='application/json'`,
      fields: 'files(id,name,appProperties,modifiedTime)'
    });

    const sanitizedBase = filename.replace(/[^a-zA-Z0-9\-_]/g, '_');
    const related = (listResp.data.files || []).filter(f => {
      const props = f.appProperties || {};
      // Prefer explicit appProperties match
      if (props.userId === ownerEmail && props.originalFilename === filename) return true;
      // Fallback: legacy files might lack appProperties; match by name pattern
      const name = f.name || '';
      return name === `${sanitizedBase}.json` || name.startsWith(`${sanitizedBase}_`);
    });

    // Delete all but the kept file
    let deletedCount = 0;
    for (const f of related) {
      if (f.id === keptFileId) continue;
      try {
        await drive.files.delete({ fileId: f.id });
        deletedCount++;
        console.log(`[Prune] Deleted duplicate/backup file: ${f.name} (${f.id})`);
      } catch (err) {
        console.warn(`[Prune] Failed to delete ${f.id}:`, err.message);
      }
    }

    // Prune older revisions of the kept file (keep only the most recent)
    try {
      const revList = await drive.revisions.list({ fileId: keptFileId, fields: 'revisions(id,modifiedTime,keepForever)' });
      const revisions = revList.data.revisions || [];
      if (revisions.length > 1) {
        // Sort by modifiedTime and keep the newest
        const sorted = [...revisions].sort((a, b) => new Date(a.modifiedTime) - new Date(b.modifiedTime));
        const toDelete = sorted.slice(0, -1); // all except newest
        for (const rev of toDelete) {
          try {
            await drive.revisions.delete({ fileId: keptFileId, revisionId: rev.id });
            console.log(`[Prune] Deleted old revision ${rev.id} of file ${keptFileId}`);
          } catch (err) {
            console.warn(`[Prune] Failed deleting revision ${rev.id} of ${keptFileId}:`, err.message);
          }
        }
      }
    } catch (err) {
      // Not all file types support revisions, or permissions may vary; continue
      console.warn('[Prune] Skipped revision pruning:', err.message);
    }

    return { deletedDuplicates: deletedCount };
  } catch (error) {
    console.warn('[Prune] Failed to prune backups/versions:', error.message);
    return { deletedDuplicates: 0, error: error.message };
  }
}

// Permanently delete only our app's trashed JSONs inside known folders (protects unrelated files)
async function emptyServiceAccountTrash(drive) {
  try {
    const finalFolderId = await getOrCreateFolder(drive, FINAL_FOLDER_NAME, DRIVE_PARENT_FOLDER_ID);
    const tempFolderId = await getOrCreateFolder(drive, TEMP_FOLDER_NAME);
    const folderIds = [tempFolderId, finalFolderId];

    for (const folderId of folderIds) {
      try {
        // Only pick trashed JSON files that likely belong to our app (have appProperties or .json name)
        const trashed = await drive.files.list({
          q: `'${folderId}' in parents and trashed=true and mimeType='application/json'`,
          fields: 'files(id,name,appProperties)'
        });
        for (const f of trashed.data.files || []) {
          const props = f.appProperties || {};
          const isOurFile = !!(props.userId || props.originalFilename || props.status);
          if (isOurFile || (f.name || '').toLowerCase().endsWith('.json')) {
            try {
              await drive.files.delete({ fileId: f.id });
              console.log(`[Cleanup] Permanently deleted trashed JSON: ${f.name} (${f.id})`);
            } catch (e) {
              console.warn(`[Cleanup] Failed to permanently delete trashed file ${f.id}:`, e.message);
            }
          }
        }
      } catch (e) {
        console.warn('[Cleanup] Skipped selective trash cleanup for folder', folderId, e.message);
      }
    }
  } catch (err) {
    console.warn('[Cleanup] Selective trash cleanup encountered an issue:', err.message);
  }
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPortfolioData(portfolio) {
  return portfolio && 
         typeof portfolio === 'object' &&
         (Array.isArray(portfolio.achievements) || portfolio.achievements === undefined) &&
         (Array.isArray(portfolio.reflections) || portfolio.reflections === undefined);
}

// Enhanced save endpoint with two-tier storage system
app.post('/api/save', async (req, res) => {
  try {
    console.log('[Save] Processing save request...');
    
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const { email: userEmail } = await verifyToken(token);

    const { roll, email, filename, portfolio, metadata } = req.body || {};
    
    // Validate required fields
    if (!email || !filename || !portfolio) {
      return res.status(400).json({ 
        error: 'Missing required fields: email, filename, or portfolio data' 
      });
    }
    
    // Validate email format and content
    if (!isValidEmail(email) || !isValidPortfolioData(portfolio)) {
      return res.status(400).json({ 
        error: 'Invalid email format or portfolio data' 
      });
    }
    
    // Multi-user support: Use authenticated user's email instead of portfolio email for ownership
    // This allows users to save portfolios with any email in the data, but ownership is tied to authenticated user
    const authenticatedEmail = userEmail.toLowerCase();
    const portfolioEmail = email.toLowerCase();
    
    console.log(`[Save] Authenticated user: ${authenticatedEmail}, Portfolio email: ${portfolioEmail}`);
    
    // For security and multi-user support, always use the authenticated user's email for file ownership
    // But preserve the original email in the portfolio data
    const ownerEmail = authenticatedEmail;
    
    console.log(`[Save] Validated request for authenticated user: ${authenticatedEmail}, portfolio email: ${portfolioEmail}, filename: ${filename}`);
    
    const drive = await getDrive();
    
    // Step 1: Save to temporary storage in service account drive (use authenticated email for ownership)
    const tempFileId = await saveToTemporaryStorage(drive, filename, portfolio, ownerEmail, metadata);
    console.log(`[Save] Saved to temporary storage: ${tempFileId}`);
    
    // Step 2: Validate and process the file
    const validationResult = await validatePortfolioFile(tempFileId, ownerEmail, portfolio);
    if (!validationResult.isValid) {
      // Clean up temporary file
      await cleanupTempFile(drive, tempFileId);
      return res.status(400).json({ 
        error: 'Portfolio validation failed: ' + validationResult.error 
      });
    }
    
  // Step 3: Transfer to final storage (use authenticated email for ownership, preserve portfolio email in data)
  const finalFileId = await transferToFinalStorage(drive, tempFileId, filename, ownerEmail, portfolio);
    console.log(`[Save] Transferred to final storage: ${finalFileId}`);
    
  // Step 4: Clean up temporary storage (permanent delete)
  await cleanupTempFile(drive, tempFileId);
  console.log(`[Save] Cleaned up temporary file: ${tempFileId}`);

  // Step 5: Prune any previous duplicates/backups and older revisions for this user's file
  await pruneFinalBackupsAndRevisions(drive, ownerEmail, filename, finalFileId);

  // Step 6: Ensure service account trash is emptied to free space immediately
  await emptyServiceAccountTrash(drive);

  // Step 7: Opportunistic background cleanup of any lingering old temp files
  // (uses the same service account credentials on Cloud Run)
  try { await cleanupOldTempFiles(); } catch (e) { console.warn('[Cleanup] Background old-temp cleanup skipped:', e.message); }
    
    res.json({
      success: true,
      fileId: finalFileId,
      message: 'Portfolio saved successfully',
      filename: filename + '.json'
    });
    
  } catch (error) {
    console.error('[Save] Error:', error);
    
    // Provide user-friendly error messages
    if (error.message.includes('quota') || error.message.includes('storage')) {
      res.status(507).json({
        error: 'Storage temporarily full. Please contact the administrator.',
        details: 'The temporary storage is at capacity. This will be resolved shortly.'
      });
    } else if (error.message.includes('permissions') || error.message.includes('Access denied') || error.message.includes('Forbidden')) {
      res.status(403).json({
        error: 'Access denied. Please ensure you are using the correct account and try again.',
        details: 'You can only save and update portfolios under your own authenticated account. Each user has their own secure storage space.'
      });
    } else if (error.message.includes('authentication') || error.message.includes('token')) {
      res.status(401).json({
        error: 'Authentication failed. Please sign in again.',
        details: 'Your authentication token may have expired. Please refresh the page and sign in again.'
      });
    } else if (error.message.includes('validation')) {
      res.status(400).json({
        error: 'Portfolio data validation failed.',
        details: error.message
      });
    } else {
      res.status(500).json({
        error: 'Internal server error. Please try again later.',
        details: process.env.NODE_ENV === 'development' ? error.message : 'Contact support if this persists.'
      });
    }
  }
});

// Admin-only list (updated to work with new user-specific folder structure)
app.get('/api/list', async (req,res)=>{
  try{
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const { email } = await verifyToken(token);
    if (email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' });

    const drive = await getDrive();
    await ensureFolderAccessible(drive);
    
    // Get final folder ID
    const finalFolderId = await getOrCreateFolder(drive, FINAL_FOLDER_NAME, DRIVE_PARENT_FOLDER_ID);
    
    console.log(`[List] Scanning user folders in: ${finalFolderId}`);
    
    const items = [];
    
    // First, get all user folders
    const userFoldersResp = await drive.files.list({
      q: `'${finalFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name)',
      pageSize: 100
    });
    
    console.log(`[List] Found ${userFoldersResp.data.files?.length || 0} user folders`);
    
    // Scan each user folder for portfolios
    for (const userFolder of (userFoldersResp.data.files || [])) {
      try {
        console.log(`[List] Scanning user folder: ${userFolder.name}`);
        
        let pageToken = undefined;
        do {
          const resp = await drive.files.list({
            q: `'${userFolder.id}' in parents and trashed=false and mimeType='application/json'`,
            fields: 'nextPageToken, files(id,name,modifiedTime,appProperties,size)',
            pageSize: 100,
            pageToken,
            orderBy: 'modifiedTime desc'
          });
          
          (resp.data.files || []).forEach(f => {
            const props = f.appProperties || {};
            items.push({
              id: f.id,
              file: props.originalFilename || f.name.replace(/\.json$/, ''),
              name: f.name,
              roll: props.roll || '',
              email: props.email || props.userId || '',
              updatedAt: f.modifiedTime,
              uploadedBy: props.uploadedBy || props.userId || '',
              createdAt: props.createdAt || f.modifiedTime,
              version: props.version || '1.0',
              size: parseInt(f.size || '0'),
              userFolder: userFolder.name
            });
          });
          
          pageToken = resp.data.nextPageToken || undefined;
        } while (pageToken);
        
      } catch (err) {
        console.warn(`[List] Error scanning folder ${userFolder.name}:`, err.message);
      }
    }
    
    // Also check for any legacy files directly in the final folder (for backward compatibility)
    try {
      const legacyResp = await drive.files.list({
        q: `'${finalFolderId}' in parents and trashed=false and mimeType='application/json'`,
        fields: 'files(id,name,modifiedTime,appProperties,size)',
        pageSize: 100,
        orderBy: 'modifiedTime desc'
      });
      
      (legacyResp.data.files || []).forEach(f => {
        const props = f.appProperties || {};
        items.push({
          id: f.id,
          file: f.name.replace(/\.json$/, ''),
          name: f.name,
          roll: props.roll || '',
          email: props.email || props.userId || '',
          updatedAt: f.modifiedTime,
          uploadedBy: props.uploadedBy || props.userId || '',
          createdAt: props.createdAt || f.modifiedTime,
          version: props.version || 'legacy',
          size: parseInt(f.size || '0'),
          userFolder: 'legacy'
        });
      });
      
      console.log(`[List] Found ${legacyResp.data.files?.length || 0} legacy files`);
    } catch (err) {
      console.warn('[List] Error scanning legacy files:', err.message);
    }

    // Sort by most recent first
    items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    console.log(`[List] Found ${items.length} total portfolios across all user folders`);
    res.status(200).json(items);
  }catch(err){
    console.error('/api/list error', err);
    const code = (''+err).includes('Not allowed by CORS') ? 403 : 500;
    res.status(code).json({ error: err.message || 'Server error' });
  }
});

// User-specific portfolio management endpoints

// Get user's own portfolios
app.get('/api/user-portfolios', async (req, res) => {
  try {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const { email } = await verifyToken(token);
    
    console.log(`[UserPortfolios] Fetching portfolios for user: ${email}`);
    
    const drive = await getDrive();
    await ensureFolderAccessible(drive);
    
    // Get final folder and user-specific folder
    const finalFolderId = await getOrCreateFolder(drive, FINAL_FOLDER_NAME, DRIVE_PARENT_FOLDER_ID);
    const userFolderName = `user_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
    
    let userPortfolios = [];
    
    try {
      const userFolderId = await getOrCreateFolder(drive, userFolderName, finalFolderId);
      
      const resp = await drive.files.list({
        q: `'${userFolderId}' in parents and trashed=false and mimeType='application/json'`,
        fields: 'files(id,name,modifiedTime,appProperties,size)',
        pageSize: 50,
        orderBy: 'modifiedTime desc'
      });
      
      userPortfolios = (resp.data.files || []).map(f => {
        const props = f.appProperties || {};
        return {
          id: f.id,
          filename: props.originalFilename || f.name.replace(/\.json$/, ''),
          fullName: f.name,
          roll: props.roll || '',
          createdAt: props.createdAt || f.modifiedTime,
          updatedAt: f.modifiedTime,
          version: props.version || '1.0',
          size: parseInt(f.size || '0')
        };
      });
      
    } catch (err) {
      console.log(`[UserPortfolios] No user folder found or error accessing: ${err.message}`);
    }
    
    console.log(`[UserPortfolios] Found ${userPortfolios.length} portfolios for user: ${email}`);
    res.json({
      success: true,
      portfolios: userPortfolios,
      userEmail: email
    });
    
  } catch (err) {
    console.error('[UserPortfolios] Error:', err);
    res.status(500).json({ 
      error: 'Failed to fetch user portfolios',
      details: err.message
    });
  }
});

// Get user's specific portfolio
app.get('/api/user-portfolio', async (req, res) => {
  try {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const { email } = await verifyToken(token);
    
    const filename = req.query.filename;
    const fileId = req.query.id;
    
    console.log(`[UserPortfolio] Fetching portfolio for user: ${email}, filename: ${filename}, id: ${fileId}`);
    
    const drive = await getDrive();
    await ensureFolderAccessible(drive);
    
    let targetFileId = null;
    
    if (fileId) {
      // Verify the file belongs to the user
      try {
        const fileMetadata = await drive.files.get({
          fileId: fileId,
          fields: 'id,name,appProperties,parents'
        });
        
        const props = fileMetadata.data.appProperties || {};
        if (props.userId !== email && props.email !== email) {
          return res.status(403).json({ 
            error: 'Access denied: This portfolio belongs to another user' 
          });
        }
        
        targetFileId = fileId;
      } catch (err) {
        return res.status(404).json({ 
          error: 'Portfolio not found or access denied' 
        });
      }
    } else if (filename) {
      // Search for user's portfolio by filename
      const finalFolderId = await getOrCreateFolder(drive, FINAL_FOLDER_NAME, DRIVE_PARENT_FOLDER_ID);
      const userFolderName = `user_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
      
      try {
        const userFolderId = await getOrCreateFolder(drive, userFolderName, finalFolderId);
        
        const resp = await drive.files.list({
          q: `'${userFolderId}' in parents and trashed=false and mimeType='application/json'`,
          fields: 'files(id,name,appProperties)'
        });
        
        const matchingFile = (resp.data.files || []).find(f => {
          const props = f.appProperties || {};
          return props.originalFilename === filename;
        });
        
        if (matchingFile) {
          targetFileId = matchingFile.id;
        }
      } catch (err) {
        console.log(`[UserPortfolio] Error searching user folder: ${err.message}`);
      }
    } else {
      // Get user's most recent portfolio
      const finalFolderId = await getOrCreateFolder(drive, FINAL_FOLDER_NAME, DRIVE_PARENT_FOLDER_ID);
      const userFolderName = `user_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
      
      try {
        const userFolderId = await getOrCreateFolder(drive, userFolderName, finalFolderId);
        
        const resp = await drive.files.list({
          q: `'${userFolderId}' in parents and trashed=false and mimeType='application/json'`,
          fields: 'files(id,name,modifiedTime)',
          pageSize: 1,
          orderBy: 'modifiedTime desc'
        });
        
        if (resp.data.files && resp.data.files.length > 0) {
          targetFileId = resp.data.files[0].id;
        }
      } catch (err) {
        console.log(`[UserPortfolio] Error accessing user folder: ${err.message}`);
      }
    }
    
    if (!targetFileId) {
      return res.status(404).json({ 
        error: 'No portfolio found',
        suggestion: 'Create your first portfolio by saving one from the portfolio page'
      });
    }
    
    // Download the portfolio content
    const resp = await drive.files.get({ 
      fileId: targetFileId, 
      alt: 'media' 
    }, { responseType: 'stream' });
    
    let portfolioData = '';
    resp.data.on('data', chunk => {
      portfolioData += chunk.toString();
    });
    
    resp.data.on('end', () => {
      try {
        const parsedData = JSON.parse(portfolioData);
        console.log(`[UserPortfolio] Successfully retrieved portfolio for user: ${email}`);
        res.json(parsedData);
      } catch (parseErr) {
        console.error('[UserPortfolio] Error parsing portfolio JSON:', parseErr);
        res.status(500).json({ 
          error: 'Portfolio file is corrupted',
          details: 'Please contact support'
        });
      }
    });
    
    resp.data.on('error', (err) => {
      console.error('[UserPortfolio] Stream error:', err);
      res.status(500).json({ 
        error: 'Failed to download portfolio',
        details: err.message
      });
    });
    
  } catch (err) {
    console.error('[UserPortfolio] Error:', err);
    res.status(500).json({ 
      error: 'Failed to fetch user portfolio',
      details: err.message
    });
  }
});

// Delete user's own portfolio
app.delete('/api/user-portfolio/:id', async (req, res) => {
  try {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const { email } = await verifyToken(token);
    
    const fileId = req.params.id;
    
    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }
    
    console.log(`[DeletePortfolio] User ${email} requesting to delete: ${fileId}`);
    
    const drive = await getDrive();
    
    // Verify ownership before deletion
    try {
      const fileMetadata = await drive.files.get({
        fileId: fileId,
        fields: 'id,name,appProperties'
      });
      
      const props = fileMetadata.data.appProperties || {};
      if (props.userId !== email && props.email !== email) {
        return res.status(403).json({ 
          error: 'Access denied: You can only delete your own portfolios' 
        });
      }
    } catch (err) {
      return res.status(404).json({ 
        error: 'Portfolio not found' 
      });
    }
    
    // Delete the file
    await drive.files.delete({ fileId: fileId });
    
    console.log(`[DeletePortfolio] Successfully deleted portfolio: ${fileId} for user: ${email}`);
    res.json({
      success: true,
      message: 'Portfolio deleted successfully'
    });
    
  } catch (err) {
    console.error('[DeletePortfolio] Error:', err);
    res.status(500).json({ 
      error: 'Failed to delete portfolio',
      details: err.message
    });
  }
});

// Admin-only download
app.get('/api/download', async (req,res)=>{
  try{
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const { email } = await verifyToken(token);
    if (email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' });
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const drive = await getDrive();
    const resp = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'stream' });
    res.setHeader('Content-Type', 'application/json');
    resp.data.pipe(res);
  }catch(err){
    console.error('/api/download error', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// Generate files.json manifest from Drive contents (VC only)
app.post('/api/generate-manifest', async (req,res)=>{
  try{
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const { email } = await verifyToken(token);
    if (email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden - VC access required' });

    console.log('[manifest] VC authenticated - generating files.json from Drive');
    const drive = await getDrive();
    await ensureFolderAccessible(drive);
    
    const portfolios = [];
    let pageToken = undefined;
    
    do{
      const resp = await drive.files.list({
        q: `'${DRIVE_PARENT_FOLDER_ID}' in parents and trashed = false and mimeType = 'application/json'`,
        fields: 'nextPageToken, files(id,name,modifiedTime,appProperties,size)',
        pageSize: 200,
        pageToken,
        orderBy: 'modifiedTime desc'
      });
      
      (resp.data.files||[]).forEach(f=>{
        const studentName = extractStudentNameFromFilename(f.name);
        const rollNo = f.appProperties?.roll || extractRollFromFilename(f.name);
        
        portfolios.push({
          file: f.name,
          name: studentName || f.name.replace(/\.json$/i, ''),
          roll: rollNo,
          email: f.appProperties?.email || '',
          size: f.size ? parseInt(f.size) : 0,
          updatedAt: f.modifiedTime,
          driveId: f.id,
          source: 'drive'
        });
      });
      
      pageToken = resp.data.nextPageToken || undefined;
    } while(pageToken);

    console.log(`[manifest] Generated manifest with ${portfolios.length} portfolios from Drive`);
    
    // Sort by roll number if available, then by name
    portfolios.sort((a, b) => {
      if (a.roll && b.roll) return a.roll.localeCompare(b.roll);
      if (a.roll && !b.roll) return -1;
      if (!a.roll && b.roll) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    return res.status(200).json({ 
      success: true, 
      count: portfolios.length,
      manifest: portfolios,
      generatedAt: new Date().toISOString()
    });
  }catch(err){
    console.error('/api/generate-manifest error', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

// Helper functions for manifest generation
function extractStudentNameFromFilename(filename) {
  // Remove .json extension and common suffixes
  let name = filename.replace(/\.json$/i, '')
                   .replace(/-?(medfolio|portfolio|file)$/i, '')
                   .replace(/-?R?\d{2}$/i, '');
  
  // Replace various separators with spaces and clean up
  name = name.replace(/[-_]+/g, ' ')
             .replace(/\s+/g, ' ')
             .trim();
  
  // Capitalize words
  name = name.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  
  return name || '';
}

function extractRollFromFilename(filename) {
  const rollPatterns = [
    /(\d{1,3}-R\d{2})/i,        // 123-R52, 67-R52
    /(\d{3}-\d{2})/i,           // 280-52, 221-52  
    /[_-](\d{3})[^\d]/i,        // _280, -221
    /[_-]([RS]\d{2})/i,         // -R52, _R51
    /(\d{2,3})\s*$/i            // ending numbers
  ];
  
  for(const pattern of rollPatterns) {
    const match = filename.match(pattern);
    if(match) {
      let roll = match[1].toUpperCase();
      // Standardize format if needed
      if(/^\d{2,3}$/.test(roll)) {
        roll = roll.length === 2 ? `000-R${roll}` : `${roll.slice(0,-2)}-R${roll.slice(-2)}`;
      }
      return roll;
    }
  }
  return '';
}

// Get user's personal portfolio from their Drive appdata folder (legacy)
app.get('/api/user-drive-portfolio', async (req,res)=>{
  try{
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const { email } = await verifyToken(token);
    
    console.log(`[user-portfolio] Loading portfolio for user: ${email}`);
    
    // Create OAuth2 client with user's access token
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token });
    
    const drive = google.drive({ 
      version: 'v3', 
      auth: oauth2Client
    });
    
    // Search for portfolio-data.json (preferred) in user's appDataFolder, fallback to portfolio.json
    let file = null;
    const searchPrimary = await drive.files.list({
      q: "name='portfolio-data.json' and parents in 'appDataFolder' and trashed=false",
      spaces: 'appDataFolder',
      fields: 'files(id,name,modifiedTime)',
      pageSize: 1
    });
    if (searchPrimary.data.files && searchPrimary.data.files.length) {
      file = searchPrimary.data.files[0];
    } else {
      const searchFallback = await drive.files.list({
        q: "name='portfolio.json' and parents in 'appDataFolder' and trashed=false",
        spaces: 'appDataFolder',
        fields: 'files(id,name,modifiedTime)',
        pageSize: 1
      });
      if (searchFallback.data.files && searchFallback.data.files.length) {
        file = searchFallback.data.files[0];
      }
    }

    if(!file) {
      console.log(`[user-portfolio] No portfolio found in appdata for ${email}`);
      return res.status(404).json({ error: 'No portfolio found in your Drive' });
    }
    console.log(`[user-portfolio] Found portfolio file:`, file.name, file.id);
    
    // Download the file content
    const downloadResp = await drive.files.get({ fileId: file.id, alt: 'media' });
    // googleapis returns object when not streaming; handle both string/object safely
    const raw = downloadResp.data;
    const portfolioData = (typeof raw === 'string') ? JSON.parse(raw) : raw;
    console.log(`[user-portfolio] Successfully loaded portfolio for ${email}`);
    
    res.status(200).json(portfolioData);
    
  }catch(err){
    console.error('/api/user-portfolio error', err);
    if(err.code === 404 || err.message.includes('not found')) {
      return res.status(404).json({ error: 'Portfolio not found in your Google Drive' });
    }
    res.status(500).json({ error: err.message || 'Failed to load user portfolio' });
  }
});

// Admin-only cleanup endpoint for old temporary files
app.post('/api/cleanup-temp-files', async (req, res) => {
  try {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const { email } = await verifyToken(token);
    if (email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' });

    const drive = await getDrive();
    const tempFolderId = await getOrCreateFolder(drive, TEMP_FOLDER_NAME);
    
    // Find temp files older than 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const oldFiles = await drive.files.list({
      q: `'${tempFolderId}' in parents and createdTime < '${oneDayAgo}' and trashed=false`,
      fields: 'files(id,name,createdTime)',
      pageSize: 100
    });
    
    let cleanedCount = 0;
    const errors = [];
    
    for (const file of oldFiles.data.files || []) {
      try {
        await drive.files.delete({ fileId: file.id });
        console.log(`[Cleanup] Deleted old temp file: ${file.name}`);
        cleanedCount++;
      } catch (error) {
        console.warn(`[Cleanup] Failed to delete ${file.name}:`, error.message);
        errors.push(`${file.name}: ${error.message}`);
      }
    }
    
    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} old temporary files`,
      cleanedCount,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (err) {
    console.error('/api/cleanup-temp-files error', err);
    res.status(500).json({ error: err.message || 'Cleanup failed' });
  }
});

// Admin-only storage monitoring endpoint
app.get('/api/storage-status', async (req, res) => {
  try {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const { email } = await verifyToken(token);
    if (email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' });

    const drive = await getDrive();
    
    // Get storage quota information
    const about = await drive.about.get({
      fields: 'storageQuota'
    });
    
    const quota = about.data.storageQuota;
    const usedBytes = parseInt(quota.usage || 0);
    const limitBytes = parseInt(quota.limit || 0);
    const usedGB = usedBytes / (1024 ** 3);
    const limitGB = limitBytes / (1024 ** 3);
    const usagePercent = limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0;
    
    // Count temporary files
    const tempFolderId = await getOrCreateFolder(drive, TEMP_FOLDER_NAME);
    const tempFiles = await drive.files.list({
      q: `'${tempFolderId}' in parents and trashed=false`,
      fields: 'files(id)',
      pageSize: 1000
    });
    const tempFileCount = tempFiles.data.files?.length || 0;
    
    // Count final files and user statistics
    const finalFolderId = await getOrCreateFolder(drive, FINAL_FOLDER_NAME, DRIVE_PARENT_FOLDER_ID);
    
    // Get user folders
    const userFoldersResp = await drive.files.list({
      q: `'${finalFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name)',
      pageSize: 100
    });
    
    const userFolders = userFoldersResp.data.files || [];
    let totalUserPortfolios = 0;
    let userStats = [];
    
    // Count portfolios per user
    for (const folder of userFolders) {
      try {
        const userPortfolios = await drive.files.list({
          q: `'${folder.id}' in parents and trashed=false and mimeType='application/json'`,
          fields: 'files(id)',
          pageSize: 100
        });
        const count = userPortfolios.data.files?.length || 0;
        totalUserPortfolios += count;
        
        const userEmail = folder.name.replace('user_', '').replace(/_/g, '.');
        userStats.push({
          userFolder: folder.name,
          email: userEmail,
          portfolioCount: count
        });
      } catch (err) {
        console.warn(`[Storage] Error counting portfolios for ${folder.name}:`, err.message);
      }
    }
    
    // Count legacy files (directly in final folder)
    const legacyFiles = await drive.files.list({
      q: `'${finalFolderId}' in parents and trashed=false and mimeType='application/json'`,
      fields: 'files(id)',
      pageSize: 1000
    });
    const legacyFileCount = legacyFiles.data.files?.length || 0;
    
    const finalFileCount = totalUserPortfolios + legacyFileCount;
    
    const status = {
      storage: {
        usedGB: parseFloat(usedGB.toFixed(2)),
        limitGB: parseFloat(limitGB.toFixed(2)),
        usagePercent: parseFloat(usagePercent.toFixed(1)),
        isNearLimit: usagePercent > 80
      },
      files: {
        temporary: tempFileCount,
        final: finalFileCount,
        userPortfolios: totalUserPortfolios,
        legacyFiles: legacyFileCount,
        total: tempFileCount + finalFileCount
      },
      users: {
        totalUsers: userFolders.length,
        activeUsers: userStats.filter(u => u.portfolioCount > 0).length,
        userStats: userStats.sort((a, b) => b.portfolioCount - a.portfolioCount)
      },
      folders: {
        tempFolderId,
        finalFolderId,
        parentFolderId: DRIVE_PARENT_FOLDER_ID,
        userFolderCount: userFolders.length
      },
      timestamp: new Date().toISOString()
    };
    
    console.log(`[Storage] Usage: ${usedGB.toFixed(2)}GB / ${limitGB.toFixed(2)}GB (${usagePercent.toFixed(1)}%)`);
    
    res.json(status);
    
  } catch (err) {
    console.error('/api/storage-status error', err);
    res.status(500).json({ error: err.message || 'Failed to get storage status' });
  }
});

// Stubs for future Python jobs
app.post('/api/run-json2excel', async (req,res)=>{
  return res.status(501).json({ error: 'Not implemented' });
});

app.listen(PORT, ()=>{
  console.log(`RMU backend listening on ${PORT}`);
  console.log(`Configured folders: temp="${TEMP_FOLDER_NAME}", final="${FINAL_FOLDER_NAME}"`);
  console.log(`Parent folder ID: ${DRIVE_PARENT_FOLDER_ID}`);
});
