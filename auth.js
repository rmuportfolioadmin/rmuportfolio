// auth.js - modernized Google auth helpers using Google Identity Services only
(function(){
  const cfg = (window.RMU_CONFIG || {});
  const CLIENT_ID = cfg.GOOGLE_CLIENT_ID || window.GOOGLE_CLIENT_ID || 'YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com';
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
      return new Promise((resolve, reject)=>{
        google.accounts.id.initialize({ 
          client_id: CLIENT_ID, 
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
      });
    } catch (e) { 
      console.error('[Auth] ID token error:', e);
      throw e; 
    }
  }

  function getCurrentUserEmail(){
    console.log('[Auth] Getting current user email, cached:', currentUserEmail);
    return currentUserEmail || '';
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

  // Modern authentication method using Google Identity Services
  async function authenticateUser() {
    console.log('[Auth] Starting modern authentication...');
    
    try {
      await _ensureGisReady();
      
      return new Promise((resolve, reject) => {
        const tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
          callback: async (tokenResponse) => {
            if (tokenResponse.error) {
              console.error('[Auth] Token error:', tokenResponse.error);
              reject(new Error(tokenResponse.error));
              return;
            }
            
            console.log('[Auth] Got access token, fetching user info...');
            currentToken = tokenResponse.access_token;
            
            // Get user info
            try {
              const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` }
              });
              
              if (userInfoResponse.ok) {
                const userInfo = await userInfoResponse.json();
                setCurrentUserEmail(userInfo.email);
                console.log('[Auth] User authenticated:', userInfo.email);
                resolve({ token: tokenResponse.access_token, email: userInfo.email });
              } else {
                reject(new Error('Failed to get user info'));
              }
            } catch (err) {
              reject(err);
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
    CLIENT_ID, 
    VC_EMAIL 
  };
  
  // Dispatch ready event
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[Auth] RMU_AUTH system ready');
    document.dispatchEvent(new CustomEvent('auth-ready'));
  });
})();
