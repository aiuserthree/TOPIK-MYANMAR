import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'bo-lp');
const BO_ASSETS = '../../../html/C안/BO(admin)/project/assets';

const X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

function pill(kind, text) {
  return `<span class="pill pill-${kind}">${text}</span>`;
}

function kv(k, v) {
  return `<div class="form-row" style="margin-bottom:0"><div class="label" style="font-size:11.5px;color:var(--text-3);margin-bottom:2px">${k}</div><div style="font-size:14px;color:var(--text);font-weight:500">${v}</div></div>`;
}

function fieldSet(legend, cols, inner) {
  const grid = cols === 2 ? 'cols-2' : cols === 3 ? 'cols-3' : '';
  return `<fieldset class="fs"><legend>${legend}</legend><div class="fs-body"><div class="fs-grid ${grid}">${inner}</div></div></fieldset>`;
}

function formRow(label, content, { required = false, hint = '', span = 0 } = {}) {
  const req = required ? '<span class="req">*</span>' : '';
  const hintHtml = hint ? `<div class="hint">${hint}</div>` : '';
  const spanStyle = span ? ` style="grid-column:span ${span}"` : '';
  return `<div class="form-row"${spanStyle}><label class="label">${label}${req}</label>${content}${hintHtml}</div>`;
}

function lpPage({ title, sub, size = '', tabs = '', body, footer, label }) {
  const sizeClass = size === 'wide' ? 'lp-wide' : size === 'sm' ? 'lp-sm' : '';
  const tabsHtml = tabs ? `<div class="lp-tabs">${tabs}</div>` : '';
  const footHtml = footer ? `<div class="lp-foot">${footer}</div>` : '';
  return pageShell(title, 'lp-capture-wrap', label, `
<div class="lp-backdrop open"></div>
<div class="lp open ${sizeClass}" role="dialog">
  <div class="lp-head">
    <div style="flex:1">
      <h2>${title}</h2>
      ${sub ? `<div class="sub" style="margin-top:2px">${sub}</div>` : ''}
    </div>
    <button class="lp-close" aria-label="닫기">${X_SVG}</button>
  </div>
  ${tabsHtml}
  <div class="lp-body">${body}</div>
  ${footHtml}
</div>`);
}

function modalPage({ title, danger = false, wide = false, body, footer, label }) {
  const headColor = danger ? ' style="color:var(--danger)"' : '';
  const wrapClass = wide ? 'lp-capture-modal modal-wide' : 'lp-capture-modal';
  return pageShell(title, wrapClass, label, `
<div class="modal-backdrop open">
  <div class="modal" role="dialog">
    <div class="modal-head" style="display:flex;align-items:center;justify-content:space-between">
      <h3${headColor}>${title}</h3>
      <button class="lp-close" aria-label="닫기" style="margin-right:-8px">${X_SVG}</button>
    </div>
    <div class="modal-body">${body}</div>
    ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
  </div>
</div>`);
}

function pageShell(title, bodyClass, label, content) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — BO LP 캡처</title>
<link rel="stylesheet" href="${BO_ASSETS}/fo-styles.css">
<link rel="stylesheet" href="${BO_ASSETS}/admin.css">
<link rel="stylesheet" href="lp-capture.css">
</head>
<body class="admin">
<div class="lp-capture-page ${bodyClass}">
  <p class="capture-label"><strong>●</strong> ${label}</p>
  ${content}
