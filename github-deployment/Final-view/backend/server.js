import express from 'express';
import cors from 'cors';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

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
  version: '1.0.0',
  status: 'running',
  endpoints: ['/healthz', '/api/list', '/api/save', '/api/download', '/api/generate-manifest']
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

// Save endpoint (any signed-in user) — writes to private backend folder using service account
app.post('/api/save', async (req, res) => {
  try{
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const { email: userEmail } = await verifyToken(token);

    const { roll = '', email = '', portfolio = null } = req.body || {};
    if (!portfolio || typeof portfolio !== 'object') return res.status(400).json({ error: 'Missing portfolio object' });

    const drive = await getDrive();
    await ensureFolderAccessible(drive);

    // Build metadata
    const nameBase = (roll || email || userEmail || 'portfolio').toString().trim().replace(/[^A-Za-z0-9._-]+/g, '-').slice(0,80) || 'portfolio';
    const filename = `${nameBase}.json`;
    const appProps = { roll: String(roll||''), email: String(email||''), uploadedBy: userEmail, updatedAt: new Date().toISOString() };

    const existing = await findExistingInFolder(drive, { roll, email });
    const fileMetadata = { name: filename, parents: [DRIVE_PARENT_FOLDER_ID], appProperties: appProps, mimeType: 'application/json' };
    const media = { mimeType: 'application/json', body: JSON.stringify(portfolio) };

    let fileId = null;
    if (existing && existing.id) {
      // Verify ownership before allowing update
      const existingOwner = existing.appProperties?.uploadedBy || existing.appProperties?.email;
      if (existingOwner && existingOwner.toLowerCase() !== userEmail.toLowerCase()) {
        return res.status(403).json({ 
          error: 'Access denied: Only the file creator can update this portfolio',
          details: `File belongs to ${existingOwner}, current user is ${userEmail}`
        });
      }
      
      // Preserve original owner information while updating other properties
      const preservedProps = {
        ...appProps,
        uploadedBy: existing.appProperties?.uploadedBy || userEmail, // Keep original owner
        createdAt: existing.appProperties?.createdAt || new Date().toISOString() // Preserve creation time if exists
      };
      
      await drive.files.update({ fileId: existing.id, requestBody: { name: filename, appProperties: preservedProps }, media });
      fileId = existing.id;
    } else {
      // Creating new file - set current user as owner
      const newFileProps = {
        ...appProps,
        uploadedBy: userEmail,
        createdAt: new Date().toISOString()
      };
      const newMetadata = { ...fileMetadata, appProperties: newFileProps };
      
      const created = await drive.files.create({ requestBody: newMetadata, media, fields: 'id' });
      fileId = created.data.id;
    }

    return res.status(200).json({ success: true, fileId });
  }catch(err){
    console.error('/api/save error', err);
    const code = (''+err).includes('Not allowed by CORS') ? 403 : 500;
    return res.status(code).json({ error: err.message || 'Server error' });
  }
});

// Admin-only list
app.get('/api/list', async (req,res)=>{
  try{
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const { email } = await verifyToken(token);
    if (email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' });

    const drive = await getDrive();
    await ensureFolderAccessible(drive);
    const items = [];
    let pageToken = undefined;
    do{
      const resp = await drive.files.list({
        q: `'${DRIVE_PARENT_FOLDER_ID}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id,name,modifiedTime,appProperties)',
        pageSize: 200,
        pageToken
      });
      (resp.data.files||[]).forEach(f=>{
        items.push({ id: f.id, file: f.name, roll: f.appProperties?.roll || '', email: f.appProperties?.email || '', updatedAt: f.modifiedTime });
      });
      pageToken = resp.data.nextPageToken || undefined;
    } while(pageToken);

    res.status(200).json(items);
  }catch(err){
    console.error('/api/list error', err);
    const code = (''+err).includes('Not allowed by CORS') ? 403 : 500;
    res.status(code).json({ error: err.message || 'Server error' });
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

// Get user's personal portfolio from their Drive appdata folder
app.get('/api/user-portfolio', async (req,res)=>{
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

// Stubs for future Python jobs
app.post('/api/run-json2excel', async (req,res)=>{
  return res.status(501).json({ error: 'Not implemented' });
});

app.listen(PORT, ()=>{
  console.log(`RMU backend listening on ${PORT}`);
});
