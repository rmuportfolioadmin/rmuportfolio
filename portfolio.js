// ==================================================================================
// ABDUL HASEEB AHMAD - MEDICAL PORTFOLIO (STANDALONE VERSION)
// ==================================================================================
// This portfolio application now includes all essential data embedded directly 
// in the code for instant loading. The five core files provide complete functionality:
// 
// REQUIRED FILES (standalone operation):
// 1. portfolio.html - Main HTML structure with profile.png reference  
// 2. portfolio.css - Complete styling and responsive layout
// 3. portfolio.js - Application logic with embedded achievements & reflections
// 4. profile.png - Default profile picture (transparent PNG supported)
// 5. RMUlogo.png - University logo for branding
//
// FEATURES:
// - Instant load with embedded achievements and reflections data
// - PNG transparency fully supported throughout the application
// - Google Drive sync capabilities preserved for updates
// - PDF export with proper image handling and no empty space
// - Responsive layout with flipped profile/content positioning  
// - All CRUD operations for achievements and reflections
// - Automatic JSON loading from repository (if portfolio-data.json present)
//
// DATA FLOW:
// 1. Page loads instantly with embedded data from loadSampleData()
// 2. If portfolio-data.json exists in same directory, it overrides embedded data
// 3. localStorage used for temporary edits and Google Drive sync
// 4. profile.png used by default, localStorage can override with uploaded photos
//
// VERSION: v2025.09.25-1 (Standalone with embedded data)
// ==================================================================================

// Portfolio JavaScript - Vanilla JS Implementation

// Safe DOM query helpers: use these to avoid throwing when elements are missing
// $safe(selector, ctx) -> Element | null
// runIfPresent(selector, fn, ctx) -> void  (calls fn(el) only when element exists)
function $safe(selector, ctx = document) {
  try {
    const el = ctx.querySelector(selector);
    if (!el) console.warn(`[safe-query] Element not found for selector: "${selector}". Skipping related render logic.`);
    return el;
  } catch (err) {
    console.warn(`[safe-query] Query failed for selector: "${selector}":`, err);
    return null;
  }
}

function runIfPresent(selector, fn, ctx = document) {
  const el = $safe(selector, ctx);
  if (!el) return;
  try {
    fn(el);
  } catch (err) {
    console.error(`[safe-run] Error while executing render for "${selector}":`, err);
  }
}

class PortfolioApp {
  constructor() {
    this.currentSection = 'personal';
    this.isEditing = false;
    this.achievements = [];
    this.reflections = [];
    this.editingAchievement = null;
    this.editingReflection = null;
    
    this.init();

    // Detect if a specific file is requested; defer sample data injection until after adoption attempt
    const urlParamsSafe = (()=>{ try { return new URLSearchParams(location.search); } catch(e){ return null; }})();
    const specificFileRequested = !!(urlParamsSafe && urlParamsSafe.get('file')) || !!window.__LOADING_SPECIFIC_FILE;

    // Enforce: no sample data. Always require external JSON via ?file=
    if (!specificFileRequested) {
      console.warn('[portfolio-loader] No ?file= parameter provided. Application will remain empty until a JSON file is specified.');
      this.achievements = [];
      this.reflections = [];
      // Render empty state
      this.renderAchievements();
      this.renderReflections();
      this.updateLinkedAchievements();
    } else {
      console.log('[portfolio-loader] Specific ?file= detected -> awaiting adoption');
      this.achievements = [];
      this.reflections = [];
    }

    // Attempt adoption AFTER init (and possible sample data skip). Always re-render on success.
    if (window.__ADOPT_PRELOADED && typeof window.__ADOPT_PRELOADED === 'function') {
      const adopted = window.__ADOPT_PRELOADED(this);
      if (adopted) {
        console.log('[portfolio-loader] ✓ Successfully adopted preloaded JSON (post-constructor)');
        // Force immediate UI refresh (in case initial sample render was skipped)
        this.renderAchievements();
        this.renderReflections();
        this.updateLinkedAchievements();
        return;
      } else if (specificFileRequested) {
        // If adoption failed but a file was specified, provide fallback feedback
        console.error('[portfolio-loader] Adoption failed for specific file; no sample fallback (enforced).');
        this.achievements = [];
        this.reflections = [];
        this.renderAchievements();
        this.renderReflections();
        this.updateLinkedAchievements();
      }
    }

    // Register a listener for custom re-adopt events triggered after dynamic navigations
    window.addEventListener('re_adopt_portfolio', () => {
      try {
        if (window.__ADOPT_PRELOADED && typeof window.__ADOPT_PRELOADED === 'function') {
          console.log('[portfolio-loader] re_adopt_portfolio event detected – forcing adoption');
          window.__ADOPT_PRELOADED(this);
        }
      } catch(e){ console.warn('re_adopt_portfolio failed', e); }
    }, { passive:true });
  }

  // Loading bar helpers ----------------------------------------------------
  _getLoadingBarEl() {
    return document.getElementById('global-loading-bar');
  }
  showLoadingBar() {
    try {
      if (this._busy) return; // already busy, prevent stacking
      this._busy = true;
      const bar = this._getLoadingBarEl();
      if (!bar) return;
      bar.classList.remove('fade-out');
      bar.style.display = 'block';
      const inner = bar.querySelector('.glb-progress');
      if (inner) {
        inner.style.width = '0%';
        // Progressive animation to simulate progress
        let p = 0;
        if (inner._timer) { clearInterval(inner._timer); }
        inner._timer = setInterval(()=>{
          // Ease towards 90% max until completion
          if (p < 90) {
            p += Math.max(0.5, (90 - p) * 0.07);
            inner.style.width = p.toFixed(2) + '%';
          }
        }, 120);
      }
      // Disable interactive buttons to prevent queueing multiple tasks
      const ids = ['save-drive','load-drive','export-json','import-json','drive-selftest'];
      const exportPdfBtn = document.querySelector('#export-pdf-btn, button[data-action="export-pdf"]');
      ids.forEach(id=>{ const el=document.getElementById(id); if (el){ el._prevDisabled = el.disabled; el.disabled=true; el.classList.add('busy-disabled'); } });
      if (exportPdfBtn) { exportPdfBtn._prevDisabled = exportPdfBtn.disabled; exportPdfBtn.disabled = true; exportPdfBtn.classList.add('busy-disabled'); }
    } catch(e) { /* ignore */ }
  }
  hideLoadingBar(success=true) {
    try {
      const bar = this._getLoadingBarEl();
      if (!bar) return;
      const inner = bar.querySelector('.glb-progress');
      if (inner) {
        if (inner._timer) { clearInterval(inner._timer); inner._timer = null; }
        // Fill to 100% quickly
        inner.style.width = '100%';
      }
      // Small delay for visual completion
      setTimeout(()=>{
        bar.classList.add('fade-out');
        setTimeout(()=>{ bar.style.display='none'; bar.classList.remove('fade-out'); }, 380);
      }, success ? 120 : 0);
      // Re-enable buttons
      const ids = ['save-drive','load-drive','export-json','import-json','drive-selftest'];
      const exportPdfBtn = document.querySelector('#export-pdf-btn, button[data-action="export-pdf"]');
      ids.forEach(id=>{ const el=document.getElementById(id); if (el){ el.disabled = !!el._prevDisabled; el.classList.remove('busy-disabled'); delete el._prevDisabled; } });
      if (exportPdfBtn) { exportPdfBtn.disabled = !!exportPdfBtn._prevDisabled; exportPdfBtn.classList.remove('busy-disabled'); delete exportPdfBtn._prevDisabled; }
      this._busy = false;
    } catch(e) { /* ignore */ }
  }

  init() {
    this.bindEvents();
    this.showSection('personal');
    // Load personal info from localStorage if present
    this.loadPersonalInfo();
    // Attempt to initialize Google Drive client if client id/key provided
    try { 
      if (typeof this.initGoogleDriveClient === 'function') {
        this.initGoogleDriveClient();
      } else {
        console.debug('initGoogleDriveClient method not available - this is normal for static deployments');
      }
    } catch (e) { 
      console.debug('Google Drive client init skipped:', e.message); 
    }
  }

  loadPersonalInfo() {
    try {
      const data = JSON.parse(localStorage.getItem('personalInfo') || '{}');
      
      // Set default values if they don't exist
      const defaults = {
        firstName: 'Abdul Haseeb Ahmad',
        title: "Abdul Haseeb's Medfolio",
        bio: 'Passionate medical student dedicated 1. To impart evidence based research oriented medical education. 2. To provide best possible patient care. 3. To inculcate the values of mutual respect and ethical practice of medicine.',
        rollNo: '000-R00-X',
        registrationNo: 'RMU-MBBS-2024-001',
        programEnrolled: 'MBBS',
        fatherName: 'Muhammad Athar',
        email: 'abdul.haseeb@student.rmu.edu.pk',
        phone: '+92 300 1234567',
        session: '2024-25'
      };
      
      // Merge defaults with existing data
      const personalInfo = { ...defaults, ...data };
      
      // Normalize roll number format if needed
      const rollNoValidator = window.rollNoValidator;
      if (personalInfo.rollNo && rollNoValidator && !rollNoValidator.isValid(personalInfo.rollNo)) {
        console.log('[Portfolio] Normalizing invalid roll number:', personalInfo.rollNo);
        personalInfo.rollNo = '000-R00-X';
        // Update localStorage with normalized data
        localStorage.setItem('personalInfo', JSON.stringify(personalInfo));
      }
      
      // Updated field mapping for new RMU structure
      const fieldMapping = {
        'firstName': ['firstName-display', 'firstName'],
        'title': ['title-display', 'title'],
        'bio': ['bio-display', 'bio'],
        'rollNo': ['rollNo-display', 'rollNo'],
        'registrationNo': ['registrationNo-display', 'registrationNo'],
        'programEnrolled': ['programEnrolled-display', 'programEnrolled'],
        'fatherName': ['fatherName-display', 'fatherName'],
        'email': ['email-display', 'email'],
        'phone': ['phone-display', 'phone'],
        'session': ['session-display', 'session']
      };
      
      Object.keys(fieldMapping).forEach(key => {
        const [displayId, inputId] = fieldMapping[key];
        const display = document.getElementById(displayId);
        const input = document.getElementById(inputId);
        if (display) display.textContent = personalInfo[key];
        if (input) input.value = personalInfo[key];
      });
      
      // Load profile photo - prioritize localStorage for uploaded photos, otherwise use static profile.png
      const imgData = localStorage.getItem('profilePhoto');
      const img = document.querySelector('.rmu-profile-img-modern');
      if (img) {
        if (imgData) {
          // Use uploaded photo from localStorage
          img.src = imgData;
          img.onload = () => this.optimizeProfileImageFit(img);
        } else {
          // Use default static profile.png file (already set in HTML)
          // Ensure it's visible and apply optimization when loaded
          img.style.display = 'block';
          
          // Ensure transparency is preserved for PNG files
          if (img.src.toLowerCase().includes('.png')) {
            img.style.backgroundColor = 'transparent';
            img.style.background = 'transparent';
          }
          
          if (img.complete && img.naturalWidth > 0) {
            this.optimizeProfileImageFit(img);
          } else {
            img.onload = () => this.optimizeProfileImageFit(img);
          }
        }
      }
      
      // Save the merged data back to localStorage if it was incomplete
      if (Object.keys(data).length < Object.keys(defaults).length) {
        if (!this.safeSetLocalStorage('personalInfo', personalInfo)) {
          console.warn('Failed to save personal info due to storage limits');
        }
      }
      
      // Ensure personal info display fields are linkified (emails, phones, urls)
      try { this.linkifyPersonalInfo(); } catch (e) { /* ignore */ }
    } catch (e) { console.warn('Failed to load personal info', e); }
  }

