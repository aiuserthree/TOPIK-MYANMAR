import { chromium, devices } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FO_BASE = 'http://localhost:8080';
const BO_BASE = 'http://localhost:8081';
const API_BASE = 'http://localhost:8000';
const OUT_FO = path.join(__dirname, 'screenshots/fo');
const OUT_BO = path.join(__dirname, 'screenshots/bo');
const BO_LP_DIR = path.join(__dirname, 'bo-lp');
/** 정적 HTML(bo-lp/*.html)에서 캡처 — API 데이터에 Diff 등이 없을 때 사용 */
const BO_LP_STATIC_CAPTURE = new Set(['bo-lp-perm-history-detail']);
const TMP_DIR = path.join(__dirname, '.tmp-screenshots');

/** DevTools Device Toolbar — iPhone 14 Pro Max */
const MO_DEVICE = devices['iPhone 14 Pro Max'];
const PC_VIEWPORT = { width: 1440, height: 900 };
const PC_MIN_WIDTH = 1280;
const MAX_CAPTURE_WIDTH = 2560;

const FO_EMAIL = process.env.FO_CAPTURE_EMAIL || 'demo@topik-mm.local';
const FO_PASSWORD = process.env.FO_CAPTURE_PASSWORD || 'DemoUser!2026';
/** 로컬 개발 BO 계정(로컬 서버 확인.txt). 다른 계정 쓰려면 BO_CAPTURE_EMAIL/PASSWORD 환경변수 */
const BO_EMAIL = process.env.BO_CAPTURE_EMAIL || 'admin-dev@topik-mm.local';
const BO_PASSWORD = process.env.BO_CAPTURE_PASSWORD || 'DevOnly!2026';

const ANNOTATIONS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'screen-annotations.json'), 'utf8'),
);

async function apiLogin(email, password, portal) {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, portal }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`Login failed ${portal} ${email}: ${JSON.stringify(body)}`);
  return body;
}

function injectFoAuth(page, auth) {
  return page.evaluate((data) => {
    const store = window.localStorage;
    store.setItem('topik_access_token', data.access_token);
    store.setItem('topik_refresh_token', data.refresh_token);
    store.setItem('topik_user', JSON.stringify(data.user));
    store.removeItem('topik_profile_incomplete');
  }, auth);
}

function injectBoAuth(page, auth) {
  return page.evaluate((data) => {
    const account = data.user || {};
    const roleUi = (r) => {
      if (r === 'super') return 'super';
      if (r === 'admin' || r === 'standard') return 'general';
      if (r === 'readonly') return 'viewer';
      return r || 'general';
    };
    localStorage.setItem('bo_access_token', data.access_token);
    localStorage.setItem('bo_refresh_token', data.refresh_token);
    localStorage.setItem('bo_admin_user', JSON.stringify(account));
    sessionStorage.setItem(
      'bo_session',
      JSON.stringify({
        id: account.email,
        email: account.email,
        name: account.name,
        role: roleUi(account.role),
        must_change_password: !!account.must_change_password,
        loginAt: new Date().toISOString(),
      }),
    );
    sessionStorage.setItem('bo_last_activity', String(Date.now()));
  }, auth);
}

async function waitFoReady(page) {
  await page.waitForSelector('#site-header', { state: 'attached', timeout: 15000 });
  await page.waitForTimeout(400);
}

async function waitBoPanel(page) {
  await page.waitForSelector('.app .mn', { timeout: 20000 });
  await page.waitForFunction(
    () => !document.body.textContent.includes('API 데이터 로딩'),
    { timeout: 30000 },
  ).catch(() => {});
  await page.waitForTimeout(900);
}

async function boOpenAuthed(page, hash) {
  await page.goto(`${BO_BASE}/admin-login.html`, { waitUntil: 'domcontentloaded' });
  await injectBoAuth(page, await ensureBoAuth());
  await page.goto(`${BO_BASE}/admin.html#${hash || 'dashboard'}`, { waitUntil: 'networkidle' });
  await waitBoPanel(page);
}

async function clickFirstGridCheckbox(page, tableSelector, rowFilter = null) {
  const rows = page.locator(`${tableSelector} tbody tr`);
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    if (rowFilter) {
      const text = await row.innerText();
      if (!rowFilter(text)) continue;
    }
    const cb = row.locator('input[type="checkbox"]');
    if (await cb.count()) {
      await cb.click();
      return true;
    }
  }
  if (count > 0) {
    const cb = rows.first().locator('input[type="checkbox"]');
    if (await cb.count()) {
      await cb.click();
      return true;
    }
  }
  return false;
}

const BO_OVERLAY_PREPARE = {
  'bo-lp-applicant-detail': async (page) => {
    const btn = page.locator('#applicants-grid tbody tr .ibtn:has-text("상세보기")').first();
    await btn.waitFor({ state: 'visible', timeout: 10000 });
    await btn.click();
    await page.waitForSelector('.lp.open', { timeout: 10000 });
  },
  'bo-lp-pay': async (page) => {
    await clickFirstGridCheckbox(page, '#applicants-grid', (t) => t.includes('미수납'));
    await page.locator('.bulkbar .ibtn:has-text("오프라인 수납")').click({ timeout: 8000 });
    await page.waitForSelector('.modal-backdrop.open', { timeout: 10000 });
  },
  'bo-lp-approve': async (page) => {
    await clickFirstGridCheckbox(page, '#applicants-grid');
    await page.locator('.bulkbar .ibtn').getByText('승인', { exact: true }).click({ timeout: 8000 });
    await page.waitForSelector('.modal-backdrop.open', { timeout: 10000 });
  },
  'bo-lp-reject': async (page) => {
    await clickFirstGridCheckbox(page, '#applicants-grid');
    await page.locator('.bulkbar .ibtn.danger:has-text("반려")').click({ timeout: 8000 });
    await page.waitForSelector('.modal-backdrop.open', { timeout: 10000 });
  },
  'bo-lp-exam-assign': async (page) => {
    await page.locator('.panel-head .btn-primary:has-text("수험번호")').click({ timeout: 10000 });
    await page.waitForSelector('.modal-backdrop.open .modal-body table.dg', { timeout: 15000 });
  },
  'bo-lp-session-edit': async (page) => {
    const btn = page.locator('table.dg tbody tr .ibtn:has-text("수정")').first();
    await btn.waitFor({ state: 'visible', timeout: 10000 });
    await btn.click();
    await page.waitForSelector('.lp.open', { timeout: 10000 });
  },
  'bo-lp-venue-edit': async (page) => {
    const btn = page.locator('table.dg tbody tr .ibtn:has-text("수정")').first();
    await btn.waitFor({ state: 'visible', timeout: 10000 });
    await btn.click();
    await page.waitForSelector('.lp.open', { timeout: 10000 });
  },
  'bo-lp-notice-edit': async (page) => {
    await page.locator('.panel-head .btn-primary:has-text("공지")').click({ timeout: 10000 });
    await page.waitForSelector('.lp.open .bo-quill-host', { timeout: 15000 });
  },
  'bo-lp-faq-edit': async (page) => {
    await page.locator('.panel-head .btn-primary:has-text("FAQ")').click({ timeout: 10000 });
    await page.waitForSelector('.lp.open', { timeout: 10000 });
  },
  'bo-lp-refund-detail': async (page) => {
    const link = page.locator('table.dg tbody tr a').first();
    await link.waitFor({ state: 'visible', timeout: 10000 });
    await link.click();
    await page.waitForSelector('.lp.open', { timeout: 10000 });
  },
  'bo-lp-inquiry-detail': async (page) => {
    const link = page.locator('table.dg tbody tr a').first();
    await link.waitFor({ state: 'visible', timeout: 10000 });
    await link.click();
    await page.waitForSelector('.lp.open', { timeout: 10000 });
  },
  'bo-lp-member-detail': async (page) => {
    const link = page.locator('table.dg tbody tr a').first();
    await link.waitFor({ state: 'visible', timeout: 10000 });
    await link.click();
    await page.waitForSelector('.lp.open', { timeout: 10000 });
  },
  'bo-lp-audit-detail': async (page) => {
    const btn = page.locator('table.dg tbody tr .ibtn').first();
    await btn.waitFor({ state: 'visible', timeout: 10000 });
    await btn.click();
    await page.waitForSelector('.lp.open', { timeout: 10000 });
  },
  'bo-lp-admin-access-detail': async (page) => {
    const btn = page.locator('table.dg tbody tr .ibtn').first();
    await btn.waitFor({ state: 'visible', timeout: 10000 });
    await btn.click();
    await page.waitForSelector('.lp.open', { timeout: 10000 });
  },
  'bo-lp-member-access-detail': async (page) => {
    const btn = page.locator('table.dg tbody tr .ibtn').first();
    await btn.waitFor({ state: 'visible', timeout: 10000 });
    await btn.click();
    await page.waitForSelector('.lp.open', { timeout: 10000 });
  },
  'bo-lp-perm-history-detail': async (page) => {
    const rows = page.locator('table.dg tbody tr');
    const count = await rows.count();
    let opened = false;
    for (let i = 0; i < count; i++) {
      const text = await rows.nth(i).innerText();
      if (/메뉴 권한 변경|등급 변경|액션 (추가|제거)/.test(text)) {
        await rows.nth(i).locator('.ibtn').click();
        opened = true;
        break;
      }
    }
    if (!opened) {
      await page.locator('table.dg tbody tr .ibtn').first().click();
    }
    await page.waitForSelector('.lp.open', { timeout: 10000 });
    await page.waitForSelector('.lp.open .diff', { timeout: 10000 }).catch(() => {});
  },
  'bo-lp-admin-edit': async (page) => {
    await page.locator('.btn-primary:has-text("관리자 등록")').click({ timeout: 10000 });
    await page.waitForSelector('.lp.open', { timeout: 10000 });
  },
  'bo-lp-term-edit': async (page) => {
    await page.locator('.panel-head .btn-primary:has-text("약관 등록")').click({ timeout: 10000 });
    await page.waitForSelector('.lp.open .bo-quill-host', { timeout: 15000 });
  },
};

