/**
 * Legal terms page loader — renders published BO terms via GET /api/v1/terms/{type}.
 * Requires: shared/api-client.js, body[data-term-type], #termsLoading/#termsDynamic/#termsBody/#termsFallback/#termsUpdated
 */
(function () {
  'use strict';

  var TERM_TYPE = (document.body && document.body.getAttribute('data-term-type')) || 'service';

  function apiLang() {
    var l = 'ko';
    try {
      var stored = (localStorage.getItem('tpkm_lang') || 'KO').toLowerCase();
      if (stored === 'my' || stored === 'en') l = stored;
    } catch (e) { /* private mode */ }
    return l;
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    try {
      return d.toLocaleDateString('ko-KR', {
        timeZone: 'Asia/Yangon', year: 'numeric', month: 'long', day: 'numeric'
      });
    } catch (e) {
      return d.toISOString().slice(0, 10);
    }
  }

  function renderBody(container, body) {
    if (!container) return;
    var text = body == null ? '' : String(body);
    var looksHtml = /<\/?[a-z][\s\S]*>/i.test(text);
    if (looksHtml && window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
      container.className = 'legal-body';
      container.innerHTML = window.DOMPurify.sanitize(text);
    } else {
      container.className = 'legal-body plain';
      container.textContent = text;
    }
  }

  var loadingEl = document.getElementById('termsLoading');
  var dynamicEl = document.getElementById('termsDynamic');
  var bodyEl = document.getElementById('termsBody');
  var fallbackEl = document.getElementById('termsFallback');
  var updatedEl = document.getElementById('termsUpdated');
  var fallbackUpdatedText = updatedEl ? updatedEl.textContent : '';

  function showFallback() {
    if (loadingEl) loadingEl.hidden = true;
    if (dynamicEl) dynamicEl.hidden = true;
    if (fallbackEl) fallbackEl.hidden = false;
    if (updatedEl) updatedEl.textContent = fallbackUpdatedText;
  }

  function loadTerms() {
    if (loadingEl) loadingEl.hidden = false;
    if (fallbackEl) fallbackEl.hidden = true;
    if (dynamicEl) dynamicEl.hidden = true;

    if (!window.TopikApi || typeof TopikApi.getTerm !== 'function' || !TopikApi.canUseApi()) {
      showFallback();
      return;
    }

    TopikApi.getTerm(TERM_TYPE, apiLang()).then(function (res) {
      if (!res.ok || !res.body || typeof res.body.body !== 'string' || !String(res.body.body).trim()) {
        showFallback();
        return;
      }
      var data = res.body;
      renderBody(bodyEl, data.body);
      if (updatedEl) {
        var parts = [];
        if (data.version) parts.push('버전 ' + data.version);
        var eff = fmtDate(data.effective_at);
        if (eff) parts.push('시행일: ' + eff);
        updatedEl.textContent = parts.join(' · ') || fallbackUpdatedText;
      }
      if (loadingEl) loadingEl.hidden = true;
      if (fallbackEl) fallbackEl.hidden = true;
      if (dynamicEl) dynamicEl.hidden = false;
    }).catch(function () {
      showFallback();
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('.lang-toggle button') : null;
    if (btn && btn.dataset && btn.dataset.lang) {
      setTimeout(loadTerms, 0);
    }
  });

  loadTerms();
})();
