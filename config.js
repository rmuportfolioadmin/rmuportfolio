window.RMU_CONFIG = {
  GOOGLE_CLIENT_ID: '738776771863-5558mme9unmotsk8bnhlrmb5sq4b2qnr.apps.googleusercontent.com',
  VC_EMAIL: 'rmuportfolioa@gmail.com',
  BACKEND_BASE: 'https://rmu-portfolio-backend-y34qi74twq-uc.a.run.app',
  // Recommended Drive parent folder ID used by the backend. Kept here for developer convenience only.
  // The canonical/production value is set on the Cloud Run service via the DRIVE_PARENT_FOLDER_ID env var.
  DRIVE_PARENT_FOLDER_ID: '1mhOmMsq913sNiHbRc2xr7R4eBbQlryMa',
  ADMIN_EMAIL: 'rmuportfolioa@gmail.com',
  // Portfolio data location (root of repository)
  PORTFOLIO_DATA_URL: './portfolio-data.json',
  
  // Environment detection
  IS_LOCALHOST: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
  IS_GITHUB_PAGES: window.location.hostname.includes('github.io'),
  
  // GitHub Pages specific settings - UPDATED FOR NEW REPO NAME
  GITHUB_PAGES_URL: 'https://rmuportfolioadmin.github.io/rmuportfolio',
  
  // Frontend origin for backend CORS - supports all pages under the domain
  FRONTEND_ORIGIN: 'https://rmuportfolioadmin.github.io',
  
  // OAuth scopes - includes drive.appdata for portfolio storage
  OAUTH_SCOPES: 'profile email openid https://www.googleapis.com/auth/drive.appdata',
  
  // API timeout settings
  API_TIMEOUT: 30000, // 30 seconds
  
  // Debug mode (enabled on localhost)
  DEBUG_MODE: window.location.hostname === 'localhost'
};

// Backwards-compat shim used by some inline scripts
window.GOOGLE_CLIENT_ID = window.RMU_CONFIG.GOOGLE_CLIENT_ID;

// Log configuration for debugging
if(window.RMU_CONFIG.DEBUG_MODE) {
  console.log('[Config] RMU Portfolio Configuration Loaded:');
  console.log('[Config] Environment:', window.RMU_CONFIG.IS_LOCALHOST ? 'Localhost' : window.RMU_CONFIG.IS_GITHUB_PAGES ? 'GitHub Pages' : 'Other');
  console.log('[Config] Backend:', window.RMU_CONFIG.BACKEND_BASE);
  console.log('[Config] OAuth Client:', window.RMU_CONFIG.GOOGLE_CLIENT_ID ? 'Configured' : 'Missing');
}

// Signal to any listeners that configuration is ready (portfolio.html GIS code can defer until this fires)
try { document.dispatchEvent(new Event('rmu-config-ready')); } catch(_) {}