const BO_OVERLAY_ROUTES = {
  'bo-lp-applicant-detail': 'applicants',
  'bo-lp-pay': 'applicants',
  'bo-lp-approve': 'applicants',
  'bo-lp-reject': 'applicants',
  'bo-lp-exam-assign': 'applicants',
  'bo-lp-session-edit': 'sessions',
  'bo-lp-venue-edit': 'venues',
  'bo-lp-notice-edit': 'notices',
  'bo-lp-faq-edit': 'faq',
  'bo-lp-refund-detail': 'refunds',
  'bo-lp-inquiry-detail': 'inquiries',
  'bo-lp-member-detail': 'members',
  'bo-lp-audit-detail': 'audit',
  'bo-lp-admin-access-detail': 'admin-access-log',
  'bo-lp-member-access-detail': 'member-access-log',
  'bo-lp-perm-history-detail': 'perm-history',
  'bo-lp-admin-edit': 'admins',
  'bo-lp-term-edit': 'terms',
};

async function captureBoLpHtmlPage(pcContext, { name, outPath }) {
  const htmlPath = path.join(BO_LP_DIR, `${name}.html`);
  if (!fs.existsSync(htmlPath)) throw new Error(`Missing static LP HTML: ${htmlPath}`);
  const page = await pcContext.newPage();
  const annotationKey = annotationKeyFromPath(outPath);
  try {
    await page.goto(`file://${htmlPath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await shotPcOnly(page, outPath, { annotationKey });
    console.log('Saved', path.basename(outPath));
  } finally {
    await page.close();
  }
}

async function captureBoOverlayPage(pcContext, { name, outPath }) {
  if (BO_LP_STATIC_CAPTURE.has(name)) {
    return captureBoLpHtmlPage(pcContext, { name, outPath });
  }

  const page = await pcContext.newPage();
  const annotationKey = annotationKeyFromPath(outPath);
  const hash = BO_OVERLAY_ROUTES[name];
  const prepare = BO_OVERLAY_PREPARE[name];

  try {
    await boOpenAuthed(page, hash);
    if (prepare) await prepare(page);
    await page.waitForTimeout(500);
    const markerList = getMarkers(annotationKey, 'pc').length
      ? getMarkers(annotationKey, 'pc')
      : getMarkers(annotationKey, 'markers');
    if (markerList.length) {
      recordBoMarkerCoords(annotationKey, await collectMarkerCoords(page, markerList));
    }
    await shotPcOnly(page, outPath, { annotationKey });
    console.log('Saved', path.basename(outPath));
  } finally {
    await page.close();
  }
}

async function openFoDrawer(page) {
  const drawerBtn = page.locator('#btnDrawer');
  if (await drawerBtn.count()) {
    await drawerBtn.click();
    await page.waitForSelector('#drawer.open', { timeout: 5000 }).catch(() => {});
  }
  await page.waitForTimeout(500);
}

async function prepareRegisterForCapture(page) {
  await page.waitForSelector('#roundList .round-card', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => {
    const card = document.querySelector('.round-card:not(.disabled)');
    if (card) {
      document.querySelectorAll('.round-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
    }
  });
  await expandStepPanes(page);
  await page.waitForTimeout(300);
}

async function expandStepPanes(page, paneSelector = '.step-pane') {
  await page.evaluate((sel) => {
    document.querySelectorAll(sel).forEach((pane, index) => {
      pane.style.display = 'block';
      pane.style.marginBottom = '28px';
      if (index > 0) {
        pane.style.borderTop = '2px dashed #d8d0c0';
        pane.style.paddingTop = '24px';
      }
    });
  }, paneSelector);
}

function annotationKeyFromPath(outPath) {
  const rel = path.relative(path.join(__dirname, 'screenshots'), outPath).replace(/\\/g, '/');
  return rel.replace(/\.png$/, '');
}

function getMarkers(key, device) {
  const entry = ANNOTATIONS[key];
  if (!entry) return [];
  if (entry.markers) return entry.markers;
  return entry[device] || entry.pc || [];
}

async function injectMarkers(page, markers) {
  if (!markers?.length) return;
  await page.evaluate((items) => {
    document.querySelectorAll('.guide-marker-overlay').forEach((el) => el.remove());
    document.getElementById('guide-marker-style')?.remove();

    const style = document.createElement('style');
    style.id = 'guide-marker-style';
    style.textContent = `
      .guide-marker-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        pointer-events: none;
        z-index: 2147483646;
      }
      .guide-marker {
        position: absolute;
        min-width: 26px;
        height: 26px;
        padding: 0 6px;
        background: #CC785C;
        color: #fff;
        border: 2px solid #fff;
        border-radius: 999px;
        font: 700 13px/22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-align: center;
        box-shadow: 0 2px 10px rgba(15, 23, 42, 0.35);
        transform: translate(-50%, -50%);
      }
    `;
    document.head.appendChild(style);

    const docH = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      document.documentElement.offsetHeight,
    );
    const overlay = document.createElement('div');
    overlay.className = 'guide-marker-overlay';
    overlay.style.height = `${docH}px`;
    document.body.appendChild(overlay);

    const used = new Set();
    const usedXY = new Map();

    function markerXY(rect, anchor) {
      const sx = window.scrollX;
      const sy = window.scrollY;
      const auto = rect.width > 360 || rect.height > 100 ? 'top-left' : 'center';
      const mode = anchor || auto;
      if (mode === 'center') {
        return {
          x: rect.left + rect.width / 2 + sx,
          y: rect.top + Math.min(Math.max(rect.height * 0.35, 16), Math.max(rect.height - 10, 16)) + sy,
        };
      }
      return {
        x: rect.left + Math.min(Math.max(rect.width * 0.06, 14), 40) + sx,
        y: rect.top + Math.min(Math.max(rect.height * 0.14, 14), 28) + sy,
      };
    }

    for (const item of items) {
      const el = document.querySelector(item.selector);
      if (!el) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) continue;

      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;

      let { x, y } = markerXY(rect, item.anchor);
      const xyKey = `${Math.round(x)}:${Math.round(y)}`;
      const dup = usedXY.get(xyKey) || 0;
      if (dup) x += dup * 28;
      usedXY.set(xyKey, dup + 1);

      const key = `${item.n}:${Math.round(x)}:${Math.round(y)}`;
      if (used.has(key)) continue;
      used.add(key);

      const badge = document.createElement('div');
      badge.className = 'guide-marker';
      badge.textContent = String(item.n);
      badge.style.left = `${x}px`;
      badge.style.top = `${y}px`;
      overlay.appendChild(badge);
    }
  }, markers);
}

async function removeMarkers(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.guide-marker-overlay').forEach((el) => el.remove());
    document.getElementById('guide-marker-style')?.remove();
  });
}

async function collectMarkerCoords(page, markers) {
  if (!markers?.length) return [];
  return page.evaluate((items) => {
    const docH = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      document.documentElement.offsetHeight,
    );
    const docW = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
      document.documentElement.offsetWidth,
    );
    function markerXY(rect, anchor) {
      const sx = window.scrollX;
      const sy = window.scrollY;
      const auto = rect.width > 360 || rect.height > 100 ? 'top-left' : 'center';
      const mode = anchor || auto;
      if (mode === 'center') {
        return {
          x: rect.left + rect.width / 2 + sx,
          y: rect.top + Math.min(Math.max(rect.height * 0.35, 16), Math.max(rect.height - 10, 16)) + sy,
        };
      }
      return {
        x: rect.left + Math.min(Math.max(rect.width * 0.06, 14), 40) + sx,
        y: rect.top + Math.min(Math.max(rect.height * 0.14, 14), 28) + sy,
      };
    }
    const out = [];
    for (const item of items) {
      const el = document.querySelector(item.selector);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) continue;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const { x, y } = markerXY(rect, item.anchor);
      out.push({ n: item.n, x: +(x / docW).toFixed(4), y: +(y / docH).toFixed(4) });
    }
    return out;
  }, markers);
}

const markerCoordExport = {};
const boMarkerCoordExport = {};

function recordMarkerCoords(annotationKey, device, coords) {
  if (!coords?.length) return;
  const base = annotationKey.replace(/^fo\//, '');
  const rel = `screenshots/fo/split/${base}__${device}.png`;
  markerCoordExport[rel] = coords;
}

const DETAIL_PATCH = {
  'screenshots/fo/split/qna__pc.png': {
    1: '<strong>탭</strong> — 전체 / 일반 / 비밀. 공개 범위별 목록 필터.',
    2: '<strong>카테고리·검색</strong> — 카테고리(접수·시험·기타) + 제목·작성자 검색.',
    3: '<strong>목록</strong> — 번호·분류·제목·작성자·작성일·상태. 행 클릭 시 <strong>상세</strong>로 전환.',
    4: '<strong>문의하기</strong> — <strong>작성 화면</strong>으로 이동.',
    5: '<strong>페이지</strong> — 목록 페이지 이동(20건/페이지).',
    6: '<strong>상세 헤더</strong> — 분류·상태·제목·작성자·작성일·비밀글 표시.',
    7: '<strong>본문·첨부</strong> — 문의 내용·첨부 다운로드.',
    8: '<strong>관리자 답변</strong> — 공식 답변 이력(최신순).',
    9: '<strong>댓글</strong> — 댓글 목록·작성·답글.',
  },
  'screenshots/fo/split/refund-correction__pc.png': {
    1: '<strong>유형 칩</strong> — 전체 / 환불 / 정보정정. 유형별 목록 필터.',
    2: '<strong>검색</strong> — 제목·작성자 검색.',
    3: '<strong>목록</strong> — 번호·유형·제목·작성자·작성일·상태. 행 클릭 시 <strong>상세</strong>로 전환.',
    4: '<strong>글쓰기</strong> — <strong>작성 화면</strong>으로 이동.',
    5: '<strong>페이지</strong> — 목록 페이지 이동.',
    6: '<strong>상세 헤더</strong> — 유형·상태·제목·작성자·작성일.',
    7: '<strong>본문·첨부</strong> — 신청 내용·첨부(영수증·신분증 등).',
    8: '<strong>관리자 답변</strong> — 공식 답변 이력.',
    9: '<strong>댓글</strong> — 댓글 목록·작성·답글.',
  },
  'screenshots/fo/split/login__pc.png': {
    1: '<strong>로그인 폼</strong> — 이메일·비밀번호 입력 후 <strong>로그인</strong>.',
    2: '<strong>Google 로그인</strong> — Google 계정으로 로그인. 프로필 미완성 시 회원가입으로 이어질 수 있음.',
    3: '<strong>아이디 찾기</strong> — 이름·생년월일·연락처 <strong>모두 일치</strong> 시 이메일 일부 안내.',
    4: '<strong>비밀번호 찾기</strong> — 이메일 → 인증코드. Google 계정이면 Google 로그인 안내, 미가입이면 &quot;가입된 계정이 없습니다.&quot;',
    5: '<strong>회원가입 링크</strong> — 회원가입 화면으로 이동.',
  },
  'screenshots/fo/split/register__pc.png': {
    1: '<strong>단계 표시</strong> — ①회차·급수 ②회원정보 확인 ③사진 규격 확인 ④최종 확인. 완료 단계 클릭 시 해당 단계로 이동(모바일은 활성 탭을 화면 중앙으로 스크롤).',
    2: '<strong>저장 후 나가기</strong> — 입력 중인 내용을 임시 저장하고 마이페이지로 나갈 수 있습니다. 저장된 내용은 <strong>30일간</strong> 보관되며, 다음에 접수 화면에 들어오면 이어서 작성할지 묻습니다.',
    3: '<strong>회차 목록</strong> — 접수 중·예정 회차만 카드로 노출. 카드에 제N회/제목, 상태 배지(접수 중/접수 마감/예정), 시험일, 접수 기간. <strong>접수 중이 아닌 회차는 선택 불가</strong>. 한 번에 하나만 선택.',
    4: '<strong>시험장</strong> — 시험장 목록 드롭다운. 시험장이 1개면 자동 선택. <strong>재접수</strong>이거나 <strong>같은 회차에 진행 중 급수</strong>가 있으면 기존 시험장으로 고정(변경 불가 + 안내 문구).',
    5: '<strong>급수 선택</strong> — TOPIK Ⅰ·Ⅱ 복수 선택. 이미 진행 중인 급수는 선택 불가 + 사유 안내(사진 심사중/수납 대기/접수 진행중). <strong>재접수</strong>에서는 반려·취소된 급수만 다시 선택 가능.',
    6: '<strong>응시료 표시</strong> — 선택 회차·급수별 응시료. Ⅰ·Ⅱ 동시 선택 시 최종 확인 단계 합계에 반영.',
    7: '<strong>회원정보 (STEP2)</strong> — 한글·영문 성명, 생년월일, 성별, 국적, 제1언어, 연락처, 이메일, 직업·응시동기·응시목적. 이 화면에서는 수정 불가 → <strong>내정보 수정</strong> 이용.',
    8: '<strong>사진 미리보기 (STEP3)</strong> — 가입 시 등록한 증명사진 표시. <strong>이 단계에서 교체 불가</strong> → 내정보 수정에서 변경.',
    9: '<strong>규격 체크리스트 (STEP3)</strong> — 5항목: 여권용 정면 컬러(JPG)·흰색 배경 / 최근 6개월 이내 / 흑백·흐릿 아님 / 모자·선글라스·이어폰·앞머리로 얼굴 안 가림 / 정면·본인. <strong>전부 체크해야</strong> <strong>다음</strong> 활성.',
    10: '<strong>최종 요약 (STEP4)</strong> — 회차·시험일, 선택 급수(2개면 &quot;동시 접수&quot;), 시험장, 응시자 정보, 응시료 합계. 응시료·환불 안내 함께 표시.',
    11: '<strong>약관 동의</strong> — <strong>[필수]</strong> 체크. 미체크 시 제출 불가(알림).',
    12: '<strong>제출</strong> — <strong>접수하기</strong> → 완료 안내 → <strong>접수확인</strong> 누르면 마이페이지 이동.',
  },
  'screenshots/fo/split/mypage-profile-basic__pc.png': {
    1: '<strong>탭</strong> — <strong>기본정보·사진</strong> / <strong>계정·비밀번호</strong> 전환. Google 계정은 비밀번호 탭이 숨겨질 수 있습니다.',
    2: '<strong>사진 교체</strong> — 미리보기·파일 선택·규격 안내. 저장 시 진행 중 접수 사진 심사 <strong>대기</strong>로 재설정. 사진만 실패 시 &quot;기본정보는 저장됐지만 사진 업로드 실패&quot; 안내.',
    3: '<strong>프로필 폼</strong> — 한글·영문 성명, 생년월일, 성별, 국적, 제1언어, 연락처, 직업·응시동기·응시목적. <strong>기본정보 저장</strong> 시 반영되며 상단 메뉴 이름도 변경됩니다.',
    4: '<strong>마케팅 수신 동의</strong> — <strong>마케팅 정보 수신 동의(이메일)</strong> 체크박스. 가입 시 선택 여부가 기본값으로 표시되며, <strong>기본정보 저장</strong>으로 변경·철회 가능. <strong>보기</strong>는 레이어 팝업으로 약관 전문을 불러옵니다.',
    5: '<strong>기본정보 저장</strong> — 기본정보·사진·마케팅 수신 설정을 한 번에 저장합니다.',
  },
  'screenshots/fo/split/mypage-profile-account__pc.png': {
    1: '<strong>탭</strong> — <strong>기본정보·사진</strong> / <strong>계정·비밀번호</strong> 전환.',
    2: '<strong>마지막 변경일</strong> — 비밀번호 마지막 변경일과 6개월마다 변경 권장 안내. Google 가입 계정에는 <strong>Google 안내</strong> 박스가 대신 표시됩니다(비밀번호는 Google에서 관리).',
    3: '<strong>이메일 (로그인 ID)</strong> — 가입 이메일 표시. <strong>변경 불가</strong>(읽기 전용).',
    4: '<strong>비밀번호 변경</strong> — 이메일 가입 계정만. 현재·새·확인 비밀번호 입력(8자 이상 + 영문·숫자·특수문자 각 1자, 현재 비밀번호와 달라야 함). 변경 후 보안상 <strong>재로그인</strong> 안내.',
    5: '<strong>계정정보 저장</strong> — 비밀번호 변경 내용을 저장합니다.',
    6: '<strong>회원 탈퇴</strong> — 이메일 계정: <strong>비밀번호</strong> 확인. Google 계정: <strong>Google 본인 확인</strong>. 탈퇴 시 <strong>진행 중 접수 전부 취소</strong>, 동일 이메일 <strong>30일 재가입 제한</strong>.',
  },
};

const BO_DETAIL_PATCH = {
  'screenshots/bo/bo-applicants.png': {
    1: '<strong>상태 필터</strong> — 전체 / 접수완료 / 사진심사중 / 수납대기 / 승인완료 / 반려 / 취소 / 환불. 각 칩에 <strong>건수</strong> 표시.',
    2: '<strong>시험장·급수</strong> — 시험장(활성만)과 급수(Ⅰ / Ⅱ / 동시)로 목록 필터.',
    3: '<strong>검색</strong> — 한글·영문 이름, 이메일, 생년월일, 수험번호 일부 검색.',
    4: '<strong>접수자 표</strong> — 체크박스, 사진심사·수납·상태, 수험번호, <strong>상세보기</strong>. 12행/페이지.',
    5: '<strong>수험번호 일괄 부여</strong> — <strong>승인완료</strong>·수험번호 미부여 건 13자리 일괄 채번. <strong>최고관리자(super)</strong> 만 활성.',
  },
  'screenshots/bo/bo-venues.png': {
    1: '<strong>시험장 목록</strong> — 코드·지역·한/영/미얀마어 명칭·주소·정원·상태·비고.',
    2: '<strong>활성/비활성</strong> — <strong>비활성</strong> 시험장은 회차 배정·접수자 필터 목록에서 <strong>제외</strong>됩니다. 폐쇄·미사용 장소는 비활성 처리하세요.',
  },
  'screenshots/bo/bo-sessions.png': {
    1: '<strong>회차 목록</strong> — 회차번호·회차명·접수기간·시험일·합격 발표일·정원·접수자 수·응시료·시험장 수·상태·관리 버튼.',
    2: '<strong>상태 표시</strong> — <strong>예정·접수중·마감·폐지</strong> — 접수 시작·마감 <strong>일시 기준으로 자동</strong> 전환됩니다(수동으로 「접수중」 버튼을 누르는 방식이 아님).',
  },
  'screenshots/bo/bo-lp-admin-edit.png': {
    1: '<strong>입력 항목</strong> — 이름·이메일·권한 등급(최고/일반/조회)·초기 비밀번호(신규 등록 시)·비고.',
    2: '<strong>게시글 신규 접수 이메일 수신</strong> — <strong>환불·정보정정신청·문의게시판</strong> 신규 글 접수 시 이 계정 <strong>이메일</strong>로 운영자 알림 수신 여부. 체크 후 <strong>저장</strong>해야 반영.',
    3: '<strong>저장/취소</strong> — <strong>등록</strong> 또는 <strong>저장</strong> 후 해당 관리자는 <strong>첫 로그인 시 비밀번호 변경</strong>이 강제됩니다(신규·비밀번호 초기화 시).',
  },
};

function recordBoMarkerCoords(annotationKey, coords) {
  if (!coords?.length) return;
  boMarkerCoordExport[`screenshots/${annotationKey}.png`] = coords;
}

function patchBoGuideMarkers() {
  const guidePath = path.join(__dirname, 'TOPIK_관리자화면_BO_가이드.html');
  if (!fs.existsSync(guidePath) || !Object.keys(boMarkerCoordExport).length) return;
  let html = fs.readFileSync(guidePath, 'utf8');
  const m = html.match(/window\.MARKERS=(\{[\s\S]*?\});/);
  if (!m) return;
  const markers = JSON.parse(m[1]);
  Object.assign(markers, boMarkerCoordExport);
  html = html.replace(/window\.MARKERS=\{[\s\S]*?\};/, `window.MARKERS=${JSON.stringify(markers)};`);

  const dm = html.match(/window\.DETAILS=(\{[\s\S]*?\});/);
  if (dm) {
    const details = JSON.parse(dm[1]);
    for (const [key, patch] of Object.entries(BO_DETAIL_PATCH)) {
      if (!boMarkerCoordExport[key]) continue;
      details[key] = patch;
    }
    html = html.replace(/window\.DETAILS=\{[\s\S]*?\};/, `window.DETAILS=${JSON.stringify(details)};`);
  }

  fs.writeFileSync(guidePath, html);
  console.log('Updated BO guide markers for', Object.keys(boMarkerCoordExport).join(', '));
}

function patchFoGuideMarkers() {
  const guidePath = path.join(__dirname, 'TOPIK_사용자화면_FO_가이드.html');
  if (!fs.existsSync(guidePath) || !Object.keys(markerCoordExport).length) return;
  let html = fs.readFileSync(guidePath, 'utf8');
  const m = html.match(/window\.MARKERS=(\{[\s\S]*?\});/);
  if (!m) return;
  const markers = JSON.parse(m[1]);
  Object.assign(markers, markerCoordExport);
  html = html.replace(/window\.MARKERS=\{[\s\S]*?\};/, `window.MARKERS=${JSON.stringify(markers)};`);

  const dm = html.match(/window\.DETAILS=(\{[\s\S]*?\});/);
  if (dm) {
    const details = JSON.parse(dm[1]);
    for (const [pcKey, patch] of Object.entries(DETAIL_PATCH)) {
      if (!markerCoordExport[pcKey]) continue;
      details[pcKey] = patch;
      const moKey = pcKey.replace('__pc.png', '__mo.png');
      details[moKey] = patch;
    }
    html = html.replace(/window\.DETAILS=\{[\s\S]*?\};/, `window.DETAILS=${JSON.stringify(details)};`);
  }

  fs.writeFileSync(guidePath, html);
  console.log('Updated FO guide markers for', Object.keys(markerCoordExport).join(', '));
}

/** 가로 overflow 없이 fullPage 캡처되도록 문서 scrollWidth에 맞춰 viewport 확장 (PC용) */
async function fitViewportForFullCapture(page, minWidth) {
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return {
      scrollWidth: Math.max(root.scrollWidth, body?.scrollWidth || 0, root.clientWidth),
      clientWidth: root.clientWidth,
    };
  });

  const vp = page.viewportSize();
  const height = vp?.height || 900;
  const targetWidth = Math.min(
    Math.max(metrics.scrollWidth, minWidth, metrics.clientWidth),
    MAX_CAPTURE_WIDTH,
  );

  if (!vp || vp.width !== targetWidth) {
    await page.setViewportSize({ width: targetWidth, height });
    await page.waitForTimeout(350);
  }

  await page.evaluate(() => window.scrollTo(0, 0));
}

async function captureFullPageShot(page, outPath, { minWidth = PC_MIN_WIDTH, fixedWidth = null, markers = null, beforeMarkers = null } = {}) {
  if (fixedWidth) {
    const vp = page.viewportSize();
    await page.setViewportSize({ width: fixedWidth, height: vp?.height || MO_DEVICE.viewport.height });
    await page.waitForTimeout(350);
    await page.evaluate(() => window.scrollTo(0, 0));
  } else {
    await fitViewportForFullCapture(page, minWidth);
  }
  if (beforeMarkers) await beforeMarkers(page);
  if (markers?.length) await injectMarkers(page, markers);
  await page.screenshot({ path: outPath, fullPage: true, animations: 'disabled' });
  if (markers?.length) await removeMarkers(page);
}

function imageMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'image/png';
}

async function measureImagePair(browser, pcData, moData, pcMime = 'image/png', moMime = 'image/png') {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  try {
    return await page.evaluate(async ({ pc, mo, pcMime: pcm, moMime: mom }) => {
      const load = (b64, mime) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = reject;
          img.src = `data:${mime};base64,${b64}`;
        });
      return { pc: await load(pc, pcm), mo: await load(mo, mom) };
    }, { pc: pcData, mo: moData, pcMime, moMime });
  } finally {
    await page.close();
  }
}

async function combinePcMo(browser, pcPath, moPath, outPath) {
  const pcMime = imageMime(pcPath);
  const moMime = imageMime(moPath);
  const pcData = fs.readFileSync(pcPath).toString('base64');
  const moData = fs.readFileSync(moPath).toString('base64');
  const dims = await measureImagePair(browser, pcData, moData, pcMime, moMime);

  const PAD = 16;
  const GAP = 28;
  const LEGEND_H = 52;
  const LABEL_H = 24;
  const LABEL_GAP = 10;
  const contentW = dims.pc.w + GAP + dims.mo.w;
  const contentH = Math.max(dims.pc.h, dims.mo.h);
  const totalW = PAD * 2 + contentW;
  const totalH = PAD + LEGEND_H + LABEL_H + LABEL_GAP + contentH + PAD;

  const moLabel = `MO (iPhone 14 Pro Max · ${MO_DEVICE.viewport.width}px)`;
  const pcLabel = `PC (${PC_MIN_WIDTH}px+, viewport ${PC_VIEWPORT.width}px)`;

  const htmlPath = path.join(TMP_DIR, 'combine.html');
  fs.writeFileSync(
    htmlPath,
    `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${totalW}px; min-height: ${totalH}px; overflow: visible; }
    body { background: #eef1f5; padding: ${PAD}px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .legend { font-size: 13px; color: #54514a; margin-bottom: 14px; line-height: 1.45; white-space: normal; }
    .legend strong { color: #CC785C; }
    .wrap { display: flex; gap: ${GAP}px; align-items: flex-start; width: ${contentW}px; }
    .col { display: flex; flex-direction: column; gap: ${LABEL_GAP}px; flex: 0 0 auto; }
    .col-pc { width: ${dims.pc.w}px; }
    .col-mo { width: ${dims.mo.w}px; }
    .label { font-size: 15px; font-weight: 600; color: #1a1a2e; letter-spacing: 0.02em; white-space: nowrap; }
    .frame { background: #fff; box-shadow: 0 2px 12px rgba(15, 23, 42, 0.12); border-radius: 8px; overflow: visible; width: 100%; }
    img { display: block; width: 100%; height: auto; max-width: none; }
  </style>
</head>
<body>
  <p class="legend"><strong>●</strong> 이미지 속 번호는 아래 「요소별 상세」 표·목록의 번호와 동일합니다. (PC·MO 각각 전체 페이지 스크롤 캡처)</p>
  <div class="wrap">
    <div class="col col-pc">
      <div class="label">${pcLabel}</div>
      <div class="frame"><img id="pc" width="${dims.pc.w}" height="${dims.pc.h}" src="data:${pcMime};base64,${pcData}" alt="PC"></div>
    </div>
    <div class="col col-mo">
      <div class="label">${moLabel}</div>
      <div class="frame"><img id="mo" width="${dims.mo.w}" height="${dims.mo.h}" src="data:${moMime};base64,${moData}" alt="MO"></div>
    </div>
  </div>
</body>
</html>`,
  );

  const page = await browser.newPage({
    viewport: { width: totalW, height: Math.min(totalH, 900) },
    deviceScaleFactor: 1,
  });
  await page.goto(`file://${htmlPath}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => {
      const pc = document.getElementById('pc');
      const mo = document.getElementById('mo');
      return pc?.complete && mo?.complete && pc.naturalWidth > 0 && mo.naturalWidth > 0;
    },
    { timeout: 120000 },
  );
  await page.screenshot({ path: outPath, fullPage: true, animations: 'disabled' });
  await page.close();
}

async function shotPcMo(browser, pcPage, moPage, outPath, { pcBeforeShot, moBeforeShot, annotationKey } = {}) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const pcTmp = path.join(TMP_DIR, 'pc.png');
  const moTmp = path.join(TMP_DIR, 'mo.png');

  if (pcBeforeShot) await pcBeforeShot(pcPage);
  if (moBeforeShot) await moBeforeShot(moPage);

  const pcMarkers = getMarkers(annotationKey, 'pc');
  const moMarkers = getMarkers(annotationKey, 'mo');
  const sharedMarkers = getMarkers(annotationKey, 'markers');

  const pcMarkerList = pcMarkers.length ? pcMarkers : sharedMarkers;
  const moMarkerList = moMarkers.length ? moMarkers : sharedMarkers;

  const moMinWidth = MO_DEVICE.viewport.width;
  if (annotationKey) {
    recordMarkerCoords(annotationKey, 'pc', await collectMarkerCoords(pcPage, pcMarkerList));
    recordMarkerCoords(annotationKey, 'mo', await collectMarkerCoords(moPage, moMarkerList));
  }
  await captureFullPageShot(pcPage, pcTmp, { minWidth: PC_MIN_WIDTH, markers: pcMarkerList });
  await captureFullPageShot(moPage, moTmp, { fixedWidth: moMinWidth, markers: moMarkerList });

  await combinePcMo(browser, pcTmp, moTmp, outPath);

  if (outPath.startsWith(OUT_FO + path.sep)) {
    const splitDir = path.join(OUT_FO, 'split');
    fs.mkdirSync(splitDir, { recursive: true });
    const base = path.basename(outPath, '.png');
    fs.copyFileSync(pcTmp, path.join(splitDir, `${base}__pc.png`));
    fs.copyFileSync(moTmp, path.join(splitDir, `${base}__mo.png`));
  }
}

/** PC는 수동 캡처 JPG/PNG, MO만 자동 캡처·마커 주입 후 합성 */
async function shotMoWithExternalPc(browser, moPage, outPath, { moBeforeShot, annotationKey, pcImagePath }) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const moTmp = path.join(TMP_DIR, 'mo.png');

  if (moBeforeShot) await moBeforeShot(moPage);

  const moMarkers = getMarkers(annotationKey, 'mo');
  const sharedMarkers = getMarkers(annotationKey, 'markers');
  await injectMarkers(moPage, moMarkers.length ? moMarkers : sharedMarkers);

  await captureFullPageShot(moPage, moTmp, { fixedWidth: MO_DEVICE.viewport.width });
  await removeMarkers(moPage);

  if (!fs.existsSync(pcImagePath)) {
    throw new Error(`PC image not found: ${pcImagePath}`);
  }
  await combinePcMo(browser, pcImagePath, moTmp, outPath);
}

