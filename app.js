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
  SITE_URL:  'https://www.mugznlugz.com',
  FORCE_EMBED_FALLBACK: false,
  EMBED_TIMEOUT_MS: 3500,
  EMBED_PREVIEW_URL: 'https://s.wordpress.com/mshots/v1/{url}?w=1280&h=800',
  LOCAL_IMAGES: [],
  DEMO_IMAGES: [],
};
const CONFIG = Object.assign({}, DEFAULTS, window.MZL_CONFIG || {});


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
};

/* Create lightbox if it doesn't exist */
function initLightboxElements() {
  if (!$('#lightbox')) {
    const lightboxHTML = `
      <div id="lightbox" class="lightbox" hidden style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.95); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div class="lightbox-content" style="position: relative; width: 90%; height: 90%; display: flex; align-items: center; justify-content: center;">
          <img id="lightboxImg" src="" alt="Full-size image" style="max-width: 100%; max-height: 100%; object-fit: contain;">
          <div class="lightbox-controls" style="position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 15px; align-items: center;">
            <button id="lightboxPrev" class="lightbox-btn prev" title="Previous" style="background: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.5); color: white; padding: 10px 15px; font-size: 20px; cursor: pointer; border-radius: 4px; transition: background 0.2s;">❮</button>
            <div id="lightboxCounter" style="color: white; font-size: 14px; min-width: 60px; text-align: center;">1 / 1</div>
            <button id="lightboxNext" class="lightbox-btn next" title="Next" style="background: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.5); color: white; padding: 10px 15px; font-size: 20px; cursor: pointer; border-radius: 4px; transition: background 0.2s;">❯</button>
            <button id="lightboxClose" class="lightbox-btn close" title="Close" style="background: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.5); color: white; padding: 10px 15px; font-size: 20px; cursor: pointer; border-radius: 4px; transition: background 0.2s;">✕</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', lightboxHTML);
  }
  
  return {
    lightbox:        $('#lightbox'),
    lightboxImg:     $('#lightboxImg'),
    lightboxClose:   $('#lightboxClose'),
    lightboxPrev:    $('#lightboxPrev'),
    lightboxNext:    $('#lightboxNext'),
    lightboxCounter: $('#lightboxCounter'),
  };
}

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
  // topbar label - removed
  // const label = name.charAt(0).toUpperCase() + name.slice(1);
  // els.topbarTitle.textContent = label;

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
  let images = [];
  let index  = 0;
  let items  = [];
  let dragging = false;
  let dragStartX = 0;
  let dragStartIndex = 0;

  const TX = 240;
  const TZ = 220;
  const RY = 28;
  const SCALE_STEP  = 0.12;
  const MIN_SCALE   = 0.5;
  const OPACITY_STEP = 0.2;
  const MIN_OPACITY  = 0;
  const MAX_VISIBLE  = 5;
  const RENDER_BUFFER = 10;

  function setImages(list) {
    images = Array.isArray(list) ? list.filter(Boolean) : [];
    index = 0;
    build();
    render();
  }

  function build() {
    if (!els.coverflow) {
      console.error('[MZL] coverflow element not found in DOM');
      return;
    }
    
    els.coverflow.innerHTML = '';
    items = [];

    images.forEach((img, i) => {
      const node = document.createElement('div');
      node.className = 'cf-item';
      node.setAttribute('role', 'option');
      node.dataset.index = String(i);
      node.dataset.loaded = 'false';

      node.addEventListener('click', () => {
        if (i === index) {
          lightbox.open(i);
        } else {
          goTo(i);
        }
      });

      els.coverflow.appendChild(node);
      items.push(node);
    });
    
    console.log('[MZL] Built', items.length, 'carousel items');
  }

  function loadImage(itemIndex) {
    const node = items[itemIndex];
    if (!node || node.dataset.loaded === 'true') return;

    const img = images[itemIndex];
    const im = document.createElement('img');
    im.src = img.src;
    im.alt = img.alt || `Image ${itemIndex + 1}`;
    im.referrerPolicy = 'no-referrer';
    im.style.width = '100%';
    im.style.height = '100%';
    im.style.objectFit = 'cover';

    im.addEventListener('error', () => {
      console.warn(`Failed to load image: ${img.src}`);
      im.style.display = 'none';
    }, { once: true });

    node.appendChild(im);
    node.dataset.loaded = 'true';
  }

  function render() {
    const n = images.length;
    if (!n || !els.coverflow) return;

    for (let d = -RENDER_BUFFER; d <= RENDER_BUFFER; d++) {
      const i   = ((index + d) % n + n) % n;
      const abs = Math.abs(d);

      loadImage(i);

      const node    = items[i];
      const tx      = d * TX;
      const tz      = -abs * TZ;
      const ry      = -d * RY;
      const scale   = abs === 0 ? 1.25 : Math.max(MIN_SCALE, 1 - abs * SCALE_STEP);
      const opacity = abs >= MAX_VISIBLE ? 0 : Math.max(MIN_OPACITY, 1 - abs * OPACITY_STEP);

      node.style.transform    = `translate3d(${tx}px, 0, ${tz}px) rotateY(${ry}deg) scale(${scale})`;
      node.style.opacity      = String(opacity);
      node.style.zIndex       = String(1000 - abs);
      node.style.pointerEvents = abs >= MAX_VISIBLE ? 'none' : 'auto';
      node.classList.toggle('center', d === 0);
    }
  }

  function next() { goTo(index + 1); }
  function prev() { goTo(index - 1); }

  function goTo(i) {
    const n = images.length;
    if (!n) return;
    index = ((i % n) + n) % n;
    render();
  }

  function onPointerDown(e) {
    if (!images.length) return;
    dragging = true;
    dragStartX = (e.touches ? e.touches[0].clientX : e.clientX);
    dragStartIndex = index;
    els.stage?.setPointerCapture?.(e.pointerId);
  }
  
  function onPointerMove(e) {
    if (!dragging) return;
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    const delta = x - dragStartX;
    const step = Math.round(-delta / 90);
    if (step !== 0) {
      goTo(dragStartIndex + step);
      dragStartX = x;
      dragStartIndex = index;
    }
  }
  
  function onPointerUp() {
    dragging = false;
  }

  if (els.stage) {
    els.stage.addEventListener('pointerdown', onPointerDown);
    els.stage.addEventListener('pointermove', onPointerMove);
  }
  window.addEventListener('pointerup',   onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  if (els.prevBtn) els.prevBtn.addEventListener('click', prev);
  if (els.nextBtn) els.nextBtn.addEventListener('click', next);
  if (els.flowArrowL) els.flowArrowL.addEventListener('click', prev);
  if (els.flowArrowR) els.flowArrowR.addEventListener('click', next);

  window.addEventListener('keydown', (e) => {
    if (!$('#panel-gallery')?.classList.contains('active')) return;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
  });

  window.addEventListener('resize', () => render());

  return { setImages, render, next, prev, goTo };
})();


/* =============================================================
 * LIGHTBOX (Full-screen image viewer)
 * ============================================================= */
const lightbox = (() => {
  let images = [];
  let currentIndex = 0;
  let lbEls = {};

  function setImages(imageList) {
    images = imageList;
  }

  function open(index) {
    if (!images.length) return;
    currentIndex = index;
    updateImage();
    lbEls.lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function close() {
    lbEls.lightbox.hidden = true;
    document.body.style.overflow = '';
  }

  function next() {
    if (!images.length) return;
    currentIndex = (currentIndex + 1) % images.length;
    updateImage();
  }

  function prev() {
    if (!images.length) return;
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    updateImage();
  }

  function updateImage() {
    const img = images[currentIndex];
    lbEls.lightboxImg.src = img.src;
    lbEls.lightboxImg.alt = img.alt || `Image ${currentIndex + 1}`;
    lbEls.lightboxCounter.textContent = `${currentIndex + 1} / ${images.length}`;
  }

  function init() {
    lbEls = initLightboxElements();
    
    if (!lbEls.lightbox) return;

    lbEls.lightboxClose.addEventListener('click', close);
    lbEls.lightboxPrev.addEventListener('click', prev);
    lbEls.lightboxNext.addEventListener('click', next);

    lbEls.lightbox.addEventListener('click', (e) => {
      if (e.target === lbEls.lightbox) close();
    });

    window.addEventListener('keydown', (e) => {
      if (lbEls.lightbox.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    });
  }

  return { setImages, open, close, init };
})();


/* =============================================================
 * GALLERY STATUS HELPERS
 * ============================================================= */
function setGalleryStatus(msg, isError = false) {
  els.galleryStatus.textContent = msg;
  els.galleryStatus.classList.toggle('error', !!isError);
}


/* =============================================================
 * INITIAL GALLERY STATE
 * -------------------------------------------------------------
 * Load images from local folder at startup.
 * ============================================================= */
(function loadLocalImages() {
  if (CONFIG.LOCAL_IMAGES?.length) {
    const imageList = CONFIG.LOCAL_IMAGES.map((src, i) => {
      const filename = src.split('/').pop().replace(/\.(jpg|jpeg|png|gif|webp|svg)$/i, '');
      return { src, alt: filename };
    });
    coverflow.setImages(imageList);
    lightbox.setImages(imageList);
    setGalleryStatus(`Showing ${CONFIG.LOCAL_IMAGES.length} images.`);
  } else if (CONFIG.DEMO_IMAGES?.length) {
    const demoList = CONFIG.DEMO_IMAGES.map((src, i) => ({
      src, alt: `Preview ${i + 1}`
    }));
    coverflow.setImages(demoList);
    lightbox.setImages(demoList);
    setGalleryStatus('Showing demo images.');
  } else {
    setGalleryStatus('No images available. Add images to the images/ folder and rebuild.');
  }
})();


/* =============================================================
 * CONTACT FORM HANDLER
 * ============================================================= */
const contactForm = (() => {
  function init() {
    const form = document.getElementById('contactForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const firstName = document.getElementById('firstName').value.trim();
      const lastName = document.getElementById('lastName').value.trim();
      const email = document.getElementById('email').value.trim();
      const phone = document.getElementById('phone').value.trim();
      const message = document.getElementById('message').value.trim();
      
      if (!firstName || !lastName || !email || !message) {
        alert('Please fill in all required fields.');
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      // Simulate sending (for local testing)
      console.log('Contact form submission:', {
        firstName,
        lastName,
        email,
        phone,
        message,
        to: 'chansen@tryc2.com'
      });

      // Simulate async delay
      setTimeout(() => {
        alert('Thank you! Your message has been sent.');
        form.reset();
        showPanel('home');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }, 1000);
    });
  }

  return { init };
})();


/* =============================================================
 * STARTUP
 * ============================================================= */
lightbox.init();
contactForm.init();

// Remove the home button as it's redundant with the logo
const homeBtn = els.navBtns.find(btn => btn.dataset.panel === 'home');
if (homeBtn) homeBtn.remove();

// Default to Home
showPanel('home');
