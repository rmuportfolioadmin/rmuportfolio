// auth.js - centralized Google auth helpers
(function(){
  const cfg = (window.RMU_CONFIG || {});
  const CLIENT_ID = cfg.GOOGLE_CLIENT_ID || window.GOOGLE_CLIENT_ID || 'YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com';
  const VC_EMAIL = (cfg.VC_EMAIL || 'rmuportfolioa@gmail.com').toLowerCase();

  // Ensure GIS script is available; if not, callers should wait.
  function _ensureGisReady(){
    return new Promise((resolve)=>{
      if(window.google && google.accounts && google.accounts.id){ return resolve(); }
      const t = setInterval(()=>{
        if(window.google && google.accounts){ clearInterval(t); resolve(); }
      }, 200);
    });
  }

  async function getIdToken(){
    // GIS One Tap / popup to retrieve ID token
    await _ensureGisReady();
    return new Promise((resolve, reject)=>{
      try {
        google.accounts.id.initialize({ client_id: CLIENT_ID, callback: (resp)=>{
          if(resp && resp.credential) return resolve(resp.credential);
          reject(new Error('No credential from GIS'));
        }});
        google.accounts.id.prompt();
      } catch (e) { reject(e); }
    });
  }

  function getCurrentUserEmail(){ return ''; }

  function isAdmin(){ return false; }

  async function signOut(){
    try {
      // Best-effort revoke of access token if one exists
      if (window.gapi && gapi.client && typeof gapi.client.getToken === 'function'){
        const t = gapi.client.getToken();
        if (t && t.access_token){
          await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t.access_token), { method:'POST', headers:{'Content-type':'application/x-www-form-urlencoded'} });
        }
        gapi.client.setToken({});
      }
      if (window.google && google.accounts && google.accounts.id){
        try { google.accounts.id.disableAutoSelect(); } catch(_) {}
      }
    } catch(_) {}
  }

  window.RMU_AUTH = { getIdToken, isAdmin, getCurrentUserEmail, signOut, CLIENT_ID, VC_EMAIL };
})();
