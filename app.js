/* =============================================================
 * Mugznlugz — Portal
 * app.js
 * -------------------------------------------------------------
 * Responsibilities:
 *   1. Panel / navigation switching
 *   2. Website iframe + fallback
 *   3. 3D coverflow gallery (keyboard, drag, click, arrows)
 *   4. Google Drive integration (Identity Services + gapi)
 * -------------------------------------------------------------
 * Most editable values live in CONFIG below.
 * ============================================================= */

'use strict';

/* ---------- CONFIG ----------
 * All user-editable values live in config.js. We merge with
 * safe defaults so the app still boots even if config.js is
 * missing or a field is left blank. */
const DEFAULTS = {
  CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
  API_KEY:   'YOUR_GOOGLE_API_KEY',
  FOLDER_ID: 'YOUR_DRIVE_FOLDER_ID',
  SCOPES:    'https://www.googleapis.com/auth/drive.readonly',
  SITE_URL:  'https://www.mugznlugz.com',
  FORCE_EMBED_FALLBACK: false,
  EMBED_TIMEOUT_MS: 3500,
  EMBED_PREVIEW_URL: 'https://s.wordpress.com/mshots/v1/{url}?w=1280&h=800',
  DEMO_IMAGES: [],
};
const CONFIG = Object.assign({}, DEFAULTS, window.MZL_CONFIG || {});

/* Google API endpoints */
const GAPI_SRC = 'https://apis.google.com/js/api.js';
const GIS_SRC  = 'https://accounts.google.com/gsi/client';
const DISCOVERY = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';


/* =============================================================
 * DOM REFERENCES
 * ============================================================= */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const els = {
  app:            $('#app'),
  sidebar:        $('.sidebar'),
  menuToggle:     $('#menuToggle'),
  nav:            $('#nav'),
  navBtns:        $$('.nav-btn[data-panel]'),
  connectBtn:     $('#connectDriveBtn'),
  topbarTitle:    $('#topbarTitle'),
  logoLink:       $('#logoLink'),

  panels:         $$('.panel'),

  websiteFrame:   $('#websiteFrame'),
  websiteFallback:$('#websiteFallback'),
  openSiteBtn:    $('#openSiteBtn'),
  fallbackPreview:$('#fallbackPreview'),
  fallbackText:   $('#fallbackText'),
  copyLinkBtn:    $('#copyLinkBtn'),
  retryEmbedBtn:  $('#retryEmbedBtn'),

  galleryStatus:  $('#galleryStatus'),
  prevBtn:        $('#prevBtn'),
  nextBtn:        $('#nextBtn'),
  flowArrowL:     $('#flowArrowLeft'),
  flowArrowR:     $('#flowArrowRight'),
  stage:          $('#coverflowStage'),
  coverflow:      $('#coverflow'),

  driveLed:       $('#driveLed'),
  driveStatusText:$('#driveStatusText'),
};


/* =============================================================
 * NAVIGATION / PANEL SWITCHING
 * ============================================================= */
function showPanel(name) {
  // panels
  els.panels.forEach(p => {
    p.classList.toggle('active', p.id === `panel-${name}`);
  });
  // nav buttons
  els.navBtns.forEach(b => {
    b.classList.toggle('active', b.dataset.panel === name);
  });
  // topbar label
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  els.topbarTitle.textContent = label;

  // close mobile nav
  els.sidebar.classList.remove('open');

  // layout recalculation for gallery so images sit correctly
  if (name === 'gallery') {
    // wait a frame so the panel is visible
    requestAnimationFrame(() => coverflow.render());
  }
}

/* Delegated click handler for any element with data-panel */
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-panel]');
  if (!trigger) return;
  e.preventDefault();
  showPanel(trigger.dataset.panel);
});

/* Logo always goes home */
els.logoLink.addEventListener('click', (e) => {
  e.preventDefault();
  showPanel('home');
});

/* Mobile menu toggle */
els.menuToggle.addEventListener('click', () => {
  els.sidebar.classList.toggle('open');
});

