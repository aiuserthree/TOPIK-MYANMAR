/**
 * FO 페이지 본문 다국어 (KO / MY / EN)
 * - [data-i18n-content="key"] 요소의 text/html/placeholder 갱신
 * - TMI18N / TPKMLang / TM_LANG 와 연동
 * - 폴백 정책: MY → EN → KO, EN → KO (빈 문자열/누락 모두 폴백)
 */
(function (g) {
  'use strict';

  var STORE_ORIG = 'data-i18n-orig';

  var T = {
    /* ── 공통 ── */
    'reg.title': {
      ko: '시험 접수',
      my: 'စာမေးပွဲ လျှောက်လွှာ',
      en: 'Exam registration'
    },
    'reg.step1': { ko: '회차 선택', my: 'အကြိမ်ရေ', en: 'Session' },
    'reg.step2': { ko: '회원정보 확인', my: 'အဖွဲ့ဝင် အချက်အလက်', en: 'Profile check' },
    'reg.step3': { ko: '사진·급수 확인', my: 'ဓာတ်ပုံ · အဆင့်', en: 'Photo & level' },
    'reg.step4': { ko: '최종 확인', my: 'နောက်ဆုံး အတည်ပြုချက်', en: 'Final review' },
    'reg.s1_title': { ko: '접수 회차 선택', my: 'လျှောက်ထားမည့် အကြိမ်ရေ', en: 'Select exam session' },
    'reg.s1_desc': { ko: '접수 가능한 회차 중 하나를 선택해 주세요.', my: 'လျှောက်ထားနိုင်သော အကြိမ်ရေတစ်ခုကို ရွေးချယ်ပါ။', en: 'Choose one open session.' },
    'reg.s2_title': { ko: '회원정보 확인', my: 'အဖွဲ့ဝင် အချက်အလက် စစ်ဆေးခြင်း', en: 'Verify member profile' },
    'reg.s2_desc': { ko: '접수 시 사용되는 회원정보입니다. 수정이 필요하면 마이페이지에서 변경 후 다시 접수해 주세요.', my: 'လျှောက်ထားရာတွင် အသုံးပြုသည့် အဖွဲ့ဝင် အချက်အလက်ဖြစ်သည်။ ပြင်ဆင်လိုပါက ကျွန်ုပ်စာမျက်နှာတွင် ပြောင်းပြီး ပြန်လည်လျှောက်ထားပါ။', en: 'Profile used for registration. Update on My page if needed.' },
    'reg.s3_title': { ko: '증명사진 확인', my: 'သက်သေခံ ဓာတ်ပုံ စစ်ဆေးခြင်း', en: 'ID photo check' },
    'reg.s3_desc': { ko: '회원가입 시 등록한 사진이 접수에 사용됩니다. 규격(6개월 이내·배경 단색)을 확인해 주세요.', my: 'အဖွဲ့ဝင်မှတ်ပုံတင်စဉ် တင်ထားသော ဓာတ်ပုံကို လျှောက်လွှာတွင် အသုံးပြုသည်။', en: 'Your signup photo is used. Check 6-month rule and plain background.' },
    'reg.s4_title': { ko: '접수 내용 최종 확인', my: 'လျှောက်လွှာ နောက်ဆုံး အတည်ပြုခြင်း', en: 'Final confirmation' },
    'reg.s4_desc': { ko: '아래 내용으로 접수가 진행됩니다. 제출 후에는 수정이 불가합니다.', my: 'အောက်ပါအချက်အလက်ဖြင့် လျှောက်ထားမည်။ တင်ပြီးနောက် ပြင်ဆင်၍ မရပါ။', en: 'Submit with the details below. No edits after submission.' },
    'reg.level_title': { ko: '응시 급수 선택', my: 'အဆင့် ရွေးချယ်ခြင်း', en: 'Select test level' },
    'login.title': { ko: '로그인', my: 'ဝင်ရောက်ရန်', en: 'Sign in' },
    'login.desc': { ko: 'TOPIK Myanmar 회원 계정으로 로그인합니다.', my: 'TOPIK Myanmar အဖွဲ့ဝင်အကောင့်ဖြင့် ဝင်ရောက်ပါ။', en: 'Sign in with your TOPIK Myanmar account.' },
    'signup.title': { ko: '회원가입', my: 'အကောင့်ဖွင့်ရန်', en: 'Create account' },
    'apply.title': { ko: '접수 방법', my: 'လျှောက်ထားနည်း', en: 'How to apply' },
    'apply.lead': { ko: 'TOPIK 시험 접수 절차와 필요 서류를 안내합니다.', my: 'TOPIK စာမေးပွဲ လျှောက်ထားမှု အဆင့်များနှင့် လိုအပ်သော စာရွက်စာတမ်းများကို လမ်းညွှန်ပေးသည်။', en: 'Steps and documents for TOPIK registration.' },
    'mypage.title': { ko: '접수 확인', my: 'လျှောက်လွှာ အခြေအနေ', en: 'Application status' },
    'mypage.desc': { ko: '접수 상태·수납·수험번호 부여 현황을 확인합니다.', my: 'လျှောက်လွှာ အခြေအနေ၊ ကြေးသွင်းမှုနှင့် ဖြေဆိုသူနံပါတ် အခြေအနေကို စစ်ဆေးပါ။', en: 'Check status, payment, and exam number.' },
    'guide.title': { ko: 'TOPIK 안내', my: 'TOPIK လမ်းညွှန်', en: 'TOPIK guide' },
    'guide.overview': { ko: '시험 개요', my: 'စာမေးပွဲ အကျဉ်းချုပ်', en: 'Overview' },
    'guide.intro': { ko: '시험 소개', my: 'စာမေးပွဲ မိတ်ဆက်', en: 'Introduction' },
    'guide.questions': { ko: '문항 구성', my: 'မေးခွန်း ဖွဲ့စည်းပုံ', en: 'Test structure' },
    'guide.evaluation': { ko: '평가 기준', my: 'အကဲဖြတ် စံနှုန်း', en: 'Scoring' },
    'rules.title': { ko: 'TOPIK 규정', my: 'TOPIK စည်းမျဉ်း', en: 'TOPIK rules' },
    'rules.notice': { ko: '유의 사항', my: 'သတိပြုရန်', en: 'Important notes' },
    'rules.answer': { ko: '답안 작성 요령', my: 'အဖြေရေးသားနည်း', en: 'Answer sheet guide' },
    'rules.fee': { ko: '응시료 규정', my: 'ဖြေဆိုကြေး စည်းမျဉ်း', en: 'Fee policy' },
    'rules.id': { ko: '신분증 규정', my: 'အထောက်အထား စည်းမျဉ်း', en: 'ID requirements' },
    'notice.title': { ko: '공지사항', my: 'ကြေညာချက်', en: 'Notices' },
    'faq.title': { ko: '자주 묻는 질문', my: 'မေးလေ့ရှိသော မေးခွန်းများ', en: 'FAQ' },
    'board.refund_title': { ko: '환불·정보정정신청', my: 'ငွေပြန်အမ်း · အချက်အလက်ပြင်ဆင်ခြင်း', en: 'Refund & correction' },
    'board.qna_title': { ko: '문의게시판', my: 'စုံစမ်းမေးမြန်းရေး ဘုတ်', en: 'Q&A board' },

    /* ── 푸터 (TPKM_FO_0_2_0_0_0_C) ── */
    'foot.org_sub': {
      ko: 'Embassy of the Republic of Korea in Myanmar',
      my: 'Embassy of the Republic of Korea in Myanmar',
      en: 'Embassy of the Republic of Korea in Myanmar'
    },
    'foot.desc': {
      ko: '한국어능력시험(TOPIK) 미얀마 시행 공식 안내·접수 사이트입니다.<br>운영기관 <strong>주미얀마 대한민국 대사관</strong>',
      my: 'TOPIK မြန်မာ တရားဝင် အချက်အလက် · လျှောက်လွှာ ဆိုက်ဖြစ်သည်။<br>ကျင်းပရေး <strong>မြန်မာနိုင်ငံရှိ ကိုရီးယားသံရုံး</strong>',
      en: 'Official TOPIK Myanmar information and registration site.<br>Operated by the <strong>Embassy of the Republic of Korea in Myanmar</strong>'
    },
    'foot.org_line': {
      ko: '운영기관 주미얀마 대한민국 대사관',
      my: 'ကျင်းပရေး — မြန်မာနိုင်ငံရှိ ကိုရီးယားသံရုံး',
      en: 'Operated by the Embassy of the Republic of Korea in Myanmar'
    },
    'foot.menu': { ko: '바로가기', my: 'အမြန်လင့်များ', en: 'Quick links' },
    'foot.ext': { ko: '외부 링크', my: 'ပြင်ပလင့်များ', en: 'External links' },
    'foot.mofa': { ko: '재외공관 안내', my: 'နိုင်ငံခြားသံရုံး', en: 'Overseas missions' },
    'foot.privacy': { ko: '개인정보처리방침', my: 'ကိုယ်ရေးအချက်အလက် မူဝါဒ', en: 'Privacy policy' },
    'foot.terms': { ko: '이용약관', my: 'အသုံးပြုမှု စည်းကမ်း', en: 'Terms of use' },
    'foot.contact': {
      ko: '<strong>문의</strong><br>topik.myanmar@mofa.go.kr<br>업무시간 월–금 09:00–17:00 (UTC+6:30)',
      my: '<strong>ဆက်သွယ်ရန်</strong><br>topik.myanmar@mofa.go.kr<br>တနင်္လ–သောကြာ 09:00–17:00 (UTC+6:30)',
      en: '<strong>Contact</strong><br>topik.myanmar@mofa.go.kr<br>Mon–Fri 09:00–17:00 (UTC+6:30)'
    },
    'foot.copy': {
      ko: '© 2025–2026 Embassy of the Republic of Korea in Myanmar. All rights reserved.',
      my: '© 2025–2026 Embassy of the Republic of Korea in Myanmar. All rights reserved.',
      en: '© 2025–2026 Embassy of the Republic of Korea in Myanmar. All rights reserved.'
    },

    /* 메뉴 (C/B FO GNB) */
    'menu.guide': { ko: 'TOPIK 안내', my: 'TOPIK လမ်းညွှန်', en: 'TOPIK guide' },
    'menu.rules': { ko: 'TOPIK 규정', my: 'TOPIK စည်းမျဉ်း', en: 'TOPIK rules' },
    'menu.apply': { ko: 'TOPIK 접수', my: 'TOPIK လျှောက်လွှာ', en: 'Registration' },
    'menu.board': { ko: '게시판', my: 'ဘုတ်', en: 'Board' },
    'menu.login': { ko: '로그인', my: 'ဝင်ရောက်ရန်', en: 'Sign in' },
    'menu.signup': { ko: '회원가입', my: 'အကောင့်ဖွင့်ရန်', en: 'Sign up' },
    'menu.logout': { ko: '로그아웃', my: 'ထွက်ရန်', en: 'Sign out' },
    'menu.mypage': { ko: '마이페이지', my: 'ကျွန်ုပ်စာမျက်နှာ', en: 'My page' },
    'sub.apply_howto': { ko: '접수 방법', my: 'လျှောက်ထားနည်း', en: 'How to apply' },
    'sub.apply_reg': { ko: '시험 접수', my: 'စာမေးပွဲ လျှောက်လွှာ', en: 'Register' },
    'sub.apply_confirm': { ko: '접수 확인', my: 'အခြေအနေ', en: 'Status' },
    'sub.apply_ticket': { ko: '수험표 출력', my: 'ဝင်ခွင့်လက်မှတ်', en: 'Admit card' },
    'sub.board_notice': { ko: '공지사항', my: 'ကြေညာချက်', en: 'Notices' },
    'sub.board_refund': { ko: '환불·정보정정신청', my: 'ငွေပြန်အမ်း · ပြင်ဆင်', en: 'Refund/correction' },
    'sub.board_qna': { ko: '문의게시판', my: 'စုံစမ်းရန်', en: 'Inquiry' },
    'sub.board_faq': { ko: 'FAQ', my: 'FAQ', en: 'FAQ' },

    /* ── 본문: TOPIK 안내 (guide-*) ──
       lead 문장은 KO/EN 확정, MY는 전문 번역 대기 → EN 폴백.
       섹션 제목(headings)은 KO/MY/EN 확정. */
    'go.lead': { ko: '한국어능력시험(TOPIK)의 정의·목적과 시행 기관, 응시 자격을 안내합니다.', en: 'Definition and purpose of TOPIK, the administering bodies, and eligibility.' },
    'go.h_what': { ko: 'TOPIK이란?', my: 'TOPIK ဆိုသည်မှာ', en: 'What is TOPIK?' },
    'go.h_purpose': { ko: '응시 목적', my: 'ဖြေဆိုရခြင်း ရည်ရွယ်ချက်', en: 'Purpose of the test' },
    'go.h_schedule': { ko: '연간 시험 일정 (2026)', my: 'နှစ်စဉ် စာမေးပွဲ အချိန်ဇယား (2026)', en: 'Annual test schedule (2026)' },
    'gi.lead': { ko: 'TOPIK Ⅰ과 TOPIK Ⅱ의 구분 및 등급별 활용처를 안내합니다.', en: 'How TOPIK I and TOPIK II differ, and where each level is used.' },
    'gi.h_uses': { ko: '미얀마 응시자의 주요 활용처', my: 'မြန်မာ ဖြေဆိုသူများအတွက် အဓိက အသုံးချမှုများ', en: 'Key uses for test-takers in Myanmar' },
    'gq.lead': { ko: '영역별 문항 수와 점수 배분, 시험 시간을 안내합니다.', en: 'Number of questions, score allocation, and test time by section.' },
    'ge.lead': { ko: '등급별 합격 점수, 채점 방식, 성적 인정 기간을 안내합니다.', en: 'Passing scores by level, scoring method, and validity period.' },
    'ge.h_t1': { ko: 'TOPIK Ⅰ 등급별 합격 점수', my: 'TOPIK Ⅰ အဆင့်အလိုက် အောင်မှတ်', en: 'TOPIK I passing scores by level' },
    'ge.h_t2': { ko: 'TOPIK Ⅱ 등급별 합격 점수', my: 'TOPIK Ⅱ အဆင့်အလိုက် အောင်မှတ်', en: 'TOPIK II passing scores by level' },
    'ge.h_scoring': { ko: '채점 방식', my: 'အမှတ်ပေးနည်း', en: 'Scoring method' },
    'ge.h_validity': { ko: '성적 인정 기간', my: 'ရမှတ် သက်တမ်း', en: 'Validity period' },
    'ge.h_grading': { ko: '등급 부여 방식', my: 'အဆင့်သတ်မှတ်နည်း', en: 'Grading method' },
    'ge.h_report': { ko: '성적표 발급', my: 'ရမှတ်လက်မှတ် ထုတ်ပေးခြင်း', en: 'Score report issuance' },

    /* ── 본문: TOPIK 규정 (rules-*) ── */
    'rn.lead': { ko: '시험 당일 입실·신분 확인·휴대 금지 물품 및 부정행위 규정을 반드시 확인해 주세요.', en: 'Check entry, ID verification, prohibited items, and misconduct rules for test day.' },
    'rn.h_entry': { ko: '입실 및 신분 확인', my: 'ဝင်ရောက်ခြင်းနှင့် အထောက်အထား စစ်ဆေးခြင်း', en: 'Entry and ID verification' },
    'rn.h_prohibited': { ko: '휴대 금지 물품', my: 'ယူဆောင်ခွင့်မပြုသော ပစ္စည်းများ', en: 'Prohibited items' },
    'rn.h_during': { ko: '시험 진행 중 준수 사항', my: 'စာမေးပွဲအတွင်း လိုက်နာရန်', en: 'Rules during the test' },
    'rn.h_penalty': { ko: '부정행위 제재', my: 'မသမာမှု အရေးယူခြင်း', en: 'Penalties for misconduct' },
    'ra.lead': { ko: 'OMR 마킹·쓰기 답안지 작성법 및 사용 가능한 필기구 안내입니다.', en: 'How to mark OMR, complete the writing sheet, and which pens are allowed.' },
    'ra.h_tools': { ko: '사용 가능한 필기구', my: 'အသုံးပြုခွင့်ရှိသော ရေးကိရိယာ', en: 'Permitted writing tools' },
    'ra.h_omr': { ko: 'OMR 카드 마킹 방법', my: 'OMR ကတ် အမှတ်ခြစ်နည်း', en: 'How to mark the OMR card' },
    'ra.h_writing': { ko: '쓰기 답안지 작성 (TOPIK Ⅱ)', my: 'ရေးသားဖြေဆိုခြင်း အဖြေစာရွက် (TOPIK Ⅱ)', en: 'Writing answer sheet (TOPIK II)' },
    'ra.h_code': { ko: '응시자 코드·수험번호 기재', my: 'ဖြေဆိုသူ ကုဒ် · ဖြေဆိုမှတ်ပုံတင်နံပါတ် ဖြည့်သွင်းခြင်း', en: 'Candidate code & exam number entry' },
    'rf.lead': { ko: '응시료 금액, 결제 방법, 환불 정책을 안내합니다. (2026 기준)', en: 'Fee amount, payment method, and refund policy (as of 2026).' },
    'rf.h_fee': { ko: '응시료', my: 'ဖြေဆိုကြေး', en: 'Test fee' },
    'rf.h_payment': { ko: '결제 방법', my: 'ငွေပေးချေနည်း', en: 'Payment method' },
    'rf.h_refund': { ko: '환불 정책', my: 'ငွေပြန်အမ်း မူဝါဒ', en: 'Refund policy' },
    'rf.h_receipt': { ko: '영수증 발급', my: 'ပြေစာ ထုတ်ပေးခြင်း', en: 'Receipt issuance' },
    'ri.lead': { ko: '시험 당일 인정 신분증 종류 및 미소지 시 대응 안내입니다.', en: 'Accepted ID types for test day and what to do if you have none.' },
    'ri.h_accepted': { ko: '인정 신분증', my: 'လက်ခံသော အထောက်အထား', en: 'Accepted ID' },
    'ri.h_unaccepted': { ko: '불인정 신분증', my: 'လက်မခံသော အထောက်အထား', en: 'Unaccepted ID' },
    'ri.h_missing': { ko: '신분증 미소지 시', my: 'အထောက်အထား မပါပါက', en: 'If you have no ID' },
    'ri.h_match': { ko: '신분증 사진과 응시자 일치 확인', my: 'အထောက်အထားဓာတ်ပုံနှင့် ဖြေဆိုသူ ကိုက်ညီမှု စစ်ဆေးခြင်း', en: 'Matching ID photo with the candidate' }
  };

  /* 언어별 폴백 순서. 요청 언어 값이 누락/빈문자열이면 다음 순서로 폴백. */
  var FALLBACK = {
    ko: ['ko', 'en'],
    my: ['my', 'en', 'ko'],
    en: ['en', 'ko']
  };

  function normLang(lang) {
    if (!lang) return 'ko';
    lang = String(lang).toLowerCase();
    if (lang === 'kr' || lang === 'ko') return 'ko';
    if (lang === 'mm' || lang === 'my') return 'my';
    return 'en';
  }

  function hasText(v) {
    return v != null && String(v).trim() !== '';
  }

  function text(key, lang) {
    var row = T[key];
    if (!row) return null;
    lang = normLang(lang);
    var order = FALLBACK[lang] || FALLBACK.ko;
    for (var i = 0; i < order.length; i++) {
      if (hasText(row[order[i]])) return row[order[i]];
    }
    // 최종 폴백: 정의된 아무 값이든 (KO 우선)
    return hasText(row.ko) ? row.ko : (hasText(row.en) ? row.en : (hasText(row.my) ? row.my : ''));
  }

  function captureOriginal(el) {
    if (el.getAttribute(STORE_ORIG)) return;
    if (el.hasAttribute('data-i18n-content-html')) {
      el.setAttribute(STORE_ORIG, el.innerHTML);
    } else if (el.hasAttribute('data-i18n-content-placeholder')) {
      el.setAttribute(STORE_ORIG, el.placeholder || '');
    } else {
      el.setAttribute(STORE_ORIG, el.textContent);
    }
  }

  function apply(lang) {
    lang = normLang(lang);
    if (lang === 'ko') {
      document.querySelectorAll('[' + STORE_ORIG + ']').forEach(function (el) {
        var orig = el.getAttribute(STORE_ORIG);
        if (el.hasAttribute('data-i18n-content-html')) el.innerHTML = orig;
        else if (el.hasAttribute('data-i18n-content-placeholder')) el.placeholder = orig;
        else el.textContent = orig;
      });
      return;
    }
    document.querySelectorAll('[data-i18n-content]').forEach(function (el) {
      captureOriginal(el);
      var key = el.getAttribute('data-i18n-content');
      var val = text(key, lang);
      // 키가 없거나 폴백 결과가 비어 있으면 원문(KO) 유지 — 빈 문자열/raw key 노출 방지
      if (!hasText(val)) {
        var orig = el.getAttribute(STORE_ORIG);
        if (el.hasAttribute('data-i18n-content-html')) el.innerHTML = orig;
        else if (el.hasAttribute('data-i18n-content-placeholder')) el.placeholder = orig;
        else el.textContent = orig;
        return;
      }
      if (el.hasAttribute('data-i18n-content-html')) el.innerHTML = val;
      else if (el.hasAttribute('data-i18n-content-placeholder')) el.placeholder = val;
      else el.textContent = val;
    });
  }

  function hookExistingI18n() {
    if (g.TMI18N && typeof g.TMI18N.setLang === 'function' && !g.TMI18N.__contentHooked) {
      var orig = g.TMI18N.setLang;
      g.TMI18N.setLang = function (lang) {
        orig(lang);
        apply(lang);
      };
      g.TMI18N.__contentHooked = true;
    }
    if (g.TPKMLang && typeof g.TPKMLang.set === 'function' && !g.TPKMLang.__contentHooked) {
      var origSet = g.TPKMLang.set;
      g.TPKMLang.set = function (l) {
        origSet(l);
        apply(l);
        if (typeof g.__tpkmRebuildNav === 'function') g.__tpkmRebuildNav();
      };
      g.TPKMLang.__contentHooked = true;
    }
    if (g.TMI18n && typeof g.TMI18n.setLang === 'function' && !g.TMI18n.__contentHooked) {
      var o2 = g.TMI18n.setLang;
      g.TMI18n.setLang = function (l) { o2(l); apply(l); };
      g.TMI18n.__contentHooked = true;
    }
  }

  function boot() {
    hookExistingI18n();
    var lang = 'ko';
    if (g.TMI18N && g.TMI18N.getLang) lang = g.TMI18N.getLang();
    else if (g.TPKMLang && g.TPKMLang.get) lang = g.TPKMLang.get();
    else if (g.TMI18n && g.TMI18n.getLang) lang = g.TMI18n.getLang();
    apply(lang);
  }

  g.TOPIKPageI18n = { T: T, text: text, apply: apply, normLang: normLang, boot: boot };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
