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

  const TAB = [
    { href: 'index.html',   key: 'home',  label: '홈',
      svg: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>' },
    { href: 'apply-howto.html', key: 'apply', label: '접수',
      svg: '<svg viewBox="0 0 24 24"><path d="M9 4h6a2 2 0 0 1 2 2v14l-5-3-5 3V6a2 2 0 0 1 2-2z"/></svg>' },
    { href: 'notice.html',  key: 'board', label: '게시판',
      svg: '<svg viewBox="0 0 24 24"><path d="M5 5h14v14H5z"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>' },
    { href: 'mypage.html',  key: 'me',    label: '마이',
      svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>' }
  ];

  // ---- 상태 헬퍼 ----
  const Auth = {
    get user() { try { return JSON.parse(localStorage.getItem('tpkm_user') || 'null'); } catch (e) { return null; } },
    login(u) { localStorage.setItem('tpkm_user', JSON.stringify(u)); },
    logout() { localStorage.removeItem('tpkm_user'); }
  };
  window.TPKMAuth = Auth;

  const Lang = {
    get() { return localStorage.getItem('tpkm_lang') || 'KO'; },
    set(l) {
      localStorage.setItem('tpkm_lang', l);
      document.documentElement.setAttribute('data-lang', l);
      document.querySelectorAll('.lang-toggle button').forEach(b => {
        b.classList.toggle('active', b.dataset.lang === l);
      });
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
    const user = Auth.user;

    const menuHTML = MENU.map(m => `
      <li class="${m.key === ak ? 'active' : ''}">
        <a href="${m.children[0].href}" data-key="${m.key}">${m.label}</a>
        <ul class="dropdown">
          ${m.children.map(c => `<li><a href="${c.href}">${c.label}</a></li>`).join('')}
        </ul>
      </li>
    `).join('');

    const authHTML = user
      ? `<a href="mypage.html" class="user-chip">
          <span class="avatar">${(user.name || 'U').slice(0,1)}</span>
          <span>${user.name || 'My'}</span>
        </a>
        <button class="btn btn-secondary btn-sm" id="btnLogout">로그아웃</button>`
      : `<a href="login.html" class="btn btn-secondary btn-sm">로그인</a>
         <a href="signup.html" class="btn btn-primary btn-sm">회원가입</a>`;

    wrap.innerHTML = `
      <header class="gnb" role="banner">
        <div class="container gnb-inner">
          <a href="index.html" class="gnb-logo" aria-label="TOPIK Myanmar 홈">
            <span class="mark">T</span>
            <span class="name">
              TOPIK Myanmar
              <small>주미얀마 대한민국 대사관</small>
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
              ? `<a href="mypage.html" class="btn btn-secondary">마이페이지</a>
                 <button class="btn btn-ghost" id="btnLogoutMobile">로그아웃</button>`
              : `<a href="login.html" class="btn btn-secondary">로그인</a>
                 <a href="signup.html" class="btn btn-primary">회원가입</a>`
            }
          </div>
          <nav class="drawer-menu" aria-label="모바일 주 메뉴">
            ${MENU.map(m => `
              <details ${m.key === ak ? 'open' : ''}>
                <summary>
                  ${m.label}
                  <svg class="chev" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
                </summary>
                <div class="submenu">
                  ${m.children.map(c => `
                    <a href="${c.href}" ${c.href === currentFile() ? 'class="active"' : ''}>
                      ${c.label}
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
    Lang.set(Lang.get());

    // Logout
    const onLogout = () => {
      if (confirm('로그아웃 하시겠습니까?')) {
        Auth.logout();
        location.href = 'index.html';
      }
    };
    document.getElementById('btnLogout')?.addEventListener('click', onLogout);
    document.getElementById('btnLogoutMobile')?.addEventListener('click', onLogout);
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
            <span>${t.label}</span>
          </a>
        `).join('')}
      </nav>
    `;
  }

  // ---- Footer ----
  function buildFooter() {
    const wrap = document.querySelector('#site-footer');
    if (!wrap) return;
    wrap.innerHTML = `
      <footer class="footer">
        <div class="container">
          <div class="ft-top">
            <div>
              <div class="brand">
                TOPIK Myanmar
                <small>Embassy of the Republic of Korea in Myanmar</small>
              </div>
              <p class="meta" style="margin-top:12px;">
                한국어능력시험(TOPIK) 미얀마 시행 공식 안내·접수 사이트입니다.
                운영기관 <strong>주미얀마 대한민국 대사관</strong>
              </p>
            </div>
            <div>
              <div style="color:#fff; font-weight:600; font-size:13px; margin-bottom:10px;">바로가기</div>
              <div class="links" style="flex-direction:column; gap:8px;">
                <a href="guide-overview.html">TOPIK 안내</a>
                <a href="rules-notice.html">TOPIK 규정</a>
                <a href="apply-howto.html">TOPIK 접수</a>
                <a href="notice.html">공지사항</a>
                <a href="faq.html">FAQ</a>
              </div>
            </div>
            <div>
              <div style="color:#fff; font-weight:600; font-size:13px; margin-bottom:10px;">외부 링크</div>
              <div class="links" style="flex-direction:column; gap:8px;">
                <a href="https://www.topik.go.kr" target="_blank" rel="noopener noreferrer">TOPIK 본부 (topik.go.kr)</a>
                <a href="https://www.niied.go.kr" target="_blank" rel="noopener noreferrer">국립국제교육원 (NIIED)</a>
                <a href="https://www.facebook.com/share/18VtSUtzTh/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer">대사관 Facebook</a>
              </div>
              <p class="meta" style="margin-top:16px;">
                <strong>문의</strong><br>
                topik.myanmar@mofa.go.kr<br>
                업무시간 월–금 09:00–17:00 (UTC+6:30)
              </p>
            </div>
          </div>
          <p class="copy">© 2025–2026 Embassy of the Republic of Korea in Myanmar. All rights reserved.</p>
        </div>
      </footer>
    `;
  }

  // ---- Login guard ----
  // Add `data-require-login` on a <body> element OR pass through this helper.
  function checkLoginGuard() {
    const body = document.body;
    if (!body.hasAttribute('data-require-login')) return;
    if (Auth.user) return;
    const next = encodeURIComponent(location.pathname.split('/').pop() + location.search);
    location.replace('login.html?next=' + next);
  }

  // ---- DOM ready ----
  function init() {
    buildHeader();
    buildFooter();
    buildTabbar();
    checkLoginGuard();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ---- Public helpers ----
  window.TPKM = {
    openModal(id) { document.getElementById(id)?.classList.add('open'); },
    closeModal(id) { document.getElementById(id)?.classList.remove('open'); },
    closeNearestModal(el) { el.closest('.modal-backdrop')?.classList.remove('open'); }
  };
})();