async function prepareBoLoginForCapture(page) {
  await page.evaluate(() => {
    const err = document.getElementById('errBanner');
    if (err) {
      err.classList.add('show');
      err.style.display = 'flex';
    }
  });
}

async function expandFoPanes(page, ids) {
  await page.evaluate((paneIds) => {
    paneIds.forEach((id, index) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.add('active');
      el.style.display = 'block';
      if (index > 0) {
        el.style.borderTop = '2px dashed #d8d0c0';
        el.style.paddingTop = '24px';
        el.style.marginTop = '28px';
      }
    });
  }, ids);
}

async function expandProfileTabsForCapture(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.tab-pane').forEach((pane, index) => {
      pane.classList.add('active');
      pane.style.display = 'block';
      if (index > 0) {
        pane.style.borderTop = '2px dashed #d8d0c0';
        pane.style.paddingTop = '24px';
        pane.style.marginTop = '28px';
      }
    });
  });
}

async function prepareCommonLayoutPc(page) {
  await page.addStyleTag({
    content: `
      .gnb, .gnb-menu .dropdown {
        backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
      }
      .gnb { background: #fff !important; }
      .gnb-menu > li:nth-child(4) .dropdown {
        opacity: 1 !important; visibility: visible !important; pointer-events: auto !important;
        transform: none !important; transition: none !important;
      }
      .hero .round-badge::before { animation: none !important; box-shadow: none !important; }
      *, *::before, *::after { animation: none !important; transition: none !important; }
    `,
  });
  await page.waitForTimeout(400);
}

