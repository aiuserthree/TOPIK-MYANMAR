/**
 * BO 처리 이력 — before/after JSON 을 비개발자가 읽을 수 있는 한국어로 변환.
 * 표시 전용 모듈. 저장 값은 손대지 않으며, 원본 JSON 은 화면에서 접어둔 채 그대로 보존한다.
 */
(function (g) {
  'use strict';

  // ---------------------------------------------------------------- 항목 이름
  var FIELD_LABELS = {
    // 공통
    id: 'ID', status: '상태', title: '제목', name: '이름', email: '이메일',
    memo: '메모', category: '분류', role: '권한 등급', rev: '수정 버전',
    is_active: '사용 여부', is_published: '게시 여부', is_pinned: '상단 고정',
    is_deleted: '삭제 여부', sort_order: '노출 순서',
    created_at: '등록 일시', updated_at: '수정 일시', deleted_at: '삭제 일시',
    published_at: '게시 일시',

    // 접수자
    exam_level: '시험 등급', submission_id: '접수 묶음 번호', application_no: '접수번호',
    exam_number: '수험번호', exam_number_visible: '수험번호 공개',
    payment_status: '수납 상태', payment_receipt_no: '영수증 번호',
    payment_memo: '수납 메모', paid_at: '수납 일시', payment_cancel_reason: '수납 취소 사유',
    reject_reason: '반려 사유', cancel_reason: '취소 사유', cancelled_at: '취소 일시',
    approved_at: '승인 일시',
    photo_review_status: '사진 심사 상태', photo_reject_code: '사진 반려 사유',
    photo_reject_note: '사진 반려 메모',
    info_review_status: '정보 심사 상태', info_reject_code: '정보 반려 사유',
    info_reject_note: '정보 반려 메모',
    exam_venue_id: '시험장', exam_round_id: '회차', user_id: '회원 번호',

    // 회차
    round_no: '회차 번호', exam_date: '시험일', result_date: '합격 발표일',
    registration_start_at: '접수 시작', registration_end_at: '접수 마감',
    payment_start_at: '응시료 납부 시작', payment_end_at: '응시료 납부 마감',
    fee_level_i: 'TOPIK Ⅰ 응시료', fee_level_ii: 'TOPIK Ⅱ 응시료',
    capacity: '전체 정원', capacity_level_i: 'TOPIK Ⅰ 정원', capacity_level_ii: 'TOPIK Ⅱ 정원',
    registration_status: '접수 상태',
    exam_number_visible_at: '수험번호 공개 시각', exam_numbers_assigned_at: '수험번호 부여 시각',
    venue_ids: '지정 시험장',
    purged: '함께 삭제된 자료', applications_deleted: '삭제된 접수',
    submissions_deleted: '삭제된 접수 묶음',

    // 시험장
    venue_code: '시험장 코드', name_ko: '이름(한국어)', name_en: '이름(영문)',
    name_my: '이름(미얀마어)', address: '주소',
    country_code: '국가 코드', region_code: '지역 코드',

    // 공지·FAQ·약관
    title_my: '제목(미얀마어)', title_en: '제목(영문)',
    body_html: '본문(한국어)', body_ko: '본문(한국어)',
    body_my: '본문(미얀마어)', body_en: '본문(영문)',
    display_start_at: '노출 시작', display_end_at: '노출 종료',
    view_count: '조회수', attachment_file_ids: '첨부파일',
    queued: '메일 발송 예약', notice_title: '공지 제목',
    question_ko: '질문(한국어)', question_my: '질문(미얀마어)', question_en: '질문(영문)',
    answer_ko: '답변(한국어)', answer_my: '답변(미얀마어)', answer_en: '답변(영문)',
    term_type: '약관 종류', version: '버전', effective_at: '시행일',

    // 회원·관리자
    birth_date: '생년월일', gender: '성별', nationality: '국적',
    first_language: '제1언어', phone: '연락처',
    job_code: '직업', motive_code: '응시 동기', purpose_code: '응시 목적',
    preferred_lang: '선호 언어', marketing_opt_in: '마케팅 수신 동의',
    signup_provider: '가입 경로', last_login_at: '최근 로그인',
    withdrawn_at: '탈퇴 일시', failed_login_count: '로그인 실패 횟수',
    must_change_password: '첫 로그인 시 비밀번호 변경',
    board_notify_opt_in: '게시판 알림 수신', matrix: '메뉴 권한',

    // 게시판
    workflow_status: '처리 상태', board_type: '게시판 종류', is_secret: '비밀글 여부',
    admin_replied_at: '답변 일시', admin_replier_id: '답변한 관리자(번호)',

    // 일괄 처리·내보내기 결과
    included: '포함된 사진', missing: '누락된 사진', files: '생성된 파일',
    rows: '포함된 인원', count: '처리 건수', groups: '묶음 수', updated: '반영된 건수',
    skipped_photo_not_approved: '건너뜀(사진 미승인)', skipped_not_found: '건너뜀(접수 없음)',
  };

  // ------------------------------------------------------------------ 값 사전
  var APP_STATUS = {
    submitted: '접수 완료', photo_review: '사진 심사중', payment_pending: '수납 대기',
    approved: '승인 완료', rejected: '반려', cancelled: '취소',
    exam_number_assigned: '수험번호 부여 완료',
  };
  var USER_STATUS = { active: '정상', suspended: '정지', withdrawn: '탈퇴', dormant: '휴면' };
  var ADMIN_STATUS = { active: '사용', inactive: '중지' };
  var TERM_STATUS = { draft: '임시저장', published: '게시중', retired: '폐지' };

  // 같은 status 라도 대상마다 뜻이 달라 유형별로 먼저 찾는다.
  var STATUS_BY_TYPE = {
    '접수자': APP_STATUS, '사진': APP_STATUS,
    '회원': USER_STATUS, '관리자계정': ADMIN_STATUS, '약관': TERM_STATUS,
  };

  var VALUE_MAPS = {
    payment_status: { unpaid: '미납', paid: '수납 완료', refunded: '환불 완료' },
    photo_review_status: { pending: '심사 대기', approved: '승인', rejected: '반려' },
    info_review_status: { pending: '심사 대기', approved: '승인', rejected: '반려' },
    registration_status: { scheduled: '접수 예정', open: '접수중', closed: '접수 마감', revoked: '폐지' },
    role: { super: '최고관리자', admin: '일반관리자', standard: '일반관리자', general: '일반관리자', readonly: '조회관리자', viewer: '조회관리자' },
    workflow_status: {
      received: '접수', in_review: '검토중', answered: '답변 완료',
      completed: '처리 완료', rejected: '반려',
    },
    board_type: { inquiry: '문의 게시판', refund_correction: '환불·정보정정' },
    term_type: { service: '이용약관', privacy: '개인정보 처리방침', marketing: '마케팅 수신' },
    gender: { M: '남성', F: '여성', m: '남성', f: '여성' },
    preferred_lang: { ko: '한국어', my: '미얀마어', en: '영어' },
    signup_provider: { email: '이메일 가입', google: 'Google 가입' },
    category: {
      registration: '접수', payment: '접수', photo: '접수', exam: '시험',
      result: '결과', other: '기타', etc: '기타', general: '기타',
      notice: '공지', event: '행사',
    },
    exam_level: { I: 'TOPIK Ⅰ', II: 'TOPIK Ⅱ', '1': 'TOPIK Ⅰ', '2': 'TOPIK Ⅱ' },
  };

  // true/false 를 항목 뜻에 맞는 한국어로.
  var BOOL_LABELS = {
    is_published: ['게시함', '게시 안 함'],
    is_active: ['사용', '사용 안 함'],
    is_pinned: ['상단 고정', '고정 안 함'],
    is_deleted: ['삭제됨', '정상'],
    exam_number_visible: ['공개', '비공개'],
    marketing_opt_in: ['수신 동의', '수신 거부'],
    board_notify_opt_in: ['받음', '받지 않음'],
    must_change_password: ['필요', '불필요'],
    dry_run: ['시뮬레이션(실제 반영 안 함)', '실제 반영'],
    is_secret: ['비밀글', '공개글'],
  };

  var JOB_LABELS = {
    1: '학생', 2: '공무원', 3: '회사원', 4: '자영업',
    5: '주부', 6: '교사', 7: '무직', 8: '기타',
  };
  var MOTIVE_LABELS = {
    1: '방송', 2: '신문', 3: '잡지', 4: '교육기관', 5: '포스터', 6: '친지',
    7: '친구', 8: '인터넷', 9: '기타', 10: '지인(가족·친구 등)', 11: '토픽 홈페이지',
  };
  var PURPOSE_LABELS = {
    1: '유학', 2: '취업', 3: '관광', 4: '학술연구', 5: '한국어 실력 확인',
    6: '한국문화 이해', 7: '기타', 8: '비자(VISA·영주권)', 9: '학점 취득',
    10: '사회통합프로그램', 15: '체류자격 관리',
  };
  var CODE_LABELS = { job_code: JOB_LABELS, motive_code: MOTIVE_LABELS, purpose_code: PURPOSE_LABELS };

  var COUNT_KEYS = {
    included: 1, missing: 1, rows: 1, count: 1, updated: 1, queued: 1,
    skipped_photo_not_approved: 1, skipped_not_found: 1,
    applications_deleted: 1, submissions_deleted: 1, view_count: 1, failed_login_count: 1,
  };
  var CAPACITY_KEYS = { capacity: 1, capacity_level_i: 1, capacity_level_ii: 1 };
  var FEE_KEYS = { fee_level_i: 1, fee_level_ii: 1 };
  var FILE_KEYS = { files: 1, groups: 1 };
  var LONG_TEXT_KEYS = {
    body_html: 1, body_ko: 1, body_my: 1, body_en: 1,
    answer_ko: 1, answer_my: 1, answer_en: 1,
    question_ko: 1, question_my: 1, question_en: 1,
    address: 1, memo: 1, payment_memo: 1,
    reject_reason: 1, cancel_reason: 1, payment_cancel_reason: 1,
    photo_reject_note: 1, info_reject_note: 1,
  };

  // 메뉴 권한(matrix) 라벨 — data.js 정의를 그대로 빌려 쓴다.
  function permMenuLabel(menuId) {
    var DS = g.DataStore;
    var secs = (DS && DS.permSections) || [];
    for (var i = 0; i < secs.length; i++) {
      for (var j = 0; j < secs[i].menus.length; j++) {
        if (secs[i].menus[j].id === menuId) return secs[i].menus[j].label;
      }
    }
    return menuId;
  }
  function permActionLabel(action) {
    var DS = g.DataStore;
    return (DS && DS.permActions && DS.permActions[action]) || action;
  }
  function permRoleLabel(role) {
    return VALUE_MAPS.role[role] || role;
  }

  // ------------------------------------------------------------------- 포맷터
  function fmtNum(n) {
    try { return new Intl.NumberFormat('ko-KR').format(n); } catch (e) { return String(n); }
  }

  var ISO_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?/;

  /** ISO 일시 → '2026-08-19 14:30' / 날짜만 있으면 '2026-08-19'. 변환 실패 시 원본. */
  function fmtWhen(value) {
    var s = String(value);
    if (!ISO_RE.test(s)) return s;
    var datePart = s.slice(0, 10);
    var timeMatch = s.slice(10).match(/\d{2}:\d{2}/);
    return timeMatch ? datePart + ' ' + timeMatch[0] : datePart;
  }

  function stripHtml(s) {
    return String(s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function shorten(s, max) {
    var t = String(s);
    if (t.length <= max) return t;
    return t.slice(0, max) + '… (총 ' + fmtNum(t.length) + '자)';
  }

  function isDateKey(key) {
    return /(_at|_date)$/.test(key);
  }

  /** 값 하나를 사람이 읽는 한국어로. type 은 '접수자'·'회원' 같은 처리 이력 유형. */
  function valueText(key, value, type) {
    if (value === null || value === undefined || value === '') return '없음';

    if (typeof value === 'boolean') {
      var pair = BOOL_LABELS[key];
      if (pair) return value ? pair[0] : pair[1];
      return value ? '예' : '아니오';
    }

    if (Array.isArray(value)) {
      if (!value.length) return '없음';
      if (key === 'venue_ids') return value.length + '개 시험장 지정';
      if (key === 'attachment_file_ids') return '첨부파일 ' + value.length + '개';
      return value.map(function (v) { return valueText(key, v, type); }).join(', ');
    }

    if (typeof value === 'object') {
      var keys = Object.keys(value);
      if (!keys.length) return '없음';
      return keys.map(function (k) {
        return fieldLabel(k) + ' ' + valueText(k, value[k], type);
      }).join(' · ');
    }

    if (typeof value === 'number') {
      if (CODE_LABELS[key]) return (CODE_LABELS[key][value] || '기타') + '(' + value + ')';
      if (FEE_KEYS[key]) return '$' + fmtNum(value) + ' USD';
      if (CAPACITY_KEYS[key]) return value > 0 ? fmtNum(value) + '명' : '미정(0)';
      if (COUNT_KEYS[key]) return fmtNum(value) + '건';
      if (FILE_KEYS[key]) return fmtNum(value) + '개';
      if (key === 'round_no') return '제' + value + '회';
      return fmtNum(value);
    }

    var s = String(value);

    // 유형별 status 사전 → 항목별 사전 순으로 찾는다.
    if (key === 'status') {
      var byType = STATUS_BY_TYPE[type];
      if (byType && byType[s]) return byType[s];
      if (APP_STATUS[s] || USER_STATUS[s] || TERM_STATUS[s] || ADMIN_STATUS[s]) {
        return APP_STATUS[s] || USER_STATUS[s] || TERM_STATUS[s] || ADMIN_STATUS[s];
      }
    }
    if (VALUE_MAPS[key] && VALUE_MAPS[key][s]) return VALUE_MAPS[key][s];
    if (key === 'exam_level') return VALUE_MAPS.exam_level[s.toUpperCase()] || s;
    if (isDateKey(key) || ISO_RE.test(s)) return fmtWhen(s);
    if (LONG_TEXT_KEYS[key]) {
      var plain = /<[a-z][\s\S]*>/i.test(s) ? stripHtml(s) : s;
      return plain ? shorten(plain, 60) : '없음';
    }
    return shorten(s, 120);
  }

  function fieldLabel(key) {
    return FIELD_LABELS[key] || key;
  }

  // ------------------------------------------------------- 메뉴 권한(matrix) 비교
  /** {admin:{menu:[act]}, readonly:{...}} 두 벌을 메뉴 단위 행으로 펼친다. */
  function matrixRows(before, after) {
    var rows = [];
    var roles = {};
    [before, after].forEach(function (m) {
      Object.keys(m || {}).forEach(function (r) { roles[r] = 1; });
    });
    Object.keys(roles).forEach(function (role) {
      var b = (before && before[role]) || {};
      var a = (after && after[role]) || {};
      var menus = {};
      Object.keys(b).forEach(function (k) { menus[k] = 1; });
      Object.keys(a).forEach(function (k) { menus[k] = 1; });
      Object.keys(menus).forEach(function (menu) {
        var bl = (b[menu] || []).slice().sort().join('|');
        var al = (a[menu] || []).slice().sort().join('|');
        if (bl === al) return;
        var toText = function (list) {
          if (!list || !list.length) return '권한 없음';
          return list.map(permActionLabel).join(', ');
        };
        rows.push({
          key: 'matrix.' + role + '.' + menu,
          label: permRoleLabel(role) + ' · ' + permMenuLabel(menu),
          before: toText(b[menu]),
          after: toText(a[menu]),
          kind: 'changed',
        });
      });
    });
    return rows;
  }

  // --------------------------------------------------------------- 변경 내용 비교
  function sameValue(a, b) {
    if (a === b) return true;
    if (a == null && b == null) return true;
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
  }

  /** 결과 묶음(purged 등) 중첩 객체를 한 단계 펼친다. 못 펼치면 null. */
  function flattenNested(key, value, type) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    var sub = Object.keys(value);
    if (!sub.length || sub.length > 8) return null;
    var parent = FIELD_LABELS[key];
    return sub.map(function (sk) {
      return {
        key: key + '.' + sk,
        label: (parent ? parent + ' · ' : '') + fieldLabel(sk),
        before: '',
        after: valueText(sk, value[sk], type),
      };
    });
  }

  /**
   * before/after 를 세 갈래로 나눈다. 한쪽에만 있는 값을 '→ 없음' 으로 보여 주면
   * 지워진 것처럼 읽히므로, 기록이 없는 쪽은 아예 다른 묶음으로 분리한다.
   *
   * @returns {{
   *   mode: 'both'|'after'|'before'|'none',
   *   changed: Array,  // 변경 전·후가 모두 기록된 항목
   *   result: Array,   // 이번 처리로 저장된 값만 기록된 항목
   *   context: Array,  // 처리 직전 상태로만 기록된 항목
   *   unchanged: number, total: number
   * }}
   */
  function diffRows(before, after, type) {
    var hasB = !!before && typeof before === 'object' && Object.keys(before).length > 0;
    var hasA = !!after && typeof after === 'object' && Object.keys(after).length > 0;
    var out = { mode: 'none', changed: [], result: [], context: [], unchanged: 0, total: 0 };
    if (!hasB && !hasA) return out;

    out.mode = hasB && hasA ? 'both' : (hasA ? 'after' : 'before');

    var keys = [];
    var seen = {};
    [after, before].forEach(function (o) {
      Object.keys(o || {}).forEach(function (k) {
        if (!seen[k]) { seen[k] = 1; keys.push(k); }
      });
    });

    keys.forEach(function (key) {
      var b = before ? before[key] : undefined;
      var a = after ? after[key] : undefined;
      var hasBk = b !== undefined;
      var hasAk = a !== undefined;

      if (key === 'matrix') {
        var mr = matrixRows(b, a);
        if (mr.length) out.changed = out.changed.concat(mr);
        else out.unchanged += 1;
        return;
      }

      if (hasBk && hasAk) {
        if (sameValue(b, a)) { out.unchanged += 1; return; }
        out.changed.push({
          key: key, label: fieldLabel(key),
          before: valueText(key, b, type), after: valueText(key, a, type),
        });
        return;
      }

      if (hasAk) {
        var nested = flattenNested(key, a, type);
        if (nested) { out.result = out.result.concat(nested); return; }
        out.result.push({ key: key, label: fieldLabel(key), before: '', after: valueText(key, a, type) });
        return;
      }

      out.context.push({ key: key, label: fieldLabel(key), before: valueText(key, b, type), after: '' });
    });

    out.total = out.changed.length + out.result.length + out.context.length;
    return out;
  }

  var SECTIONS = {
    changed: {
      title: '바뀐 항목',
      hint: '변경 전·후 값이 모두 남아 있는 항목입니다.',
    },
    result: {
      title: '이번 처리로 저장된 값',
      hint: '처리 결과로 기록된 값입니다. 같은 항목의 이전 값은 이력에 남아 있지 않습니다.',
    },
    context: {
      title: '처리 직전 상태',
      // 대상 자체가 사라진 삭제·폐지와, 일부 필드만 patch 된 수정은 뜻이 다르다.
      hint: '처리 직전 상태로 함께 남긴 값입니다. 이 항목들이 지워졌다는 뜻은 아닙니다.',
      hintWhenOnly: '삭제·폐지되기 전에 저장돼 있던 값입니다. 복구하거나 대조할 때 쓰는 기록입니다.',
    },
  };

  function sectionTitle(name) { return (SECTIONS[name] || {}).title || ''; }

  /** mode 를 넘기면 그 상황에 맞는 설명을 고른다. */
  function sectionHint(name, mode) {
    var sec = SECTIONS[name] || {};
    if (name === 'context' && mode === 'before') return sec.hintWhenOnly;
    return sec.hint || '';
  }

  // ------------------------------------------------- 전·후 값이 없는 처리 설명
  /**
   * 운영 로그의 약 70%는 before/after 를 남기지 않는다(로그인·사진심사·수납 등).
   * 표가 비면 상세가 통째로 사라져 보이므로, 무슨 처리였는지 문장으로 대신 설명한다.
   *
   * kind - 'view': 값을 바꾸지 않는 열람·인증 기록
   *        'change': 값은 바뀌지만 전·후를 이력에 남기지 않는 처리
   */
  var ACTION_NOTES = {
    login: { what: '관리자 콘솔에 로그인했습니다.', kind: 'view' },
    logout: { what: '관리자 콘솔에서 로그아웃했습니다.', kind: 'view' },
    board_secret_view: { what: '문의 게시판의 비밀글 본문을 열람했습니다.', kind: 'view' },
    board_comment: { what: '게시글에 관리자 댓글을 남겼습니다.', kind: 'change' },
    photos_export: { what: '접수 사진을 압축 파일로 내려받았습니다.', kind: 'view' },
    roster_export: { what: '연명부를 내려받았습니다.', kind: 'view' },
    payment_roster_export: { what: '수납 명부를 내려받았습니다.', kind: 'view' },

    photo_review_approve: { what: '접수 사진을 심사해 승인했습니다.', kind: 'change' },
    photo_review_reject: { what: '접수 사진을 심사해 반려했습니다. 반려 사유는 위 「처리 사유」에 있습니다.', kind: 'change' },
    info_review_approve: { what: '접수 정보를 심사해 승인했습니다.', kind: 'change' },
    info_review_reject: { what: '접수 정보를 심사해 반려했습니다. 반려 사유는 위 「처리 사유」에 있습니다.', kind: 'change' },
    payment_complete: { what: '응시료 수납을 완료 처리했습니다.', kind: 'change' },
    payment_cancel: { what: '응시료 수납을 취소 처리했습니다.', kind: 'change' },
    payment_roster_import: { what: '수납 명부 파일을 올려 수납 상태를 일괄 반영했습니다.', kind: 'change' },
    reject: { what: '접수를 반려했습니다. 사유는 위 「처리 사유」에 있습니다.', kind: 'change' },
    memo: { what: '접수자에게 관리자 메모를 남겼습니다. 메모 내용은 위 「처리 사유」에 있습니다.', kind: 'change' },
    board_reply: { what: '게시글에 답변을 등록했습니다.', kind: 'change' },
    board_delete: { what: '게시글을 삭제했습니다.', kind: 'change' },
    admin_change_password: { what: '본인 관리자 비밀번호를 변경했습니다.', kind: 'change' },
    admin_reset_password: { what: '관리자 비밀번호를 초기화했습니다. 임시 비밀번호가 새로 발급됩니다.', kind: 'change' },
    user_reset_password: { what: '회원 비밀번호를 초기화했습니다.', kind: 'change' },
  };

  var NOTE_TAIL = {
    view: '값을 바꾸는 처리가 아니라 변경 내용이 없습니다.',
    change: '이 처리는 전·후 값을 따로 남기지 않아 비교표가 없습니다.',
  };

  /** 전·후 값이 없을 때 표 대신 보여 줄 설명. actionType 을 모르면 일반 문구. */
  function actionNote(actionType) {
    var n = ACTION_NOTES[actionType];
    if (!n) return '이 처리는 전·후 값을 남기지 않았습니다. 처리 시각·처리자·대상은 위 「기본」에서 확인할 수 있습니다.';
    return n.what + ' ' + NOTE_TAIL[n.kind];
  }

  /** 상세 위쪽에 한 줄로 붙일 요약 — 조사(을/를) 없이 읽히도록 구성한다. */
  function summaryText(result) {
    if (!result || !result.total) return '';
    if (result.changed.length === 1 && !result.result.length) {
      var r0 = result.changed[0];
      return '「' + r0.label + '」 항목이 ' + (r0.before || '없음') + ' → ' + (r0.after || '없음') + ' 로 바뀌었습니다.';
    }
    // 항목이 많으면 앞의 몇 개만 이름을 밝히고 나머지는 개수로 줄인다.
    var LIST_MAX = 4;
    var names = function (rows) {
      var all = rows.map(function (r) { return r.label; });
      if (all.length <= LIST_MAX) return all.join(', ');
      return all.slice(0, LIST_MAX).join(', ') + ' 외 ' + (all.length - LIST_MAX) + '개';
    };
    var parts = [];
    if (result.changed.length) {
      parts.push('바뀐 항목 ' + result.changed.length + '개(' + names(result.changed) + ')');
    }
    if (result.result.length) {
      parts.push('새로 기록된 값 ' + result.result.length + '개(' + names(result.result) + ')');
    }
    if (!parts.length && result.context.length) {
      return '처리 직전 상태 ' + result.context.length + '개 항목이 기록으로 남았습니다 — ' + names(result.context);
    }
    return parts.join(' · ') + '.';
  }

  g.BOAuditReadable = {
    fieldLabel: fieldLabel,
    valueText: valueText,
    diffRows: diffRows,
    summaryText: summaryText,
    sectionTitle: sectionTitle,
    sectionHint: sectionHint,
    actionNote: actionNote,
  };
})(typeof window !== 'undefined' ? window : this);