  bindEvents() {
    // Navigation
    document.querySelectorAll('.nav-item[data-section]').forEach(item => {
      item.addEventListener('click', (e) => {
        const section = e.currentTarget.dataset.section;
        this.showSection(section);
      });
    });

    // Achievement and Reflection Add buttons + form submit handlers
    const addAchBtn = document.getElementById('add-achievement');
    if (addAchBtn) addAchBtn.addEventListener('click', (e) => { e.preventDefault(); this.openAchievementModal(); });
    const achForm = document.getElementById('achievement-form');
    if (achForm) achForm.addEventListener('submit', (e) => { e.preventDefault(); this.saveAchievement(e); });

    const addRefBtn = document.getElementById('add-reflection');
    if (addRefBtn) addRefBtn.addEventListener('click', (e) => { e.preventDefault(); this.openReflectionModal(); });
    const refForm = document.getElementById('reflection-form');
    if (refForm) refForm.addEventListener('submit', (e) => { e.preventDefault(); this.saveReflection(e); });

    // Search inputs for achievements and reflections (debounced)
    const searchDesc = document.getElementById('search-descriptive');
    if (searchDesc) {
      let t = null;
      searchDesc.addEventListener('input', (e) => {
        clearTimeout(t);
        t = setTimeout(() => {
          const cat = this.getActiveDescriptiveCategory() || (document.getElementById('mobile-descriptive-select')?.value || '');
          this.filterAchievements(e.target.value || '', cat);
        }, 180);
      });
    }

    // Mobile select change should also filter achievements
    const mobileSelect = document.getElementById('mobile-descriptive-select');
    if (mobileSelect) {
      mobileSelect.addEventListener('change', (e) => {
        const cat = e.target.value || '';
        // update pills active state
        document.querySelectorAll('.descriptive-category').forEach(b => b.classList.remove('active'));
        const matching = document.querySelector(`.descriptive-category[data-category="${cat}"]`);
        if (matching) matching.classList.add('active');
        const searchVal = document.getElementById('search-descriptive')?.value || '';
        this.filterAchievements(searchVal, cat);
      });
    }

    const searchRef = document.getElementById('search-reflective');
    if (searchRef) {
      let t2 = null;
      searchRef.addEventListener('input', (e) => {
        clearTimeout(t2);
        t2 = setTimeout(() => {
          const mood = document.getElementById('filter-reflective')?.value || '';
          this.filterReflections(e.target.value || '', mood);
        }, 180);
      });
    }

    // Reflective mood filter: update on change
    const moodSelect = document.getElementById('filter-reflective');
    if (moodSelect) {
      moodSelect.addEventListener('change', (e) => {
        const q = document.getElementById('search-reflective')?.value || '';
        this.filterReflections(q, e.target.value || '');
      });
    }

    // Export to PDF button (non-invasive): uses html2canvas + jsPDF
    const exportBtn = document.getElementById('export-pdf');
    if (exportBtn) exportBtn.addEventListener('click', (e) => { e.preventDefault(); this.exportToPdf(); });

  // Personal Info Edit Controls (guarded to avoid throwing if elements are missing)
  const editPersonalBtn = document.getElementById('edit-personal');
  if (editPersonalBtn) editPersonalBtn.addEventListener('click', () => this.toggleEditPersonal(true));
  const savePersonalBtn = document.getElementById('save-personal');
  if (savePersonalBtn) savePersonalBtn.addEventListener('click', () => this.savePersonal());
  const cancelPersonalBtn = document.getElementById('cancel-personal');
  if (cancelPersonalBtn) cancelPersonalBtn.addEventListener('click', () => this.cancelPersonal());
    // Change photo wiring: open hidden file input
    const changePhotoBtn = document.getElementById('change-photo');
    const photoInput = document.getElementById('profile-photo-input');
    if (changePhotoBtn && photoInput) {
      changePhotoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        photoInput.click();
      });
      photoInput.addEventListener('change', async (ev) => {
        const f = ev.target.files && ev.target.files[0];
        if (!f) return;
        // Resize image client-side to limit localStorage/Drive size before saving
        try {
          const dataUrl = await this.resizeImage(f, 800, 0.8);
          const img = document.querySelector('.rmu-profile-img-modern');
          if (img) { 
            img.src = dataUrl; 
            img.style.display = 'block';
            // Apply intelligent sizing after image loads
            img.onload = () => this.optimizeProfileImageFit(img);
          }
          // Persist to localStorage with quota protection
          if (!this.safeSetLocalStorage('profilePhoto', dataUrl)) {
            this.showToast('Failed to save profile photo due to storage limits', 'error');
            return;
          }
        } catch (err) {
          console.warn('Image resize failed, falling back to direct read', err);
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataUrl = e.target.result;
            const img = document.querySelector('.rmu-profile-img-modern');
            if (img) { 
              img.src = dataUrl; 
              img.style.display = 'block';
              // Apply intelligent sizing after image loads
              img.onload = () => this.optimizeProfileImageFit(img);
            }
            try { localStorage.setItem('profilePhoto', dataUrl); } catch (err2) { console.warn('Failed to persist profile photo', err2); }
          };
          reader.readAsDataURL(f);
        }
      });
    }

    // ------------------------------------------------------------------
    // Delegated/fallback listeners: in some environments the DOM may be
    // re-rendered or an earlier error prevented the direct bindings above
    // from attaching. Attach delegated listeners on document.body so mobile
    // select, descriptive pills and search inputs still work reliably.
    // ------------------------------------------------------------------
    document.body.addEventListener('click', (e) => {
      const pill = e.target.closest && e.target.closest('.descriptive-category');
      if (pill) {
        try {
          // behave like the per-element handler: set active, sync mobile select, filter
          document.querySelectorAll('.descriptive-category').forEach(b => b.classList.remove('active'));
          pill.classList.add('active');
          pill.setAttribute('aria-pressed', 'true');
          const cat = pill.dataset.category || '';
          const mobile = document.getElementById('mobile-descriptive-select'); if (mobile) mobile.value = cat;
          const searchVal = document.getElementById('search-descriptive')?.value || '';
          console.debug('delegated: descriptive pill clicked', { cat, searchVal });
          this.filterAchievements(searchVal, cat);
        } catch (err) { /* swallow to avoid breaking other handlers */ }
      }
    });

    // Delegated change for mobile select and reflective mood select
    document.body.addEventListener('change', (e) => {
      const tgt = e.target;
      if (!tgt) return;
      if (tgt.id === 'mobile-descriptive-select') {
        const cat = tgt.value || '';
        document.querySelectorAll('.descriptive-category').forEach(b => b.classList.remove('active'));
        const matching = document.querySelector(`.descriptive-category[data-category="${cat}"]`);
        if (matching) matching.classList.add('active');
        const searchVal = document.getElementById('search-descriptive')?.value || '';
        console.debug('delegated: mobile select changed', { cat, searchVal });
        this.filterAchievements(searchVal, cat);
        return;
      }
      if (tgt.id === 'filter-reflective') {
        const q = document.getElementById('search-reflective')?.value || '';
        console.debug('delegated: reflective mood changed', { mood: tgt.value, q });
        this.filterReflections(q, tgt.value || '');
        return;
      }
    });

    // Delegated input for search boxes (debounced)
    let _debounceSearch = null;
    document.body.addEventListener('input', (e) => {
      const tgt = e.target;
      if (!tgt) return;
      if (tgt.id === 'search-descriptive') {
        clearTimeout(_debounceSearch);
        _debounceSearch = setTimeout(() => {
          const cat = this.getActiveDescriptiveCategory() || (document.getElementById('mobile-descriptive-select')?.value || '');
          console.debug('delegated: search-descriptive input', { q: tgt.value, cat });
          this.filterAchievements(tgt.value || '', cat);
        }, 180);
      } else if (tgt.id === 'search-reflective') {
        clearTimeout(_debounceSearch);
        _debounceSearch = setTimeout(() => {
          const mood = document.getElementById('filter-reflective')?.value || '';
          console.debug('delegated: search-reflective input', { q: tgt.value, mood });
          this.filterReflections(tgt.value || '', mood);
        }, 180);
      }
    });

    // RMU Editable Field Handling
    this.initRmuEditableFields();

  }
  
  // Initialize RMU editable fields functionality
  initRmuEditableFields() {
    let currentEditingElement = null;
    let isRmuEditMode = false;
    
    // RMU Edit button functionality
    const rmuEditBtn = document.getElementById('edit-personal');
    if (rmuEditBtn) {
      rmuEditBtn.addEventListener('click', () => {
        this.toggleEditPersonal(true);
      });
    }
    
    const saveBtn = document.getElementById('save-personal');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.savePersonal();
      });
    }
    
    const cancelBtn = document.getElementById('cancel-personal');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.cancelPersonal();
      });
    }
    
    // Handle editable field clicks in edit mode
    document.body.addEventListener('click', (e) => {
      const editableField = e.target.closest('.rmu-editable-field[data-field]');
      if (!editableField || !this.isEditing) return;
      
      const fieldName = editableField.dataset.field;
      if (!fieldName) return;
      
      // If already editing this field, ignore
      if (currentEditingElement === editableField) return;
      
      // Save current edit if switching fields
      if (currentEditingElement) {
        this.saveRmuFieldEdit(currentEditingElement);
      }
      
      this.startRmuFieldEdit(editableField, fieldName);
      currentEditingElement = editableField;
    });
    
    // Handle clicks outside editable fields to save current edit
    document.body.addEventListener('click', (e) => {
      if (!this.isEditing || !currentEditingElement) return;
      
      const clickedField = e.target.closest('.rmu-editable-field[data-field]');
      if (!clickedField || clickedField !== currentEditingElement) {
        this.saveRmuFieldEdit(currentEditingElement);
        currentEditingElement = null;
      }
    });
  }
  
  // Start editing an RMU field
  startRmuFieldEdit(fieldElement, fieldName) {
    const span = fieldElement.querySelector('span');
    const input = fieldElement.querySelector('input, textarea');
    
    if (!span || !input) return;
    
    // Show input, hide span
    span.style.display = 'none';
    input.style.display = 'block';
    input.focus();
    
    // Select all text for easy replacement
    if (input.select) input.select();
    
    // Handle escape key to cancel edit
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        this.cancelRmuFieldEdit(fieldElement);
        input.removeEventListener('keydown', handleKeyDown);
      } else if (e.key === 'Enter' && input.tagName !== 'TEXTAREA') {
        this.saveRmuFieldEdit(fieldElement);
        input.removeEventListener('keydown', handleKeyDown);
      }
    };
    
    input.addEventListener('keydown', handleKeyDown);
  }
  
  // Save RMU field edit
  saveRmuFieldEdit(fieldElement) {
    console.log('[Portfolio] saveRmuFieldEdit called with element:', fieldElement);
    
    const span = fieldElement.querySelector('span');
    const input = fieldElement.querySelector('input, textarea');
    
    if (!span || !input) {
      console.log('[Portfolio] Missing span or input element');
      return;
    }
    
    const fieldName = fieldElement.dataset.field;
    let sanitizedValue = input.value.trim().replace(/\s+/g, ' ');
    
    console.log('[Portfolio] Field name:', fieldName, 'Value:', sanitizedValue);
    
    // Normalize roll number format (ensure uppercase) but don't validate here
    // Validation will happen when Save button is clicked
    if (fieldName === 'rollNo') {
      console.log('[Portfolio] Processing roll number field - normalizing format only');
      sanitizedValue = sanitizedValue.toUpperCase();
      console.log('[Portfolio] Normalized roll number:', sanitizedValue);
    }
    
    // Update span with new value
    span.textContent = sanitizedValue;
    
    // Show span, hide input
    input.style.display = 'none';
    span.style.display = 'block';
    
    console.log('[Portfolio] Field saved successfully:', fieldName, '=', sanitizedValue);
  }
  
  // Cancel RMU field edit
  cancelRmuFieldEdit(fieldElement) {
    const span = fieldElement.querySelector('span');
    const input = fieldElement.querySelector('input, textarea');
    
    if (!span || !input) return;
    
    // Reset input to original value
    input.value = span.textContent;
    
    // Show span, hide input
    input.style.display = 'none';
    span.style.display = 'block';
  }

  // Helper: resize an image file to a max dimension and return a data URL
  resizeImage(file, maxDim = 800, quality = 0.8) {
    return new Promise((resolve, reject) => {
      // Check file size before processing (prevent memory issues)
      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        reject(new Error('File too large. Maximum file size is 50MB.'));
        return;
      }

      if (!file.type.startsWith('image/')) return reject(new Error('Not an image'));
      const img = new Image();
      const reader = new FileReader();
      reader.onerror = (e) => reject(e);
      reader.onload = (e) => {
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let { width, height } = img;
            const ratio = width / height;
            if (width > height) {
              if (width > maxDim) { width = maxDim; height = Math.round(maxDim / ratio); }
            } else {
              if (height > maxDim) { height = maxDim; width = Math.round(maxDim * ratio); }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            // Preserve PNG transparency - only fill background for non-PNG images
            const isPNG = file.type === 'image/png';
            if (!isPNG) {
              // Fill white background for JPEG and other formats
              ctx.fillStyle = '#fff';
              ctx.fillRect(0,0,canvas.width,canvas.height);
            }
            
            // Draw centered and cover-style: compute scale and offset to cover the canvas
            const sx = 0, sy = 0;
            ctx.drawImage(img, sx, sy, img.width, img.height, 0, 0, canvas.width, canvas.height);
            
            // Use appropriate format and quality based on input type
            let dataUrl;
            if (isPNG) {
              // Preserve PNG format for transparency
              dataUrl = canvas.toDataURL('image/png');
            } else {
              // Use JPEG for other formats
              dataUrl = canvas.toDataURL('image/jpeg', quality);
            }
            
            // Check size before resolving
            if (dataUrl.length > 5 * 1024 * 1024) { // 5MB data URL limit
              console.warn('Resized image still too large, applying additional compression');
              // Try JPEG as fallback with lower quality
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, sx, sy, img.width, img.height, 0, 0, canvas.width, canvas.height);
              dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            }
            
            resolve(dataUrl);
          } catch (err) { reject(err); }
        };
        img.onerror = (err) => reject(err);
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Safe localStorage setter with quota protection
  safeSetLocalStorage(key, value) {
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      // Check if the data would exceed reasonable localStorage limits
      const currentUsage = this.getLocalStorageUsage();
      const newSize = new Blob([stringValue]).size;
      
      if (currentUsage + newSize > 4 * 1024 * 1024) { // 4MB conservative limit
        console.warn('localStorage quota nearly exceeded. Cleaning up old data...');
        this.cleanupLocalStorage();
      }
      
      localStorage.setItem(key, stringValue);
      return true;
    } catch (err) {
      if (err.name === 'QuotaExceededError') {
        console.error('localStorage quota exceeded. Attempting cleanup...');
        this.cleanupLocalStorage();
        try {
          localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
          return true;
        } catch (retryErr) {
          console.error('Failed to save to localStorage even after cleanup:', retryErr);
          this.showToast('Storage full. Some data may not be saved.', 'error');
          return false;
        }
      }
      console.error('Failed to save to localStorage:', err);
      return false;
    }
  }

  // Get approximate localStorage usage
  getLocalStorageUsage() {
    let totalSize = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        totalSize += localStorage[key].length;
      }
    }
    return totalSize;
  }

  // Cleanup localStorage to free space
  cleanupLocalStorage() {
    try {
      // Remove old/large items that can be regenerated
      const keysToCheck = ['profilePhoto', 'achievements', 'reflections'];
      
      keysToCheck.forEach(key => {
        const item = localStorage.getItem(key);
        if (item && item.length > 1024 * 1024) { // Remove items larger than 1MB
          console.warn(`Removing large localStorage item: ${key}`);
          localStorage.removeItem(key);
        }
      });
      
      // Clean up blob URLs as well
      this.cleanupAllAttachmentUrls();
    } catch (err) {
      console.error('Failed to cleanup localStorage:', err);
    }
  }

  // Optimize profile image fit to show complete image without cropping
  optimizeProfileImageFit(imgElement) {
    if (!imgElement || !imgElement.naturalWidth || !imgElement.naturalHeight) return;
    
    try {
      const containerColumn = imgElement.closest('.rmu-profile-column');
      if (!containerColumn) return;

      // Get container dimensions
      const containerRect = containerColumn.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height || window.innerHeight;
      
      // Get image natural dimensions
      const imgWidth = imgElement.naturalWidth;
      const imgHeight = imgElement.naturalHeight;
      const imgAspectRatio = imgWidth / imgHeight;
      const containerAspectRatio = containerWidth / containerHeight;

      // Reset any previous styling
      imgElement.style.width = '';
      imgElement.style.height = '';
      imgElement.style.objectFit = '';
      imgElement.style.objectPosition = '';

      if (imgAspectRatio > containerAspectRatio) {
        // Image is wider relative to container - fit to container width, show full height
        imgElement.style.width = '100%';
        imgElement.style.height = 'auto';
        imgElement.style.minHeight = '100vh';
        imgElement.style.objectFit = 'contain';
        imgElement.style.objectPosition = 'center center';
      } else {
        // Image is taller relative to container - fit to container height, show full width  
        imgElement.style.width = '100%';
        imgElement.style.height = '100vh';
        imgElement.style.objectFit = 'contain';
        imgElement.style.objectPosition = 'center center';
      }

      console.log('Profile image optimized for full display without cropping');
    } catch (error) {
      console.warn('Failed to optimize profile image fit:', error);
      // Fallback to basic sizing
      imgElement.style.width = '100%';
      imgElement.style.minHeight = '100vh';
      imgElement.style.objectFit = 'contain';
      imgElement.style.objectPosition = 'center center';
    }
  }

  // Convert a data URL (base64) into a Blob
  dataURLToBlob(dataURL) {
    if (!dataURL || typeof dataURL !== 'string') return null;
    try {
      const parts = dataURL.split(',');
      const meta = parts[0] || '';
      const b64 = parts[1] || '';
      const m = meta.match(/data:([^;]+);base64/);
      const mime = m ? m[1] : 'application/octet-stream';
      const binary = atob(b64);
      const len = binary.length;
      const u8 = new Uint8Array(len);
      for (let i = 0; i < len; i++) u8[i] = binary.charCodeAt(i);
      return new Blob([u8], { type: mime });
    } catch (err) {
      console.warn('dataURLToBlob failed', err);
      return null;
    }
  }

  // Create or return a usable URL for an attachment object/value.
  // attachment may be:
  // - a string: data: URI, http(s) URL, blob: URL, or raw base64
  // - a Blob
  // - an ArrayBuffer or TypedArray
  // - an object with { name, type, data }
  getAttachmentUrl(key, attachment) {
    if (!attachment) return null;
    if (!this._attachmentUrls) this._attachmentUrls = {};
    
    // Clean up previous URL for this key to prevent memory leaks
    this.cleanupAttachmentUrl(key);
    
    // If attachment is an object with a data property, use that
    let data = attachment && typeof attachment === 'object' && 'data' in attachment ? attachment.data : attachment;
    let filename = attachment && typeof attachment === 'object' && attachment.name ? attachment.name : null;
    let type = attachment && typeof attachment === 'object' && attachment.type ? attachment.type : '';

    // If it's already a usable URL
    if (typeof data === 'string') {
      const s = data.trim();
      if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('blob:')) {
        return s;
      }
      if (s.startsWith('data:')) {
        const blob = this.dataURLToBlob(s);
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        this._attachmentUrls[key] = url;
        return url;
      }
      // If it's probably a bare base64 string (no prefix), try to convert
      const base64Regex = /^[A-Za-z0-9+/=\s]+$/;
      if (base64Regex.test(s)) {
        const mime = type || 'application/octet-stream';
        const dataURL = `data:${mime};base64,${s.replace(/\s+/g,'')}`;
        const blob = this.dataURLToBlob(dataURL);
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        this._attachmentUrls[key] = url;
        return url;
      }
      // Unknown string form - return as-is (may still work)
      return s;
    }

    // Blob
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      const url = URL.createObjectURL(data);
      this._attachmentUrls[key] = url;
      return url;
    }

    // ArrayBuffer or TypedArray
    if (data && (data instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
      const buf = data instanceof ArrayBuffer ? data : data.buffer;
      const blob = new Blob([buf], { type: type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      this._attachmentUrls[key] = url;
      return url;
    }

    // Fallback: try JSON/stringify and then base64? unlikely — return null
    return null;
  }

  // Helper method to clean up individual blob URLs to prevent memory leaks
  cleanupAttachmentUrl(key) {
    if (this._attachmentUrls && this._attachmentUrls[key]) {
      try {
        URL.revokeObjectURL(this._attachmentUrls[key]);
        delete this._attachmentUrls[key];
      } catch (e) {
        console.warn('Failed to cleanup attachment URL:', e);
      }
    }
  }

  // Method to clean up all blob URLs (call on app shutdown or major data changes)
  cleanupAllAttachmentUrls() {
    if (this._attachmentUrls) {
      Object.keys(this._attachmentUrls).forEach(key => {
        this.cleanupAttachmentUrl(key);
      });
      this._attachmentUrls = {};
    }
  }

    // Normalize/upgrade loaded JSON data (handles legacy shapes)
    normalizeLoadedData(raw) {
      if (!raw || typeof raw !== 'object') return { achievements: [], reflections: [], personalInfo: {}, profilePhoto: null };
      const normalizeEntry = (entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const out = Object.assign({}, entry);
        // ensure id
        out.id = out.id || (Date.now().toString() + Math.random().toString(36).slice(2,7));

        // migrate single `image` to `images` array
        if (out.image && !out.images) {
          out.images = [{ name: out.image.name || 'image', type: out.image.type || (out.image.data && out.image.data.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'), data: out.image.data || out.image }];
          delete out.image;
        }
        // ensure images is an array
        if (!Array.isArray(out.images)) out.images = out.images ? [out.images] : [];

        // Backwards/alternate attachment shapes: support an `attachments` array or similar
        out.attachments = out.attachments || out.files || out.documents || [];
        if (!Array.isArray(out.attachments)) out.attachments = out.attachments ? [out.attachments] : [];

        // Initialize explicit pdf/ppt fields if present (may be strings or objects)
        if (out.pdf && typeof out.pdf === 'string') out.pdf = { name: out.pdf.split('/').pop().split('?')[0], type: '', data: out.pdf };
        if (out.ppt && typeof out.ppt === 'string') out.ppt = { name: out.ppt.split('/').pop().split('?')[0], type: '', data: out.ppt };

        // Ensure pdf/ppt are null if missing
        out.pdf = out.pdf || null;
        out.ppt = out.ppt || null;

        // Normalize attachments into images/pdf/ppt when possible
        try {
          out.attachments.forEach(att => {
            if (!att) return;
            let attObj = att;
            // If attachment is a bare string, treat it as a URL
            if (typeof att === 'string') {
              const name = att.split('/').pop().split('?')[0] || 'file';
              attObj = { name, type: '', data: att };
            } else {
              // If object has `url` property but not `data`, copy it to `data` for consistency
              if (att.url && !att.data) attObj.data = att.url;
              if (!attObj.name && attObj.url) attObj.name = attObj.url.split('/').pop().split('?')[0];
            }

            const t = (attObj.type || '').toLowerCase();
            const nameLower = (attObj.name || '').toLowerCase();

            // Image types
            if (t.startsWith('image/') || nameLower.match(/\.(png|jpe?g|gif|webp|bmp)$/)) {
              out.images = out.images || [];
              // Detect PNG from filename or data URL
              let imageType = attObj.type || 'image/jpeg';
              if (nameLower.endsWith('.png') || (attObj.data && attObj.data.startsWith('data:image/png'))) {
                imageType = 'image/png';
              }
              out.images.push({ name: attObj.name || 'image', type: imageType, data: attObj.data || attObj.url || attObj });
              return;
            }

            // PDF
            if (t.includes('pdf') || nameLower.endsWith('.pdf')) {
              if (!out.pdf) out.pdf = { name: attObj.name || 'file.pdf', type: attObj.type || 'application/pdf', data: attObj.data || attObj.url || attObj };
              return;
            }

            // PPT / PPTX
            if (t.includes('powerpoint') || nameLower.endsWith('.ppt') || nameLower.endsWith('.pptx')) {
              if (!out.ppt) out.ppt = { name: attObj.name || 'file.pptx', type: attObj.type || 'application/vnd.ms-powerpoint', data: attObj.data || attObj.url || attObj };
              return;
            }

            // Unknown attachments: keep them in a catch-all array for debugging or future use
            out._otherAttachments = out._otherAttachments || [];
            out._otherAttachments.push(attObj);
          });
        } catch (e) {
          // Non-fatal: if attachments processing fails, continue with what we have
          console.warn('Failed to normalize attachments for entry', out.id, e);
        }

        // ensure required fields exist
        out.title = out.title || '';
        out.category = out.category || '';
        out.date = out.date || new Date().toISOString().split('T')[0];
        out.description = out.description || out.content || '';
        out.status = out.status || 'completed';
        return out;
      };

      const achievements = Array.isArray(raw.achievements) ? raw.achievements.map(normalizeEntry).filter(Boolean) : [];
      const reflections = Array.isArray(raw.reflections) ? raw.reflections.map(normalizeEntry).filter(Boolean) : [];
      const personalInfo = raw.personalInfo || {};
      const profilePhoto = raw.profilePhoto || null;
      return { achievements, reflections, personalInfo, profilePhoto };
    }

    // Load data directly into the app (for admin portfolios or external data)
    loadDataDirectly(normalizedData) {
      try {
        console.log('[loadDataDirectly] Loading external portfolio data');
        
        // Clear current state
        this.achievements = [];
        this.reflections = [];
        
        // Apply the normalized data
        this.achievements = normalizedData.achievements || [];
        this.reflections = normalizedData.reflections || [];
        
        // Handle personal info and profile photo
        if (normalizedData.personalInfo) {
          try {
            localStorage.setItem('personalInfo', JSON.stringify(normalizedData.personalInfo));
          } catch(_) {}
        }
        
        if (normalizedData.profilePhoto) {
          try {
            localStorage.setItem('profilePhoto', normalizedData.profilePhoto);
          } catch(_) {}
        } else {
          try {
            localStorage.removeItem('profilePhoto');
          } catch(_) {}
        }
        
        // Render all components
        this.loadPersonalInfo();
        this.renderAchievements();
        this.renderReflections();
        this.updateLinkedAchievements();
        
        // Make sections visible and remove loading state
        document.querySelectorAll('#personal.section,#descriptive.section,#reflective.section').forEach(s => {
          s.style.visibility = 'visible';
        });
        document.body.classList.remove('loading-initial');
        
        console.log('[loadDataDirectly] Successfully loaded external portfolio data');
        
      } catch(err) {
        console.error('[loadDataDirectly] Failed to load data:', err);
      }
    }

    // Load user portfolio data (similar to loadDataDirectly but for user mode)
    loadUserPortfolioData(portfolioData) {
      try {
        console.log('[loadUserPortfolioData] Loading user portfolio data from Drive');
        
        // Normalize the data
        const normalizedData = this.normalizeLoadedData(portfolioData || {});
        
        // Clear previous state
        this.achievements = [];
        this.reflections = [];
        
        // Load the data
        this.achievements = normalizedData.achievements || [];
        this.reflections = normalizedData.reflections || [];
        
        // Set personal info and photo
        if(normalizedData.personalInfo) {
          try {
            localStorage.setItem('personalInfo', JSON.stringify(normalizedData.personalInfo));
          } catch(e) {
            console.warn('[loadUserPortfolioData] Could not save personalInfo to localStorage:', e);
          }
        }
        
        if(normalizedData.profilePhoto) {
          try {
            localStorage.setItem('profilePhoto', normalizedData.profilePhoto);
          } catch(e) {
            console.warn('[loadUserPortfolioData] Could not save profilePhoto to localStorage:', e);
          }
        } else {
          try {
            localStorage.removeItem('profilePhoto');
          } catch(e) {
            console.warn('[loadUserPortfolioData] Could not remove profilePhoto from localStorage:', e);
          }
        }
        
        // Render everything
        this.loadPersonalInfo();
        this.renderAchievements();
        this.renderReflections();
        this.updateLinkedAchievements();
        
        // Show sections
        document.querySelectorAll('#personal.section, #descriptive.section, #reflective.section').forEach(section => {
          section.style.visibility = 'visible';
        });
        
        // Remove loading state
        document.body.classList.remove('loading-initial');
        
        console.log('[loadUserPortfolioData] Successfully loaded user portfolio data from Drive');
        
      } catch(err) {
        console.error('[loadUserPortfolioData] Failed to load user data:', err);
      }
    }

  // Helper: returns currently selected descriptive category ('' means all)
  getActiveDescriptiveCategory() {
    const active = document.querySelector('.descriptive-category.active');
    return (active && active.dataset && typeof active.dataset.category === 'string') ? active.dataset.category : '';
  }

  showSection(sectionName) {
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });
      runIfPresent(`[data-section="${sectionName}"]`, (el) => el.classList.add('active'));

    // Update sections
    document.querySelectorAll('.section').forEach(section => {
      section.classList.remove('active');
    });
      runIfPresent(`#${sectionName}`, (el) => el.classList.add('active'));

    this.currentSection = sectionName;

    // Load section-specific data
    if (sectionName === 'descriptive') {
      this.renderAchievements();
    } else if (sectionName === 'reflective') {
      this.renderReflections();
      this.updateLinkedAchievements();
    }
  }

  // Personal Info Management
  toggleEditPersonal(editing) {
    this.isEditing = editing;
    
    // Toggle edit controls visibility
    const editBtn = document.getElementById('edit-personal');
    const saveBtn = document.getElementById('save-personal');
    const cancelBtn = document.getElementById('cancel-personal');
    const changePhotoBtn = document.getElementById('change-photo');
    
    if (editBtn) editBtn.style.display = editing ? 'none' : 'block';
    if (saveBtn) saveBtn.style.display = editing ? 'block' : 'none';
    if (cancelBtn) cancelBtn.style.display = editing ? 'block' : 'none';
    if (changePhotoBtn) changePhotoBtn.style.display = editing ? 'block' : 'none';

    // Toggle display spans and input fields for new structure
    const fields = [
      'firstName', 'title', 'bio', 'rollNo', 'registrationNo', 'programEnrolled',
      'fatherName', 'email', 'phone', 'session'
    ];
    
    fields.forEach(id => {
      const input = document.getElementById(id);
      const display = document.getElementById(id + '-display');
      if (input && display) {
        if (editing) {
          input.style.display = 'block';
          display.style.display = 'none';
        } else {
          input.style.display = 'none';
          display.style.display = 'block';
        }
      }
    });

    // Toggle cursor pointer class for editable fields
    document.querySelectorAll('.rmu-editable-field').forEach(field => {
      if (editing) {
        field.classList.add('cursor-pointer');
        field.title = 'Click to edit';
      } else {
        field.classList.remove('cursor-pointer');
        field.title = '';
      }
    });
  }

  savePersonal() {
    console.log('[Portfolio] savePersonal called - validating all fields before saving');
    
    // Get roll number input for validation
    const rollNoInput = document.getElementById('rollNo');
    if (rollNoInput) {
      const rollNoValue = rollNoInput.value.trim();
      console.log('[Portfolio] Checking roll number before save:', rollNoValue);
      
      // Validate roll number format using the validator
      const rollNoValidator = window.rollNoValidator;
      if (rollNoValidator && rollNoValue) {
        const isValidRollNo = rollNoValidator.isValid(rollNoValue);
        console.log('[Portfolio] Roll number validation result:', isValidRollNo);
        
        if (!isValidRollNo) {
          console.log('[Portfolio] ❌ Invalid roll number detected during save - showing popup');
          
          // Show the validation popup
          if (rollNoValidator.showGuide) {
            rollNoValidator.showGuide();
            console.log('[Portfolio] 🚨 Popup shown - save operation cancelled');
          }
          
          // Focus on the roll number field to highlight the issue
          rollNoInput.focus();
          if (rollNoInput.select) rollNoInput.select();
          
          // Prevent saving - return early without toggling edit mode
          console.log('[Portfolio] 🚫 Save operation blocked due to invalid roll number');
          return false;
        } else {
          console.log('[Portfolio] ✅ Roll number format is valid - proceeding with save');
        }
      }
    }
    
    // Store original values for rollback
    const originalData = JSON.parse(localStorage.getItem('personalInfo') || '{}');
    
    // Update display spans with new values for new structure
    const fields = [
      'firstName', 'title', 'bio', 'rollNo', 'registrationNo', 'programEnrolled',
      'fatherName', 'email', 'phone', 'session'
    ];
    
    const saved = {};
    
    fields.forEach(id => {
      const input = document.getElementById(id);
      const display = document.getElementById(id + '-display');
      if (input && display) {
        // Normalize roll number to uppercase if it's valid
        let value = input.value;
        if (id === 'rollNo' && value) {
          value = value.trim().toUpperCase();
          input.value = value; // Update input with normalized value
        }
        display.textContent = value;
        saved[id] = value;
      }
    });
    
    // Update avatar initials
    const firstName = document.getElementById('firstName')?.value || '';
    const initials = (firstName[0] || '');
    const avatarFallback = document.querySelector('.avatar-fallback');
    if (avatarFallback) { avatarFallback.textContent = initials; }

    // Persist to localStorage
    localStorage.setItem('personalInfo', JSON.stringify(saved));
    console.log('[Portfolio] ✅ Personal info saved successfully');

    this.toggleEditPersonal(false);
    this.showToast('Personal information updated successfully', 'success');
    // Re-run linkify so newly-saved text becomes clickable where appropriate
    try { this.linkifyPersonalInfo(); } catch (e) { /* ignore */ }
    
    return true;
  }

  cancelPersonal() {
    // Restore original values from localStorage or defaults
    const originalData = JSON.parse(localStorage.getItem('personalInfo') || '{}');
    const defaults = {
      firstName: 'Abdul Haseeb Ahmad',
      title: "Haseeb's Medfolio",
      bio: 'Passionate medical student dedicated 1. To impart evidence based research oriented medical education. 2. To provide best possible patient care. 3. To inculcate the values of mutual respect and ethical practice of medicine.',
      rollNo: '123',
      registrationNo: 'RMU-MBBS-2024-001',
      programEnrolled: 'MBBS',
      fatherName: 'Muhammad Athar',
      email: 'abdul.haseeb@student.rmu.edu.pk',
      phone: '+92 300 1234567',
      session: '2024-25'
    };
    
    const restoreData = { ...defaults, ...originalData };
    
    // Reset input values to original
    const fields = [
      'firstName', 'title', 'bio', 'rollNo', 'registrationNo', 'programEnrolled',
      'fatherName', 'email', 'phone', 'session'
    ];
    
    fields.forEach(id => {
      const input = document.getElementById(id);
      if (input && restoreData[id] !== undefined) {
        input.value = restoreData[id];
      }
    });
    
    this.toggleEditPersonal(false);
    this.showToast('Changes cancelled', 'info');
  }

  // Convert plain text URLs, emails, and phone numbers inside personal info display
  // spans into clickable anchors so they are interactive on the page and will
  // be preserved (as anchors) when exported to PDF.
  linkifyPersonalInfo() {
    try {
      const rootIds = [
        'firstName-display','title-display','bio-display','rollNo-display','registrationNo-display','programEnrolled-display',
        'fatherName-display','email-display','phone-display','session-display'
      ];
      const urlRegex = /(\b(?:https?:\/\/|www\.|[a-z0-9.-]+\.[a-z]{2,})(?:[^\s<>()]*))/gi;
      const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
      const phoneRegex = /(\+?\d[\d\s().-]{4,}\d)/g;

      const processElement = (el) => {
        if (!el) return;
        // If the element already contains an anchor, ensure href is absolute and style applied
        if (el.querySelector && el.querySelector('a')) {
          Array.from(el.querySelectorAll('a')).forEach(a => {
            try { const raw = a.getAttribute('href') || a.href || ''; if (!/^https?:\/\//i.test(raw) && !/^mailto:/i.test(raw) && !/^tel:/i.test(raw)) { try { a.href = new URL(raw, document.location.href).href; } catch (e) {} } a.style.color = '#0366d6'; a.style.textDecoration = 'underline'; } catch (e) {}
          });
          return;
        }

        // Walk text nodes and replace URLs/emails/phones with anchors
        const walk = (node) => {
          if (!node) return;
          if (node.nodeType === Node.ELEMENT_NODE) {
            // avoid modifying input elements or anchors
            const tag = node.tagName && node.tagName.toLowerCase();
            if (tag === 'a' || tag === 'input' || tag === 'textarea' || tag === 'button') return;
            const children = Array.from(node.childNodes);
            for (const c of children) walk(c);
            return;
          }
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.nodeValue;
            if (!text || !text.trim()) return;
            // If the whole text is an email, replace with mailto
            if (emailRegex.test(text) && text.trim().match(emailRegex)[0].length === text.trim().length) {
              const addr = text.trim();
              const a = document.createElement('a'); a.href = 'mailto:' + addr; a.textContent = addr; a.style.color = '#0366d6'; a.style.textDecoration = 'underline'; node.parentNode.replaceChild(a, node); return;
            }
            // If the whole text looks like a phone number, replace with tel:
            const phoneMatch = text.trim().match(/^\+?\d[\d\s().-]{4,}\d$/);
            if (phoneMatch) {
              const num = text.trim();
              const a = document.createElement('a'); a.href = 'tel:' + num.replace(/[^+\d]/g, ''); a.textContent = num; a.style.color = '#0366d6'; a.style.textDecoration = 'underline'; node.parentNode.replaceChild(a, node); return;
            }

            // otherwise attempt to linkify URLs within the text node
            urlRegex.lastIndex = 0;
            let match; let lastIndex = 0; let found = false;
            const frag = document.createDocumentFragment();
            while ((match = urlRegex.exec(text)) !== null) {
              found = true;
              const url = match[0]; const idx = match.index;
              if (idx > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
              let href = url;
              if (/^www\./i.test(href)) href = 'https://' + href;
              // add protocol for bare domains
              if (!/^https?:\/\//i.test(href)) href = 'https://' + href;
              const a = document.createElement('a'); a.href = href; a.textContent = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.color = '#0366d6'; a.style.textDecoration = 'underline'; frag.appendChild(a);
              lastIndex = idx + url.length;
            }
            if (!found) return;
            if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
            if (node.parentNode) node.parentNode.replaceChild(frag, node);
          }
        };
        walk(el);
      };

      for (const id of rootIds) {
        const el = document.getElementById(id);
        try {
          // Special-case email/phone/location to ensure clear anchors
          if (el && id === 'email-display') {
            const txt = (el.textContent || '').trim();
            if (txt && /\S+@\S+\.\S+/.test(txt)) {
              el.innerHTML = `<a href="mailto:${txt}" style="color:#0366d6;text-decoration:underline;cursor:pointer;">${txt}</a>`;
              continue;
            }
          }
          if (el && id === 'phone-display') {
            const txt = (el.textContent || '').trim();
            const cleaned = txt.replace(/[^+\d]/g, '');
            if (cleaned && cleaned.length >= 7) {
              el.innerHTML = `<a href="tel:${cleaned}" style="color:#0366d6;text-decoration:underline;cursor:pointer;">${txt}</a>`;
              continue;
            }
          }
          if (el && id === 'location-display') {
            const txt = (el.textContent || '').trim();
            if (txt && (/^https?:\/\//i.test(txt) || /^www\./i.test(txt) || /\.[a-z]{2,}(\/|$)/i.test(txt))) {
              let href = txt;
              if (/^www\./i.test(href)) href = 'https://' + href;
              if (!/^https?:\/\//i.test(href)) href = 'https://' + href;
              el.innerHTML = `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:#0366d6;text-decoration:underline;cursor:pointer;">${txt}</a>`;
              continue;
            }
          }
          processElement(el);
        } catch (e) { /* ignore per-element */ }
      }

      // Ensure CMS Attendance anchor remains styled and clickable
      try {
        const cms = document.getElementById('cms-attendance');
        if (cms && cms.tagName && cms.tagName.toLowerCase() === 'a') {
          cms.style.color = '#0366d6'; cms.style.textDecoration = 'underline'; cms.style.cursor = 'pointer'; cms.setAttribute('target','_blank'); cms.setAttribute('rel','noopener noreferrer');
        }
      } catch (e) { /* ignore */ }
    } catch (e) { /* swallow linkify errors */ }
  }

  // Achievement Management
  openAchievementModal(achievement = null) {
    this.editingAchievement = achievement;
    const modal = document.getElementById('achievement-modal');
    const title = document.getElementById('achievement-modal-title');
    
    if (achievement) {
      title.textContent = 'Edit Achievement';
      document.getElementById('achievement-title').value = achievement.title;
      document.getElementById('achievement-category').value = achievement.category;
      document.getElementById('achievement-date').value = achievement.date;
      document.getElementById('achievement-description').value = achievement.description;
      document.getElementById('achievement-status').value = achievement.status;
      // Clear file inputs (browsers won't let us populate them programmatically)
      try { document.getElementById('achievement-image').value = null; } catch (e) {}
      try { document.getElementById('achievement-ppt').value = null; } catch (e) {}
      try { document.getElementById('achievement-pdf').value = null; } catch (e) {}
    } else {
      title.textContent = 'Add Achievement';
      document.getElementById('achievement-form').reset();
      document.getElementById('achievement-date').value = new Date().toISOString().split('T')[0];
    }
    
    modal.classList.add('active');
    // Ensure controls inside this modal reliably close it (bind on open)
    try {
      const closeBtn = modal.querySelector('.modal-close');
      if (closeBtn) { closeBtn.onclick = () => this.closeModals(); }
      modal.querySelectorAll('.modal-cancel').forEach(b => { b.onclick = () => this.closeModals(); });
    } catch (e) { /* ignore */ }
  }

  saveAchievement(e) {
    e.preventDefault();
    const getFileData = async (inputId, allowMultiple = false) => {
      const fileInput = document.getElementById(inputId);
      if (!fileInput || !fileInput.files || fileInput.files.length === 0) return null;
      const files = Array.from(fileInput.files);
      
      // Check total file size before processing
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      if (totalSize > 100 * 1024 * 1024) { // 100MB total limit
        this.showToast('Total file size too large. Maximum is 100MB.', 'error');
        return null;
      }
      
      // Read each file; for images use resizeImage to limit size
      const readers = files.map(async (file) => {
        try {
          if (file.type.startsWith('image/')) {
            // Use resizeImage to produce a JPEG/PNG data URL with size control
            try {
              const data = await this.resizeImage(file, 800, 0.8);
              return { name: file.name, type: file.type, data };
            } catch (e) {
              console.warn('Failed to resize image, using original:', e);
              // fallback to FileReader
              return new Promise((resolve) => {
                const r = new FileReader();
                r.onload = (ev) => {
                  const result = ev.target.result;
                  // Check data URL size
                  if (result.length > 10 * 1024 * 1024) { // 10MB limit for individual files
                    console.warn('File too large after reading:', file.name);
                    resolve(null);
                  } else {
                    resolve({ name: file.name, type: file.type, data: result });
                  }
                };
                r.onerror = () => resolve(null);
                r.readAsDataURL(file);
              });
            }
          } else {
            // For non-images, check size limit before reading
            if (file.size > 25 * 1024 * 1024) { // 25MB limit for PPT/PDF files
              console.warn('Non-image file too large:', file.name);
              this.showToast(`File "${file.name}" is too large. Maximum size for documents is 25MB.`, 'error');
              return null;
            }
            
            return new Promise((resolve) => {
              const r = new FileReader();
              r.onload = (ev) => resolve({ name: file.name, type: file.type, data: ev.target.result });
              r.onerror = (err) => {
                console.error('Failed to read file:', file.name, err);
                resolve(null);
              };
              r.readAsDataURL(file);
            });
          }
        } catch (err) { 
          console.error('Error processing file:', file.name, err);
          return null; 
        }
      });
      const results = await Promise.all(readers);
      return allowMultiple ? results.filter(Boolean) : (results[0] || null);
    };

    Promise.all([
      getFileData('achievement-image', true),
      getFileData('achievement-ppt', false),
      getFileData('achievement-pdf', false)
    ]).then(([images, ppt, pdf]) => {
      const formData = {
        id: this.editingAchievement?.id || Date.now().toString(),
        title: document.getElementById('achievement-title').value,
        category: document.getElementById('achievement-category').value,
        date: document.getElementById('achievement-date').value,
        description: document.getElementById('achievement-description').value,
        status: document.getElementById('achievement-status').value,
        images: images || null,
        ppt,
        pdf
      };
      if (this.editingAchievement) {
        const index = this.achievements.findIndex(a => a.id === this.editingAchievement.id);
        this.achievements[index] = formData;
        this.showToast('Achievement updated successfully', 'success');
      } else {
        this.achievements.push(formData);
        this.showToast('Achievement added successfully', 'success');
      }
      this.closeModals();
      this.renderAchievements();
      this.updateLinkedAchievements();
    });
  }

  deleteAchievement(id) {
    if (confirm('Are you sure you want to delete this achievement?')) {
      this.achievements = this.achievements.filter(a => a.id !== id);
      this.renderAchievements();
      this.showToast('Achievement deleted successfully', 'success');
    }
  }

  filterAchievements(search, category) {
    const achievements = document.querySelectorAll('.achievement-card');
    
    achievements.forEach(card => {
      const title = card.querySelector('.achievement-title').textContent.toLowerCase();
      const description = card.querySelector('.achievement-description').textContent.toLowerCase();
      const cardCategory = card.querySelector('.achievement-category').textContent.toLowerCase();
      
      const matchesSearch = title.includes(search.toLowerCase()) || 
                           description.includes(search.toLowerCase());
      const matchesCategory = !category || cardCategory.includes(category.toLowerCase());
      
      card.style.display = matchesSearch && matchesCategory ? 'block' : 'none';
    });
  }

  // Helper to open modal by id (prevents embedding large data URLs into inline handlers)
  openAchievementModalById(id) {
    const a = this.achievements.find(x => x.id === id);
    if (a) this.openAchievementModal(a);
  }

  renderAchievements() {
    const container = document.getElementById('achievements-container');
    
    if (this.achievements.length === 0) {
      container.innerHTML = `
        <div class="text-center" style="grid-column: 1 / -1; padding: 3rem;">
          <p class="text-muted" style="font-size: 1.125rem;">No achievements added yet.</p>
          <p class="text-muted" style="margin-top: 0.5rem;">Click "Add Achievement" to get started.</p>
        </div>
      `;
      return;
    }

  container.innerHTML = this.achievements.map(achievement => {
  let fileHtml = '';
      // Images may be an array
      if (Array.isArray(achievement.images) && achievement.images.length) {
        fileHtml += `<div class="achievement-images" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">`;
        achievement.images.forEach(img => {
          if (img && img.data) fileHtml += `<div style="flex:1 0 120px;max-width:220px;"><img src="${img.data}" alt="Achievement Image" style="width:100%;height:auto;border-radius:6px;object-fit:cover;"></div>`;
        });
        fileHtml += `</div>`;
      } else if (achievement.image && achievement.image.data) {
        fileHtml += `<div><img src="${achievement.image.data}" alt="Achievement Image" style="max-width:100%;max-height:200px;margin-bottom:8px;"></div>`;
      }
      // Placeholder container for attachments — we'll create blob URLs after injecting HTML
      if ((achievement.pdf && achievement.pdf.data) || (achievement.ppt && achievement.ppt.data)) {
        fileHtml += `<div class="achievement-files" data-attach-id="${achievement.id}"></div>`;
      }
  return `
  <div class="achievement-card" data-category="${(achievement.category||'').toLowerCase()}">
        <div class="achievement-header">
          <span class="achievement-category ${achievement.category}">${achievement.category}</span>
          <span class="achievement-status ${achievement.status.replace('-', '')}">${achievement.status.replace('-', ' ')}</span>
        </div>
        <h3 class="achievement-title">${achievement.title}</h3>
        <div class="achievement-date">${this.formatDate(achievement.date)}</div>
        <p class="achievement-description">${achievement.description}</p>
        ${fileHtml}
        <div class="achievement-actions">
          <button class="btn btn-outline btn-sm" data-edit-id="${achievement.id}">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="m18.5 2.5 a2.828 2.828 0 1 1 4 4L12 16l-4 1 1-4 10.5-10.5z"/>
            </svg>
            Edit
          </button>
          <button class="btn btn-outline btn-sm" data-delete-id="${achievement.id}">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="3,6 5,6 21,6"/>
              <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
            </svg>
            Delete
          </button>
        </div>
      </div>
      `;
    }).join('');

    // Revoke any previously created blob URLs to avoid leaks
    try {
      if (!this._attachmentUrls) this._attachmentUrls = {};
      Object.keys(this._attachmentUrls).forEach(k => {
        try { URL.revokeObjectURL(this._attachmentUrls[k]); } catch (e) {}
      });
      this._attachmentUrls = {};
    } catch (e) { /* ignore */ }

    // Convert data URLs to blob URLs and insert real links for attachments
    this.achievements.forEach(achievement => {
      const attachContainer = container.querySelector(`.achievement-files[data-attach-id="${achievement.id}"]`);
      if (!attachContainer) return;
      try {
        // Create a consistent attachment row with: filename label, Open action, and a download-icon
        const makeAttachmentRow = (att, typeKey) => {
          const url = this.getAttachmentUrl(`${achievement.id}-${typeKey}`, att);
          if (!url) return;
          const filename = att && att.name ? att.name : (typeKey === 'pdf' ? `achievement-${achievement.id}.pdf` : `achievement-${achievement.id}.ppt`);

          const row = document.createElement('div');
          row.className = 'attachment-item';

          // Decide open URL: for PPT files, prefer Office Online viewer if URL is publicly addressable
          let openUrl = url;
          if (typeKey === 'ppt') {
            try {
              if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
                openUrl = 'https://view.officeapps.live.com/op/view.aspx?src=' + encodeURIComponent(url);
              } else {
                // blob: or data: URLs are not accessible to Office Online — open directly
                openUrl = url;
              }
            } catch (e) { openUrl = url; }
          }

          // Make the filename itself the clickable open link (styled as a prominent control)
          const nameLink = document.createElement('a');
          nameLink.className = 'attachment-name attach-open';
          nameLink.href = openUrl; nameLink.target = '_blank'; nameLink.rel = 'noopener';
          nameLink.textContent = filename;
          // Accessibility: allow keyboard focus styling
          nameLink.setAttribute('role', 'button');
          row.appendChild(nameLink);

          // If this is a PPT and the openUrl is not an http(s) URL, try to upload to Drive
          // and open via Office Online viewer. This requires Drive integration (gapi) and auth.
          if (typeKey === 'ppt') {
            const isHttp = (typeof openUrl === 'string' && (openUrl.startsWith('http://') || openUrl.startsWith('https://')));
            if (!isHttp) {
              // Prevent default navigation — we'll handle click
              nameLink.addEventListener('click', async (ev) => {
                ev.preventDefault(); ev.stopPropagation();
                try {
                  // Resolve the attachment data to a Blob if necessary
                  let blob = null;
                  // If att.data is a data: URI string, convert via dataURLToBlob
                  const raw = att && (att.data || att);
                  if (typeof raw === 'string' && raw.startsWith('data:')) {
                    blob = this.dataURLToBlob(raw);
                  } else if (typeof Blob !== 'undefined' && raw instanceof Blob) {
                    blob = raw;
                  } else if (raw && (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw))) {
                    const buf = raw instanceof ArrayBuffer ? raw : raw.buffer;
                    blob = new Blob([buf], { type: att.type || 'application/vnd.ms-powerpoint' });
                  }

                  if (!blob) {
                    this.showToast('Cannot prepare PPT for Office preview locally', 'error');
                    // fallback: open the existing URL (may download)
                    window.open(openUrl, '_blank', 'noopener');
                    return;
                  }

                  // Download the PPT file directly (privacy compliant - no external uploads)
                  // This ensures we only use drive.appdata scope, not drive.file scope
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = filename || 'presentation.ppt';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(a.href);
                  this.showToast('PPT file downloaded', 'success');
                  return;
                } catch (err) {
                  console.error('Office preview upload failed', err);
                  this.showToast('Unable to open PPT in Office Online: ' + (err && err.message ? err.message : ''), 'error');
                }
              });
            }
          }

          // Download icon (keeps existing download behavior)
          const dl = document.createElement('a');
          dl.href = url; dl.download = filename; dl.className = 'attach-download'; dl.title = 'Download ' + filename; dl.rel = 'noopener';
          dl.innerHTML = `
            <svg class="icon icon-download" viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>`;
          row.appendChild(dl);

          attachContainer.appendChild(row);
        };

        if (achievement.pdf) makeAttachmentRow(achievement.pdf, 'pdf');
        if (achievement.ppt) makeAttachmentRow(achievement.ppt, 'ppt');
      } catch (e) { console.warn('attachment processing failed for achievement', achievement.id, e); }
    });

    // Update category cards counts after rendering
    if (typeof this.updateCategoryCards === 'function') this.updateCategoryCards();

    // Wire category-card clicks (so the summary cards filter the grid)
    document.querySelectorAll('#category-cards .cat-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const key = card.dataset.key || '';
        // Activate matching descriptive pill (ensure aria attributes and unique active state)
        document.querySelectorAll('.descriptive-category').forEach(p => { p.classList.remove('active'); p.setAttribute('aria-pressed', 'false'); });
        const matchingPill = document.querySelector(`.descriptive-category[data-category="${key}"]`);
        if (matchingPill) { matchingPill.classList.add('active'); matchingPill.setAttribute('aria-pressed','true'); }
        // Update mobile select if present
        const mobileSelect = document.getElementById('mobile-descriptive-select');
        if (mobileSelect) { mobileSelect.value = key || ''; mobileSelect.classList.toggle('active', !!key); }
        // Filter
        this.filterAchievements(document.getElementById('search-descriptive')?.value || '', key);
      });
    });

    // Wire edit/delete buttons by id (avoid embedding large data in onclick)
    container.querySelectorAll('[data-edit-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.dataset.editId;
        this.openAchievementModalById(id);
      });
    });
    container.querySelectorAll('[data-delete-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.dataset.deleteId;
        this.deleteAchievement(id);
      });
    });

    // Ensure descriptive pills still filter correctly (rebind in case of dynamic HTML)
    document.querySelectorAll('.descriptive-category').forEach(btn => {
      btn.onclick = (e) => {
        document.querySelectorAll('.descriptive-category').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const cat = e.currentTarget.dataset.category || '';
        const searchVal = document.getElementById('search-descriptive')?.value || '';
        // Sync mobile select
        const mobile = document.getElementById('mobile-descriptive-select'); if (mobile) mobile.value = cat;
        this.filterAchievements(searchVal, cat);
      };
    });
  }

  // Override filterAchievements to use achievement.dataset or data-category attribute instead of inner text
  filterAchievements(search, category) {
    const q = (search || '').toLowerCase();
    const achievements = document.querySelectorAll('.achievement-card');
    achievements.forEach(card => {
      const titleEl = card.querySelector('.achievement-title');
      const descEl = card.querySelector('.achievement-description');
      const title = (titleEl && titleEl.textContent || '').toLowerCase();
      const description = (descEl && descEl.textContent || '').toLowerCase();
      const cardCategory = (card.dataset.category || (card.querySelector('.achievement-category') && card.querySelector('.achievement-category').textContent) || '').toLowerCase();
      // Prefer title match; fall back to description if title not matched
      const matchesSearch = q === '' ? true : (title.includes(q) || description.includes(q));
      const matchesCategory = !category || category === '' || cardCategory === (category || '').toLowerCase();
      card.style.display = (matchesSearch && matchesCategory) ? 'block' : 'none';
    });
  }

  // Update the small category cards' counts based on current achievements
  updateCategoryCards() {
    // Count exactly the four requested categories
    const keys = {
      academic: 0,
      clinical: 0,
      extracurricular: 0,
      research: 0
    };
    (this.achievements || []).forEach(a => {
      const cat = (a.category || '').toLowerCase();
      if (cat === 'academic') keys.academic++;
      else if (cat === 'clinical') keys.clinical++;
      else if (cat === 'extracurricular' || cat === 'extracurriculars') keys.extracurricular++;
      else if (cat === 'research') keys.research++;
    });

    const cards = document.querySelectorAll('#category-cards .cat-card');
    cards.forEach(card => {
      const key = card.dataset.key;
      const count = keys[key] || 0;
      const countEl = card.querySelector('.cat-count');
      if (countEl) countEl.textContent = count;
    });
  }

  // Reflection Management
  openReflectionModal(reflection = null) {
    this.editingReflection = reflection;
    const modal = document.getElementById('reflection-modal');
    const title = document.getElementById('reflection-modal-title');
    
    if (reflection) {
      title.textContent = 'Edit Reflection';
      document.getElementById('reflection-title').value = reflection.title;
      document.getElementById('reflection-date').value = reflection.date;
      document.getElementById('reflection-mood').value = reflection.mood;
      document.getElementById('reflection-content').value = reflection.content;
      document.getElementById('reflection-linked').value = reflection.linkedAchievement || '';
      // Clear file inputs for security/browsers and avoid stale file submission
      try { document.getElementById('reflection-image').value = null; } catch (e) {}
      try { document.getElementById('reflection-ppt').value = null; } catch (e) {}
      try { document.getElementById('reflection-pdf').value = null; } catch (e) {}
    } else {
      title.textContent = 'Add Reflection';
      document.getElementById('reflection-form').reset();
      document.getElementById('reflection-date').value = new Date().toISOString().split('T')[0];
    }
    
    modal.classList.add('active');
    // Ensure controls inside this modal reliably close it (bind on open)
    try {
      const closeBtn = modal.querySelector('.modal-close');
      if (closeBtn) { closeBtn.onclick = () => this.closeModals(); }
      modal.querySelectorAll('.modal-cancel').forEach(b => { b.onclick = () => this.closeModals(); });
    } catch (e) { /* ignore */ }
  }

  saveReflection(e) {
    e.preventDefault();
    const getFileData = async (inputId, allowMultiple = false) => {
      const fileInput = document.getElementById(inputId);
      if (!fileInput || !fileInput.files || fileInput.files.length === 0) return null;
      const files = Array.from(fileInput.files);
      const readers = files.map(file => {
        return new Promise(async (resolve) => {
          try {
            if (file.type.startsWith('image/')) {
              try {
                const data = await this.resizeImage(file, 800, 0.8);
                resolve({ name: file.name, type: file.type, data });
              } catch (e) {
                const r = new FileReader();
                r.onload = (ev) => resolve({ name: file.name, type: file.type, data: ev.target.result });
                r.readAsDataURL(file);
              }
            } else {
              const r = new FileReader();
              r.onload = (ev) => resolve({ name: file.name, type: file.type, data: ev.target.result });
              r.readAsDataURL(file);
            }
          } catch (err) { resolve(null); }
        });
      });
      const results = await Promise.all(readers);
      return allowMultiple ? results.filter(Boolean) : (results[0] || null);
    };

    Promise.all([
      getFileData('reflection-image', true),
      getFileData('reflection-ppt', false),
      getFileData('reflection-pdf', false)
    ]).then(([images, ppt, pdf]) => {
      const formData = {
        id: this.editingReflection?.id || Date.now().toString(),
        title: document.getElementById('reflection-title').value,
        date: document.getElementById('reflection-date').value,
        mood: document.getElementById('reflection-mood').value,
        content: document.getElementById('reflection-content').value,
        linkedAchievement: document.getElementById('reflection-linked').value || null,
        images: images || null,
        ppt,
        pdf
      };
      if (this.editingReflection) {
        const index = this.reflections.findIndex(r => r.id === this.editingReflection.id);
        this.reflections[index] = formData;
        this.showToast('Reflection updated successfully', 'success');
      } else {
        this.reflections.push(formData);
        this.showToast('Reflection added successfully', 'success');
      }
      this.closeModals();
      this.renderReflections();
    });
  }

  openReflectionModalById(id) {
    const r = this.reflections.find(x => x.id === id);
    if (r) this.openReflectionModal(r);
  }

  deleteReflection(id) {
    if (confirm('Are you sure you want to delete this reflection?')) {
      this.reflections = this.reflections.filter(r => r.id !== id);
      this.renderReflections();
      this.showToast('Reflection deleted successfully', 'success');
    }
  }

  filterReflections(search, mood) {
    const q = (search || '').toLowerCase();
    const reflections = document.querySelectorAll('.reflection-card');
    reflections.forEach(card => {
      const titleEl = card.querySelector('.reflection-title');
      const contentEl = card.querySelector('.reflection-content');
      const moodEl = card.querySelector('.reflection-mood');
      const title = (titleEl && titleEl.textContent || '').toLowerCase();
      const content = (contentEl && contentEl.textContent || '').toLowerCase();
      const cardMood = (moodEl && moodEl.textContent || '').toLowerCase();
      const matchesSearch = q === '' ? true : (title.includes(q) || content.includes(q));
      const matchesMood = !mood || mood === '' ? true : cardMood === (mood || '').toLowerCase();
      card.style.display = (matchesSearch && matchesMood) ? 'block' : 'none';
    });
  }

  renderReflections() {
    const container = document.getElementById('reflections-container');
    
    if (this.reflections.length === 0) {
      container.innerHTML = `
        <div class="text-center" style="padding: 3rem;">
          <p class="text-muted" style="font-size: 1.125rem;">No reflections added yet.</p>
          <p class="text-muted" style="margin-top: 0.5rem;">Click "Add Reflection" to start journaling your experiences.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.reflections.map(reflection => {
      const linkedAchievement = this.achievements.find(a => a.id === reflection.linkedAchievement);
      let fileHtml = '';
      if (Array.isArray(reflection.images) && reflection.images.length) {
        fileHtml += `<div class="reflection-images" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">`;
        reflection.images.forEach(img => { if (img && img.data) fileHtml += `<div style="flex:1 0 120px;max-width:220px;"><img src="${img.data}" alt="Reflection Image" style="width:100%;height:auto;border-radius:6px;object-fit:cover;"></div>` });
        fileHtml += `</div>`;
      } else if (reflection.image && reflection.image.data) {
        fileHtml += `<div><img src="${reflection.image.data}" alt="Reflection Image" style="max-width:100%;max-height:200px;margin-bottom:8px;"></div>`;
      }
      // Placeholder container for attachments — we'll create blob URLs after injecting HTML
      if ((reflection.pdf && reflection.pdf.data) || (reflection.ppt && reflection.ppt.data)) {
        fileHtml += `<div class="reflection-files" data-attach-id="${reflection.id}"></div>`;
      }
      return `
        <div class="reflection-card">
          <div class="reflection-header">
            <div class="reflection-meta">
              <span class="reflection-mood ${reflection.mood}">${reflection.mood}</span>
              <div class="reflection-date">${this.formatDate(reflection.date)}</div>
            </div>
            <div class="reflection-actions">
                <button class="btn btn-outline btn-sm" data-edit-id="${reflection.id}">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="m18.5 2.5 a2.828 2.828 0 1 1 4 4L12 16l-4 1 1-4 10.5-10.5z"/>
                </svg>
                Edit
              </button>
                <button class="btn btn-outline btn-sm" data-delete-id="${reflection.id}">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <polyline points="3,6 5,6 21,6"/>
                  <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
                </svg>
                Delete
              </button>
            </div>
          </div>
          <h3 class="reflection-title">${reflection.title}</h3>
          <div class="reflection-content">${reflection.content}</div>
          ${fileHtml}
          ${linkedAchievement ? `
            <div class="reflection-linked">
              <div class="reflection-linked-label">Linked Achievement</div>
              <div class="reflection-linked-title">${linkedAchievement.title}</div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    // Wire edit/delete handlers for reflections
    container.querySelectorAll('[data-edit-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.dataset.editId;
        this.openReflectionModalById(id);
      });
    });
    container.querySelectorAll('[data-delete-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.dataset.deleteId;
        this.deleteReflection(id);
      });
    });

    // Attach blob-backed links for reflection attachments
    try {
      if (!this._attachmentUrls) this._attachmentUrls = {};
      this.reflections.forEach(reflection => {
        const attachContainer = container.querySelector(`.reflection-files[data-attach-id="${reflection.id}"]`);
        if (!attachContainer) return;
        try {
          const makeAttachmentRow = (att, typeKey) => {
            const url = this.getAttachmentUrl(`${reflection.id}-${typeKey}`, att);
            if (!url) return;
            const filename = att && att.name ? att.name : (typeKey === 'pdf' ? `reflection-${reflection.id}.pdf` : `reflection-${reflection.id}.ppt`);

            const row = document.createElement('div');
            row.className = 'attachment-item';

            let openUrl = url;
            if (typeKey === 'ppt') {
              try {
                if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
                  openUrl = 'https://view.officeapps.live.com/op/view.aspx?src=' + encodeURIComponent(url);
                } else {
                  openUrl = url;
                }
              } catch (e) { openUrl = url; }
            }

            const nameLink = document.createElement('a');
            nameLink.className = 'attachment-name attach-open';
            nameLink.href = openUrl; nameLink.target = '_blank'; nameLink.rel = 'noopener';
            nameLink.textContent = filename;
            nameLink.setAttribute('role', 'button');
            row.appendChild(nameLink);

            if (typeKey === 'ppt') {
              const isHttp = (typeof openUrl === 'string' && (openUrl.startsWith('http://') || openUrl.startsWith('https://')));
              if (!isHttp) {
                nameLink.addEventListener('click', async (ev) => {
                  ev.preventDefault(); ev.stopPropagation();
                  try {
                    let blob = null;
                    const raw = att && (att.data || att);
                    if (typeof raw === 'string' && raw.startsWith('data:')) {
                      blob = this.dataURLToBlob(raw);
                    } else if (typeof Blob !== 'undefined' && raw instanceof Blob) {
                      blob = raw;
                    } else if (raw && (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw))) {
                      const buf = raw instanceof ArrayBuffer ? raw : raw.buffer;
                      blob = new Blob([buf], { type: att.type || 'application/vnd.ms-powerpoint' });
                    }

                    if (!blob) {
                      this.showToast('Cannot prepare PPT for Office preview locally', 'error');
                      window.open(openUrl, '_blank', 'noopener');
                      return;
                    }

                    // Download the PPT file directly (privacy compliant - no external uploads)
                    // This ensures we only use drive.appdata scope, not drive.file scope
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = filename || 'presentation.ppt';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(a.href);
                    this.showToast('PPT file downloaded', 'success');
                    return;
                  } catch (err) {
                    console.error('Office preview upload failed', err);
                    this.showToast('Unable to open PPT in Office Online: ' + (err && err.message ? err.message : ''), 'error');
                  }
                });
              }
            }

            const dl = document.createElement('a');
            dl.href = url; dl.download = filename; dl.className = 'attach-download'; dl.title = 'Download ' + filename; dl.rel = 'noopener';
            dl.innerHTML = `
              <svg class="icon icon-download" viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>`;
            row.appendChild(dl);

            attachContainer.appendChild(row);
          };

          if (reflection.pdf) makeAttachmentRow(reflection.pdf, 'pdf');
          if (reflection.ppt) makeAttachmentRow(reflection.ppt, 'ppt');
        } catch (e) { console.warn('attachment processing failed for reflection', reflection.id, e); }
      });
    } catch (e) { /* ignore */ }
  }

  updateLinkedAchievements() {
    const select = document.getElementById('reflection-linked');
    select.innerHTML = '<option value="">No linked achievement</option>' +
      this.achievements.map(achievement => 
        `<option value="${achievement.id}">${achievement.title}</option>`
      ).join('');
  }

  // Utility Methods
  closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.classList.remove('active');
    });
    this.editingAchievement = null;
    this.editingReflection = null;
  }

  // Helper function to generate standardized filename from personal info
  generateStandardFilename(extension = '', fallback = 'portfolio') {
    try {
      console.log('[Portfolio] Generating standardized filename with extension:', extension);
      
      // Get personal info from localStorage and DOM
      let personalInfo = {};
      try {
        personalInfo = JSON.parse(localStorage.getItem('personalInfo') || '{}');
      } catch(e) {
        console.warn('[Portfolio] Failed to parse localStorage personalInfo:', e);
      }
      
      // Try multiple sources for student name
      let studentName = personalInfo.studentName || 
                       personalInfo.fullName || 
                       personalInfo.firstName || 
                       document.getElementById('studentName-display')?.textContent ||
                       document.getElementById('firstName-display')?.textContent ||
                       '';
      
      // Try multiple sources for roll number  
      let rollNo = personalInfo.rollNo ||
                   personalInfo.roll ||
                   document.getElementById('rollNo-display')?.textContent ||
                   '';
      
      console.log('[Portfolio] Found studentName:', studentName, 'rollNo:', rollNo);
      
      // Clean and format the values
      studentName = String(studentName || '').trim();
      rollNo = String(rollNo || '').trim();
      
      // Generate filename based on available data
      let filename = '';
      if (studentName && rollNo) {
        // Both name and roll number available - ideal format
        const cleanName = studentName.replace(/[^A-Za-z0-9\s]/g, '').replace(/\s+/g, '-').toLowerCase();
        const cleanRoll = rollNo.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
        filename = `${cleanName}-${cleanRoll}`;
        console.log('[Portfolio] ✅ Generated full filename:', filename);
      } else if (studentName) {
        // Only name available
        const cleanName = studentName.replace(/[^A-Za-z0-9\s]/g, '').replace(/\s+/g, '-').toLowerCase();
        filename = `${cleanName}-portfolio`;
        console.log('[Portfolio] ⚠️ Generated name-only filename:', filename);
      } else if (rollNo) {
        // Only roll number available
        const cleanRoll = rollNo.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
        filename = `student-${cleanRoll}`;
        console.log('[Portfolio] ⚠️ Generated roll-only filename:', filename);
      } else {
        // Neither available - use fallback
        filename = fallback;
        console.log('[Portfolio] ❌ Using fallback filename:', filename);
      }
      
      // Remove any remaining invalid characters and ensure reasonable length
      filename = filename.replace(/[^A-Za-z0-9-]+/g, '-')
                        .replace(/^-+|-+$/g, '')
                        .toLowerCase();
      
      if (!filename) filename = fallback;
      if (filename.length > 80) filename = filename.slice(0, 80);
      
      // Add extension if provided
      if (extension) {
        const ext = extension.startsWith('.') ? extension : '.' + extension;
        filename = filename + ext;
      }
      
      console.log('[Portfolio] 🎯 Final standardized filename:', filename);
      return filename;
      
    } catch (error) {
      console.error('[Portfolio] Error generating filename:', error);
      return fallback + (extension ? (extension.startsWith('.') ? extension : '.' + extension) : '');
    }
  }

  // Export visible portfolio content to PDF using html2canvas + jsPDF
  async exportToPdf() {
    if (this._busy) return; // prevent re-entry
    this.showLoadingBar();
    try {
      if (typeof html2canvas === 'undefined' || (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined')) {
        this.showToast('PDF libraries not loaded', 'error');
        this.hideLoadingBar(false);
        return;
      }
      const JSPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (typeof jsPDF !== 'undefined' ? jsPDF : null);
      if (!JSPDF) { this.showToast('jsPDF not available', 'error'); this.hideLoadingBar(false); return; }

      // PDF layout parameters
      const pdf = new JSPDF('p', 'pt', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 28; // points
      const contentWidth = pageWidth - margin * 2;
      const headerHeight = 50; // Reserve space for header
      let cursorY = margin + headerHeight; // Start content below header
  // Track current page (start at 1). We'll increment when we add pages so we can
  // avoid inserting a blank page before the very first heading.
  let pageIndex = 1;

      // Function to add RMU header to current page
      const addRMUHeader = (pdf, pageIndex) => {
        try {
          // Set font and size for university name
          pdf.setFont('times', 'bold');
          pdf.setFontSize(16);
          pdf.setTextColor(139, 69, 19); // RMU maroon color (approximate RGB)
          
          // Center the university name
          const universityName = "RAWALPINDI MEDICAL UNIVERSITY";
          const textWidth = pdf.getStringUnitWidth(universityName) * 16 / pdf.internal.scaleFactor;
          const centerX = (pageWidth - textWidth) / 2;
          
          pdf.text(universityName, centerX, margin + 20);
          
          // Add a line below the header
          pdf.setDrawColor(139, 69, 19); // Same maroon color
          pdf.setLineWidth(1);
          pdf.line(margin, margin + 35, pageWidth - margin, margin + 35);
          
          // Reset text color for content
          pdf.setTextColor(0, 0, 0);
        } catch (e) {
          console.warn('Failed to add PDF header:', e);
        }
      };

      // Add header to first page
      addRMUHeader(pdf, pageIndex);

      // Color map for categories and statuses (approximate)
      const categoryColors = {
        academic: { bg: '#eaf4ff', color: '#2b8aef' },
        clinical: { bg: '#ecfdf5', color: '#10b981' },
        extracurricular: { bg: '#fff7ed', color: '#f97316' },
        research: { bg: '#f3e8ff', color: '#8b5cf6' },
        certification: { bg: '#fff7f0', color: '#ef4444' }
      };
      const statusColors = {
        completed: '#10b981',
        'in-progress': '#f59e0b',
        planned: '#3b82f6'
      };

      // We'll clone the live DOM sections so the PDF visually matches the website CSS
  // Use let (not const) so we can optionally null it later without errors
  let renderRoot = document.createElement('div');
      renderRoot.style.position = 'fixed'; 
      renderRoot.style.left = '-9999px'; 
      renderRoot.style.top = '0'; 
      renderRoot.style.zIndex = '99999'; 
      renderRoot.style.padding = '10px';
      // Always use desktop width for PDF export, regardless of current device/viewport
      const widthPx = 960;
      renderRoot.style.width = widthPx + 'px';
      renderRoot.style.minWidth = widthPx + 'px';
      renderRoot.style.maxWidth = widthPx + 'px';
      renderRoot.style.fontSize = '14px'; // Force consistent font size
      renderRoot.style.overflow = 'visible';
      // Force desktop media query behavior by setting a large width on the container
      renderRoot.style.setProperty('width', widthPx + 'px', 'important');
      renderRoot.classList.add('pdf-desktop-render'); // Add a class for targeting if needed
      document.body.appendChild(renderRoot);

      // Helper to clone a node and remove interactive controls that shouldn't appear in PDF
      const cloneClean = (el) => {
        const c = el.cloneNode(true);
        // remove any buttons, inputs, modals, action toolbars
        c.querySelectorAll && c.querySelectorAll('.modal, .achievement-actions, .reflection-actions, button, input, textarea, .attach-download').forEach(n => n.remove());
        // remove any overly interactive elements that might show focus outlines
        c.querySelectorAll && c.querySelectorAll('[contenteditable]').forEach(n => n.removeAttribute('contenteditable'));
        
        // Force desktop layout for PDF export regardless of mobile viewport
        const modernLayout = c.querySelector('.rmu-modern-layout');
        if (modernLayout) {
          modernLayout.style.display = 'grid';
          modernLayout.style.gridTemplateColumns = '1fr 33.333%';
          modernLayout.style.minHeight = '100vh';
          modernLayout.style.width = '100%';
          // Override any mobile media query effects
          modernLayout.style.setProperty('grid-template-columns', '1fr 33.333%', 'important');
        }
        
        // Ensure content area uses desktop styling
        const contentArea = c.querySelector('.rmu-content-area');
        if (contentArea) {
          contentArea.style.order = '1';
          contentArea.style.width = 'auto';
          contentArea.style.padding = '2rem';
        }
        
        // Force desktop two-column layout for fields container (override mobile single column)
        const fieldsContainer = c.querySelector('.rmu-fields-container');
        if (fieldsContainer) {
          fieldsContainer.style.display = 'grid';
          fieldsContainer.style.gridTemplateColumns = '1fr 1fr';
          fieldsContainer.style.gap = '3rem';
          fieldsContainer.style.padding = '1rem 0';
          // Override mobile media query with important
          fieldsContainer.style.setProperty('grid-template-columns', '1fr 1fr', 'important');
          fieldsContainer.style.setProperty('gap', '3rem', 'important');
        }
        
        // Ensure field columns use desktop layout
        const fieldColumns = c.querySelectorAll('.rmu-field-column');
        fieldColumns.forEach(column => {
          column.style.display = 'flex';
          column.style.flexDirection = 'column';
          column.style.gap = '2rem';
        });
        
        // Override any mobile-specific field styling
        const rmuFields = c.querySelectorAll('.rmu-field');
        rmuFields.forEach(field => {
          field.style.display = 'flex';
          field.style.flexDirection = 'column';
          field.style.gap = '0.5rem';
        });
        
        // Fix profile image styling for PDF export to prevent stretching
        const profileImg = c.querySelector('.rmu-profile-img-modern');
        if (profileImg && profileImg.naturalWidth && profileImg.naturalHeight) {
          // Reset any dynamic styles that might cause stretching in PDF
          profileImg.style.width = 'auto';
          profileImg.style.height = 'auto';
          profileImg.style.maxWidth = '100%';
          profileImg.style.maxHeight = '100%';
          profileImg.style.objectFit = 'contain';
          profileImg.style.objectPosition = 'center center';
          profileImg.style.minHeight = 'unset';
          
          // Set the profile column to have a reasonable height for PDF
          const profileColumn = c.querySelector('.rmu-profile-column');
          if (profileColumn) {
            profileColumn.style.height = 'auto';
            profileColumn.style.minHeight = '400px'; // reasonable height for PDF
            profileColumn.style.maxHeight = '600px';
            profileColumn.style.display = 'flex';
            profileColumn.style.alignItems = 'center';
            profileColumn.style.justifyContent = 'center';
            profileColumn.style.order = '2';
            profileColumn.style.width = 'auto'; // Let grid handle the width
          }
          
          // Ensure the profile picture container maintains aspect ratio
          const profilePicture = c.querySelector('.rmu-profile-picture-modern');
          if (profilePicture) {
            profilePicture.style.width = '100%';
            profilePicture.style.height = 'auto';
            profilePicture.style.display = 'flex';
            profilePicture.style.alignItems = 'center';
            profilePicture.style.justifyContent = 'center';
          }
        }
        
        return c;
      };

      // 1) First page: personal info section (use the live DOM if available)
      try {
        const personalEl = document.getElementById('personal');
        if (personalEl) {
          const pClone = cloneClean(personalEl);
          try { pClone.dataset.pdfPersonal = 'true'; } catch (e) {}
          renderRoot.appendChild(pClone);
        } else {
          // fallback: construct a small personal card from localStorage values
          try {
            const personalInfo = JSON.parse(localStorage.getItem('personalInfo') || '{}');
            const personalCard = document.createElement('div'); personalCard.style.width = widthPx + 'px'; personalCard.style.padding = '14px'; personalCard.style.background = '#fff'; personalCard.style.borderRadius = '12px'; personalCard.style.boxShadow = '0 8px 24px rgba(16,24,40,0.06)'; personalCard.style.marginBottom = '12px';
            const name = document.createElement('h1'); name.textContent = personalInfo.firstName || document.getElementById('firstName-display')?.textContent || 'Profile'; name.style.margin = '0 0 6px 0'; name.style.fontSize = '20px'; personalCard.appendChild(name);
            const prof = document.createElement('div'); prof.textContent = personalInfo.title || document.getElementById('title-display')?.textContent || ''; prof.style.color = '#64748b'; personalCard.appendChild(prof);
            const bio = document.createElement('p'); bio.textContent = personalInfo.bio || document.getElementById('bio-display')?.textContent || ''; bio.style.marginTop = '8px'; bio.style.color = '#475569'; personalCard.appendChild(bio);
            renderRoot.appendChild(personalCard);
          } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore personal render errors */ }

      // 2) Descriptive portfolio heading and grouped achievements by category
      try {
        const descHeading = document.createElement('div');
        descHeading.style.width = widthPx + 'px';
        descHeading.style.margin = '18px 0 8px 0';
        descHeading.style.padding = '12px 8px';
        descHeading.style.background = 'linear-gradient(90deg,#f8fafc,#ffffff)';
        descHeading.style.borderRadius = '10px';
        const dh = document.createElement('h1'); dh.textContent = 'Descriptive portfolio'; dh.style.margin = '0'; dh.style.fontSize = '20px'; dh.style.letterSpacing = '0.2px'; dh.style.color = '#0f172a'; dh.style.fontWeight = '700';
  descHeading.appendChild(dh);
  descHeading.dataset.pdfForcePageBreak = 'before';
  renderRoot.appendChild(descHeading);

        const achContainer = document.getElementById('achievements-container');
        if (achContainer) {
          // Append achievements in their existing DOM order (no category subheadings)
          const items = Array.from(achContainer.querySelectorAll('.achievement-card')).filter(c => c.style.display !== 'none');
          for (const c of items) {
            try { renderRoot.appendChild(cloneClean(c)); } catch (e) { /* ignore individual clone errors */ }
          }
        }
      } catch (e) { console.warn('Failed to clone achievements for PDF', e); }

      // 3) Reflective portfolio heading and reflections
      try {
        const reflHeading = document.createElement('div');
        reflHeading.style.width = widthPx + 'px';
        reflHeading.style.margin = '18px 0 8px 0';
        reflHeading.style.padding = '12px 8px';
        reflHeading.style.background = 'linear-gradient(90deg,#f8fafc,#ffffff)';
        reflHeading.style.borderRadius = '10px';
        const rh = document.createElement('h1'); rh.textContent = 'Reflective portfolio'; rh.style.margin = '0'; rh.style.fontSize = '20px'; rh.style.letterSpacing = '0.2px'; rh.style.color = '#0f172a'; rh.style.fontWeight = '700';
  reflHeading.appendChild(rh);
  reflHeading.dataset.pdfForcePageBreak = 'before';
  renderRoot.appendChild(reflHeading);

        const refContainer = document.getElementById('reflections-container');
        if (refContainer) {
          const cards = Array.from(refContainer.querySelectorAll('.reflection-card'));
          for (const c of cards) {
            if (c.style.display === 'none') continue;
            renderRoot.appendChild(cloneClean(c));
          }
        }
      } catch (e) { console.warn('Failed to clone reflections for PDF', e); }

      // Convert any plain-text URLs inside the cloned renderRoot to real anchors
      // so jsPDF can add link annotations for them (e.g. links in descriptions).
      const linkifyTextUrls = (root) => {
        try {
          // Match full http(s) urls, www-prefixed, or bare domains like example.com/path
          const urlRegex = /(\b(?:https?:\/\/|www\.|[a-z0-9.-]+\.[a-z]{2,})(?:[^\s<>()]*))/gi;
          const walk = (node) => {
            if (!node) return;
            if (node.nodeType === Node.ELEMENT_NODE) {
              const tag = node.tagName && node.tagName.toLowerCase();
              if (tag === 'a' || tag === 'script' || tag === 'style') return;
              // walk a static copy because we may replace child nodes
              const children = Array.from(node.childNodes);
              for (const c of children) walk(c);
              return;
            }
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.nodeValue;
              if (!text) return;
              urlRegex.lastIndex = 0;
              let match;
              let lastIndex = 0;
              const frag = document.createDocumentFragment();
              let found = false;
              while ((match = urlRegex.exec(text)) !== null) {
                found = true;
                const url = match[0];
                const idx = match.index;
                if (idx > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
                // normalize URL (add https if it starts with www.) and trim trailing punctuation
                let href = url;
                if (/^www\./i.test(href)) href = 'https://' + href;
                href = href.replace(/[.,;:()]+$/g, '');
                try {
                  const a = document.createElement('a');
                  a.setAttribute('href', href);
                  a.textContent = url;
                  a.setAttribute('target', '_blank');
                  a.setAttribute('rel', 'noopener noreferrer');
                  // Add lightweight inline styling so links appear clearly in the rendered PDF
                  try { a.style.color = '#0366d6'; a.style.textDecoration = 'underline'; } catch (e) {}
                  frag.appendChild(a);
                } catch (e) {
                  frag.appendChild(document.createTextNode(url));
                }
                lastIndex = idx + url.length;
              }
              if (!found) return;
              if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
              if (node.parentNode) node.parentNode.replaceChild(frag, node);
            }
          };
          walk(root);
        } catch (e) { /* ignore linkify errors */ }
      };

      // Run linkify on the cloned render root so any plain URLs become anchors
      try { linkifyTextUrls(renderRoot); } catch (e) { /* ignore */ }

      // Ensure all anchors have absolute hrefs and consistent inline styling so PDF link annotations are valid
      try {
        const anchors = Array.from(renderRoot.querySelectorAll('a'));
        anchors.forEach(a => {
          try {
            const raw = a.getAttribute('href') || a.href || '';
            // If it's already absolute (starts with http(s):), leave it
            if (/^https?:\/\//i.test(raw)) { a.href = raw; } else {
              // Resolve relative to current document location
              try { a.href = new URL(raw, document.location.href).href; } catch (e) { /* leave as-is */ }
            }
            // Ensure visible link styling in the rendered PDF
            try {
              a.style.color = '#0366d6';
              a.style.textDecoration = 'underline';
              a.style.textDecorationColor = '#0366d6';
            } catch (e) { /* ignore styling errors */ }
          } catch (e) { /* ignore per-anchor */ }
        });
      } catch (e) { /* ignore anchor resolution errors */ }

      // Render each child to canvas and add to PDF, preserving links by adding annotations
      const children = Array.from(renderRoot.children);
      for (let i = 0; i < children.length; i++) {
        const node = children[i];
        // Small visual placeholder (SVG) used when images fail to load
        const _placeholderSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400'><rect width='100%' height='100%' fill='#f3f4f6'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#9ca3af' font-family='Arial' font-size='20'>Image unavailable</text></svg>`;
        const _placeholderDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(_placeholderSvg);

        // Replace any broken/unloaded images with a placeholder and return a restore list
        const replaceBrokenImages = (parent) => {
          try {
            const imgs = Array.from(parent.querySelectorAll('img'));
            const replaced = [];
            imgs.forEach(img => {
              const ok = img.complete && img.naturalWidth && img.naturalHeight;
              if (!ok) {
                replaced.push({ img, origSrc: img.src, origSrcset: img.srcset || '' });
                try { img.src = _placeholderDataUrl; img.srcset = ''; } catch (e) { /* ignore */ }
              }
            });
            return replaced;
          } catch (e) { return []; }
        };

        // Wait for images inside the node to finish loading (avoid 0x0 canvas from html2canvas)
        const waitForImagesToLoad = async (parent, timeout = 2000) => {
          try {
            const imgs = Array.from(parent.querySelectorAll('img'));
            if (!imgs.length) return true;
            const promises = imgs.map((img) => new Promise((resolve) => {
              if (img.complete && img.naturalWidth && img.naturalHeight) return resolve(true);
              let settled = false;
              const onDone = () => { if (settled) return; settled = true; cleanup(); resolve(img.naturalWidth > 0 && img.naturalHeight > 0); };
              const onErr = () => { if (settled) return; settled = true; cleanup(); resolve(false); };
              const cleanup = () => { img.removeEventListener('load', onDone); img.removeEventListener('error', onErr); };
              img.addEventListener('load', onDone); img.addEventListener('error', onErr);
              // fallback timeout
              setTimeout(() => { if (settled) return; settled = true; cleanup(); resolve(img.naturalWidth > 0 && img.naturalHeight > 0); }, timeout);
            }));
            await Promise.all(promises);
            return true;
          } catch (e) { return false; }
        };
        // If this node requests a page break before it, start a new page
        try {
          if (node.dataset && node.dataset.pdfForcePageBreak === 'before') {
            // Only add a new page if current page already has content (cursorY > margin).
            // This prevents creating an extra blank page when the prior node already added a fresh page
            if (cursorY > margin + headerHeight) { 
              pdf.addPage(); 
              pageIndex++; 
              addRMUHeader(pdf, pageIndex);
              cursorY = margin + headerHeight; 
            }
          }
        } catch (e) { /* ignore */ }
        // Ensure layout/styles settle. Replace broken images with placeholders so
        // html2canvas still renders the layout even if some images fail to load.
        await new Promise(r => setTimeout(r, 60));
        const replacedImgs = replaceBrokenImages(node);
        try {
          await waitForImagesToLoad(node, 2000);
        } catch (e) { /* continue - we'll still attempt to render with placeholders */ }

        // Collect anchors for annotation (href may be relative; resolve to absolute)
        const anchors = Array.from(node.querySelectorAll('a')).map(a => {
          try { return { href: a.href || a.getAttribute('href'), rect: a.getBoundingClientRect() }; } catch (e) { return null; }
        }).filter(Boolean);

  const nodeRect = node.getBoundingClientRect();
  // Use consistent scaling for all content to ensure identical output from mobile and desktop
  const pdfScale = 2.0; // Fixed scale for consistent results
  const canvas = await html2canvas(node, { scale: pdfScale, useCORS: true, logging: false, backgroundColor: '#ffffff', width: widthPx });
        // Defensive: html2canvas may return a zero-dimension canvas for hidden/empty nodes.
        if (!canvas || !canvas.width || !canvas.height) {
          console.warn('html2canvas returned empty canvas for node, skipping:', node);
          // restore replaced images before continuing
          try { replacedImgs.forEach(r => { r.img.src = r.origSrc; r.img.srcset = r.origSrcset || ''; }); } catch (e) {}
          continue;
        }
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pxWidth = canvas.width;
        const pxHeight = canvas.height;
        let pdfImgWidth = contentWidth; // fit to content width
        let pdfImgHeight = (pxHeight * pdfImgWidth) / pxWidth;

        // If this rendered node is extremely tall (taller than a single page), try to scale it down to fit one page
        const usablePageHeight = pageHeight - margin * 2 - headerHeight;
        if (pdfImgHeight > usablePageHeight * 1.05) {
          // Scale down to fit the usable page height
          const scaleDownToFit = usablePageHeight / pdfImgHeight;
          pdfImgWidth = Math.max(40, pdfImgWidth * scaleDownToFit);
          pdfImgHeight = pdfImgHeight * scaleDownToFit;
        }

        // If this node was marked as the personal section, force it to fit into a single PDF page
        const isPersonal = node.dataset && node.dataset.pdfPersonal === 'true';
        const maxSingleHeight = pageHeight - margin * 2 - headerHeight;
        if (isPersonal) {
          if (pdfImgHeight > maxSingleHeight) {
            const scaleDown = maxSingleHeight / pdfImgHeight;
            pdfImgWidth = pdfImgWidth * scaleDown;
            pdfImgHeight = pdfImgHeight * scaleDown;
          }
          // Place personal on its own page (avoid slicing)
          if (cursorY + pdfImgHeight > pageHeight - margin) { 
            if (cursorY > margin + headerHeight) { 
              pdf.addPage(); 
              pageIndex++; 
              addRMUHeader(pdf, pageIndex);
              cursorY = margin + headerHeight; 
            } 
          }
          pdf.addImage(imgData, 'JPEG', margin, cursorY, pdfImgWidth, pdfImgHeight);
          // ensure next content starts on fresh page
          pdf.addPage(); 
          pageIndex++; 
          addRMUHeader(pdf, pageIndex);
          cursorY = margin + headerHeight;
          try { replacedImgs.forEach(r => { r.img.src = r.origSrc; r.img.srcset = r.origSrcset || ''; }); } catch (e) {}
          continue;
        }

        // If the rendered node is taller than a page, slice the canvas vertically into page-sized strips
        const maxContentHeight = pageHeight - margin - margin - headerHeight; // usable height
        const pageScale = pdfImgHeight / pxHeight; // points per pixel vertically
        // Compute available remaining height on current page
        const remainingHeight = pageHeight - margin - cursorY;
        // If this node is an entry-like element (achievement/reflection) we prefer to keep it whole on the next page
        const looksLikeEntry = node.classList && (node.classList.contains('achievement-card') || node.classList.contains('reflection-card') || node.querySelector && node.querySelector('.achievement-title') || node.querySelector && node.querySelector('.reflection-title'));
        if (looksLikeEntry && pdfImgHeight > remainingHeight) {
          // Move the whole entry to the next page if it fits there, otherwise we'll slice only when the entry itself is larger than a page
          if (pdfImgHeight <= usablePageHeight) {
            pdf.addPage(); 
            pageIndex++; 
            addRMUHeader(pdf, pageIndex);
            cursorY = margin + headerHeight;
          }
        }

        if (pdfImgHeight <= pageHeight - margin - cursorY) {
          // fits in remaining space (after possible page move above)
          if (cursorY + pdfImgHeight > pageHeight - margin) { 
            pdf.addPage(); 
            pageIndex++; 
            addRMUHeader(pdf, pageIndex);
            cursorY = margin + headerHeight; 
          }
          pdf.addImage(imgData, 'JPEG', margin, cursorY, pdfImgWidth, pdfImgHeight);

          // add links for anchors
          try {
            const scaleX = pdfImgWidth / (nodeRect.width || 1);
            const scaleY = pdfImgHeight / (nodeRect.height || 1);
            for (const a of anchors) {
              if (!a || !a.href) continue;
              const href = a.href;
              const relLeft = (a.rect.left - nodeRect.left);
              const relTop = (a.rect.top - nodeRect.top);
              const x = margin + relLeft * scaleX;
              const y = cursorY + relTop * scaleY;
              const w = (a.rect.width || 1) * scaleX;
              const h = (a.rect.height || 1) * scaleY;
              try { pdf.link(x, y, w, h, { url: href }); } catch (e) {}
            }
          } catch (e) { console.warn('Failed to add PDF link annotations', e); }

          cursorY += pdfImgHeight + 12;
        } else {
          // Slice vertically: draw successive clipped images
          // Create an offscreen canvas to extract stripes at 1:1 canvas pixel density
          const off = document.createElement('canvas'); off.width = canvas.width; off.height = canvas.height;
          const offCtx = off.getContext('2d');
          // Defensive: ensure canvas has non-zero dimensions before drawing
          if (canvas.width > 0 && canvas.height > 0 && off.width > 0 && off.height > 0) {
            offCtx.drawImage(canvas, 0, 0);
          } else {
            console.warn('Skipping slice draw: zero-dimension canvas', { canvasWidth: canvas.width, canvasHeight: canvas.height });
            try { replacedImgs.forEach(r => { r.img.src = r.origSrc; r.img.srcset = r.origSrcset || ''; }); } catch (e) {}
            continue;
          }

          // compute stripe height in canvas pixels that maps to maxContentHeight in PDF points
          const stripePdfHeight = maxContentHeight; // points
          let stripePxHeight = Math.floor(stripePdfHeight / pageScale);
          // Prevent splitting images: if a stripe boundary would cut through an image, expand the stripe to include the image
          try {
            const imgs = Array.from(node.querySelectorAll('img')).map(img => {
              const r = img.getBoundingClientRect(); return { top: Math.round((r.top - nodeRect.top) * (pxHeight / nodeRect.height)), bottom: Math.round((r.bottom - nodeRect.top) * (pxHeight / nodeRect.height)) };
            }).filter(Boolean);
            if (imgs.length) {
              // for each potential slice starting point, ensure it does not fall inside an image
              const adjustSliceTop = (proposedTopPx) => {
                let top = proposedTopPx;
                for (const im of imgs) {
                  if (top > im.top && top < im.bottom) {
                    // move top down to image bottom
                    top = im.bottom;
                  }
                }
                return top;
              };
              // Recompute stripePxHeight as a conservative minimum (no change here), adjustments happen per-slice below
            }
          } catch (e) { /* ignore image-split adjustments if measurement fails */ }
          let sliceTop = 0;
          // Precompute image positions in canvas pixels to avoid slicing through images
          let imgBounds = [];
          try {
            imgBounds = Array.from(node.querySelectorAll('img')).map(img => {
              const r = img.getBoundingClientRect();
              return { top: Math.round((r.top - nodeRect.top) * (pxHeight / nodeRect.height)), bottom: Math.round((r.bottom - nodeRect.top) * (pxHeight / nodeRect.height)) };
            }).filter(b => typeof b.top === 'number' && typeof b.bottom === 'number');
          } catch (e) { imgBounds = []; }

          while (sliceTop < canvas.height) {
            // If the current sliceTop falls inside any image, move it to that image's bottom
            let adjustedTop = sliceTop;
            for (const ib of imgBounds) {
              if (adjustedTop > ib.top && adjustedTop < ib.bottom) {
                adjustedTop = ib.bottom;
              }
            }
            // Ensure adjustedTop advances to avoid infinite loop
            if (adjustedTop >= canvas.height) break;
            if (adjustedTop !== sliceTop) {
              // started inside an image; move sliceTop forward
              sliceTop = adjustedTop;
            }

            const hPx = Math.min(stripePxHeight, canvas.height - sliceTop);
            if (hPx <= 0) break;
            const slice = document.createElement('canvas'); slice.width = canvas.width; slice.height = hPx;
            const sctx = slice.getContext('2d');
            sctx.drawImage(off, 0, sliceTop, canvas.width, hPx, 0, 0, canvas.width, hPx);
            const sliceData = slice.toDataURL('image/jpeg', 0.95);
            const slicePdfH = (hPx * pdfImgWidth) / pxWidth;

            if (cursorY + slicePdfH > pageHeight - margin) { 
              pdf.addPage(); 
              pageIndex++; 
              addRMUHeader(pdf, pageIndex);
              cursorY = margin + headerHeight; 
            }
            pdf.addImage(sliceData, 'JPEG', margin, cursorY, pdfImgWidth, slicePdfH);

            // Add link annotations that fall within this slice
            try {
              const sliceTopPx = sliceTop;
              const scaleX = pdfImgWidth / (nodeRect.width || 1);
              const scaleY = slicePdfH / (hPx || 1); // mapping for this slice
              for (const a of anchors) {
                if (!a || !a.href) continue;
                const relLeft = (a.rect.left - nodeRect.left);
                const relTop = (a.rect.top - nodeRect.top);
                // check if anchor vertical position falls within this slice
                if (relTop + (a.rect.height || 0) < sliceTopPx || relTop > sliceTopPx + hPx) continue;
                const localTop = relTop - sliceTopPx;
                const x = margin + relLeft * scaleX;
                const y = cursorY + localTop * (slicePdfH / hPx);
                const w = (a.rect.width || 1) * scaleX;
                const h = (a.rect.height || 1) * (slicePdfH / hPx);
                try { pdf.link(x, y, w, h, { url: a.href }); } catch (e) {}
              }
            } catch (e) { console.warn('Failed to add PDF link annotations for slice', e); }

            cursorY += slicePdfH + 6; // small gap between slices
            // advance
            sliceTop += hPx;
            // if there is more content, start a new page
            if (sliceTop < canvas.height) { 
              pdf.addPage(); 
              pageIndex++; 
              addRMUHeader(pdf, pageIndex);
              cursorY = margin + headerHeight; 
            }
          }
        }
        // restore any replaced images after rendering this node
        try { replacedImgs.forEach(r => { r.img.src = r.origSrc; r.img.srcset = r.origSrcset || ''; }); } catch (e) {}
        // If we approach bottom, next loop will addPage as needed
      }

      // Cleanup - remove render container and clean up memory
      try {
        if (renderRoot && renderRoot.parentNode) {
          document.body.removeChild(renderRoot);
        }
        // Clean up any blob URLs that may have been created
        this.cleanupAllAttachmentUrls();
        // Null reference (optional) for GC hint
        renderRoot = null;
      } catch (e) { /* ignore */ }
  // Dynamic PDF filename using same logic as JSON export (title -> sanitized)
  try {
    let personalInfo = {};
    try { personalInfo = JSON.parse(localStorage.getItem('personalInfo') || '{}'); } catch(_){}
    let base = (personalInfo && personalInfo.title) || (document.getElementById('title-display')?.textContent) || 'portfolio-export';
    base = String(base || '')
      .replace(/["'“”‘’]+/g, '')        // remove quotes/apostrophes
      .replace(/[^A-Za-z0-9]+/g, '-')    // non-alphanumerics -> dashes
      .replace(/^-+|-+$/g, '')           // trim leading/trailing dashes
      .toLowerCase();
    // Use standardized filename instead of title-based filename
    console.log('[Portfolio] 📄 Generating PDF filename using standardized format');
    const baseFilename = this.generateStandardFilename('', 'portfolio-export');
    const datePart = new Date().toISOString().split('T')[0];
    const filename = `${baseFilename}-${datePart}.pdf`;
    
    console.log('[Portfolio] 💾 Saving PDF with filename:', filename);
    pdf.save(filename);
    this.showToast(`📄 Exported ${filename}`, 'success');
  } catch (e) { this.showToast('Failed to save PDF', 'error'); }
    } catch (err) {
      console.error('exportToPdf error', err);
      this.hideLoadingBar(false);
      this.showToast('Failed to export PDF', 'error');
    }
    this.hideLoadingBar(true);
  }

  formatDate(dateString) {
    if(!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      // Fallback: attempt to parse YYYY-MM-DD manually or return original
      const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(dateString).trim());
      if (m) {
        return `${m[2]}/${m[3]}/${m[1]}`; // MM/DD/YYYY simple fallback
      }
      return String(dateString); // return raw if unparseable
    }
    try {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch(e) {
      return date.toISOString().slice(0,10);
    }
  }

  showToast(message, type = 'info') {
    // Simple toast implementation
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? 'hsl(142 71% 45%)' : 'hsl(210 85% 45%)'};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      font-weight: 500;
      transition: all 0.3s ease;
      transform: translateX(100%);
    `;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
      toast.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  }

  // Sample Data Loader
  loadSampleData() { /* disabled: sample data removed to enforce external JSON usage */ }
}

// Initialize the application
const app = new PortfolioApp();
// Expose the instance to the global scope so inline handlers and other
// scripts can reliably reference it as `app`. Top-level `const` does not
// always create a `window` property in all environments, so set it here.
window.app = app;

// Check if admin portfolio data was received before app initialization
if (window.__ADMIN_PORTFOLIO_DATA) {
  console.log('[Portfolio] Loading admin portfolio data that was received earlier');
  try {
    const normalized = app.normalizeLoadedData(window.__ADMIN_PORTFOLIO_DATA);
    app.loadDataDirectly(normalized);
    // Clear the stored data
    window.__ADMIN_PORTFOLIO_DATA = null;
    window.__ADMIN_FILENAME = null;
    // Prevent any auto-loader overrides
    try {
      window.__ADOPTED_SPECIFIC_PORTFOLIO = true;
      localStorage.setItem('__lastPortfolioFile', 'admin-remote');
      const pre = document.getElementById('preload-status'); if(pre) pre.remove();
    } catch(_){ }
  } catch(err) {
    console.error('[Portfolio] Failed to load admin portfolio data:', err);
  }
}

// Check if user portfolio data was received before app initialization
if (window.__USER_PORTFOLIO_DATA) {
  console.log('[Portfolio] Loading user portfolio data that was received earlier');
  try {
    app.loadUserPortfolioData(window.__USER_PORTFOLIO_DATA);
    // Clear the stored data
    window.__USER_PORTFOLIO_DATA = null;
  } catch(err) {
    console.error('[Portfolio] Failed to load user portfolio data:', err);
  }
}

// Clean up resources when the page is being unloaded
window.addEventListener('beforeunload', () => {
  try {
    if (app && typeof app.cleanupAllAttachmentUrls === 'function') {
      app.cleanupAllAttachmentUrls();
    }
  } catch (e) {
    console.warn('Error during cleanup:', e);
  }
});

// -----------------------------------------------------------------------------
// GitHub / Repository JSON Auto-Loader
// -----------------------------------------------------------------------------
// Behavior requested by user:
// - When someone opens the site, the script should attempt to load a JSON file
//   that you manually upload to the same repository/directory as `portfolio.html`.
// - You will keep exactly one JSON file in the repo; this loader expects the
//   file to be named `portfolio-data.json` and placed next to the HTML file.
// - The loader will NOT modify, rename, or touch any files on Google Drive.
// -----------------------------------------------------------------------------

// Repository auto-loader removed: application now depends solely on explicit ?file= JSON.

// Drive persistence methods added to app prototype - Updated for appDataFolder security
PortfolioApp.prototype.findDriveFileInAppData = async function(filename) {
  try {
    // Search only in appDataFolder - each user can only access their own appData
    const res = await gapi.client.request({
      path: 'https://www.googleapis.com/drive/v3/files',
      method: 'GET',
      params: { 
        q: `name='${filename.replace(/'/g, "\\'")}' and parents in 'appDataFolder' and trashed=false`, 
        spaces: 'appDataFolder',
        fields: 'files(id,name)'
      }
    });
    return (res.result.files && res.result.files[0]) || null;
  } catch (e) {
    console.error('findDriveFileInAppData error', e);
    throw e;
  }
}