async function prepareCommonLayoutMo(page) {
  await openFoDrawer(page);
  await page.evaluate(() => {
    const items = document.querySelectorAll('.drawer-menu details');
    if (items[3]) items[3].open = true;
  });
}

async function closeAllModals(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.classList.remove('open'));
  });
}

async function prepareLegalPageForCapture(page) {
  await closeAllModals(page);
  await page.evaluate(() => {
    const loading = document.getElementById('termsLoading');
    if (loading) loading.hidden = true;
    const dynamic = document.getElementById('termsDynamic');
    const fallback = document.getElementById('termsFallback');
    if (dynamic) dynamic.hidden = true;
    if (fallback) {
      fallback.hidden = false;
      fallback.style.display = 'block';
    }
  });
  await page.waitForTimeout(300);
}

async function prepareNoticeForCapture(page) {
  await waitNoticeList(page);
  await page.evaluate(() => {
    const detailView = document.getElementById('detailView');
    if (!detailView) return;
    detailView.classList.add('active');
    detailView.style.display = 'block';
    detailView.style.marginTop = '28px';
    detailView.style.borderTop = '2px dashed #d8d0c0';
    detailView.style.paddingTop = '24px';

    const title = document.getElementById('noticeDetailTitle');
    if (title && title.textContent.trim() === '공지') title.textContent = '접수 일정 안내 (예시)';

    const body = document.getElementById('noticeDetailBody');
    if (body && !body.textContent.trim()) {
      body.innerHTML = '<p>공지 본문 예시입니다. 접수 일정·유의사항을 확인하세요.</p>';
    }

    const attach = document.getElementById('noticeDetailAttach');
    if (attach) {
      attach.style.display = 'block';
      if (!attach.innerHTML.trim()) {
        attach.innerHTML = '<a href="#" class="attach-item">schedule.pdf (120KB)</a>';
      }
    }

    const nav = document.getElementById('noticeNavPn');
    if (nav) {
      nav.style.display = 'flex';
      if (!nav.innerHTML.trim()) {
        nav.innerHTML =
          '<div class="nav-item prev"><span class="lbl">이전글</span><span class="tit">이전 공지</span></div>' +
          '<div class="nav-item next"><span class="lbl">다음글</span><span class="tit">다음 공지</span></div>';
      }
    }
  });
}