/* Close sidebar when clicking outside (mobile) */
document.addEventListener('click', (e) => {
  if (window.innerWidth > 860) return;
  if (!els.sidebar.classList.contains('open')) return;
  if (e.target.closest('.sidebar') || e.target.closest('#menuToggle')) return;
  els.sidebar.classList.remove('open');
});


/* =============================================================
 * WEBSITE PANEL (iframe + fallback)
 * -------------------------------------------------------------
 * Many sites (Shopify, Squarespace, Wix, banks) send
 *   X-Frame-Options: DENY / SAMEORIGIN
 * or a strict Content-Security-Policy `frame-ancestors` rule.
 * Browsers block the load silently — no error event fires.
 *
 * Strategy:
 *   1. If CONFIG.FORCE_EMBED_FALLBACK, skip the iframe.
 *   2. Otherwise load it and race a timeout.
 *   3. If `load` never fires inside the timeout, OR the iframe
 *      ends up blank/about:blank, show the fallback.
 *   4. Fallback has: screenshot preview, Open in new tab,
 *      Copy link, and a manual Retry button.
 * ============================================================= */
const websitePanel = (() => {
  let timer = null;
  let handled = false;

  /* Minimum "real load" time in ms. X-Frame-Options / CSP blocks cause
     Chrome's internal error page to render almost instantly (typically
     under 100ms). Real page loads are at least a few hundred ms. */
  const BLOCK_THRESHOLD_MS = 350;

  function buildPreviewUrl() {
    if (!CONFIG.EMBED_PREVIEW_URL) return '';
    return CONFIG.EMBED_PREVIEW_URL.replace('{url}', encodeURIComponent(CONFIG.SITE_URL));
  }

  function setFallbackText(msg) {
    if (els.fallbackText) els.fallbackText.textContent = msg;
  }

  function mountPreview() {
    const previewUrl = buildPreviewUrl();
    if (!previewUrl || !els.fallbackPreview) return;
    if (els.fallbackPreview.dataset.mounted === '1') return;
    els.fallbackPreview.dataset.mounted = '1';
    els.fallbackPreview.src = previewUrl;
    els.fallbackPreview.hidden = false;
    els.fallbackPreview.onerror = () => { els.fallbackPreview.hidden = true; };
  }

  function showFallback(msg) {
    els.websiteFallback.hidden = false;
    els.websiteFrame.classList.remove('is-ready');
    if (msg) setFallbackText(msg);
    mountPreview();
  }

  function showIframe() {
    els.websiteFrame.classList.add('is-ready');
    els.websiteFallback.hidden = true;
  }

  function tryEmbed() {
    handled = false;
    clearTimeout(timer);

    /* Always show the fallback first. If the iframe turns out to load a
       real cross-origin page, we reveal it on top. If it doesn't, the
       user never sees Chrome's white "refused to connect" page. */
    showFallback('Checking embed compatibility…');
    els.websiteFrame.classList.remove('is-ready');

    if (CONFIG.FORCE_EMBED_FALLBACK) {
      setFallbackText('Embedding is disabled for this site. Open it in a new tab below.');
      return;
    }

    const t0 = performance.now();

    const onLoad = () => {
      if (handled) return;
      handled = true;
      clearTimeout(timer);
      const elapsed = performance.now() - t0;

      /* Heuristic #1: suspiciously fast load = browser block */
      if (elapsed < BLOCK_THRESHOLD_MS) {
        setFallbackText('This site blocks embedded previews. Open it in a new tab below.');
        return;
      }

      /* Heuristic #2: try to peek at contentDocument. For a real
         cross-origin site this will throw SecurityError (good — means
         the site actually loaded). For a browser-rendered error page
         on same-origin, doc will be accessible and either empty or
         about:blank. */
      try {
        const win = els.websiteFrame.contentWindow;
        const doc = els.websiteFrame.contentDocument;
        if (doc) {
          const href = (win && win.location && win.location.href) || '';
          if (!href || href === 'about:blank') {
            setFallbackText('This site blocks embedded previews. Open it in a new tab below.');
            return;
          }
          const bodyText = (doc.body && doc.body.textContent || '').trim();
          if (!bodyText && (!doc.body || doc.body.children.length === 0)) {
            setFallbackText('This site blocks embedded previews. Open it in a new tab below.');
            return;
          }
        }
      } catch (_) {
        /* SecurityError — cross-origin site loaded successfully. */
      }

      /* Passed all checks — reveal the real embed. */
      showIframe();
    };

    els.websiteFrame.addEventListener('load', onLoad, { once: true });

    /* Hard timeout — site is slow or blocked silently */
    timer = setTimeout(() => {
      if (handled) return;
      handled = true;
      setFallbackText('The site took too long to load. Open it in a new tab below.');
    }, CONFIG.EMBED_TIMEOUT_MS);

    /* Kick off the load. Force a reset to about:blank first so the load
       event fires reliably on repeated retries. */
    try { els.websiteFrame.src = 'about:blank'; } catch (_) {}
    requestAnimationFrame(() => {
      els.websiteFrame.src = CONFIG.SITE_URL;
    });
  }

  function init() {
    if (els.openSiteBtn) els.openSiteBtn.href = CONFIG.SITE_URL;

    els.retryEmbedBtn?.addEventListener('click', tryEmbed);
    els.copyLinkBtn?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(CONFIG.SITE_URL);
        const prev = els.copyLinkBtn.textContent;
        els.copyLinkBtn.textContent = 'Copied';
        setTimeout(() => { els.copyLinkBtn.textContent = prev; }, 1400);
      } catch {
        /* Clipboard API may be blocked; fail silently. */
      }
    });

    tryEmbed();
  }

  return { init, tryEmbed };
})();
websitePanel.init();


