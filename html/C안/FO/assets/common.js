/* ============================================================
   TOPIK Myanmar — Common GNB/Footer/Drawer/Lang/Tabbar
   ============================================================ */
(function () {
  'use strict';

  // ---- 메뉴 구조 ----
  const MENU = [
    {
      key: 'guide', label: 'TOPIK 안내', children: [
        { href: 'guide-overview.html',   label: '시험 개요' },
        { href: 'guide-intro.html',      label: '시험 소개' },
        { href: 'guide-questions.html',  label: '문항 구성' },
        { href: 'guide-evaluation.html', label: '평가 기준' }
      ]
    },
    {
      key: 'rules', label: 'TOPIK 규정', children: [
        { href: 'rules-notice.html', label: '유의 사항' },
        { href: 'rules-answer.html', label: '답안 작성 요령' },
        { href: 'rules-fee.html',    label: '응시료 규정' },
        { href: 'rules-id.html',     label: '신분증 규정' }
      ]
    },
    {
      key: 'apply', label: 'TOPIK 접수', children: [
        { href: 'apply-howto.html', label: '접수 방법' },
        { href: 'register.html',    label: '시험 접수',  requireLogin: true },
        { href: 'mypage.html',      label: '접수 확인',  requireLogin: true },
        { href: 'ticket.html',      label: '수험표 출력' }
      ]
    },
    {
      key: 'board', label: '게시판', children: [
        { href: 'notice.html',            label: '공지사항' },
        { href: 'refund-correction.html', label: '환불·정보정정신청', requireLogin: true },
        { href: 'qna.html',               label: '문의게시판',         requireLogin: true },
        { href: 'faq.html',               label: 'FAQ' }
      ]
    }
  ];

  // 로그인 필요 메뉴 (시험 접수/접수 확인/환불·정보정정신청/문의게시판)
  // 수험표 출력(ticket.html)은 가드 제외 — 0527 정책
  const PROTECTED = new Set();
  MENU.forEach(m => m.children.forEach(c => { if (c.requireLogin) PROTECTED.add(c.href); }));

  const TAB = [
    { href: 'index.html',   key: 'home',  label: '홈',
      svg: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>' },
    { href: 'register.html', key: 'apply', label: '접수',
      svg: '<svg viewBox="0 0 24 24"><path d="M9 4h6a2 2 0 0 1 2 2v14l-5-3-5 3V6a2 2 0 0 1 2-2z"/></svg>' },
    { href: 'notice.html',  key: 'board', label: '게시판',
      svg: '<svg viewBox="0 0 24 24"><path d="M5 5h14v14H5z"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>' },
    { href: 'mypage.html',  key: 'me',    label: '마이',
      svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>' }
  ];

  // ---- 상태 헬퍼 (API sessionStorage + legacy tpkm_user localStorage) ----
  const TOKEN_ACCESS = 'topik_access_token';
  const TOKEN_USER = 'topik_user';

  function mapApiStoredUser(raw) {
    if (!raw) return null;
    return {
      name: raw.name_ko || raw.name || (raw.email || '').split('@')[0] || 'User',
      email: raw.email,
      id: raw.id,
      role: raw.role
    };
  }

  function readApiSessionUser() {
    try {
      if (!sessionStorage.getItem(TOKEN_ACCESS) && !localStorage.getItem(TOKEN_ACCESS)) return null;
      const raw = sessionStorage.getItem(TOKEN_USER) || localStorage.getItem(TOKEN_USER);
      return mapApiStoredUser(raw ? JSON.parse(raw) : null);
    } catch (e) { return null; }
  }

  function clearApiSession() {
    [sessionStorage, localStorage].forEach(store => {
      try {
        store.removeItem(TOKEN_ACCESS);
        store.removeItem('topik_refresh_token');
        store.removeItem(TOKEN_USER);
      } catch (e) { /* ignore */ }
    });
    if (window.TopikApi && typeof TopikApi.logout === 'function') TopikApi.logout();
  }

  const Auth = {
    get user() {
      const apiUser = readApiSessionUser();
      if (apiUser) return apiUser;
      try { return JSON.parse(localStorage.getItem('tpkm_user') || 'null'); } catch (e) { return null; }
    },
    hasSession() {
      try {
        if (sessionStorage.getItem(TOKEN_ACCESS) || localStorage.getItem(TOKEN_ACCESS)) return true;
      } catch (e) { /* ignore */ }
      if (window.TopikApi && TopikApi.hasSession && TopikApi.hasSession()) return true;
      return false;
    },
    isSignupPending() {
      if (window.TopikApi && TopikApi.isProfileIncomplete && TopikApi.isProfileIncomplete()) return true;
      return this.hasSession() && !this.isLoggedIn();
    },
    isLoggedIn() {
      if (window.TopikApi && TopikApi.isLoggedIn) return TopikApi.isLoggedIn();
      return !!this.user;
    },
    login(u) { localStorage.setItem('tpkm_user', JSON.stringify(u)); },
    logout() {
      clearApiSession();
      localStorage.removeItem('tpkm_user');
      try {
        if (window.google && window.google.accounts && window.google.accounts.id &&
            window.google.accounts.id.disableAutoSelect) {
          window.google.accounts.id.disableAutoSelect();
        }
      } catch (e) { /* ignore */ }
    }
  };
  window.TPKMAuth = Auth;

  const MENU_I18N = { guide: 'menu.guide', rules: 'menu.rules', apply: 'menu.apply', board: 'menu.board' };
  const SUB_I18N = {
    'guide-overview.html': 'guide.overview', 'guide-intro.html': 'guide.intro',
    'guide-questions.html': 'guide.questions', 'guide-evaluation.html': 'guide.evaluation',
    'rules-notice.html': 'rules.notice', 'rules-answer.html': 'rules.answer',
    'rules-fee.html': 'rules.fee', 'rules-id.html': 'rules.id',
    'apply-howto.html': 'sub.apply_howto', 'register.html': 'sub.apply_reg',
    'mypage.html': 'sub.apply_confirm', 'ticket.html': 'sub.apply_ticket',
    'notice.html': 'sub.board_notice', 'refund-correction.html': 'sub.board_refund',
    'qna.html': 'sub.board_qna', 'faq.html': 'sub.board_faq'
  };

  function applyLangUI(lang) {
    const l = lang || Lang.get();
    document.documentElement.setAttribute('data-lang', l);
    document.querySelectorAll('.lang-toggle button').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === l);
    });
  }

  const Lang = {
    get() { return localStorage.getItem('tpkm_lang') || 'KO'; },
    set(l) {
      localStorage.setItem('tpkm_lang', l);
      applyLangUI(l);
      if (window.TOPIKPageI18n) TOPIKPageI18n.apply(l);
    },
    t(key) {
      if (window.TOPIKPageI18n) return TOPIKPageI18n.text(key, Lang.get()) || null;
      return null;
    }
  };
  window.TPKMLang = Lang;

  // ---- Active page detection ----
  function currentFile() {
    const p = location.pathname.split('/').pop() || 'index.html';
    return p || 'index.html';
  }
  function activeMenuKey() {
    const f = currentFile();
    for (const m of MENU) {
      if (m.children.some(c => c.href === f)) return m.key;
    }
    if (['login.html','signup.html','mypage-profile.html'].includes(f)) return 'account';
    return 'home';
  }
  function activeTabKey() {
    const f = currentFile();
    if (f === 'index.html') return 'home';
    if (['register.html','apply-howto.html','ticket.html'].includes(f)) return 'apply';
    if (['notice.html','qna.html','faq.html','refund-correction.html'].includes(f)) return 'board';
    if (['mypage.html','mypage-profile.html','login.html','signup.html'].includes(f)) return 'me';
    if (['guide-overview.html','guide-intro.html','guide-questions.html','guide-evaluation.html'].includes(f)) return 'home';
    return '';
  }

  // ---- Render GNB ----
  function buildHeader() {
    const wrap = document.querySelector('#site-header');
    if (!wrap) return;
    const ak = activeMenuKey();
    const user = Auth.isLoggedIn() ? Auth.user : null;

    const menuHTML = MENU.map(m => `
      <li class="${m.key === ak ? 'active' : ''}">
        <a href="${m.children[0].href}" data-key="${m.key}">${Lang.t(MENU_I18N[m.key]) || m.label}</a>
        <ul class="dropdown">
          ${m.children.map(c => `<li><a href="${c.href}">${Lang.t(SUB_I18N[c.href]) || c.label}</a></li>`).join('')}
        </ul>
      </li>
    `).join('');

    const authHTML = user
      ? `<a href="mypage.html" class="user-chip">
          <span class="avatar">${(user.name || 'U').slice(0,1)}</span>
          <span>${user.name || 'My'}</span>
        </a>
        <button class="btn btn-secondary btn-sm" id="btnLogout">${Lang.t('menu.logout') || '로그아웃'}</button>`
      : `<a href="login.html" class="btn btn-secondary btn-sm">${Lang.t('menu.login') || '로그인'}</a>
         <a href="signup.html" class="btn btn-primary btn-sm">${Lang.t('menu.signup') || '회원가입'}</a>`;

    wrap.innerHTML = `
      <header class="gnb" role="banner">
        <div class="container gnb-inner">
          <a href="index.html" class="gnb-logo" aria-label="TOPIK Myanmar 홈">
            <span class="mark">T</span>
            <span class="name">
              TOPIK Myanmar
              <small>${Lang.t('brand.sub') || '주미얀마 대한민국 대사관'}</small>
            </span>
          </a>

          <ul class="gnb-menu" role="navigation" aria-label="주 메뉴">
            ${menuHTML}
          </ul>

          <div class="gnb-right">
            <div class="lang-toggle" role="tablist" aria-label="언어 선택">
              <button data-lang="KO" role="tab">KO</button>
              <button data-lang="MY" role="tab">MY</button>
              <button data-lang="EN" role="tab">EN</button>
            </div>
            <div class="gnb-auth">${authHTML}</div>
            <button class="hamburger" id="btnDrawer" aria-label="메뉴 열기" aria-expanded="false">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
            </button>
          </div>
        </div>
      </header>

      <div class="drawer-backdrop" id="drawerBackdrop" aria-hidden="true"></div>
      <aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="모바일 메뉴">
        <div class="drawer-head">
          <a href="index.html" class="gnb-logo">
            <span class="mark">T</span>
            <span class="name">TOPIK Myanmar</span>
          </a>
          <button class="drawer-close" id="drawerClose" aria-label="메뉴 닫기">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <div class="drawer-body">
          <div class="drawer-auth">
            ${user
              ? `<a href="mypage.html" class="btn btn-secondary">${Lang.t('menu.mypage') || '마이페이지'}</a>
                 <button class="btn btn-ghost" id="btnLogoutMobile">${Lang.t('menu.logout') || '로그아웃'}</button>`
              : `<a href="login.html" class="btn btn-secondary">${Lang.t('menu.login') || '로그인'}</a>
                 <a href="signup.html" class="btn btn-primary">${Lang.t('menu.signup') || '회원가입'}</a>`
            }
          </div>
          <nav class="drawer-menu" aria-label="모바일 주 메뉴">
            ${MENU.map(m => `
              <details ${m.key === ak ? 'open' : ''}>
                <summary>
                  ${Lang.t(MENU_I18N[m.key]) || m.label}
                  <svg class="chev" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
                </summary>
                <div class="submenu">
                  ${m.children.map(c => `
                    <a href="${c.href}" ${c.href === currentFile() ? 'class="active"' : ''}>
                      ${Lang.t(SUB_I18N[c.href]) || c.label}
                    </a>
                  `).join('')}
                </div>
              </details>
            `).join('')}
          </nav>
        </div>
        <div class="drawer-foot">
          <div class="lang-toggle" style="width:100%; justify-content:center;">
            <button data-lang="KO">KO</button>
            <button data-lang="MY">MY</button>
            <button data-lang="EN">EN</button>
          </div>
        </div>
      </aside>
    `;

    // Drawer wiring
    const drawer = document.getElementById('drawer');
    const backdrop = document.getElementById('drawerBackdrop');
    const btn = document.getElementById('btnDrawer');
    const btnClose = document.getElementById('drawerClose');
    function open() {
      drawer.classList.add('open'); backdrop.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }
    function close() {
      drawer.classList.remove('open'); backdrop.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
    btn.addEventListener('click', open);
    btnClose.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    // Language wiring
    document.querySelectorAll('.lang-toggle button').forEach(b => {
      b.addEventListener('click', () => Lang.set(b.dataset.lang));
    });
    applyLangUI(Lang.get());

    // Logout
    const onLogout = () => {
      if (confirm(Lang.t('msg.logout_confirm') || '로그아웃 하시겠습니까?')) {
        Auth.logout();
        location.href = 'index.html';
      }
    };
    document.getElementById('btnLogout')?.addEventListener('click', onLogout);
    document.getElementById('btnLogoutMobile')?.addEventListener('click', onLogout);

    // ---- Login guard on GNB/drawer protected menus ----
    if (!Auth.isLoggedIn()) {
      wrap.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (PROTECTED.has(href)) {
          a.addEventListener('click', (e) => {
            e.preventDefault();
            redirectToLogin(href);
          });
        }
      });
    }
  }

  // ---- Tabbar ----
  function buildTabbar() {
    const wrap = document.querySelector('#site-tabbar');
    if (!wrap) return;
    const ak = activeTabKey();
    wrap.innerHTML = `
      <nav class="tabbar" aria-label="하단 탭바">
        ${TAB.map(t => `
          <a href="${t.href}" class="${t.key === ak ? 'active' : ''}">
            ${t.svg.replace('<svg', '<svg fill="none" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"')}
            <span>${Lang.t('tab.' + (t.key === 'me' ? 'my' : t.key)) || t.label}</span>
          </a>
        `).join('')}
      </nav>
    `;
  }

  // ---- Favicon (avoid /favicon.ico 404 in smoke tests) ----
  function ensureFavicon() {
    if (document.querySelector('link[rel="icon"]')) return;
    var svg = document.createElement('link');
    svg.rel = 'icon';
    svg.type = 'image/svg+xml';
    svg.href = 'assets/favicon.svg';
    document.head.appendChild(svg);
    var ico = document.createElement('link');
    ico.rel = 'icon';
    ico.href = 'favicon.ico';
    ico.sizes = '32x32';
    document.head.appendChild(ico);
  }

  // ---- Footer (TPKM_FO_0_2_0_0_0_C) ----
  function buildFooter() {
    const wrap = document.querySelector('#site-footer');
    if (!wrap) return;
    const compact = document.body.hasAttribute('data-footer-compact');
    wrap.innerHTML = compact ? `
      <footer class="footer footer-compact" role="contentinfo">
        <div class="container">
          <p class="meta" data-i18n-content="foot.org_line">
            운영기관 <strong>주미얀마 대한민국 대사관</strong>
          </p>
          <div class="ft-policy">
            <a href="privacy.html" data-i18n-content="foot.privacy">개인정보처리방침</a>
            <a href="terms.html" data-i18n-content="foot.terms">이용약관</a>
          </div>
          <p class="copy" data-i18n-content="foot.copy">© 2025–2026 Embassy of the Republic of Korea in Myanmar. All rights reserved.</p>
        </div>
      </footer>
    ` : `
      <footer class="footer" role="contentinfo">
        <div class="container">
          <div class="ft-top">
            <div class="ft-brand-col">
              <div class="brand">
                TOPIK Myanmar
                <small data-i18n-content="foot.org_sub">Embassy of the Republic of Korea in Myanmar</small>
              </div>
              <p class="meta" data-i18n-content="foot.desc" data-i18n-content-html>
                한국어능력시험(TOPIK) 미얀마 시행 공식 안내·접수 사이트입니다.<br>
                운영기관 <strong>주미얀마 대한민국 대사관</strong>
              </p>
              <div class="ft-policy">
                <a href="privacy.html" data-i18n-content="foot.privacy">개인정보처리방침</a>
                <a href="terms.html" data-i18n-content="foot.terms">이용약관</a>
              </div>
            </div>
            <div>
              <div class="ft-col-ttl" data-i18n-content="foot.menu">바로가기</div>
              <div class="links ft-links-col">
                <a href="guide-overview.html" data-i18n-content="menu.guide">TOPIK 안내</a>
                <a href="rules-notice.html" data-i18n-content="menu.rules">TOPIK 규정</a>
                <a href="apply-howto.html" data-i18n-content="menu.apply">TOPIK 접수</a>
                <a href="notice.html" data-i18n-content="notice.title">공지사항</a>
                <a href="faq.html" data-i18n-content="faq.title">FAQ</a>
              </div>
            </div>
            <div>
              <div class="ft-col-ttl" data-i18n-content="foot.ext">외부 링크</div>
              <div class="links ft-links-col">
                <a href="https://www.topik.go.kr" target="_blank" rel="noopener noreferrer">TOPIK 본부 (topik.go.kr)</a>
                <a href="https://www.niied.go.kr" target="_blank" rel="noopener noreferrer">NIIED (niied.go.kr)</a>
                <a href="https://overseas.mofa.go.kr/mm-ko/index.do" target="_blank" rel="noopener noreferrer" data-i18n-content="foot.mofa">재외공관 안내</a>
              </div>
              <p class="meta ft-contact" data-i18n-content="foot.contact" data-i18n-content-html>
                <strong>문의</strong><br>
                support@topik-myanmar.com<br>
                업무시간 월–금 09:00–17:00 (UTC+6:30)
              </p>
            </div>
          </div>
          <p class="copy" data-i18n-content="foot.copy">© 2025–2026 Embassy of the Republic of Korea in Myanmar. All rights reserved.</p>
        </div>
      </footer>
    `;
    if (window.TOPIKPageI18n) TOPIKPageI18n.apply(Lang.get());
  }

  // ---- Login guard ----
  // 가입 미완료(구글 중도 이탈) 세션은 로그인 전과 동일 — 로그인 페이지로 유도.
  function redirectToLogin(nextHref) {
    if (Auth.isSignupPending()) Auth.logout();
    const next = encodeURIComponent(
      nextHref || (location.pathname.split('/').pop() + location.search)
    );
    location.href = 'login.html?next=' + next;
  }

  // Add `data-require-login` on a <body> element OR pass through this helper.
  function checkLoginGuard() {
    const body = document.body;
    if (!body.hasAttribute('data-require-login')) return;
    if (Auth.isLoggedIn()) return;
    const next = location.pathname.split('/').pop() + location.search;
    if (Auth.isSignupPending()) Auth.logout();
    location.replace('login.html?next=' + encodeURIComponent(next));
  }

  function syncProfileState() {
    if (!window.TopikApi || !TopikApi.hasSession || !TopikApi.getMe || !TopikApi.hasSession()) {
      return Promise.resolve();
    }
    try {
      var hasFlag =
        sessionStorage.getItem('topik_profile_incomplete') != null ||
        localStorage.getItem('topik_profile_incomplete') != null;
      if (hasFlag) return Promise.resolve();
    } catch (e) { /* ignore */ }
    return TopikApi.getMe().catch(function () { /* ignore */ });
  }

  // ---- DOM ready ----
  function init() {
    ensureFavicon();
    window.__tpkmRebuildNav = function () { buildHeader(); buildFooter(); buildTabbar(); };
    var boot = function () {
      buildHeader();
      buildFooter();
      buildTabbar();
      checkLoginGuard();
    };
    syncProfileState().then(boot).catch(boot);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      var sc = document.createElement('script');
      sc.src = 'shared/topik-i18n-content.js';
      sc.onload = init;
      document.head.appendChild(sc);
    });
  } else {
    var sc = document.createElement('script');
    sc.src = 'shared/topik-i18n-content.js';
    sc.onload = init;
    document.head.appendChild(sc);
  }

  // ---- Public helpers ----
  window.TPKM = {
    openModal(id) { document.getElementById(id)?.classList.add('open'); },
    closeModal(id) { document.getElementById(id)?.classList.remove('open'); },
    closeNearestModal(el) { el.closest('.modal-backdrop')?.classList.remove('open'); }
  };
})();