async function prepareLoginForCapture(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.classList.remove('open'));
  });
}

async function preparePasswordResetForCapture(page) {
  await page.evaluate(() => {
    ['panelForm', 'panelSuccess', 'panelError'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('show', id === 'panelForm');
    });
    const email = document.getElementById('sentEmail');
    if (email && !email.textContent.trim()) email.textContent = 'demo@topik-mm.local';
  });
}

async function setMypageProfileTab(page, tab) {
  await closeAllModals(page);
  await page.evaluate((activeTab) => {
    document.querySelectorAll('.profile-tabs button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === activeTab);
    });
    document.querySelectorAll('.tab-pane').forEach((pane) => {
      const on = pane.dataset.tab === activeTab;
      pane.classList.toggle('active', on);
      pane.style.display = on ? 'block' : 'none';
    });
    const googleNotice = document.getElementById('pf-google-notice');
    if (googleNotice) googleNotice.style.display = 'none';
    const changed = document.getElementById('pf-pw-changed');
    if (changed && (!changed.textContent.trim() || changed.textContent.trim() === '—')) {
      changed.textContent = '2025.12.01';
    }
  }, tab);
}

async function prepareMypageProfileBasicForCapture(page) {
  await setMypageProfileTab(page, 'basic');
}

async function prepareMypageProfileAccountForCapture(page) {
  await setMypageProfileTab(page, 'account');
}

