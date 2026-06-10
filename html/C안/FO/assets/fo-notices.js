/* FO 공지사항 — API 목록·상세 */
(function () {
  'use strict';

  var CAT_BADGE = {
    important: 'badge-important',
    registration: 'badge-info',
    exam: 'badge-outline',
    result: 'badge-outline',
  };

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function nt(key, fallback) {
    try {
      if (window.TPKMLang && typeof TPKMLang.t === 'function') {
        var v = TPKMLang.t(key);
        if (v) return v;
      }
    } catch (e) { /* ignore */ }
    return fallback;
  }

  function sessionKey() {
    try {
      var k = sessionStorage.getItem('tpkm_notice_sess');
      if (k) return k;
      k = 's' + Date.now() + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem('tpkm_notice_sess', k);
      return k;
    } catch (e) {
      return 'anon';
    }
  }

  function badgeClass(cat) {
    return CAT_BADGE[cat] || 'badge-outline';
  }

  function renderHomeList(container, items) {
    if (!container) return;
    if (!items.length) {
      container.innerHTML =
        '<p style="padding:20px;text-align:center;color:var(--text-3);font-size:14px;">' +
        esc(nt('nt.empty_home', '등록된 공지가 없습니다.')) + '</p>';
      return;
    }
    container.innerHTML = items
      .map(function (n) {
        var pin = n.is_pinned ? ' <span class="badge badge-new" style="margin-left:6px;">NEW</span>' : '';
        return (
          '<a href="notice.html?id=' +
          encodeURIComponent(n.id) +
          '" class="notice-row">' +
          '<span class="badge ' +
          badgeClass(n.category) +
          '">' +
          esc(n.category_label) +
          '</span>' +
          '<span class="ttl">' +
          esc(n.title) +
          pin +
          '</span>' +
          '<span class="date">' +
          esc(n.date_formatted) +
          '</span>' +
          '</a>'
        );
      })
      .join('');
  }

  function renderTableRows(tbody, items) {
    if (!tbody) return;
    if (!items.length) {
      tbody.innerHTML =
        '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-3);">' +
        esc(nt('nt.none', '공지가 없습니다.')) + '</td></tr>';
      return;
    }
    tbody.innerHTML = items
      .map(function (n, idx) {
        var num = n.is_pinned ? '—' : String(items.length - idx);
        var imp = n.category === 'important' ? ' imp' : '';
        var pin = n.is_pinned ? ' <span class="badge badge-new" style="margin-left:6px;">NEW</span>' : '';
        return (
          '<tr data-id="' +
          n.id +
          '" style="cursor:pointer">' +
          '<td class="col-num">' +
          esc(num) +
          '</td>' +
          '<td class="col-cat"><span class="badge ' +
          badgeClass(n.category) +
          '">' +
          esc(n.category_label) +
          '</span></td>' +
          '<td class="col-title' +
          imp +
          '">' +
          esc(n.title) +
          pin +
          '</td>' +
          '<td class="col-date">' +
          esc(n.date_formatted) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
    tbody.querySelectorAll('tr[data-id]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        var id = tr.getAttribute('data-id');
        if (window.TPKMNotices && TPKMNotices.openDetail) TPKMNotices.openDetail(id);
      });
    });
  }

  function currentLang() {
    try {
      if (window.TPKMLang && TPKMLang.getLang) return TPKMLang.getLang();
      if (window.TPKMLang && TPKMLang.lang) return TPKMLang.lang;
    } catch (e) { /* ignore */ }
    return 'ko';
  }

  function loadList(opts) {
    opts = opts || {};
    if (!window.TopikApi || !TopikApi.canUseApi()) {
      if (opts.onFallback) opts.onFallback();
      return Promise.resolve(null);
    }
    return TopikApi.getNotices({
      category: opts.category,
      q: opts.q,
      lang: opts.lang || currentLang(),
      page: opts.page,
      home_preview: opts.homePreview ? '1' : undefined,
    }).then(function (res) {
      if (!res.ok) {
        if (opts.onError) opts.onError(TopikApi.parseError(res));
        if (opts.onFallback) opts.onFallback();
        return null;
      }
      if (opts.onData) opts.onData(res.body.items || []);
      return res.body;
    });
  }

  function openDetailPage(id) {
    var listView = document.getElementById('listView');
    var detailView = document.getElementById('detailView');
    if (!listView || !detailView) return;

    listView.classList.add('hidden');
    detailView.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    var titleEl = document.getElementById('noticeDetailTitle');
    var metaEl = document.getElementById('noticeDetailMeta');
    var bodyEl = document.getElementById('noticeDetailBody');

    if (titleEl) titleEl.textContent = nt('nt.loading', '불러오는 중…');
    if (bodyEl) bodyEl.innerHTML = '<p style="color:var(--text-3);">' + esc(nt('nt.detail_loading', '로딩 중입니다.')) + '</p>';

    var lang = currentLang();
    TopikApi.getNotice(id, sessionKey(), lang).then(function (res) {
      if (!res.ok) {
        if (titleEl) titleEl.textContent = nt('nt.load_fail', '공지를 불러올 수 없습니다');
        if (bodyEl) bodyEl.innerHTML = '<p>' + esc(TopikApi.parseError(res)) + '</p>';
        return;
      }
      var n = res.body;
      if (titleEl) titleEl.textContent = n.title;
      if (metaEl) {
        metaEl.innerHTML =
          '<span class="badge ' +
          badgeClass(n.category) +
          '">' +
          esc(n.category_label) +
          '</span>' +
          '<span>' +
          esc(n.date_formatted) +
          '</span>';
      }
      if (bodyEl) bodyEl.innerHTML = n.body_html || '';
    });
  }

  window.TPKMNotices = {
    loadList: loadList,
    renderHomeList: renderHomeList,
    renderTableRows: renderTableRows,
    openDetail: openDetailPage,
    sessionKey: sessionKey,
  };
})();
