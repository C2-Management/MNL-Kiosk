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
 * CONTACT FORM HANDLER
 * ============================================================= */
const contactForm = (() => {
  function init() {
    const form = document.getElementById('contactForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const firstName = document.getElementById('firstName').value.trim();
      const lastName  = document.getElementById('lastName').value.trim();
      const email     = document.getElementById('email').value.trim();
      const phone     = document.getElementById('phone').value.trim();
      const message   = document.getElementById('message').value.trim();

      if (!firstName || !lastName || !email || !message) {
        alert('Please fill in all required fields.');
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      console.log('Contact form submission:', { firstName, lastName, email, phone, message });

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
 * SUGGESTIONS FORM HANDLER
 * ============================================================= */
const suggestionsForm = (() => {
  function init() {
    const form = document.getElementById('suggestionsForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const name       = document.getElementById('suggestName').value.trim();
      const email      = document.getElementById('suggestEmail').value.trim();
      const suggestion = document.getElementById('suggestion').value.trim();

      if (!suggestion) {
        document.getElementById('suggestion').focus();
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';

      console.log('Suggestion submitted:', { name, email, suggestion });

      setTimeout(() => {
        form.innerHTML = `
          <div class="form-success">
            <strong>Thanks for your suggestion!</strong>
            We appreciate your feedback and will take it into consideration.
          </div>`;
      }, 800);
    });
  }

  return { init };
})();


/* =============================================================
 * STARTUP
 * ============================================================= */
contactForm.init();
suggestionsForm.init();

const homeBtn = els.navBtns.find(btn => btn.dataset.panel === 'home');
if (homeBtn) homeBtn.remove();

showPanel('home');