async function prepareMypageForCapture(page) {
  await waitMypageCards(page);
  await page.evaluate(() => {
    if (document.querySelector('.app-card')) return;
    const pane = document.getElementById('paneActive');
    if (!pane) return;
    pane.innerHTML =
      '<div class="app-card" data-status="pay">' +
      '<div class="app-head"><div class="lt"><h3><span class="round-n">제107회</span> <span class="lvls">TOPIK Ⅰ</span></h3>' +
      '<div class="meta">시험일 2026.10.18 · 양곤대</div></div>' +
      '<div class="rt"><span class="status status-pay">수납 대기</span><span class="apply-n">접수번호 APP-1-I</span></div></div>' +
      '<div class="app-grid">' +
      '<div class="it"><div class="l">수험번호</div><div class="v pending">부여 전</div></div>' +
      '<div class="it"><div class="l">사진 심사</div><div class="v">대기</div></div>' +
      '<div class="it"><div class="l">응시료 수납</div><div class="v pending">대기</div></div>' +
      '<div class="it"><div class="l">접수일</div><div class="v" style="color:var(--text-2);font-weight:500;">2026.06.10</div></div>' +
      '</div>' +
      '<div class="app-actions">' +
      '<button type="button" class="btn btn-secondary btn-sm" data-act="confirm">접수 확인증</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="cancel">접수 취소</button>' +
      '</div></div>';
    const ct = document.getElementById('ctActive');
    if (ct) ct.textContent = '1';
  });
}

