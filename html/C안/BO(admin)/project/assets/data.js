// ============================================================
// TOPIK Myanmar — BO mock data store
// Pure plain JS — exposes window.DataStore (no React deps here)
// ============================================================

(function () {
  // ---- Deterministic PRNG so the mock data is stable across reloads ----
  let _seed = 20260528;
  function rand() { _seed = (_seed * 9301 + 49297) % 233280; return _seed / 233280; }
  function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
  function rint(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
  function pad(n, w) { return String(n).padStart(w, '0'); }

  // ---- Master data ----
  const VENUES = [
    { id: 'v01', code: '01', regionCode: '001', region: '양곤', nameKo: '양곤대 흘라잉캠퍼스', nameEn: 'Yangon Univ. Hlaing Campus', address: 'No.1, Pyay Rd, Hlaing Tsp, Yangon', cap: 600, active: true, memo: '— 1차 시험 주 시험장. 책임자: U Aung (운영 합의 후 기재)' },
    { id: 'v02', code: '02', regionCode: '001', region: '양곤', nameKo: '한국문화원', nameEn: 'Korean Cultural Center', address: '#3, Min Yegyaw St, Yangon', cap: 240, active: true, memo: '' },
    { id: 'v03', code: '03', regionCode: '002', region: '만달레이', nameKo: '만달레이 외국어대학교', nameEn: 'Mandalay Univ. of Foreign Languages', address: '78th St, Mandalay', cap: 320, active: true, memo: '' },
    { id: 'v04', code: '04', regionCode: '003', region: '네피도', nameKo: '네피도 한국어교육원', nameEn: 'Naypyidaw Korean Edu. Center', address: 'Zabuthiri, Naypyidaw', cap: 180, active: true, memo: '' },
    { id: 'v05', code: '05', regionCode: '004', region: '몽유와', nameKo: '몽유와대학교', nameEn: 'Monywa University', address: 'Monywa, Sagaing', cap: 120, active: false, memo: '2026-1차 운영 보류' },
  ];

  const REGIONS = [
    { code: '001', name: '양곤(Yangon)' },
    { code: '002', name: '만달레이(Mandalay)' },
    { code: '003', name: '네피도(Naypyidaw)' },
    { code: '004', name: '몽유와(Monywa)' },
  ];

  const SESSIONS = [
    { id: 's107', no: 107, name: '제107회 TOPIK', applyStart: '2026-07-17', applyEnd: '2026-07-21', examDate: '2026-10-18', resultDate: '', cap: 1200, feeI: 25, feeII: 25, venues: ['v01','v02','v03','v04'], status: 'open', applicants: 0 },
    { id: 's106', no: 106, name: '제106회 TOPIK', applyStart: '2026-06-01', applyEnd: '2026-07-21', examDate: '2026-09-19', resultDate: '2026-10-20', cap: 1200, feeI: 25, feeII: 25, venues: ['v01','v02','v03','v04'], status: 'closed', applicants: 0 },
    { id: 's105', no: 105, name: '제105회 TOPIK', applyStart: '2026-02-10', applyEnd: '2026-03-15', examDate: '2026-05-09', resultDate: '2026-06-10', cap: 1000, feeI: 25, feeII: 25, venues: ['v01','v02','v03'], status: 'closed', applicants: 942 },
    { id: 's104', no: 104, name: '제104회 TOPIK', applyStart: '2025-10-01', applyEnd: '2025-10-31', examDate: '2025-12-14', resultDate: '2026-01-15', cap: 1000, feeI: 25, feeII: 25, venues: ['v01','v02','v03'], status: 'closed', applicants: 887 },
  ];

  // ---- Applicants ----
  // Korean given names commonly used here; for myanmar, use sample local names
  const FIRST_KO = ['민지','수아','지호','준영','서윤','하준','지우','예린','다은','시우','채원','윤서','은우','지안','서연'];
  const LAST_KO = ['김','이','박','최','정','강','조','윤','장','임','한','오','신','권','황'];
  const FIRST_EN_MM = ['Aung','Thida','Su Su','Kyaw','Hla','Myo','Khin','Naing','Zaw','Yin','Phyu','Nyein','Thant','Mi Mi','Tun','Win','Ko Ko','Aye','Mya','Min'];
  const LAST_EN_MM = ['Htun','Maung','Win','Oo','Kyi','Mon','Hlaing','Aung','Lin','Soe','Tun','Wai','Naing','Phyo'];
  const NATIONS = ['미얀마','미얀마','미얀마','미얀마','한국','중국','베트남'];
  const L1 = ['미얀마어','버마어','샨어','카렌어','한국어','중국어'];
  const JOBS = ['학생','회사원','공무원','자영업','전문직','주부','무직','교사','군인','농업·어업','기타','미상'];
  const MOTIVES = ['유학 및 진학','취업 및 이민','자격 취득','개인적 관심','학업 요건','장학금 신청','비자 발급','기업 요구','한국 문화 관심','기타','미상'];
  const PURPOSES = ['대학 입학','대학원 입학','취업','비자 발급','장학금','자격증','개인 학습','기업 요구','유학','이민','한국어 교육','연구','교환학생','기타','미상'];
  const STATUSES = ['applied','photo','pay','approved','rejected','cancel','refund'];

  const APPLICANTS = [];
  let seq107 = 1, seq105 = 1;
  // current open session (107) applicants
  for (let i = 1; i <= 78; i++) {
    const lvl = pick(['Ⅰ','Ⅱ','동시']);
    const dual = lvl === '동시';
    const ven = pick(VENUES.filter(v => v.active && ['v01','v02','v03','v04'].includes(v.id)));
    const sx = pick([1,2]);
    const yob = rint(1990, 2006);
    const mob = pad(rint(1, 12), 2);
    const dob = `${yob}${mob}${pad(rint(1,28), 2)}`;
    const nameKo = pick(LAST_KO) + pick(FIRST_KO);
    const nameEn = (pick(FIRST_EN_MM) + ' ' + pick(LAST_EN_MM));
    const photoOk = rand() > 0.18;
    const paid = rand() > 0.35;
    let st;
    if (rand() < 0.04) st = 'cancel';
    else if (!photoOk && rand() < 0.5) st = 'photo';
    else if (!photoOk) st = 'rejected';
    else if (!paid) st = 'pay';
    else if (rand() < 0.86) st = 'approved';
    else st = 'applied';

    // exam number only if approved && paid && (status not in rejected/cancel)
    let exam = '';
    if ((st === 'approved' || st === 'refund') && paid) {
      const lvlCode = (lvl === 'Ⅱ' ? '8' : '7'); // 동시면 두 번호 부여(여기선 Ⅰ만 표기)
      exam = `025001${lvlCode}${ven.code}${pad(seq107++, 4)}`;
    }

    APPLICANTS.push({
      id: 'a' + pad(i, 4),
      sessionId: 's107',
      no: i,
      nameKo, nameEn,
      dob,
      sx,
      nation: pick(NATIONS),
      l1: pick(L1),
      job: pick(JOBS),
      motive: pick(MOTIVES),
      purpose: pick(PURPOSES),
      level: lvl,
      venueId: ven.id,
      photoOk,
      photoStatus: photoOk ? 'approved' : (st === 'rejected' ? 'rejected' : 'pending'),
      paid,
      paidAt: paid ? `2026-07-${pad(rint(24, 26), 2)} ${pad(rint(9,17),2)}:${pad(rint(0,59),2)}` : '',
      receipt: paid ? `R-${pad(rint(10000, 99999), 5)}` : '',
      exam,
      status: st,
      appliedAt: `2026-07-${pad(rint(17, 21), 2)} ${pad(rint(9,18), 2)}:${pad(rint(0,59),2)}`,
      rejectReason: st === 'rejected' ? pick(['사진 부적합','정보 불일치','중복 접수','기타']) : '',
      memo: '',
      email: `applicant${i}@example.com`,
      tel: `+95 9 ${rint(700,999)} ${pad(rint(0,9999), 4)}`,
      accommodation: rand() < 0.05, // 편의지원
    });
  }
  // session 105 (closed): a few historical
  for (let i = 1; i <= 18; i++) {
    APPLICANTS.push({
      id: 'a5' + pad(i, 4),
      sessionId: 's105',
      no: i,
      nameKo: pick(LAST_KO) + pick(FIRST_KO),
      nameEn: pick(FIRST_EN_MM) + ' ' + pick(LAST_EN_MM),
      dob: `${rint(1990,2005)}${pad(rint(1,12),2)}${pad(rint(1,28),2)}`,
      sx: pick([1,2]),
      nation: '미얀마',
      l1: '미얀마어',
      job: pick(JOBS),
      motive: pick(MOTIVES),
      purpose: pick(PURPOSES),
      level: pick(['Ⅰ','Ⅱ']),
      venueId: pick(['v01','v02','v03']),
      photoOk: true, photoStatus: 'approved', paid: true,
      paidAt: `2026-03-${pad(rint(1,15),2)} 11:30`,
      receipt: `R-${pad(rint(10000, 99999), 5)}`,
      exam: `025001${pick(['7','8'])}${pad(rint(1,3),2)}${pad(seq105++, 4)}`,
      status: 'approved',
      appliedAt: `2026-02-${pad(rint(10,28), 2)} 10:00`,
      rejectReason: '', memo: '',
      email: `past${i}@example.com`,
      tel: '+95 9 700 0000',
      accommodation: false,
    });
  }
  SESSIONS.find(s => s.id === 's107').applicants = APPLICANTS.filter(a => a.sessionId === 's107').length;

  // Update SESSIONS[0] applicants count was set above

  // ---- Members ----
  const MEMBERS = [];
  for (let i = 1; i <= 42; i++) {
    const st = rand() < 0.85 ? 'active' : (rand() < 0.5 ? 'inactive' : 'withdrawn');
    MEMBERS.push({
      id: 'm' + pad(i, 4),
      no: i,
      nameKo: pick(LAST_KO) + pick(FIRST_KO),
      nameEn: pick(FIRST_EN_MM) + ' ' + pick(LAST_EN_MM),
      email: `user${i}@example.com`,
      tel: `+95 9 ${rint(700,999)} ${pad(rint(0,9999),4)}`,
      nation: pick(['미얀마','미얀마','미얀마','한국']),
      joinedAt: `2025-${pad(rint(1,12),2)}-${pad(rint(1,28),2)}`,
      lastLogin: `2026-05-${pad(rint(1,28),2)} ${pad(rint(0,23),2)}:${pad(rint(0,59),2)}`,
      status: st,
      reason: st !== 'active' ? pick(['장기 미접속','이용 약관 위반','본인 요청','기타']) : '',
      marketing: rand() < 0.6, // 마케팅 수신동의
      applies: rint(0, 3),
    });
  }

  // ---- Notices ----
  const NOTICES = [
    { id: 'n1', no: 1, cat: '중요', title: '제107회 TOPIK 접수 안내(2026.07.17 ~ 07.21)', author: 'admin01', createdAt: '2026-07-17 09:00', views: 5234, public: true, pin: true, body: '<p>제107회 TOPIK 접수가 시작되었습니다. 접수 기간 및 시험 정보는 다음과 같습니다.</p><ul><li>접수: 2026.07.17(금) ~ 07.21(화)</li><li>응시료 납부(오프라인): 2026.07.24(금) ~ 07.26(일)</li><li>시험일: 2026.10.18(일)</li><li>합격자 발표: 추후 공지</li></ul>' },
    { id: 'n2', no: 2, cat: '접수', title: '응시료 납부 안내 — 양곤 한국문화원 1층', author: 'admin01', createdAt: '2026-06-02 14:00', views: 2812, public: true, pin: true, body: '' },
    { id: 'n3', no: 3, cat: '시험', title: '시험 당일 준비물 안내(신분증·필기구·수험표)', author: 'editor01', createdAt: '2026-06-10 10:15', views: 1455, public: true, pin: false, body: '' },
    { id: 'n4', no: 4, cat: '결과', title: '제105회 TOPIK 합격자 발표 안내', author: 'admin01', createdAt: '2026-06-08 11:00', views: 8932, public: true, pin: false, body: '' },
    { id: 'n5', no: 5, cat: '접수', title: '환불·정정 신청 절차 변경 안내(2026.05.19 시행)', author: 'admin01', createdAt: '2026-05-19 16:30', views: 643, public: true, pin: false, body: '' },
    { id: 'n6', no: 6, cat: '중요', title: '관리자 권한 매트릭스 개정(0526)', author: 'admin01', createdAt: '2026-05-26 09:00', views: 89, public: false, pin: false, body: '' },
  ];

  // ---- FAQ ----
  const FAQS = [
    { id: 'f1', no: 1, cat: '접수', order: 1, question: '접수 취소 및 환불은 어떻게 하나요?', answer: '<p>접수 마감 전: 마이페이지에서 자동 처리. 접수 마감 후: 환불·정정 신청 게시판으로 문의.</p>' },
    { id: 'f2', no: 2, cat: '접수', order: 2, question: '사진은 어떤 규격으로 제출해야 하나요?', answer: '<p>3.5×4.5cm 여권 사진 규격 jpg. 6개월 이내 촬영, 정면, 모자·선글라스 제외.</p>' },
    { id: 'f3', no: 3, cat: '시험', order: 1, question: '수험번호는 언제 발급되나요?', answer: '<p>수납 마감일 이후 일괄 부여됩니다. 정해진 날짜에 접수확인 페이지에서 확인 가능합니다.</p>' },
    { id: 'f4', no: 4, cat: '시험', order: 2, question: '시험 당일 신분증은 무엇이 필요한가요?', answer: '<p>여권 또는 미얀마 NRC 원본. 사본·만료 신분증 불가.</p>' },
    { id: 'f5', no: 5, cat: '결과', order: 1, question: '합격증 재발급은 어떻게 하나요?', answer: '<p>NIIED 공식 사이트에서 직접 신청. 본 사이트에서는 발급되지 않습니다.</p>' },
    { id: 'f6', no: 6, cat: '기타', order: 1, question: '회원 탈퇴 후 재가입은 가능한가요?', answer: '<p>탈퇴 후 30일 경과 시 재가입 가능. 동일 이메일 사용 가능.</p>' },
  ];

  // ---- Refund/Correction posts (전 게시글 비밀글) ----
  const REFUNDS = [];
  for (let i = 1; i <= 24; i++) {
    const type = rand() < 0.45 ? '환불' : '정보정정';
    const st = pick(['접수','검토중','처리완료','반려']);
    REFUNDS.push({
      id: 'r' + pad(i,3), no: i, type, title: type === '환불' ? `응시료 환불 요청(${i})` : `생년월일 정정 요청(${i})`,
      author: `user${rint(1,42)}`,
      createdAt: `2026-${pad(rint(5,7),2)}-${pad(rint(1,28),2)} ${pad(rint(9,18),2)}:${pad(rint(0,59),2)}`,
      status: st,
      hasAnswer: rand() > 0.45,
      assignee: rand() > 0.5 ? 'admin01' : (rand() > 0.5 ? 'editor01' : ''),
      body: type === '환불' ? '응시료를 환불 받고 싶습니다. 영수증 첨부합니다.' : '생년월일이 잘못 등록되었습니다. NRC 사본 첨부합니다.',
      attachments: [type === '환불' ? '영수증.jpg' : 'NRC_사본.jpg'],
      comments: [],
    });
  }

  // ---- Inquiry board ----
  const INQUIRIES = [];
  const INQ_CATS = ['접수','시험','기타'];
  for (let i = 1; i <= 28; i++) {
    const secret = rand() < 0.35;
    const done = rand() > 0.45;
    INQUIRIES.push({
      id: 'q' + pad(i, 3), no: i,
      cat: pick(INQ_CATS),
      secret,
      title: secret ? `[비밀] 문의 ${i}` : `시험 관련 문의 ${i}`,
      author: `user${rint(1,42)}`,
      createdAt: `2026-${pad(rint(4,7),2)}-${pad(rint(1,28),2)} ${pad(rint(9,18),2)}:${pad(rint(0,59),2)}`,
      status: done ? 'done' : 'wait',
      assignee: done ? pick(['admin01','editor01']) : '',
      body: secret ? '비밀글 본문입니다. 관리자 열람 시 처리 이력에 자동 기록됩니다.' : '시험장 위치를 자세히 알고 싶습니다.',
      comments: [],
    });
  }

  // ---- Terms versions ----
  const TERMS = [
    { id: 't1', kind: '이용약관', version: 'v2.0', publishedAt: '2026-05-01', retiredAt: '', status: 'pub', author: 'admin01' },
    { id: 't2', kind: '이용약관', version: 'v1.2', publishedAt: '2025-09-01', retiredAt: '2026-05-01', status: 'retired', author: 'admin01' },
    { id: 't3', kind: '개인정보', version: 'v3.1', publishedAt: '2026-05-19', retiredAt: '', status: 'pub', author: 'admin01' },
    { id: 't4', kind: '개인정보', version: 'v3.2', publishedAt: '', retiredAt: '', status: 'draft', author: 'admin01' },
    { id: 't5', kind: '마케팅', version: 'v1.0', publishedAt: '2025-09-01', retiredAt: '', status: 'pub', author: 'admin01' },
  ];

  // ---- Admin accounts ----
  const ADMINS = [
    { id: 'admin01', name: '김관리', email: 'admin01@embassy.kr', role: 'super', lastLogin: '2026-05-28 09:12', lastIp: '203.0.113.42', status: 'active', note: '운영 책임' },
    { id: 'admin02', name: '이슈퍼', email: 'admin02@embassy.kr', role: 'super', lastLogin: '2026-05-27 16:48', lastIp: '203.0.113.51', status: 'active', note: '' },
    { id: 'editor01', name: '박편집', email: 'editor01@embassy.kr', role: 'general', lastLogin: '2026-05-28 08:30', lastIp: '203.0.113.62', status: 'active', note: '콘텐츠 편집' },
    { id: 'editor02', name: '정담당', email: 'editor02@embassy.kr', role: 'general', lastLogin: '2026-05-26 14:00', lastIp: '203.0.113.62', status: 'active', note: '접수 처리' },
    { id: 'viewer01', name: '최조회', email: 'viewer01@embassy.kr', role: 'viewer', lastLogin: '2026-05-20 10:00', lastIp: '203.0.113.71', status: 'active', note: '감사관' },
    { id: 'editor03', name: '홍지원', email: 'editor03@embassy.kr', role: 'general', lastLogin: '2026-04-30 11:20', lastIp: '203.0.113.62', status: 'inactive', note: '휴직' },
  ];

  // ---- Permission matrix (rows = menu, cols = role) ----
  const MATRIX = [
    { menu: '대시보드',                    super: 'rw', general: 'rw', viewer: 'r' },
    { menu: '접수 관리 · 접수자 목록',     super: 'rw', general: 'rw', viewer: 'r' },
    { menu: '접수 관리 · 접수 처리',       super: 'rw', general: 'rw', viewer: 'r' },
    { menu: '접수 관리 · 수험번호 일괄부여', super: 'rw', general: 'no', viewer: 'no' },
    { menu: '시험 관리 · 회차',            super: 'rw', general: 'r',  viewer: 'r' },
    { menu: '시험 관리 · 시험장',          super: 'rw', general: 'r',  viewer: 'r' },
    { menu: '콘텐츠 · 공지사항',           super: 'rw', general: 'rw', viewer: 'r' },
    { menu: '콘텐츠 · FAQ',                super: 'rw', general: 'rw', viewer: 'r' },
    { menu: '콘텐츠 · 환불·정정',          super: 'rw', general: 'rw', viewer: 'r' },
    { menu: '콘텐츠 · 문의게시판',         super: 'rw', general: 'rw', viewer: 'r' },
    { menu: '회원·약관 · 회원 관리',       super: 'rw', general: 'r',  viewer: 'r' },
    { menu: '회원·약관 · 약관 관리',       super: 'rw', general: 'r',  viewer: 'r' },
    { menu: '시스템 · 관리자 계정',        super: 'rw', general: 'no', viewer: 'no' },
    { menu: '시스템 · 관리자 권한',        super: 'rw', general: 'no', viewer: 'no' },
    { menu: '시스템 · 처리 이력',          super: 'rw', general: 'r-own',  viewer: 'r-own' },
    { menu: '시스템 · 관리자 접근 로그',   super: 'rw', general: 'no', viewer: 'no' },
    { menu: '시스템 · 회원 접근 로그',     super: 'rw', general: 'no', viewer: 'no' },
    { menu: '시스템 · 권한 변경 이력',     super: 'rw', general: 'no', viewer: 'no' },
  ];

  // ---- Audit log (seed with realistic entries) ----
  const AUDIT_TYPES = ['접수자','사진','회차','시험장','공지','FAQ','환불·정정','문의','회원','약관','관리자계정'];
  const AUDIT_ACTIONS = ['생성','수정','삭제','승인','반려','수납','수납취소','게시','폐지','정지','탈퇴','비밀번호초기화','로그인','로그아웃','수험번호부여'];
  const AUDIT = [];
  for (let i = 1; i <= 80; i++) {
    const t = pick(AUDIT_TYPES);
    const act = pick(AUDIT_ACTIONS);
    AUDIT.push({
      id: 'log' + pad(i, 4),
      ts: `2026-05-${pad(rint(20,28),2)} ${pad(rint(0,23),2)}:${pad(rint(0,59),2)}:${pad(rint(0,59),2)}`,
      actor: pick(['admin01','admin02','editor01','editor02']),
      ip: pick(['203.0.113.42','203.0.113.51','203.0.113.62','203.0.113.71']),
      type: t,
      targetId: t === '접수자' ? `a${pad(rint(1,78),4)}` : t === '회원' ? `m${pad(rint(1,42),4)}` : t === '공지' ? `n${rint(1,6)}` : t === 'FAQ' ? `f${rint(1,6)}` : t === '회차' ? `s10${rint(4,7)}` : '—',
      action: act,
      before: act === '수정' || act === '반려' ? { status: '검토중', memo: '' } : null,
      after: act === '수정' || act === '반려' ? { status: '반려', memo: '사진 부적합' } : null,
      memo: act === '반려' ? '사진 부적합(정면 아님)' : (act === '수정' ? '담당자 변경' : ''),
    });
  }
  AUDIT.sort((a, b) => b.ts.localeCompare(a.ts));

  // ---- Consent log (약관 동의 이력) ----
  const CONSENTS = [];
  for (let i = 1; i <= 36; i++) {
    CONSENTS.push({
      id: 'c' + pad(i, 3),
      memberId: `m${pad(rint(1,42),4)}`,
      termsKind: pick(['이용약관','개인정보','마케팅']),
      version: pick(['v1.2','v2.0','v3.1','v1.0']),
      ts: `2025-${pad(rint(1,12),2)}-${pad(rint(1,28),2)} ${pad(rint(0,23),2)}:${pad(rint(0,59),2)}`,
      ip: `203.0.${rint(0,255)}.${rint(1,254)}`,
      method: pick(['체크박스','전체 동의']),
    });
  }

  // ---- Admin access log (관리자 로그인·로그아웃·세션) ----
  const ADMIN_ACCESS_ACTIONS = ['로그인', '로그아웃', '세션만료', '로그인실패'];
  const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) Safari/17.4',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Mobile/15E148',
    'Mozilla/5.0 (Linux; Android 14) Chrome/124.0 Mobile',
  ];
  const ADMIN_ACCESS_LOGS = [];
  for (let i = 1; i <= 48; i++) {
    const admin = pick(ADMINS.filter(a => a.status === 'active'));
    const act = pick(ADMIN_ACCESS_ACTIONS);
    const ok = act === '로그인실패' ? '실패' : '성공';
    ADMIN_ACCESS_LOGS.push({
      id: 'aal' + pad(i, 4),
      ts: `2026-05-${pad(rint(20, 28), 2)} ${pad(rint(0, 23), 2)}:${pad(rint(0, 59), 2)}:${pad(rint(0, 59), 2)}`,
      adminId: act === '로그인실패' ? 'unknown' : admin.id,
      name: act === '로그인실패' ? '—' : admin.name,
      ip: pick(['203.0.113.42', '203.0.113.51', '203.0.113.62', '203.0.113.71', '198.51.100.12']),
      action: act,
      result: ok,
      userAgent: pick(USER_AGENTS),
      memo: act === '로그인실패' ? pick(['비밀번호 불일치', '계정 잠금(5회 실패)', '비활성 계정']) : (act === '세션만료' ? '30분 무활동' : ''),
    });
  }
  ADMIN_ACCESS_LOGS.sort((a, b) => b.ts.localeCompare(a.ts));

  // ---- Member access log (회원 로그인·페이지 접근) ----
  const MEMBER_ACCESS_ACTIONS = ['로그인', '로그아웃', '페이지접근', '로그인실패'];
  const MEMBER_PATHS = ['/', '/login', '/mypage', '/apply', '/notice', '/faq', '/qna', '/mypage/profile', '/ticket'];
  const MEMBER_ACCESS_LOGS = [];
  for (let i = 1; i <= 60; i++) {
    const member = pick(MEMBERS.filter(m => m.status === 'active'));
    const act = pick(MEMBER_ACCESS_ACTIONS);
    const ok = act === '로그인실패' ? '실패' : '성공';
    MEMBER_ACCESS_LOGS.push({
      id: 'mal' + pad(i, 4),
      ts: `2026-05-${pad(rint(1, 28), 2)} ${pad(rint(0, 23), 2)}:${pad(rint(0, 59), 2)}:${pad(rint(0, 59), 2)}`,
      memberId: act === '로그인실패' ? '—' : member.id,
      email: act === '로그인실패' ? pick(['wrong@example.com', 'test@test.com', member.email]) : member.email,
      ip: `203.0.${rint(0, 255)}.${rint(1, 254)}`,
      action: act,
      path: act === '페이지접근' ? pick(MEMBER_PATHS) : (act === '로그인' || act === '로그인실패' ? '/login' : '/'),
      result: ok,
      userAgent: pick(USER_AGENTS),
      memo: act === '로그인실패' ? '비밀번호 불일치' : '',
    });
  }
  MEMBER_ACCESS_LOGS.sort((a, b) => b.ts.localeCompare(a.ts));

  // ---- Permission change history (권한 매트릭스·등급 변경) ----
  const PERM_TARGETS = ['권한매트릭스', 'admin01', 'editor01', 'editor02', 'viewer01'];
  const PERM_CHANGES = ['메뉴 권한 변경', '등급 변경', '액션 추가', '액션 제거'];
  const ROLE_LABELS = { super: '최고관리자', general: '일반관리자', viewer: '조회관리자' };
  const PERM_HISTORY = [];
  for (let i = 1; i <= 24; i++) {
    const target = pick(PERM_TARGETS);
    const change = pick(PERM_CHANGES);
    const role = pick(['general', 'viewer']);
    const menu = pick(['applicants', 'notices', 'members', 'audit', 'sessions']);
    PERM_HISTORY.push({
      id: 'ph' + pad(i, 4),
      ts: `2026-05-${pad(rint(1, 28), 2)} ${pad(rint(8, 18), 2)}:${pad(rint(0, 59), 2)}:${pad(rint(0, 59), 2)}`,
      actor: pick(['admin01', 'admin02']),
      ip: pick(['203.0.113.42', '203.0.113.51']),
      target,
      changeType: change,
      role: target === '권한매트릭스' ? role : pick(['super', 'general', 'viewer']),
      menu: target === '권한매트릭스' ? menu : '—',
      before: change === '등급 변경' ? { role: 'general' } : { actions: ['view', 'edit'] },
      after: change === '등급 변경' ? { role: 'viewer' } : { actions: ['view'] },
      memo: target === '권한매트릭스'
        ? `${ROLE_LABELS[role] || role} · ${menu} 메뉴 권한 조정`
        : `관리자 ${target} 등급 변경`,
    });
  }
  PERM_HISTORY.sort((a, b) => b.ts.localeCompare(a.ts));

  // ============================================================
  // Reactive store — listeners pattern (no framework deps)
  // ============================================================
  const listeners = new Set();
  function notify() { listeners.forEach(fn => { try { fn(); } catch(e){} }); }

  // ---- 권한 액션 모델 (편집형 권한 매트릭스) ----
  const PERM_ACTIONS = {
    view: '조회', create: '등록', edit: '수정', delete: '삭제',
    photo: '사진심사', pay: '수납', approve: '승인', reject: '반려', exam: '수험번호부여',
    answer: '답변', publish: '게시·폐지', suspend: '정지·탈퇴', reset: '비번초기화',
    deactivate: '비활성', export: '내보내기', viewAll: '전체이력', viewOwn: '본인이력',
  };
  const PERM_SECTIONS = [
    { id: 'dash', title: '대시보드', menus: [
      { id: 'dashboard', label: '대시보드', actions: ['view'] },
    ]},
    { id: 'apply', title: '접수 관리', menus: [
      { id: 'applicants', label: '접수자 목록', actions: ['view','photo','pay','approve','reject','exam','export'] },
    ]},
    { id: 'exam', title: '시험 관리', menus: [
      { id: 'sessions', label: '회차 관리', actions: ['view','create','edit','delete'] },
      { id: 'venues', label: '시험장 관리', actions: ['view','create','edit','delete'] },
    ]},
    { id: 'content', title: '콘텐츠 관리', menus: [
      { id: 'notices', label: '공지사항', actions: ['view','create','edit','delete'] },
      { id: 'faq', label: 'FAQ', actions: ['view','create','edit','delete'] },
      { id: 'refunds', label: '환불·정보정정', actions: ['view','answer','delete'] },
      { id: 'inquiries', label: '문의 게시판', actions: ['view','answer','delete'] },
    ]},
    { id: 'member', title: '회원·약관', menus: [
      { id: 'members', label: '회원 관리', actions: ['view','edit','suspend','reset'] },
      { id: 'terms', label: '약관 관리', actions: ['view','create','publish'] },
    ]},
    { id: 'system', title: '시스템', menus: [
      { id: 'admins', label: '관리자 계정', actions: ['view','create','edit','reset','deactivate'] },
      { id: 'permissions', label: '관리자 권한', actions: ['view','edit'] },
      { id: 'audit', label: '처리 이력', actions: ['viewAll','viewOwn','export'] },
      { id: 'admin-access-log', label: '관리자 접근 로그', actions: ['view','export'] },
      { id: 'member-access-log', label: '회원 접근 로그', actions: ['view','export'] },
      { id: 'perm-history', label: '권한 변경 이력', actions: ['view','export'] },
    ]},
  ];
  // 권장 기본값 (role별)
  function recommendedPerms(role) {
    const out = {};
    PERM_SECTIONS.forEach(sec => sec.menus.forEach(m => {
      if (role === 'super') {
        out[m.id] = m.actions.slice();              // 모든 액션 허용
      } else if (role === 'general') {
        // 운영 액션
        const map = {
          dashboard: ['view'],
          applicants: ['view','photo','pay','approve','reject'],   // 수험번호 일괄부여·내보내기 제외(슈퍼 전용)
          sessions: ['view'], venues: ['view'],
          notices: ['view','create','edit','delete'],
          faq: ['view','create','edit','delete'],
          refunds: ['view','answer','delete'],
          inquiries: ['view','answer','delete'],
          members: ['view'], terms: ['view'],
          admins: [], permissions: [],
          audit: ['viewOwn'],
          'admin-access-log': [], 'member-access-log': [], 'perm-history': [],
        };
        out[m.id] = (map[m.id] || []).filter(a => m.actions.includes(a));
      } else { // viewer — read-only
        const ro = m.actions.filter(a => a === 'view' || a === 'viewOwn');
        out[m.id] = ro;
      }
    }));
    return out;
  }

  const PERMS = {
    super: recommendedPerms('super'),
    general: recommendedPerms('general'),
    viewer: recommendedPerms('viewer'),
  };

  const state = {
    sessions: SESSIONS,
    venues: VENUES,
    regions: REGIONS,
    applicants: APPLICANTS,
    members: MEMBERS,
    notices: NOTICES,
    noticeTrash: [],
    faqs: FAQS,
    refunds: REFUNDS,
    inquiries: INQUIRIES,
    terms: TERMS,
    admins: ADMINS,
    matrix: MATRIX,
    perms: PERMS,
    audit: AUDIT,
    consents: CONSENTS,
    adminAccessLogs: ADMIN_ACCESS_LOGS,
    memberAccessLogs: MEMBER_ACCESS_LOGS,
    permHistory: PERM_HISTORY,
    activeSessionId: 's107', // 현재 회차
    me: null, // 로그인 사용자 - set on boot
    apiError: null,
    apiLoading: false,
  };

  function addAudit(entry) {
    const e = {
      id: 'log' + pad(state.audit.length + 1, 4),
      ts: new Date().toISOString().replace('T',' ').slice(0,19),
      actor: state.me?.id || 'admin01',
      ip: state.me?.ip || '203.0.113.42',
      ...entry,
    };
    state.audit.unshift(e);
  }

  function addPermHistory(entry) {
    const e = {
      id: 'ph' + pad(state.permHistory.length + 1, 4),
      ts: new Date().toISOString().replace('T', ' ').slice(0, 19),
      actor: state.me?.id || 'admin01',
      ip: state.me?.ip || '203.0.113.42',
      target: '권한매트릭스',
      changeType: '메뉴 권한 변경',
      role: '—',
      menu: '—',
      ...entry,
    };
    state.permHistory.unshift(e);
  }

  function setSession(sessionId) {
    state.activeSessionId = sessionId;
    notify();
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // counts for sidebar badges
  function badges() {
    const s = state.activeSessionId;
    const apps = state.applicants.filter(a => a.sessionId === s);
    return {
      // 접수자 목록 사이드바 배지 — 현재 회차·미수납(!paid)만 (취소/반려/환불 제외)
      unpaid: apps.filter(a => !a.paid && !['cancel', 'rejected', 'refund'].includes(a.status)).length,
      photoWait: apps.filter(a => a.photoStatus === 'pending' && a.status !== 'cancel').length,
      refundNew: state.refunds.filter(r => r.status === '접수' || r.status === '검토중').length,
      inquiryWait: state.inquiries.filter(q => q.status === 'wait').length,
    };
  }

  // ---- Format helpers (Korean text mostly) ----
  function fmtNum(n) { return new Intl.NumberFormat('ko-KR').format(n); }
  function fmtResultDate(d) { return d || '미정'; }
  function fmtCurrency(n) { return '$' + fmtNum(n) + ' USD'; }
  function statusLabel(s) {
    return ({
      applied: '접수완료', photo: '사진심사중', pay: '수납대기',
      approved: '승인완료', rejected: '반려', cancel: '취소',
      refund: '환불자',
    })[s] || s;
  }
  function levelLabel(l) { return l; }
  function roleLabel(r) {
    return ({ super: '최고관리자', general: '일반관리자', viewer: '조회관리자' })[r] || r;
  }
  function venueName(id) {
    const v = state.venues.find(x => x.id === id);
    return v ? v.nameKo : '—';
  }

  function getAdminSession() {
    try { return JSON.parse(sessionStorage.getItem('tpkm_bo_admin') || 'null'); } catch (e) { return null; }
  }

  /** API role(admin/readonly) → UI role(general/viewer) */
  function normalizeRole(role) {
    if (role === 'admin' || role === 'standard') return 'general';
    if (role === 'readonly') return 'viewer';
    return role || 'super';
  }

  /** 역할별 권한 매트릭스 — API 모드에서도 정적 recommendedPerms 기준으로 UI 버튼 비활성 */
  function can(menuId, action) {
    const role = normalizeRole(state.me?.role);
    if (role === 'super') return true;
    const allowed = (state.perms[role] || {})[menuId] || [];
    return allowed.includes(action);
  }

  function isReadonly() {
    return normalizeRole(state.me?.role) === 'viewer';
  }

  window.DataStore = {
    state, subscribe, notify, addAudit, addPermHistory, setSession, getAdminSession,
    badges, fmtNum, fmtResultDate, fmtCurrency, statusLabel, levelLabel, roleLabel, venueName, pad,
    permSections: PERM_SECTIONS, permActions: PERM_ACTIONS, recommendedPerms, normalizeRole, can, isReadonly,
  };
})();