PortfolioApp.prototype.saveToDrive = async function() {
  if (this._busy) return; // prevent re-entry
  this.showLoadingBar();
  try {
    // Guard: ensure gapi and gapi.client exist to avoid ReferenceError when Drive is not initialized
    if (typeof gapi === 'undefined' || !gapi || !gapi.client) {
      this.showToast('Google API not loaded. Initialize Drive integration first.', 'error');
      this.hideLoadingBar(false);
      return;
    }
    if (!gapi.client.getToken || !gapi.client.getToken().access_token) {
      this.showToast('Not authenticated with Drive', 'info');
      this.hideLoadingBar(false);
      return;
    }
    const filename = 'portfolio-data.json';
    const existing = await this.findDriveFileInAppData(filename).catch(()=>null);
    
    // Create metadata for appDataFolder - parents array ensures file is created in appDataFolder
    const metadata = { 
      name: filename, 
      mimeType: 'application/json'
    };
    
    // If creating a new file, specify appDataFolder as parent
    if (!existing || !existing.id) {
      metadata.parents = ['appDataFolder'];
    }
  // Include personalInfo and profilePhoto (if any) from localStorage in the saved JSON
  const personalInfo = JSON.parse(localStorage.getItem('personalInfo') || '{}');
  const profilePhoto = localStorage.getItem('profilePhoto') || null;
  const content = JSON.stringify({ achievements: this.achievements, reflections: this.reflections, personalInfo, profilePhoto }, null, 2);

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      content +
      close_delim;

    let path = 'https://www.googleapis.com/upload/drive/v3/files';
    if (existing && existing.id) {
      path += '/' + existing.id + '?uploadType=multipart';
    } else {
      path += '?uploadType=multipart';
    }

    const resp = await gapi.client.request({
      path,
      method: existing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
      body: multipartRequestBody
    });
    console.log('Drive save response', resp);
    // Use safe instance reference
    const inst = (this && typeof this.loadFromDrive === 'function') ? this : (window.app || this);
    if (inst && typeof inst.showToast === 'function') inst.showToast('Saved portfolio to Google Drive', 'success');
    // After a successful save, reload the file from Drive so the in-memory
    // representation exactly matches what was saved.
    try {
      if (inst && typeof inst.loadFromDrive === 'function') await inst.loadFromDrive();
    } catch (e) {
      console.warn('Saved to Drive but failed to reload immediately', e);
    }
  } catch (e) {
    console.error('saveToDrive error', e);
    this.showToast('Failed to save to Drive', 'error');
    this.hideLoadingBar(false);
    return;
  }
  this.hideLoadingBar(true);
}