async function padBoardDetailForCapture(page) {
  await page.evaluate(() => {
    const reply = document.getElementById('bdReply');
    if (reply && (reply.style.display === 'none' || !reply.textContent.trim())) {
      reply.style.display = '';
      reply.innerHTML =
        '<div class="reply-block"><div class="who">' +
        '<span class="reply-badge">답변</span><span>관리자</span><span class="when">2026.06.10</span>' +
        '</div><div class="body-r">안내드립니다. 접수 내용 확인 후 처리하겠습니다.</div></div>';
    }
    const comments = document.getElementById('bdComments');
    if (comments && !comments.querySelector('h4')) {
      comments.innerHTML =
        '<h4>댓글 <span style="color:var(--text-3);font-weight:500;">0</span></h4>' +
        '<p style="color:var(--text-3);font-size:13px;padding:8px 0 4px;">아직 등록된 댓글이 없습니다.</p>' +
        '<div class="comment-write"><textarea placeholder="댓글을 입력하세요" data-comment-input></textarea>' +
        '<button class="btn btn-primary" data-comment-submit>등록</button></div>';
    }
  });
}

async function injectBoardDetailFallback(page) {
  const isRefund = (await page.url()).includes('refund-correction');
  await page.evaluate((refund) => {
    const title = document.getElementById('bdTitle');
    if (!title) return;
    title.textContent = refund ? '제107회 응시료 환불 신청' : '응시료 수납 확인 문의';
    const badge = document.getElementById('bdBadge');
    if (badge) {
      badge.textContent = refund ? '환불' : '접수';
      badge.className = refund ? 'badge badge-type-rfd' : 'badge badge-outline';
    }
    const status = document.getElementById('bdStatus');
    if (status) {
      status.textContent = '답변 완료';
      status.className = 'status status-done';
    }
    const meta = document.getElementById('bdMeta');
    if (meta) meta.innerHTML = '<span>본인</span><span>·</span><span>2026.06.10</span>';
    const body = document.getElementById('bdBody');
    if (body) {
      body.innerHTML = refund
        ? '<p>접수번호 APP-1-I · 제107회 TOPIK Ⅰ 환불 신청합니다.</p>'
        : '<p>접수번호 APP-1-I 수납 확인 부탁드립니다.</p>';
    }
  }, isRefund);
}

async function prepareBoardListDetailForCapture(page) {
  const listSel = (await page.url()).includes('refund-correction') ? '#rfdListBody' : '#qnaListBody';
  await page.waitForFunction(
    (sel) => {
      const tbody = document.querySelector(sel);
      return tbody && !tbody.textContent.includes('불러오는 중');
    },
    listSel,
    { timeout: 15000 },
  ).catch(() => {});

  const row = page.locator(`${listSel} tr[data-id]:not([data-locked="1"])`).first();
  if (await row.count()) {
    await row.click();
    await page.waitForFunction(
      () => {
        const t = document.getElementById('bdTitle');
        const b = document.getElementById('bdBody');
        return t && b && t.textContent.trim() && b.textContent.trim()
          && !t.textContent.includes('불러오는') && !b.textContent.includes('불러오는');
      },
      { timeout: 12000 },
    ).catch(() => {});
  } else {
    await injectBoardDetailFallback(page);
  }

  await padBoardDetailForCapture(page);

  await page.evaluate(() => {
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.classList.remove('open'));
    const write = document.getElementById('writePane');
    if (write) {
      write.classList.remove('active');
      write.style.display = 'none';
    }
    ['listPane', 'detailPane'].forEach((id, index) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.add('active');
      el.style.display = 'block';
      if (index > 0) {
        el.style.borderTop = '2px dashed #d8d0c0';
        el.style.paddingTop = '24px';
        el.style.marginTop = '28px';
      }
    });
  });
}

async function expandSignupForCapture(page) {
  await expandStepPanes(page, '.step-pane');
  await page.evaluate(() => {
    document.getElementById('otpRow')?.classList.remove('hidden');
  });
}

async function waitMypageCards(page) {
  await page.waitForFunction(
    () => document.querySelector('.app-card') || document.querySelector('#paneActive')?.textContent?.includes('없'),
    { timeout: 15000 },
  ).catch(() => {});
  await page.waitForTimeout(600);
}

async function waitNoticeList(page) {
  await page.waitForFunction(
    () => {
      const tbody = document.getElementById('noticeTbody');
      return tbody && !tbody.textContent.includes('불러오는 중');
    },
    { timeout: 15000 },
  ).catch(() => {});
  await page.waitForTimeout(400);
}

const FO_URL_OVERRIDES = {
  'password-reset.html': `${FO_BASE}/password-reset.html?email=demo@topik-mm.local`,
};

const PAGE_HOOKS = {
  'fo/common-layout': { pcBeforeShot: prepareCommonLayoutPc, moBeforeShot: prepareCommonLayoutMo },
  'fo/register': { pcBeforeShot: prepareRegisterForCapture, moBeforeShot: prepareRegisterForCapture },
  'fo/signup': { pcBeforeShot: expandSignupForCapture, moBeforeShot: expandSignupForCapture },
  'fo/mypage': { pcBeforeShot: prepareMypageForCapture, moBeforeShot: prepareMypageForCapture },
  'fo/notice-list': { pcBeforeShot: prepareNoticeForCapture, moBeforeShot: prepareNoticeForCapture },
  'fo/login': { pcBeforeShot: prepareLoginForCapture, moBeforeShot: prepareLoginForCapture },
  'fo/password-reset': { pcBeforeShot: preparePasswordResetForCapture, moBeforeShot: preparePasswordResetForCapture },
  'fo/qna': { pcBeforeShot: prepareBoardListDetailForCapture, moBeforeShot: prepareBoardListDetailForCapture },
  'fo/refund-correction': { pcBeforeShot: prepareBoardListDetailForCapture, moBeforeShot: prepareBoardListDetailForCapture },
  'fo/mypage-profile-basic': { pcBeforeShot: prepareMypageProfileBasicForCapture, moBeforeShot: prepareMypageProfileBasicForCapture },
  'fo/mypage-profile-account': { pcBeforeShot: prepareMypageProfileAccountForCapture, moBeforeShot: prepareMypageProfileAccountForCapture },
  'fo/terms': { pcBeforeShot: prepareLegalPageForCapture, moBeforeShot: prepareLegalPageForCapture },
  'fo/privacy': { pcBeforeShot: prepareLegalPageForCapture, moBeforeShot: prepareLegalPageForCapture },
  'bo/bo-login': { beforeShot: prepareBoLoginForCapture },
};

async function shotPcOnly(page, outPath, { beforeShot, annotationKey, beforeMarkers = null } = {}) {
  if (beforeShot) await beforeShot(page);

  const pcMarkers = getMarkers(annotationKey, 'pc');
  const sharedMarkers = getMarkers(annotationKey, 'markers');
  const markerList = pcMarkers.length ? pcMarkers : sharedMarkers;
  await captureFullPageShot(page, outPath, {
    minWidth: PC_MIN_WIDTH,
    markers: markerList,
    beforeMarkers,
  });
}

