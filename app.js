'use strict';

/* =============================================================
 * DOM REFERENCES
 * ============================================================= */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const els = {
  sidebar:    $('.sidebar'),
  menuToggle: $('#menuToggle'),
  navBtns:    $$('.nav-btn[data-panel]'),
  panels:     $$('.panel'),
};


/* =============================================================
 * NAVIGATION / PANEL SWITCHING
 * ============================================================= */
function showPanel(name) {
  els.panels.forEach(p => {
    p.classList.toggle('active', p.id === `panel-${name}`);
  });
  els.navBtns.forEach(b => {
    b.classList.toggle('active', b.dataset.panel === name);
  });
  els.sidebar.classList.remove('open');
}

document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-panel]');
  if (!trigger) return;
  e.preventDefault();
  showPanel(trigger.dataset.panel);
});

els.menuToggle.addEventListener('click', () => {
  els.sidebar.classList.toggle('open');
});

document.addEventListener('click', (e) => {
  if (window.innerWidth > 860) return;
  if (!els.sidebar.classList.contains('open')) return;
  if (e.target.closest('.sidebar') || e.target.closest('#menuToggle')) return;
  els.sidebar.classList.remove('open');
});


/* =============================================================
 * STARTUP
 * ============================================================= */
const homeBtn = els.navBtns.find(btn => btn.dataset.panel === 'home');
if (homeBtn) homeBtn.remove();

showPanel('home');