PortfolioApp.prototype.loadFromDrive = async function() {
  if (this._busy) return; // prevent re-entry
  this.showLoadingBar();
  try {
    // Guard: ensure gapi is available before attempting to use it
    if (typeof gapi === 'undefined' || !gapi || !gapi.client) {
      this.showToast('Google API not loaded', 'error');
      this.hideLoadingBar(false);
      return;
    }
    
    console.log('[Drive] Searching for portfolio in appDataFolder...');
    const filename = 'portfolio-data.json';
    const file = await this.findDriveFileInAppData(filename);
    
    if (!file) {
      console.log('[Drive] No portfolio data found in user\'s appDataFolder.');
      this.showToast('No existing portfolio found, creating new...', 'info');
      await this.createDefaultPortfolioInAppData();
      return;
    }
    
    console.log(`[Drive] Loading portfolio from: ${file.name}`);
    this.showToast(`Loading portfolio: ${file.name}`, 'info');
    
    const res = await gapi.client.request({ 
      path: `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, 
      method: 'GET' 
    });
    
    const data = res.result;
    if (data) {
      this.processLoadedPortfolioData(data);
      
      // If loaded file has different name than expected, save a copy as portfolio-data.json
      if (file.name !== 'portfolio-data.json') {
        console.log(`[Drive] Loaded ${file.name}, saving as portfolio-data.json for consistency`);
        setTimeout(() => {
          this.saveToDrive(); // This will save as portfolio-data.json
        }, 1000);
      }
      
      this.showToast('Portfolio loaded successfully', 'success');
    } else {
      this.showToast('Failed to load portfolio data', 'error');
    }
  } catch (e) {
    console.error('loadFromDrive error', e);
    this.showToast('Failed to load from Drive: ' + (e.message || 'Unknown error'), 'error');
    this.hideLoadingBar(false);
    return;
  }
  this.hideLoadingBar(true);
}

// Export current in-memory + local personal info/profile photo JSON as a downloadable file
PortfolioApp.prototype.exportPortfolioJson = function(customName) {
  try {
    const personalInfo = JSON.parse(localStorage.getItem('personalInfo') || '{}');
    const profilePhoto = localStorage.getItem('profilePhoto') || null;
    const data = { achievements: this.achievements || [], reflections: this.reflections || [], personalInfo, profilePhoto };

    console.log('[Portfolio] 📝 Generating JSON filename using standardized format');
    
    let filename;
    if (customName && String(customName).trim()) {
      // If explicit custom name provided, use it (for legacy compatibility)
      console.log('[Portfolio] Using custom name:', customName);
      let baseName = String(customName).trim()
                    .replace(/["“”'‘’]+/g, '')
                    .replace(/[^A-Za-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '')
                    .toLowerCase();
      if (!baseName) baseName = 'portfolio-data';
      if (baseName.length > 80) baseName = baseName.slice(0, 80);
      filename = baseName + '.json';
    } else {
      // Use standardized filename based on student name and roll number
      console.log('[Portfolio] Generating standardized JSON filename');
      filename = this.generateStandardFilename('json', 'portfolio-data');
    }

    // Ensure filename safety and extension
    try {
      const dotIdx = filename.lastIndexOf('.');
      const nameOnly = (dotIdx > 0 ? filename.slice(0, dotIdx) : filename)
        .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
        .replace(/["“”'‘’]+/g, '')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, 80) || 'portfolio-data';
      filename = nameOnly + '.json';
    } catch(_) {}


    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    this.showToast(`Downloaded ${filename}`, 'success');

    // NOTE: The repository auto-loader currently only fetches 'portfolio-data.json'.
    // If you intend to place this exported file in the repo for auto-loading, rename it
    // back to 'portfolio-data.json' (or adjust loadFromRepoIfPresent to use your pattern).
  } catch (e) {
    console.error('exportPortfolioJson error', e);
    this.showToast('Failed to export JSON', 'error');
  }
};

// Handle user-selected JSON file import (manual legacy migration or external backup)
PortfolioApp.prototype.handleImportJsonFile = function(file) {
  if (!file) return;
  if (this._busy) return; // prevent re-entry
  if (!/\.json$/i.test(file.name)) {
    this.showToast('Please select a .json file', 'error');
    return;
  }
  
  console.log(`[Import] Starting import of: ${file.name}`);
  this.showLoadingBar();
  this.showToast(`Importing ${file.name}...`, 'info');
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const text = e.target.result;
      const data = JSON.parse(text);
      if (typeof data !== 'object') throw new Error('Invalid JSON structure');
      
      console.log('[Import] JSON parsed successfully, loading into portfolio...');
      this.processLoadedPortfolioData(data);
      
      // Always save imported data as portfolio-data.json in appDataFolder
      console.log('[Import] Saving to Drive as portfolio-data.json...');
      await this.saveToDrive();
      
      this.showToast(`Successfully imported ${file.name} and saved to Drive`, 'success');
      
      console.log(`[Import] Import completed for: ${file.name}`);
      this.hideLoadingBar(true);
    } catch (err) {
      console.error('[Import] Import failed:', err);
      this.showToast('Failed to import JSON: ' + (err && err.message ? err.message : 'Unknown error'), 'error');
      this.hideLoadingBar(false);
    }
  };
  reader.onerror = () => {
    console.error('[Import] File read error');
    this.showToast('Failed to read selected file', 'error');
    this.hideLoadingBar(false);
  };
  reader.readAsText(file);
};

// Self-test: verify save -> load roundtrip & report timings
PortfolioApp.prototype.runDriveSelfTest = async function() {
  if (typeof gapi === 'undefined' || !gapi || !gapi.client || !gapi.client.getToken || !gapi.client.getToken().access_token) {
    this.showToast('Sign in first to run Drive test', 'info');
    return;
  }
  try {
    if (this._busy) return; // prevent re-entry
    this.showLoadingBar();
    const start = performance.now();
    await this.saveToDrive();
    const mid = performance.now();
    await this.loadFromDrive();
    const end = performance.now();
    const saveMs = Math.round(mid - start);
    const loadMs = Math.round(end - mid);
    this.showToast(`Drive self-test passed (save ${saveMs}ms, load ${loadMs}ms)`, 'success');
    this.hideLoadingBar(true);
  } catch (e) {
    console.error('Drive self-test failed', e);
    this.showToast('Drive self-test failed: ' + (e && e.message ? e.message : 'Unknown error'), 'error');
    this.hideLoadingBar(false);
  }
};

// Helper function to process loaded portfolio data
PortfolioApp.prototype.processLoadedPortfolioData = function(data) {
  try {
    const inst = (this && typeof this.renderAchievements === 'function') ? this : (window.app || this);
    inst.achievements = data.achievements || [];
    inst.reflections = data.reflections || [];
    
    // Restore personal info and profile photo to localStorage and UI
    if (data.personalInfo && !this.safeSetLocalStorage('personalInfo', data.personalInfo)) {
      console.warn('Failed to restore personal info from Drive due to storage limits');
    }
    if (data.profilePhoto && !this.safeSetLocalStorage('profilePhoto', data.profilePhoto)) {
      console.warn('Failed to restore profile photo from Drive due to storage limits');
    }
    
    if (typeof inst.loadPersonalInfo === 'function') inst.loadPersonalInfo();
    if (typeof inst.renderAchievements === 'function') inst.renderAchievements();
    if (typeof inst.renderReflections === 'function') inst.renderReflections();
    if (typeof inst.updateLinkedAchievements === 'function') inst.updateLinkedAchievements();
    if (typeof inst.showToast === 'function') inst.showToast('Loaded portfolio from Google Drive', 'success');
  } catch (e) {
    console.error('Error processing loaded portfolio data:', e);
    this.showToast('Error processing portfolio data', 'error');
  }
}

// Create default portfolio file in appDataFolder for new users
PortfolioApp.prototype.createDefaultPortfolioInAppData = async function() {
  try {
    console.log('[Drive] Creating new portfolio in appDataFolder...');
    this.showToast('Creating new portfolio...', 'info');
    
    const filename = 'portfolio-data.json';
    
    // Get current localStorage data to preserve any existing work
    const personalInfo = JSON.parse(localStorage.getItem('personalInfo') || '{}');
    const profilePhoto = localStorage.getItem('profilePhoto') || null;
    
    // Create default data structure with any existing achievements/reflections
    const defaultData = {
      achievements: this.achievements || [],
      reflections: this.reflections || [],
      personalInfo: personalInfo,
      profilePhoto: profilePhoto
    };
    
    const content = JSON.stringify(defaultData, null, 2);
    
    const metadata = { 
      name: filename, 
      mimeType: 'application/json',
      parents: ['appDataFolder'] // Ensure file is created in appDataFolder
    };

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      content +
      close_delim;

    const res = await gapi.client.request({
      path: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
      body: multipartRequestBody
    });
    
    if (res.result && res.result.id) {
      console.log('[Drive] Default portfolio created with ID:', res.result.id);
      
      // Load the data into the current session
      this.processLoadedPortfolioData(defaultData);
      
      this.showToast('New portfolio created successfully', 'success');
      
      // Force UI update to show the loaded data
      setTimeout(() => {
        this.hideLoadingBar(true);
      }, 500);
    } else {
      throw new Error('Failed to create file in Drive');
    }
  } catch (e) {
    console.error('[Drive] createDefaultPortfolioInAppData error:', e);
    this.showToast('Failed to create portfolio: ' + (e.message || 'Unknown error'), 'error');
    this.hideLoadingBar(false);
    throw e;
  }
}

// PPT upload functionality removed for privacy compliance (Google API approval)
// Files are now downloaded directly instead of uploaded to Drive with broader permissions

// Anonymous upload and Office helper functions removed for privacy compliance
// These functions used external services and complex iframe integrations

// -----------------------------------------------------------------------------
// Drive Auto-Loader (monitor) - Updated for appDataFolder
// -----------------------------------------------------------------------------
// When a Drive access token becomes available (user signs in via GIS),
// automatically load `portfolio-data.json` from the user's private appDataFolder
// and apply it to the current session. Each user can only access their own 
// appDataFolder, ensuring complete data isolation between users.
// -----------------------------------------------------------------------------

;(function setupDriveAutoLoad() {
  // Helper: check token presence
  function hasDriveToken() {
    try {
      return !!(gapi && gapi.client && gapi.client.getToken && gapi.client.getToken().access_token);
    } catch (e) { return false; }
  }

  // Poll for token for a short period after page load/sign-in events.
  // If detected, call app.loadFromDrive() to load from user's private appDataFolder.
  let polled = false;
  function pollTokenAndLoad() {
    if (polled) return;
    polled = true;
    const start = Date.now();
    const maxMs = 10_000; // poll up to 10s
    const interval = 500;
    const timer = setInterval(async () => {
      if (hasDriveToken()) {
        clearInterval(timer);
        try {
          console.log('Drive token detected — auto-loading user portfolio from secure appDataFolder.');
          await window.app.loadFromDrive();
        } catch (e) {
          console.warn('Drive auto-load failed', e);
        }
      } else if (Date.now() - start > maxMs) {
        clearInterval(timer);
      }
    }, interval);
  }

  // If GIS token client or gapi initialization code triggers a global event
  // you can hook here. For now, attempt an initial poll (covers page loads
  // where user already signed in) and also listen for focus events which often
  // follow the OAuth popup flow.
  try { pollTokenAndLoad(); } catch (e) { /* ignore */ }
  window.addEventListener('focus', () => {
    // When window regains focus after an OAuth popup, re-check token quickly
    try { pollTokenAndLoad(); } catch (e) { /* ignore */ }
  });
})();

// Initialize Google API client for Drive usage (non-invasive). This will load gapi
// if it exists on the page and initialize the client with the Drive scopes so
// uploads can use gapi.client.getToken() and related helpers. If your page already
// sets up Google Sign-In, this will be a no-op.
PortfolioApp.prototype.initGoogleDriveClient = function() {
  // Required scope for Drive appDataFolder access - each user can only access their own appData
  const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
  // Use global keys if provided by the page (optional)
  const CLIENT_ID = window.GOOGLE_CLIENT_ID || null;
  const API_KEY = window.GOOGLE_API_KEY || null;

  // If gapi is not available, don't attempt to load it automatically here (page likely already loads it)
  if (typeof gapi === 'undefined' || !gapi) {
    console.debug('gapi not present; skipping Drive client init');
    return;
  }

  // If already initialized, skip
  try { if (gapi.client && gapi.client.init && gapi.client._initialized) return; } catch (e) {}

  // Try to init client; note: this won't sign the user in automatically.
  try {
    gapi.load('client:auth2', async () => {
      try {
        const initObj = { discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'] };
        if (API_KEY) initObj.apiKey = API_KEY;
        if (CLIENT_ID) initObj.clientId = CLIENT_ID;
        await gapi.client.init(initObj);
        // Also initialize auth2 if available and we have a client id
        if (CLIENT_ID && gapi.auth2 && !gapi.auth2.getAuthInstance()) {
          try { await gapi.auth2.init({ client_id: CLIENT_ID, scope: SCOPES }); } catch (e) { /* ignore */ }
        }
        // mark initialized so we don't re-init
        gapi.client._initialized = true;
        console.debug('gapi.client initialized for Drive (no sign-in performed)');
      } catch (err) {
        console.warn('gapi.client.init failed', err);
      }
    });
  } catch (e) {
    console.warn('gapi.load failed', e);
  }
};