async function captureBoPage(pcContext, { url, outPath, wait = null, auth = null, beforeShot = null }) {
  const page = await pcContext.newPage();
  const annotationKey = annotationKeyFromPath(outPath);

  try {
    if (auth === 'bo') {
      await page.goto(`${BO_BASE}/admin-login.html`, { waitUntil: 'domcontentloaded' });
      await injectBoAuth(page, await ensureBoAuth());
    } else if (auth === 'clear-bo') {
      await page.goto(`${BO_BASE}/admin-login.html`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
    }

    await page.goto(url, { waitUntil: 'networkidle' });
    if (wait === 'bo') await waitBoPanel(page);

    const markerList = getMarkers(annotationKey, 'pc').length
      ? getMarkers(annotationKey, 'pc')
      : getMarkers(annotationKey, 'markers');
    await shotPcOnly(page, outPath, {
      beforeShot: async (p) => {
        if (beforeShot) await beforeShot(p);
        const hooks = PAGE_HOOKS[annotationKey] || {};
        if (hooks.beforeShot) await hooks.beforeShot(p);
      },
      beforeMarkers: markerList.length
        ? async (p) => recordBoMarkerCoords(annotationKey, await collectMarkerCoords(p, markerList))
        : null,
      annotationKey,
    });
    console.log('Saved', path.basename(outPath));
  } finally {
    await page.close();
  }
}

async function capturePair(browser, pcContext, moContext, { url, outPath, wait = null, auth = null, moBeforeShot = null, pcBeforeShot = null }) {
  const annotationKey = annotationKeyFromPath(outPath);
  const hooks = PAGE_HOOKS[annotationKey] || {};
  const moHook = moBeforeShot || hooks.moBeforeShot || null;

  const pcPage = await pcContext.newPage();
  const moPage = await moContext.newPage();

  try {
    if (auth === 'fo') {
      const authData = await ensureFoAuth();
      for (const page of [pcPage, moPage]) {
        await page.goto(`${FO_BASE}/login.html`, { waitUntil: 'domcontentloaded' });
        await injectFoAuth(page, authData);
      }
    } else if (auth === 'bo') {
      const authData = await ensureBoAuth();
      for (const page of [pcPage, moPage]) {
        await page.goto(`${BO_BASE}/admin-login.html`, { waitUntil: 'domcontentloaded' });
        await injectBoAuth(page, authData);
      }
    } else if (auth === 'clear-bo') {
      for (const page of [pcPage, moPage]) {
        await page.goto(`${BO_BASE}/admin-login.html`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });
      }
    }

    await pcPage.goto(url, { waitUntil: 'networkidle' });
    await moPage.goto(url, { waitUntil: 'networkidle' });

    if (wait === 'fo') {
      await waitFoReady(pcPage);
      await waitFoReady(moPage);
    } else if (wait === 'bo') {
      await waitBoPanel(pcPage);
      await waitBoPanel(moPage);
    }

    await shotPcMo(browser, pcPage, moPage, outPath, {
      annotationKey,
      pcBeforeShot: pcBeforeShot || hooks.pcBeforeShot || null,
      moBeforeShot: moHook,
    });
    console.log('Saved', path.basename(outPath));
  } finally {
    await pcPage.close();
    await moPage.close();
  }
}

let foAuth;
let boAuth;

async function ensureFoAuth() {
  if (!foAuth) foAuth = await apiLogin(FO_EMAIL, FO_PASSWORD, 'fo');
  return foAuth;
}

async function ensureBoAuth() {
  if (!boAuth) boAuth = await apiLogin(BO_EMAIL, BO_PASSWORD, 'bo');
  return boAuth;
}

async function main() {
  fs.mkdirSync(OUT_FO, { recursive: true });
  fs.mkdirSync(OUT_BO, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const pcContext = await browser.newContext({
    viewport: PC_VIEWPORT,
    deviceScaleFactor: 1,
  });
  const moContext = await browser.newContext({ ...MO_DEVICE });

  const foPublic = [
    'index.html',
    'guide-overview.html',
    'guide-intro.html',
    'guide-questions.html',
    'guide-evaluation.html',
    'rules-notice.html',
    'rules-answer.html',
    'rules-fee.html',
    'rules-id.html',
    'apply-howto.html',
    'login.html',
    'signup.html',
    'password-reset.html',
    'terms.html',
    'privacy.html',
    'marketing.html',
    'notice.html',
    'faq.html',
    '404.html',
    'ticket.html',
  ];

  const foName = (p) => (p === 'notice.html' ? 'notice-list' : p.replace('.html', ''));
  const only = process.env.CAPTURE_ONLY?.replace(/\.(html|png)$/, '');
  const boOnly = process.env.CAPTURE_BO === '1';
  const boLpOnly = process.env.CAPTURE_BO_LP === '1';

  if (!boOnly && !boLpOnly) for (const p of foPublic) {
    const name = foName(p);
    if (only && name !== only && p.replace('.html', '') !== only) continue;
    const url = FO_URL_OVERRIDES[p] || `${FO_BASE}/${p}`;
    await capturePair(browser, pcContext, moContext, {
      url,
      outPath: path.join(OUT_FO, `${name}.png`),
      wait: 'fo',
    });
  }

  if (!boOnly && !boLpOnly && (!only || only === 'common-layout')) {
    await capturePair(browser, pcContext, moContext, {
      url: `${FO_BASE}/index.html`,
      outPath: path.join(OUT_FO, 'common-layout.png'),
      wait: 'fo',
    });
  }

  const foAuthPages = [
    ['register.html', 'register.png'],
    ['mypage.html', 'mypage.png'],
    ['mypage-profile.html', 'mypage-profile-basic.png'],
    ['mypage-profile.html', 'mypage-profile-account.png'],
    ['qna.html', 'qna.png'],
    ['refund-correction.html', 'refund-correction.png'],
  ];

  if (!boOnly && !boLpOnly) for (const [page, file] of foAuthPages) {
    const base = file.replace('.png', '');
    if (only && only !== base) continue;
    await capturePair(browser, pcContext, moContext, {
      url: `${FO_BASE}/${page}`,
      outPath: path.join(OUT_FO, file),
      wait: 'fo',
      auth: 'fo',
    });
  }

  if (!boLpOnly && (!only || only.startsWith('bo-') || only === 'bo-login' || only === 'bo-shell')) {
    if (!only || only === 'bo-login') {
      await captureBoPage(pcContext, {
        url: `${BO_BASE}/admin-login.html`,
        outPath: path.join(OUT_BO, 'bo-login.png'),
        auth: 'clear-bo',
      });
    }

    if (!only || only === 'bo-shell') {
      await captureBoPage(pcContext, {
        url: `${BO_BASE}/admin.html`,
        outPath: path.join(OUT_BO, 'bo-shell.png'),
        wait: 'bo',
        auth: 'bo',
      });
    }
  }

  const boPanels = [
    ['dashboard', 'bo-dashboard.png'],
    ['applicants', 'bo-applicants.png'],
    ['sessions', 'bo-sessions.png'],
    ['venues', 'bo-venues.png'],
    ['notices', 'bo-notices.png'],
    ['faq', 'bo-faq.png'],
    ['refunds', 'bo-refunds.png'],
    ['inquiries', 'bo-inquiries.png'],
    ['members', 'bo-members.png'],
    ['terms', 'bo-terms.png'],
    ['admins', 'bo-admins.png'],
    ['permissions', 'bo-permissions.png'],
    ['audit', 'bo-audit.png'],
    ['admin-access-log', 'bo-admin-access-log.png'],
    ['member-access-log', 'bo-member-access-log.png'],
    ['perm-history', 'bo-perm-history.png'],
  ];

  if (!boLpOnly) for (const [hash, file] of boPanels) {
    const base = file.replace('.png', '').replace(/^bo-/, '');
    if (only && only !== file.replace('.png', '') && only !== base) continue;
    await captureBoPage(pcContext, {
      url: `${BO_BASE}/admin.html#${hash}`,
      outPath: path.join(OUT_BO, file),
      wait: 'bo',
      auth: 'bo',
    });
  }

  const boOverlayPages = [
    'bo-lp-applicant-detail',
    'bo-lp-pay',
    'bo-lp-approve',
    'bo-lp-reject',
    'bo-lp-exam-assign',
    'bo-lp-session-edit',
    'bo-lp-venue-edit',
    'bo-lp-notice-edit',
    'bo-lp-faq-edit',
    'bo-lp-refund-detail',
    'bo-lp-inquiry-detail',
    'bo-lp-member-detail',
    'bo-lp-audit-detail',
    'bo-lp-admin-access-detail',
    'bo-lp-member-access-detail',
    'bo-lp-perm-history-detail',
    'bo-lp-admin-edit',
    'bo-lp-term-edit',
  ];

  if (boOnly || boLpOnly || !only || only.startsWith('bo-lp-')) {
    for (const name of boOverlayPages) {
      if (only && only !== name && !only.startsWith('bo-lp-')) continue;
      if (only && only.startsWith('bo-lp-') && only !== name) continue;
      await captureBoOverlayPage(pcContext, {
        name,
        outPath: path.join(OUT_BO, `${name}.png`),
      });
    }
  }

  await pcContext.close();
  await moContext.close();
  await browser.close();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  patchFoGuideMarkers();
  patchBoGuideMarkers();
  console.log('Done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