/* =============================================================
 * 3D COVERFLOW GALLERY
 * ============================================================= */
const coverflow = (() => {
  let images = [];        // array of { src, alt }
  let index  = 0;         // current centered index
  let items  = [];        // DOM nodes
  let dragging = false;
  let dragStartX = 0;
  let dragStartIndex = 0;

  /* Transform tuning */
  const TX = 180;   // horizontal spacing per step (px)
  const TZ = 220;   // depth per step (px)
  const RY = 28;    // rotation per step (deg)
  const SCALE_STEP  = 0.12;
  const MIN_SCALE   = 0.5;
  const OPACITY_STEP = 0.2;
  const MIN_OPACITY  = 0;
  const MAX_VISIBLE  = 5; // items per side that remain visible

  function setImages(list) {
    images = Array.isArray(list) ? list.filter(Boolean) : [];
    index = 0;
    build();
    render();
  }

  function build() {
    els.coverflow.innerHTML = '';
    items = [];
    images.forEach((img, i) => {
      const node = document.createElement('div');
      node.className = 'cf-item';
      node.setAttribute('role', 'option');
      node.dataset.index = String(i);

      const im = document.createElement('img');
      im.src = img.src;
      im.alt = img.alt || `Image ${i + 1}`;
      im.loading = 'lazy';
      im.referrerPolicy = 'no-referrer';

      // fallback if a Drive thumbnail fails to load
      im.addEventListener('error', () => {
        im.src = makeDriveThumbFallback(img);
      }, { once: true });

      node.appendChild(im);
      node.addEventListener('click', () => {
        if (i === index) return;
        goTo(i);
      });

      els.coverflow.appendChild(node);
      items.push(node);
    });
  }

  /* If thumbnailLink fails we have a backup URL stored on the item */
  function makeDriveThumbFallback(img) {
    if (img.driveId) {
      return `https://drive.google.com/thumbnail?id=${img.driveId}&sz=w1600`;
    }
    return img.src;
  }

  /* Render — compute each item's 3D transform relative to center */
  function render() {
    const n = images.length;
    if (!n) return;

    items.forEach((node, i) => {
      // shortest signed distance (so it loops visually)
      let offset = i - index;
      if (offset >  n / 2) offset -= n;
      if (offset < -n / 2) offset += n;

      const abs = Math.abs(offset);
      const tx = offset * TX;
      const tz = -abs * TZ;
      const ry = -offset * RY;
      const scale   = Math.max(MIN_SCALE, 1 - abs * SCALE_STEP);
      const opacity = abs > MAX_VISIBLE ? 0 : Math.max(MIN_OPACITY, 1 - abs * OPACITY_STEP);
      const blur    = abs > 1 ? Math.min((abs - 1) * 1.4, 6) : 0;

      node.style.transform = `
        translate3d(${tx}px, 0, ${tz}px)
        rotateY(${ry}deg)
        scale(${scale})
      `;
      node.style.opacity   = String(opacity);
      node.style.filter    = blur ? `blur(${blur}px)` : 'none';
      node.style.zIndex    = String(1000 - abs);
      node.style.pointerEvents = abs > MAX_VISIBLE ? 'none' : 'auto';
      node.classList.toggle('center', offset === 0);
    });
  }

  function next() { goTo(index + 1); }
  function prev() { goTo(index - 1); }

  function goTo(i) {
    const n = images.length;
    if (!n) return;
    // infinite loop
    index = ((i % n) + n) % n;
    render();
  }

  /* ---- Drag / swipe support ---- */
  function onPointerDown(e) {
    if (!images.length) return;
    dragging = true;
    dragStartX = (e.touches ? e.touches[0].clientX : e.clientX);
    dragStartIndex = index;
    els.stage.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    const delta = x - dragStartX;
    const step = Math.round(-delta / 90); // 90px per item
    if (step !== 0) {
      goTo(dragStartIndex + step);
      dragStartX = x;
      dragStartIndex = index;
    }
  }
  function onPointerUp() {
    dragging = false;
  }

  els.stage.addEventListener('pointerdown', onPointerDown);
  els.stage.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup',   onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  /* ---- Control bindings ---- */
  els.prevBtn.addEventListener('click', prev);
  els.nextBtn.addEventListener('click', next);
  els.flowArrowL.addEventListener('click', prev);
  els.flowArrowR.addEventListener('click', next);

  /* ---- Keyboard ---- */
  window.addEventListener('keydown', (e) => {
    // only when gallery panel is active
    if (!$('#panel-gallery').classList.contains('active')) return;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
  });

  /* ---- Re-render on resize for responsiveness ---- */
  window.addEventListener('resize', () => render());

  return { setImages, render, next, prev, goTo };
})();


