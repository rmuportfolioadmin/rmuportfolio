// auth.js - modernized Google auth helpers using Google Identity Services only
(function(){
  const cfg = (window.RMU_CONFIG || {});
  // Read the client id lazily at call time to avoid timing issues where config.js
  // may not have been applied yet when this module executes. Use an explicit
  // empty string when not configured to allow callers to detect missing id.
  function getClientId() {
    const c = (window.RMU_CONFIG && window.RMU_CONFIG.GOOGLE_CLIENT_ID) || (typeof window.GOOGLE_CLIENT_ID !== 'undefined' ? window.GOOGLE_CLIENT_ID : '');
    return c || '';
  }
  const VC_EMAIL = (cfg.VC_EMAIL || 'rmuportfolioa@gmail.com').toLowerCase();

  // Store current auth state
  let currentToken = null;
  let currentUserEmail = null;

  // Ensure Google Identity Services is available
  function _ensureGisReady(){
    return new Promise((resolve)=>{
      if(window.google && google.accounts){ return resolve(); }
      const t = setInterval(()=>{
        if(window.google && google.accounts){ clearInterval(t); resolve(); }
      }, 200);
    });
  }

  async function getIdToken(){
    console.log('[Auth] Getting ID token using Google Identity Services...');
    
    // Return cached token if available
    if (currentToken) {
      console.log('[Auth] Using cached token');
      return currentToken;
    }
    
    // Use Google Identity Services to get a new token
    await _ensureGisReady();
    
    try {
      // Use the credential response approach
      const _cid = getClientId();
      if (!_cid) {
        throw new Error('CLIENT_ID not configured. Set RMU_CONFIG.GOOGLE_CLIENT_ID or GOOGLE_CLIENT_ID');
      }

      return new Promise((resolve, reject)=>{
        try {
          google.accounts.id.initialize({ 
            client_id: _cid, 
            callback: (resp)=>{
              if(resp && resp.credential) {
                currentToken = resp.credential;
                console.log('[Auth] Got credential token from GIS');
                return resolve(resp.credential);
              }
              reject(new Error('No credential from Google Identity Services'));
            }
          });
          
          // Try to get credential silently first
          google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
              console.log('[Auth] Silent credential request failed, user interaction required');
              reject(new Error('User interaction required for authentication'));
            }
          });
        } catch (e) {
          console.error('[Auth] GIS initialization failed', e);
          reject(e);
        }
      });
    } catch (e) { 
      console.error('[Auth] ID token error:', e);
      throw e; 
    }
  }

  function getCurrentUserEmail(){
    // Only log if debugging is enabled to reduce console spam
    if (window.DEBUG_AUTH || window.RMU_CONFIG?.DEBUG_MODE) {
      console.log('[Auth] Getting current user email, cached:', currentUserEmail);
    }
    return currentUserEmail || '';
  }

  // Add rate limiting to prevent excessive auth calls
  let lastAuthCall = 0;
  const AUTH_CALL_COOLDOWN = 1000; // 1 second
  
  function shouldAllowAuthCall() {
    const now = Date.now();
    if (now - lastAuthCall < AUTH_CALL_COOLDOWN) {
      return false;
    }
    lastAuthCall = now;
    return true;
  }

  function setCurrentUserEmail(email) {
    currentUserEmail = email ? email.toLowerCase() : '';
    console.log('[Auth] Set current user email:', currentUserEmail);
  }

  function isAdmin(){
    const email = getCurrentUserEmail();
    const admin = email === VC_EMAIL;
    console.log('[Auth] Is admin check:', email, 'vs', VC_EMAIL, '=', admin);
    return admin;
  }

  // Modern authentication method using Google Identity Services with rate limiting
  async function authenticateUser() {
    const _cid2 = getClientId();
    if (!_cid2) {
      throw new Error('CLIENT_ID not configured. Cannot authenticate.');
    }
    if (!shouldAllowAuthCall()) {
      console.log('[Auth] Rate limited - authentication call too frequent');
      throw new Error('Authentication rate limited. Please wait before trying again.');
    }
    
    console.log('[Auth] Starting modern authentication...');
    
    try {
      await _ensureGisReady();
      
      return new Promise((resolve, reject) => {
        if (!getClientId()) {
          console.error('[Auth] CLIENT_ID missing - cannot initialize token client');
          return reject(new Error('CLIENT_ID missing'));
        }
        const tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: getClientId(),
          scope: 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
          callback: async (tokenResponse) => {
            if (tokenResponse.error) {
              console.error('[Auth] Token error:', tokenResponse.error);
              reject(new Error(tokenResponse.error));
              return;
            }
            
            console.log('[Auth] Got access token, fetching user info...');
            currentToken = tokenResponse.access_token;
            
            // Get user info with timeout
            try {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout
              
              const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` },
                signal: controller.signal
              });
              
              clearTimeout(timeout);
              
              if (userInfoResponse.ok) {
                const userInfo = await userInfoResponse.json();
                setCurrentUserEmail(userInfo.email);
                console.log('[Auth] User authenticated:', userInfo.email);
                resolve({ token: tokenResponse.access_token, email: userInfo.email, userInfo });
              } else {
                reject(new Error(`Failed to get user info: ${userInfoResponse.status}`));
              }
            } catch (err) {
              console.error('[Auth] User info fetch error:', err);
              reject(new Error(`User info fetch failed: ${err.message}`));
            }
          }
        });
        
        console.log('[Auth] Requesting access token...');
        tokenClient.requestAccessToken({ prompt: 'consent' });
      });
      
    } catch (error) {
      console.error('[Auth] Authentication error:', error);
      throw error;
    }
  }

  window.RMU_AUTH = { 
    getIdToken, 
    isAdmin, 
    getCurrentUserEmail, 
    setCurrentUserEmail,
    authenticateUser,
    // Expose the resolved client id value (read at export time) for compatibility
    CLIENT_ID: getClientId(),
    VC_EMAIL 
  };
  
  // Dispatch ready event
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[Auth] RMU_AUTH system ready');
    document.dispatchEvent(new CustomEvent('auth-ready'));
  });
})();