</div>
</body>
</html>`;
}

const pages = {
  'bo-lp-applicant-detail.html': lpPage({
    title: '접수자 상세 — 김민수 (Kim Minsu)',
    sub: `회차 컨텍스트 · 접수ID <code class="code-id">app-2026-00142</code> · 상태 ${pill('pay', '수납대기')}`,
    size: 'wide',
    label: '접수자 목록 → 상세보기 LP (기본 정보 탭)',
    tabs: `
      <button class="active">기본 정보</button>
      <button>메모</button>
      <button>처리 이력 (3)</button>`,
    body: `
      <div style="display:grid;grid-template-columns:240px 1fr;gap:24px">
        <div>
          <div class="photo-lg" style="background:linear-gradient(160deg,hsl(210 35% 86%),hsl(210 30% 70%));color:#fff;font-size:80px;font-weight:700;display:flex;align-items:center;justify-content:center">김</div>
          <div style="margin-top:10px;display:flex;gap:6px">
            <button class="ibtn" style="flex:1">원본 받기</button>
            <button class="ibtn" style="flex:1">회전 보정</button>
          </div>
          <div id="photo-review-box" style="margin-top:10px;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-2)">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
              <div style="font-size:12px;font-weight:700;color:var(--text-2)">사진 심사</div>
              ${pill('photo', '미심사')}
            </div>
            <div style="display:flex;gap:6px">
              <button class="ibtn" style="flex:1">사진 반려</button>
              <button class="ibtn btn-primary-ish" style="flex:1">사진 승인</button>
            </div>
          </div>
        </div>
        <div>
          ${fieldSet('응시자 정보', 2, `
            ${kv('접수 번호', '142')}
            ${kv('접수 ID', '<code class="code-id">app-2026-00142</code>')}
            ${kv('한글 성명', '김민수')}
            ${kv('영문 성명', 'Kim Minsu')}
            ${kv('생년월일', '<code class="code-id">19980512</code>')}
            ${kv('성별', '남(1)')}
            ${kv('국적', '미얀마')}
            ${kv('제1언어', '미얀마어')}
            ${kv('직업', '학생')}
            ${kv('이메일', 'demo@topik-mm.local')}
            ${kv('전화', '+95 9 1234 5678')}
            ${kv('편의지원', '미신청')}
          `)}
          ${fieldSet('시험 정보', 2, `
            ${kv('회차 ID', '<code class="code-id">sess-107</code>')}
            ${kv('처리 상태', pill('pay', '수납대기'))}
            ${kv('급수', 'TOPIK Ⅰ')}
            ${kv('시험장', '양곤대학교 흘라잉캠퍼스')}
            ${kv('시험장 ID', '<code class="code-id">v-ygn-01</code>')}
            ${kv('사진 심사', pill('photo', '미심사'))}
            ${kv('사진 승인 여부', '미승인')}
            ${kv('수납 상태', pill('pay', '미수납'))}
            ${kv('수험번호', '미부여')}
            ${kv('접수일시', '2026-05-28 14:32')}
          `)}
        </div>
      </div>`,
    footer: `
      <button class="btn btn-secondary">닫기</button>
      <button class="btn btn-secondary">반려</button>
      <button class="btn btn-secondary">수납</button>
      <button class="btn btn-primary">승인</button>`,
  }),

  'bo-lp-photo-review.html': lpPage({
    title: '사진 심사 — 김민수',
    sub: `접수ID <code class="code-id">app-2026-00142</code> · 현재 ${pill('photo', '미심사')}`,
    size: 'sm',
    label: '접수자 목록 → 사진 심사 LP',
    body: `
      <div class="photo-lg" style="background:linear-gradient(160deg,hsl(210 35% 86%),hsl(210 30% 70%));color:#fff;font-size:80px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-bottom:12px">김</div>
      <div style="display:flex;gap:6px;margin-bottom:14px">
        <button class="ibtn" style="flex:1">원본 받기</button>
        <button class="ibtn" style="flex:1">회전 보정</button>
      </div>
      ${fieldSet('응시자 확인', 1, `
        ${kv('한글 성명', '김민수')}
        ${kv('영문 성명', 'Kim Minsu')}
        ${kv('생년월일', '<code class="code-id">19980512</code>')}
        ${kv('시험장', '양곤대학교 흘라잉캠퍼스 · TOPIK Ⅰ')}
      `)}
      <div style="padding:10px;background:var(--st-photo-bg);color:var(--st-photo);border-radius:6px;font-size:12.5;margin-top:8px">
        ※ 사진을 확대·회전하여 확인한 뒤 승인 또는 반려하세요.
      </div>`,
    footer: `
      <button class="btn btn-secondary">닫기</button>
      <button class="btn btn-danger">반려</button>
      <button class="btn btn-primary">사진 승인</button>`,
  }),

  'bo-lp-pay.html': modalPage({
    title: '오프라인 수납 처리',
    label: '일괄 처리 바 → 오프라인 수납 모달',
    body: `
      <div style="margin-bottom:14px;font-size:13;color:var(--text-2)">
        대상 <b>2</b>건 · 합계 응시료 <b style="color:var(--primary)">USD 24</b>
        <div style="font-size:12;color:var(--text-3);margin-top:2px">※ 행 단위 낙관적 잠금 · 처리 즉시 관리자 처리 이력에 기록됩니다.</div>
      </div>
      <div id="pay-target-table" style="border:1px solid var(--border);border-radius:6px;margin-bottom:14px;overflow:hidden">
        <table class="dg" style="font-size:12">
          <thead><tr><th>사진</th><th>한글성명</th><th>영문성명</th><th>생년월일</th><th>급수</th><th>시험장</th><th>사진심사</th><th>현 상태</th></tr></thead>
          <tbody>
            <tr>
              <td><div class="photo" style="background:var(--st-approved-bg);color:var(--st-approved);font-size:11px;display:flex;align-items:center;justify-content:center">승</div></td>
              <td>김민수</td><td>Kim Minsu</td><td class="code">19980512</td><td>Ⅰ</td><td>양곤대</td>
              <td>${pill('approved', '승인')}</td><td>${pill('pay', '수납대기')}</td>
            </tr>
            <tr>
              <td><div class="photo" style="background:var(--st-approved-bg);color:var(--st-approved);font-size:11px;display:flex;align-items:center;justify-content:center">승</div></td>
              <td>최영희</td><td>Choi Younghee</td><td class="code">19960320</td><td>Ⅱ</td><td>양곤대</td>
              <td>${pill('approved', '승인')}</td><td>${pill('pay', '수납대기')}</td>
            </tr>
          </tbody>
        </table>
      </div>
      ${formRow('영수증 번호(선택)', '<input class="input" placeholder="예) R-12345" value="R-20260528-001"/>')}
      ${formRow('메모(선택)', '<textarea class="textarea" rows="2" placeholder="예) 양곤대 흘라잉캠퍼스 1층 접수 데스크">현장 현금 수납 확인</textarea>')}`,
    footer: `
      <button class="btn btn-secondary">취소</button>
      <button class="btn btn-primary">수납 완료 처리</button>`,
  }),

  'bo-lp-approve.html': modalPage({
    title: '접수자 승인 처리',
    label: '일괄 처리 바 → 승인 모달',
    body: `
      <div style="font-size:13;color:var(--text-2)">
        대상 <b>3</b>건을 승인합니다. 승인 완료 시 FO 마이페이지·접수확인에 반영됩니다.
      </div>`,
    footer: `
      <button class="btn btn-secondary">취소</button>
      <button class="btn btn-primary">승인 완료</button>`,
  }),

  'bo-lp-reject.html': modalPage({
    title: '접수자 반려 처리',
    danger: true,
    label: '일괄 처리 바 → 반려 모달',
    body: `
      <div style="font-size:13;color:var(--text-2);margin-bottom:10px">
        대상 <b>1</b>건 · 반려 사유는 응시자 이메일/마이페이지에 안내됩니다.
      </div>
      ${formRow('반려 사유', '<select class="select"><option selected>정보 불일치</option><option>중복 접수</option><option>기타</option></select>', { required: true })}
      ${formRow('추가 안내 (선택)', '<textarea class="textarea" rows="3" placeholder="예) 정면 사진이 아닙니다.">생년월일이 신분증과 일치하지 않습니다.</textarea>')}`,
    footer: `
      <button class="btn btn-secondary">취소</button>
      <button class="btn btn-danger">반려 처리</button>`,
  }),

  'bo-lp-exam-assign.html': modalPage({
    title: '수험번호 13자리 일괄 부여',
    wide: true,
    label: '접수자 목록 → 수험번호 일괄 부여 미리보기 모달',
    body: `
      <div style="font-size:13;color:var(--text-2)">
        <p>① 국가코드(3) <b>025</b> + ② 지역코드(3) + ③ 수준코드(1) <b>7=Ⅰ / 8=Ⅱ</b> + ④ 시험장코드(2) + ⑤ 응시자코드(4) — 영문 성명 알파벳 오름차순.</p>
        <p style="margin-top:4px;color:var(--text-3);font-size:12">대상: 수납 완료 + 사진 승인 + 비반려/비취소 · 이메일 발송: <b style="color:var(--danger)">안 함</b></p>
      </div>
      <div class="kpi-grid" style="margin:14px 0">
        <div class="kpi"><div class="label">부여 대상</div><div class="val">48</div></div>
        <div class="kpi"><div class="label">제외(누락 사유)</div><div class="val">3</div></div>
      </div>
      <div id="exam-preview-table" style="border:1px solid var(--border);border-radius:6px;overflow:hidden">
        <table class="dg" style="font-size:12">
          <thead><tr><th>한글성명</th><th>영문성명</th><th>급수</th><th>수험번호(미리보기)</th></tr></thead>
          <tbody>
            <tr><td>김민수</td><td>Kim Minsu</td><td>Ⅰ</td><td><code class="code-id" style="color:var(--st-number);font-weight:700">0250017010001</code></td></tr>
            <tr><td>최영희</td><td>Choi Younghee</td><td>Ⅱ</td><td><code class="code-id" style="color:var(--st-number);font-weight:700">0250018020001</code></td></tr>
            <tr><td>박지훈</td><td>Park Jihoon</td><td>Ⅰ</td><td><code class="code-id" style="color:var(--st-number);font-weight:700">0250017010002</code></td></tr>
          </tbody>
        </table>
      </div>`,
    footer: `
      <button class="btn btn-secondary">취소</button>
      <button class="btn btn-primary">48건 일괄 부여</button>`,
  }),

  'bo-lp-session-edit.html': lpPage({
    title: '회차 수정 — 제107회 TOPIK',
    sub: '회차 ID <code class="code-id">sess-107</code>',
    label: '회차 관리 → 회차 등록/수정 LP',
    body: `
      ${fieldSet('기본 정보', 2, `
        ${formRow('회차 번호', '<input type="number" class="input" value="107"/>', { required: true })}
        ${formRow('회차명', '<input class="input" value="제107회 TOPIK"/>', { required: true })}
        ${formRow('접수 상태', '<div class="input" style="display:flex;align-items:center;background:var(--bg-2);color:var(--text-2);cursor:default">접수중</div>', { hint: '접수 시작일 00:00(KST) 이전=예정 · 기간 내=접수중 · 마감일 23:59(KST) 이후=마감' })}
        ${formRow('정원', '<input type="number" class="input" value="500"/>', { required: true })}
      `)}
      ${fieldSet('일정', 2, `
        ${formRow('접수 시작일', '<input type="date" class="input" value="2026-05-01"/>', { required: true })}
        ${formRow('접수 마감일', '<input type="date" class="input" value="2026-05-25"/>', { required: true })}
        ${formRow('시험일', '<input type="date" class="input" value="2026-06-15"/>', { required: true })}
        ${formRow('합격발표일', '<input type="date" class="input" value="2026-07-20"/>')}
      `)}
      ${fieldSet('응시료(USD)', 2, `
        ${formRow('TOPIK Ⅰ', '<input type="number" class="input" value="12"/>', { required: true })}
        ${formRow('TOPIK Ⅱ', '<input type="number" class="input" value="12"/>', { required: true })}
      `)}
      ${fieldSet('시험장 다중 선택', 1, `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">
          <label class="kv" style="cursor:pointer;flex-direction:row;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:6px">
            <input type="checkbox" checked/>
            <div><div class="k">001 · 코드 01</div><div class="v" style="font-size:13px;font-weight:500">양곤대학교 흘라잉캠퍼스</div></div>
          </label>
          <label class="kv" style="cursor:pointer;flex-direction:row;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:6px">
            <input type="checkbox" checked/>
            <div><div class="k">001 · 코드 02</div><div class="v" style="font-size:13px;font-weight:500">양곤공과대학교</div></div>
          </label>
        </div>
      `)}`,
    footer: `
      <button class="btn btn-secondary">취소</button>
      <button class="btn btn-primary">저장</button>`,
  }),

  'bo-lp-venue-edit.html': lpPage({
    title: '시험장 수정 — 양곤대학교 흘라잉캠퍼스',
    sub: '코드 <code class="code-id">025·001·01</code>',
    label: '시험장 관리 → 등록/수정 LP',
    body: `
      ${fieldSet('기본 정보', 2, `
        ${formRow('국가', '<input class="input" value="미얀마 (025)" disabled/>')}
        ${formRow('지역', '<select class="select"><option selected>001 양곤</option><option>002 만달레이</option></select>', { required: true })}
        ${formRow('시험장 코드', '<input class="input" value="01"/>', { required: true, hint: '2자리 01~99, 동일 지역 내 unique' })}
        ${formRow('정원', '<input type="number" class="input" value="120"/>', { required: true })}
        ${formRow('한글 명칭', '<input class="input" value="양곤대학교 흘라잉캠퍼스"/>', { required: true })}
        ${formRow('영문 명칭', '<input class="input" value="Yangon University Hlaing Campus"/>', { required: true })}
        ${formRow('미얀마어 명칭', '<div style="display:flex;gap:8px"><input class="input" value="ရန်ကုန်တက္ကသိုလ်"/><button class="btn btn-secondary" style="height:38px;white-space:nowrap">적용</button></div>')}
        ${formRow('주소', '<input class="input" value="Hlaing Township, Yangon"/>')}
        ${formRow('상태', '<select class="select"><option selected>활성</option><option>비활성</option></select>')}
        ${formRow('비고', '<textarea class="textarea" rows="2" placeholder="좌석배치도·책임자·연락처 등">1층 강의실 A·B · 담당: U Aung Kyaw (+95 9 xxx)</textarea>', { span: 2 })}
      `)}`,
    footer: `
      <button class="btn btn-secondary">취소</button>
      <button class="btn btn-primary">저장</button>`,
  }),

  'bo-lp-notice-edit.html': lpPage({
    title: '공지 수정 — 제107회 접수 안내',
    sub: '공지 ID <code class="code-id">ntc-2026-042</code>',
    size: 'wide',
    label: '공지사항 → 작성/수정 LP',
    body: `
      <div class="seg" style="margin-bottom:14px">
        <button class="active">KO</button><button>MY</button><button>EN</button>
      </div>
      ${fieldSet('기본', 2, `
        ${formRow('카테고리', '<select class="select"><option>중요</option><option selected>접수</option><option>시험</option><option>결과</option></select>')}
        ${formRow('제목', '<input class="input" value="제107회 TOPIK 접수 안내"/>', { required: true })}
        ${formRow('노출 시작', '<input type="datetime-local" class="input" value="2026-05-01T09:00"/>')}
        ${formRow('노출 종료', '<input type="datetime-local" class="input" value="2026-05-25T23:59"/>')}
        ${formRow('옵션', '<label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" checked/> 공개</label><label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-top:6px"><input type="checkbox"/> 상단 고정</label>', { span: 2 })}
      `)}
      ${fieldSet('본문', 1, `
        <div id="notice-editor" style="border:1px solid var(--border);border-radius:6px;min-height:180px;padding:12px;background:#fff;font-size:14px;line-height:1.65;color:var(--text)">
          <p><strong>제107회 TOPIK</strong> 접수가 2026년 5월 1일부터 시작됩니다.</p>
          <ul style="margin:8px 0 0 20px"><li>접수 기간: 5/1 ~ 5/25</li><li>시험일: 6/15</li><li>응시료: USD 12 (Ⅰ·Ⅱ 동일)</li></ul>
        </div>
      `)}
      ${fieldSet('첨부파일', 1, `
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <span class="tag">📎 접수안내.pdf</span>
          <button class="btn btn-secondary" style="height:32px;font-size:12px">+ 파일 추가</button>
        </div>
        <div class="hint" style="margin-top:8px">최대 5개 · 파일당 10MB · jpg/png/pdf/doc/xlsx 등</div>
      `)}`,
    footer: `
      <button class="btn btn-secondary">취소</button>
      <button class="btn btn-primary">저장</button>`,
  }),

  'bo-lp-faq-edit.html': lpPage({
    title: 'FAQ 수정',
    sub: 'FAQ ID <code class="code-id">faq-012</code>',
    label: 'FAQ → 등록/수정 LP',
    body: `
      <div class="seg" style="margin-bottom:14px">
        <button class="active">KO</button><button>MY</button><button>EN</button>
      </div>
      ${fieldSet('FAQ', 1, `
        ${formRow('분류', '<select class="select"><option selected>접수</option><option>시험</option><option>결과</option><option>기타</option></select>')}
        ${formRow('노출 순서', '<input type="number" class="input" value="10" style="width:120px"/>', { hint: '작을수록 상단 노출' })}
        ${formRow('질문', '<input class="input" value="접수 후 수정이 가능한가요?"/>', { required: true })}
        ${formRow('답변', '<textarea class="textarea" rows="5">접수 마감 전까지 마이페이지에서 일부 정보 수정이 가능합니다. 시험장·급수 변경은 취소 후 재접수해야 합니다.</textarea>', { required: true })}
      `)}`,
    footer: `
      <button class="btn btn-secondary">취소</button>
      <button class="btn btn-primary">저장</button>`,
  }),

  'bo-lp-refund-detail.html': lpPage({
    title: '환불 신청 — 접수 취소 및 환불 요청',
    sub: '작성자 demo@topik-mm.local · 작성일 2026-05-20 · 비밀글',
    size: 'wide',
    label: '환불·정보정정 → 상세 LP',
    body: `
      ${fieldSet('신청 내용', 1, `
        ${kv('유형', pill('pay', '환불'))}
        ${kv('본문', '<pre style="background:var(--bg-2);padding:10px;border-radius:6px;font-size:13;white-space:pre-wrap;font-family:inherit;color:var(--text)">개인 사정으로 시험 응시가 불가하여 환불을 요청합니다.\n수납 영수증 번호: R-20260515-003</pre>')}
        ${kv('첨부', '<span class="tag">📎 receipt.jpg</span>')}
      `)}
      ${fieldSet('처리', 2, `
        ${formRow('처리 상태', '<select class="select"><option>접수</option><option selected>검토중</option><option>처리완료</option><option>반려</option></select>', { required: true })}
        ${formRow('담당자', '<input class="input" value="admin-dev@topik-mm.local" disabled/>')}
        ${formRow('환불 금액', '<input class="input" placeholder="예) 12,000 MMK" value="USD 12"/>')}
        ${formRow('환불 방법', '<select class="select"><option selected>계좌이체</option><option>현장환불</option><option>기타</option></select>')}
      `)}
      ${fieldSet('답변 이력 (1)', 1, `
        <div style="padding:10px;background:#eef4ff;border:1px solid var(--border);border-radius:6px;font-size:13">
          <div style="display:flex;justify-content:space-between;font-size:12;color:var(--text-3);margin-bottom:4px">
            <span><b>admin-dev@topik-mm.local</b> · <span class="code-id" style="color:var(--primary)">공식 답변</span></span>
            <span class="code-id">2026-05-21 10:15</span>
          </div>
          <div>환불 신청이 접수되었습니다. 영업일 기준 7일 이내 처리 예정입니다.</div>
        </div>
      `)}
      ${fieldSet('답변 작성', 1, `
        ${formRow('답변 내용', '<textarea class="textarea" rows="5" placeholder="작성자에게 보낼 답변을 입력하세요.">환불 처리가 완료되었습니다. 3~5 영업일 내 입금 확인 부탁드립니다.</textarea>', { required: true })}
      `)}`,
    footer: `
      <button class="btn btn-secondary">닫기</button>
      <button class="btn btn-primary">답변 등록 · 상태 저장</button>`,
  }),

  'bo-lp-inquiry-detail.html': lpPage({
    title: '시험장 위치 문의',
    sub: '작성자 user01@example.com · 작성일 2026-05-18 · 일반글',
    size: 'wide',
    label: '문의 게시판 → 상세 LP',
    body: `
      ${fieldSet('문의 내용', 1, `
        ${kv('카테고리', '<span class="pill" style="background:var(--bg-3)">시험</span>')}
        ${kv('본문', '<pre style="background:var(--bg-2);padding:10px;border-radius:6px;font-size:13;white-space:pre-wrap;font-family:inherit;color:var(--text)">양곤대학교 흘라잉캠퍼스 시험장의 정확한 위치와 당일 입실 시간을 알려주세요.</pre>')}
      `)}
      ${fieldSet('답변 이력 (0)', 1, `
        <div class="empty" style="padding:12px 0">등록된 답변이 없습니다</div>
      `)}
      ${fieldSet('답변 작성', 1, `
        ${formRow('답변 내용', '<textarea class="textarea" rows="5" placeholder="답변 내용을 입력하세요.">흘라잉캠퍼스 정문 기준 1층 강의실 A·B입니다. 입실은 08:30~09:00입니다.</textarea>', { required: true })}
      `)}
      ${fieldSet('댓글/대댓글 (0)', 1, `
        <div style="padding:12px;background:var(--bg-2);border-radius:6px;font-size:13;color:var(--text-3)">댓글이 없습니다. 일반글은 「공개」 체크로 댓글 공개 여부를 선택할 수 있습니다.</div>
      `)}`,
    footer: `
      <button class="btn btn-secondary">닫기</button>
      <button class="btn btn-primary">답변 등록 · 완료 처리</button>`,
  }),

  'bo-lp-member-detail.html': lpPage({
    title: '회원 상세 — 김민수',
    sub: '회원ID <code class="code-id">mem-0042</code>',
    size: 'wide',
    label: '회원 관리 → 상세 LP',
    body: `
      ${fieldSet('프로필', 2, `
        ${kv('한글 성명', '김민수')}
        ${kv('영문 성명', 'Kim Minsu')}
        ${kv('이메일', 'demo@topik-mm.local')}
        ${kv('연락처', '<span class="code-id">+95 9 1234 5678</span>')}
        ${kv('국적', '미얀마')}
        ${kv('가입 유형', pill('active', '일반'))}
        ${kv('가입일', '<span class="code-id">2026-01-15</span>')}
        ${kv('마지막 로그인', '<span class="code-id">2026-05-28 09:12</span>')}
        ${kv('상태', pill('active', '활성'))}
        ${kv('마케팅 수신', '동의')}
      `)}
      ${fieldSet('접수 이력 (1)', 1, `
        <table class="dg" style="font-size:12.5">
          <thead><tr><th>회차</th><th>급수</th><th>시험장</th><th>상태</th><th>수험번호</th></tr></thead>
          <tbody>
            <tr><td>제107회 TOPIK</td><td>Ⅰ</td><td>양곤대학교 흘라잉캠퍼스</td><td>${pill('pay', '수납대기')}</td><td class="code">—</td></tr>
          </tbody>
        </table>
      `)}
      ${fieldSet('관리자 처리 이력 (2)', 1, `
        <div class="timeline">
          <div class="ev">
            <div class="when">2026-05-28 14:32</div>
            <div class="what">접수자 · <b>등록</b></div>
            <div class="who">처리자 <code class="code-id">system</code></div>
          </div>
          <div class="ev approved">
            <div class="when">2026-05-29 10:05</div>
            <div class="what">사진 · <b>승인</b></div>
            <div class="who">처리자 <code class="code-id">admin-dev@topik-mm.local</code></div>
          </div>
        </div>
      `)}`,
    footer: `
      <button class="btn btn-secondary">닫기</button>
      <button class="btn btn-primary">정보 수정</button>`,
  }),

  'bo-lp-admin-access-detail.html': lpPage({
    title: '관리자 접근 로그 상세 — 로그인',
    sub: 'admin-dev@topik-mm.local · <span class="code-id">2026-06-11 13:42</span>',
    size: 'wide',
    label: '관리자 접근 로그 → 상세 LP',
    body: `
      ${fieldSet('기본', 2, `
        ${kv('접근 시각', '<span class="code-id">2026-06-11 13:42:08</span>')}
        ${kv('액션', '<span class="pill" style="background:var(--bg-3)">로그인</span>')}
        ${kv('관리자 ID', '<code class="code-id">admin-dev@topik-mm.local</code>')}
        ${kv('이름', 'Dev Admin')}
        ${kv('IP', '<code class="code-id">127.0.0.1</code>')}
        ${kv('결과', pill('approved', '성공'))}
        ${kv('로그 ID', '<code class="code-id">aal-20260611-0042</code>')}
      `)}
      ${fieldSet('환경 정보', 1, `
        ${kv('User-Agent', '<code class="code-id" style="font-size:12px;word-break:break-all">Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0</code>')}
        ${kv('메모', '—')}
      `)}
      <div style="font-size:11.5;color:var(--text-3)">※ 접근 로그는 수정/삭제 불가(append-only). 로그인 5회 실패 시 30분 잠금 정책 적용.</div>`,
    footer: `
      <a class="btn btn-secondary">관리자 계정 바로가기 →</a>
      <button class="btn btn-primary">닫기</button>`,
  }),

  'bo-lp-member-access-detail.html': lpPage({
    title: '회원 접근 로그 상세 — 페이지접근',
    sub: 'mem-0042 · demo@topik-mm.local',
    size: 'wide',
    label: '회원 접근 로그 → 상세 LP',
    body: `
      ${fieldSet('기본', 2, `
        ${kv('접근 시각', '<span class="code-id">2026-06-11 09:15:22</span>')}
        ${kv('액션', '<span class="pill" style="background:var(--bg-3)">페이지접근</span>')}
        ${kv('회원 ID', '<code class="code-id">mem-0042</code>')}
        ${kv('이메일', 'demo@topik-mm.local')}
        ${kv('IP', '<code class="code-id">203.0.113.18</code>')}
        ${kv('경로', '<code class="code-id">/mypage.html</code>')}
        ${kv('결과', pill('approved', '성공'))}
        ${kv('로그 ID', '<code class="code-id">mal-20260611-0088</code>')}
      `)}
      ${fieldSet('환경 정보', 1, `
        ${kv('User-Agent', '<code class="code-id" style="font-size:12px;word-break:break-all">Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148</code>')}
        ${kv('메모', '—')}
      `)}
      <div style="font-size:11.5;color:var(--text-3)">※ 개인정보 접근 로그 — 누가·언제·어떤 데이터를 조회했는지 감사 추적용. 수정/삭제 불가.</div>`,
    footer: `
      <a class="btn btn-secondary">회원 관리 바로가기 →</a>
      <button class="btn btn-primary">닫기</button>`,
  }),

  'bo-lp-perm-history-detail.html': lpPage({
    title: '권한 변경 상세 — 메뉴 권한 변경',
    sub: '권한매트릭스 · <span class="code-id">2026-06-09 14:22:10</span>',
    size: 'wide',
    label: '권한 변경 이력 → 상세 LP',
    body: `
      ${fieldSet('기본', 2, `
        ${kv('변경 시각', '<span class="code-id">2026-06-09 14:22:10</span>')}
        ${kv('변경 유형', '<span class="pill" style="background:var(--bg-3)">메뉴 권한 변경</span>')}
        ${kv('변경자', '<code class="code-id">admin-dev@topik-mm.local</code>')}
        ${kv('IP', '<code class="code-id">127.0.0.1</code>')}
        ${kv('대상', '<code class="code-id">권한매트릭스</code>')}
        ${kv('등급', '일반관리자')}
        ${kv('메뉴', '<code class="code-id">applicants</code>')}
        ${kv('로그 ID', '<code class="code-id">ph-20260609-0015</code>')}
      `)}
      ${fieldSet('변경 사유', 1, `
        <div style="background:var(--bg-2);padding:10px;border-radius:6px;font-size:13;color:var(--text-2);white-space:pre-wrap">일반관리자 · applicants 메뉴 수험번호·보내기 권한 제거</div>
      `)}
      ${fieldSet('변경 내용 (Diff)', 1, `
        <div class="diff">
          <div>
            <div class="h">Before</div>
            <pre class="before">{
  "role": "general",
  "menu": "applicants",
  "actions": ["view", "photo", "pay", "approve", "reject", "exam", "export"]
}</pre>
          </div>
          <div>
            <div class="h">After</div>
            <pre class="after">{
  "role": "general",
  "menu": "applicants",
  "actions": ["view", "photo", "pay", "approve", "reject"]
}</pre>
          </div>
        </div>
      `)}
      <div style="font-size:11.5;color:var(--text-3)">※ 권한 변경 이력은 append-only. 활성 세션은 다음 API 요청 시 새 권한이 적용됩니다.</div>`,
    footer: `
      <a class="btn btn-secondary">관리자 권한 바로가기 →</a>
      <button class="btn btn-primary">닫기</button>`,
  }),

  'bo-lp-audit-detail.html': lpPage({
    title: '처리 이력 상세',
    sub: '이력 ID <code class="code-id">aud-20260529-0042</code>',
    size: 'sm',
    label: '처리 이력 → 상세 LP',
    body: `
      ${fieldSet('기본', 1, `
        ${kv('처리 시각', '<span class="code-id">2026-05-29 10:05:32</span>')}
        ${kv('처리자', 'admin-dev@topik-mm.local')}
        ${kv('IP', '127.0.0.1')}
        ${kv('유형', '사진')}
        ${kv('대상 ID', '<code class="code-id">app-2026-00142</code>')}
        ${kv('액션', pill('approved', '승인'))}
      `)}
      ${fieldSet('변경 내용', 1, `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13">
          <div style="padding:10px;background:var(--bg-2);border-radius:6px">
            <div style="font-size:11.5;color:var(--text-3);margin-bottom:6px">변경 전</div>
            <code>photoStatus: pending</code>
          </div>
          <div style="padding:10px;background:var(--st-approved-bg);border-radius:6px">
            <div style="font-size:11.5;color:var(--text-3);margin-bottom:6px">변경 후</div>
            <code>photoStatus: approved</code>
          </div>
        </div>
      `)}
      ${fieldSet('메모', 1, `
        <pre style="background:var(--bg-2);padding:10px;border-radius:6px;font-size:13;font-family:inherit;color:var(--text-2)">사진 심사 승인</pre>
      `)}`,
    footer: `<button class="btn btn-secondary">닫기</button>`,
  }),

  'bo-lp-admin-edit.html': lpPage({
    title: '관리자 등록',
    sub: '신규 계정',
    label: '관리자 계정 → 등록 LP',
    body: `
      ${fieldSet('계정 정보', 2, `
        ${formRow('이름', '<input class="input" value="홍길동"/>', { required: true })}
        ${formRow('이메일', '<input class="input" value="admin02@topik-mm.local"/>', { required: true })}
        ${formRow('권한 등급', '<select class="select"><option>최고관리자</option><option selected>일반관리자</option><option>조회관리자</option></select>', { required: true })}
        ${formRow('초기 비밀번호', '<input type="password" class="input" value="TempPass!2026"/>', { required: true, hint: '8자 이상 · 영문·숫자·특수문자 · 첫 로그인 시 변경 강제' })}
        ${formRow('비고', '<textarea class="textarea" rows="2" placeholder="담당 업무 등"></textarea>', { span: 2 })}
      `)}`,
    footer: `
      <button class="btn btn-secondary">취소</button>
      <button class="btn btn-primary">등록</button>`,
  }),

  'bo-lp-term-edit.html': lpPage({
    title: '약관 수정 — 이용약관 v2.1 (초안)',
    sub: '약관 ID <code class="code-id">term-terms-v2.1</code>',
    size: 'wide',
    label: '약관 관리 → 등록/수정 LP',
    body: `
      <div class="seg" style="margin-bottom:14px">
        <button class="active">KO</button><button>MY</button><button>EN</button>
      </div>
      ${fieldSet('기본', 2, `
        ${formRow('종류', '<select class="select"><option selected>이용약관</option><option>개인정보</option><option>마케팅</option></select>')}
        ${formRow('버전', '<input class="input" value="v2.1"/>', { required: true })}
        ${formRow('게시 예정일', '<input type="date" class="input" value="2026-06-01"/>')}
        ${formRow('상태', '<div class="input" style="background:var(--bg-2);cursor:default">초안</div>')}
      `)}
      ${fieldSet('본문', 1, `
        <div id="term-editor" style="border:1px solid var(--border);border-radius:6px;min-height:160px;padding:12px;background:#fff;font-size:14px;line-height:1.65">
          <h4 style="margin-bottom:8px">제1조 (목적)</h4>
          <p>본 약관은 TOPIK Myanmar 시험 접수 서비스 이용에 관한 사항을 규정합니다.</p>
        </div>
      `)}`,
    footer: `
      <button class="btn btn-secondary">취소</button>
      <button class="btn btn-primary">저장</button>`,
  }),
};

fs.mkdirSync(OUT, { recursive: true });
for (const [file, html] of Object.entries(pages)) {
  fs.writeFileSync(path.join(OUT, file), html, 'utf8');
}
console.log(`Generated ${Object.keys(pages).length} BO LP HTML files → ${OUT}`);