/* =============================================================
 * GALLERY STATUS HELPERS
 * ============================================================= */
function setGalleryStatus(msg, isError = false) {
  els.galleryStatus.textContent = msg;
  els.galleryStatus.classList.toggle('error', !!isError);
}

function setDriveIndicator(state /* 'on' | 'off' | 'error' */, text) {
  els.driveLed.classList.remove('on', 'error');
  if (state === 'on')    els.driveLed.classList.add('on');
  if (state === 'error') els.driveLed.classList.add('error');
  if (text) els.driveStatusText.textContent = text;
}


/* =============================================================
 * INITIAL GALLERY STATE
 * -------------------------------------------------------------
 * If DEMO_IMAGES is populated, we show them immediately so the
 * coverflow never looks empty. Connecting Drive replaces them.
 * ============================================================= */
(function seedDemo() {
  if (CONFIG.DEMO_IMAGES?.length) {
    coverflow.setImages(CONFIG.DEMO_IMAGES.map((src, i) => ({
      src, alt: `Preview ${i + 1}`
    })));
    setGalleryStatus('Showing demo images. Connect Drive to load yours.');
  } else {
    setGalleryStatus('Connect Drive to load images.');
  }
})();


/* =============================================================
 * GOOGLE DRIVE INTEGRATION
 * -------------------------------------------------------------
 * Scripts are loaded lazily on first Connect Drive click so the
 * site stays fast for users who never sign in.
 * ============================================================= */
