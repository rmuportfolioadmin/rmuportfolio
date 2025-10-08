window.RMU_CONFIG = {
  GOOGLE_CLIENT_ID: '230626308317-ts08shmn77745hq81ghu5q7e2s2i0gf9.apps.googleusercontent.com',
  VC_EMAIL: 'rmuportfolioa@gmail.com',
  BACKEND_BASE: 'https://rmu-portfolio-backend-y34qi74twq-uc.a.run.app',
  // Multi-user backend configuration
  API_TIMEOUT: 20000, // 20 second timeout for API calls
  DRIVE_ENABLED: true, // Enable Google Drive integration
  AUTO_RETRY: true, // Auto-retry failed requests
  // Portfolio data location (root of repository)
  PORTFOLIO_DATA_URL: './portfolio-data.json',
  // Environment detection
  IS_LOCALHOST: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
};

// Backwards-compat shim used by some inline scripts
window.GOOGLE_CLIENT_ID = window.RMU_CONFIG.GOOGLE_CLIENT_ID;
