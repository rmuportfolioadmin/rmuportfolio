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
    // Use gapi.auth2 if already used in your flow; otherwise fallback to GIS token client for ID token
    if (typeof gapi !== 'undefined' && gapi.auth2 && gapi.auth2.getAuthInstance) {
      const inst = gapi.auth2.getAuthInstance();
      if (inst) {
        const user = inst.currentUser && inst.currentUser.get ? inst.currentUser.get() : null;
        if (user) {
          const authResp = user.getAuthResponse && user.getAuthResponse();
          if (authResp && (authResp.id_token || authResp.idToken)) {
            return authResp.id_token || authResp.idToken;
          }
        }
      }
    }
    // Fallback: use Google Identity Services One Tap to get a new ID token silently if possible
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

  function getCurrentUserEmail(){
    try {
      if (typeof gapi !== 'undefined' && gapi.auth2 && gapi.auth2.getAuthInstance) {
        const inst = gapi.auth2.getAuthInstance();
        const user = inst && inst.currentUser && inst.currentUser.get ? inst.currentUser.get() : null;
        const profile = user && user.getBasicProfile && user.getBasicProfile();
        const email = profile && profile.getEmail && profile.getEmail();
        return (email||'').toLowerCase();
      }
    } catch(_) {}
    return '';
  }

  function isAdmin(){
    return getCurrentUserEmail() === VC_EMAIL;
  }

  window.RMU_AUTH = { getIdToken, isAdmin, getCurrentUserEmail, CLIENT_ID, VC_EMAIL };
})();