const drive = (() => {
  let gapiReady = false;
  let gisReady  = false;
  let tokenClient = null;
  let accessToken = null;
  let loading = false;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.defer = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  async function ensureLibs() {
    if (gapiReady && gisReady) return;

    setGalleryStatus('Loading Google libraries…');

    await Promise.all([
      loadScript(GAPI_SRC),
      loadScript(GIS_SRC),
    ]);

    // init gapi.client
    await new Promise((res, rej) => {
      gapi.load('client', { callback: res, onerror: () => rej(new Error('gapi load failed')) });
    });
    await gapi.client.init({
      apiKey: CONFIG.API_KEY,
      discoveryDocs: [DISCOVERY],
    });
    gapiReady = true;

    // init GIS token client
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope: CONFIG.SCOPES,
      callback: () => {}, // set per-request below
    });
    gisReady = true;
  }

  async function connect() {
    if (loading) return;
    loading = true;

    // guard against missing config
    if (!CONFIG.CLIENT_ID || CONFIG.CLIENT_ID.startsWith('YOUR_') ||
        !CONFIG.API_KEY  || CONFIG.API_KEY.startsWith('YOUR_')  ||
        !CONFIG.FOLDER_ID || CONFIG.FOLDER_ID.startsWith('YOUR_')) {
      setGalleryStatus('Drive is not configured. Edit CONFIG in app.js.', true);
      setDriveIndicator('error', 'Drive: not configured');
      loading = false;
      return;
    }

    try {
      await ensureLibs();
    } catch (err) {
      console.error(err);
      setGalleryStatus('Couldn’t load Google libraries. Check your connection.', true);
      setDriveIndicator('error', 'Drive: network error');
      loading = false;
      return;
    }

    // request an access token
    tokenClient.callback = async (resp) => {
      if (resp.error) {
        console.error(resp);
        setGalleryStatus('Google sign-in failed. Please try again.', true);
        setDriveIndicator('error', 'Drive: sign-in failed');
        loading = false;
        return;
      }
      accessToken = resp.access_token;
      setDriveIndicator('on', 'Drive: connected');
      await loadImages();
      loading = false;
    };

    // prompt user
    try {
      if (accessToken) {
        tokenClient.requestAccessToken({ prompt: '' });
      } else {
        tokenClient.requestAccessToken({ prompt: 'consent' });
      }
      setGalleryStatus('Waiting for Google sign-in…');
    } catch (err) {
      console.error(err);
      setGalleryStatus('Unable to start sign-in.', true);
      setDriveIndicator('error', 'Drive: sign-in error');
      loading = false;
    }
  }

  async function loadImages() {
    setGalleryStatus('Loading images…');
    try {
      const res = await gapi.client.drive.files.list({
        q: `'${CONFIG.FOLDER_ID}' in parents and mimeType contains 'image/' and trashed = false`,
        fields: 'files(id, name, mimeType, thumbnailLink, webContentLink)',
        pageSize: 200,
        orderBy: 'name',
      });

      const files = res?.result?.files || [];
      if (!files.length) {
        setGalleryStatus('No images found in this Drive folder.');
        coverflow.setImages([]);
        return;
      }

      const images = files.map(f => {
        // thumbnailLink default is ~220px; upgrade it.
        const thumb = f.thumbnailLink
          ? f.thumbnailLink.replace(/=s\d+(-[a-z])?$/i, '=s1600')
          : `https://drive.google.com/thumbnail?id=${f.id}&sz=w1600`;
        return { src: thumb, alt: f.name, driveId: f.id };
      });

      coverflow.setImages(images);
      setGalleryStatus(`Loaded ${images.length} image${images.length === 1 ? '' : 's'} from Drive.`);
    } catch (err) {
      console.error(err);
      setGalleryStatus('Failed to load images from Drive.', true);
      setDriveIndicator('error', 'Drive: load failed');
    }
  }

  return { connect };
})();

els.connectBtn.addEventListener('click', () => {
  // Keep user oriented: jump to the gallery when they connect.
  showPanel('gallery');
  drive.connect();
});


/* =============================================================
 * STARTUP
 * ============================================================= */
// Default to Home
showPanel('home');
