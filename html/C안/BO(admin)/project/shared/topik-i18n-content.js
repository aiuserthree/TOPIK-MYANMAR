/**
 * FO 페이지 본문 다국어 (KO / MY / EN)
 * - [data-i18n-content="key"] 요소의 text/html/placeholder 갱신
 * - TMI18N / TPKMLang / TM_LANG 와 연동
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
    'reg.step2': { ko: '회원정보 확인', my: 'အဖွဲ့ဝင် 정보', en: 'Profile check' },
    'reg.step3': { ko: '사진·급수 확인', my: 'ဓာတ်ပုံ·급수', en: 'Photo & level' },
    'reg.step4': { ko: '최종 확인', my: 'နောက်ဆုံး 확인', en: 'Final review' },
    'reg.s1_title': { ko: '접수 회차 선택', my: 'လျှောက်ထားမည့် အကြိမ်ရေ', en: 'Select exam session' },
    'reg.s1_desc': { ko: '접수 가능한 회차 중 하나를 선택해 주세요.', my: 'လျှောက်ထားနိုင်သော အကြိမ်ရေတစ်ခုကို ရွေးချယ်ပါ။', en: 'Choose one open session.' },
    'reg.s2_title': { ko: '회원정보 확인', my: 'အဖွဲ့ဝင် 정보 확인', en: 'Verify member profile' },
    'reg.s2_desc': { ko: '접수 시 사용되는 회원정보입니다. 수정이 필요하면 마이페이지에서 변경 후 다시 접수해 주세요.', my: 'လျှောက်ထားမှုတွင် အသုံးပြုသော 정보입니다။ ပြင်ဆင်ရန် My Page သို့ သွားပါ။', en: 'Profile used for registration. Update on My page if needed.' },
    'reg.s3_title': { ko: '증명사진 확인', my: 'သက်သေခံ ဓာတ်ပုံ 확인', en: 'ID photo check' },
    'reg.s3_desc': { ko: '회원가입 시 등록한 사진이 접수에 사용됩니다. 규격(6개월 이내·배경 단색)을 확인해 주세요.', my: 'အဖွဲ့ဝင်မှတ်ပုံတင်စဉ် တင်ထားသော ဓာတ်ပုံကို အသုံးပြုသည်။', en: 'Your signup photo is used. Check 6-month rule and plain background.' },
    'reg.s4_title': { ko: '접수 내용 최종 확인', my: 'နောက်ဆုံး 확인 및 제출', en: 'Final confirmation' },
    'reg.s4_desc': { ko: '아래 내용으로 접수가 진행됩니다. 제출 후에는 수정이 불가합니다.', my: 'အောက်ပါအချက်အလက်ဖြင့် လျှောက်ထားမည်။ တင်ပြီးနောက် ပြင်ဆင်၍ မရပါ။', en: 'Submit with the details below. No edits after submission.' },
    'reg.level_title': { ko: '응시 급수 선택', my: 'အဆင့် ရွေးချယ်ခြင်း', en: 'Select test level' },
    'login.title': { ko: '로그인', my: 'Login', en: 'Sign in' },
    'login.desc': { ko: 'TOPIK Myanmar 회원 계정으로 로그인합니다.', my: 'TOPIK Myanmar အဖွဲ့ဝင်အကောင့်ဖြင့် ဝင်ရောက်ပါ။', en: 'Sign in with your TOPIK Myanmar account.' },
    'signup.title': { ko: '회원가입', my: 'အဖွဲ့ဝင်မှတ်ပုံတင်', en: 'Create account' },
    'apply.title': { ko: '접수 방법', my: 'လျှောက်ထားနည်း', en: 'How to apply' },
    'apply.lead': { ko: 'TOPIK 시험 접수 절차와 필요 서류를 안내합니다.', my: 'TOPIK လျှောက်ထားမှုလုပ်ငန်းစဉ်ကို 안내합니다.', en: 'Steps and documents for TOPIK registration.' },
    'mypage.title': { ko: '접수 확인', my: 'လျှောက်ထားမှု 확인', en: 'Application status' },
    'mypage.desc': { ko: '접수 상태·수납·수험번호 부여 현황을 확인합니다.', my: 'လျှောက်ထားမှု အခြေအနေကို 확인하세요။', en: 'Check status, payment, and exam number.' },
    'guide.title': { ko: 'TOPIK 안내', my: 'TOPIK လမ်းညွှန်', en: 'TOPIK guide' },
    'guide.overview': { ko: '시험 개요', my: 'စာမေးပွဲ အကျဉ်း', en: 'Overview' },
    'guide.intro': { ko: '시험 소개', my: 'စာမေးပွဲ မိတ်ဆက်', en: 'Introduction' },
    'guide.questions': { ko: '문항 구성', my: 'မေးခွန်း ဖွဲ့စည်းပုံ', en: 'Test structure' },
    'guide.evaluation': { ko: '평가 기준', my: 'အဆင့်သတ်မှတ်', en: 'Scoring' },
    'rules.title': { ko: 'TOPIK 규정', my: 'TOPIK စည်းမျဉ်း', en: 'TOPIK rules' },
    'rules.notice': { ko: '유의 사항', my: 'သတိပြုရန်', en: 'Important notes' },
    'rules.answer': { ko: '답안 작성 요령', my: 'အဖြေရေးသားနည်း', en: 'Answer sheet guide' },
    'rules.fee': { ko: '응시료 규정', my: 'စာမေးပွဲကြေး', en: 'Fee policy' },
    'rules.id': { ko: '신분증 규정', my: 'နိုင်ငံသားစိစစ်ရေးကတ်', en: 'ID requirements' },
    'notice.title': { ko: '공지사항', my: 'ကြေညာချက်', en: 'Notices' },
    'faq.title': { ko: '자주 묻는 질문', my: 'FAQ', en: 'FAQ' },
    'board.refund_title': { ko: '환불·정보정정신청', my: 'ငွေပြန်အမ်း·정보 수정', en: 'Refund & correction' },
    'board.qna_title': { ko: '문의게시판', my: '문의 게시판', en: 'Q&A board' },
    /* 메뉴 (C/B FO GNB) */
    'menu.guide': { ko: 'TOPIK 안내', my: 'TOPIK လမ်းညွှန်', en: 'TOPIK guide' },
    'menu.rules': { ko: 'TOPIK 규정', my: 'TOPIK စည်းမျဉ်း', en: 'TOPIK rules' },
    'menu.apply': { ko: 'TOPIK 접수', my: 'TOPIK လျှောက်လွှာ', en: 'Registration' },
    'menu.board': { ko: '게시판', my: 'ဖိုရမ်', en: 'Board' },
    'menu.login': { ko: '로그인', my: 'Login', en: 'Sign in' },
    'menu.signup': { ko: '회원가입', my: 'Sign up', en: 'Sign up' },
    'menu.logout': { ko: '로그아웃', my: 'Logout', en: 'Sign out' },
    'menu.mypage': { ko: '마이페이지', my: 'My Page', en: 'My page' },
    'sub.apply_howto': { ko: '접수 방법', my: 'လျှောက်နည်း', en: 'How to apply' },
    'sub.apply_reg': { ko: '시험 접수', my: 'စာမေးပွဲ လျှောက်လွှာ', en: 'Register' },
    'sub.apply_confirm': { ko: '접수 확인', my: '확인', en: 'Status' },
    'sub.apply_ticket': { ko: '수험표 출력', my: 'ဝင်ခွင့်လက်မှတ်', en: 'Admit card' },
    'sub.board_notice': { ko: '공지사항', my: 'ကြေညာချက်', en: 'Notices' },
    'sub.board_refund': { ko: '환불·정보정정신청', my: 'Refund·정정', en: 'Refund/correction' },
    'sub.board_qna': { ko: '문의게시판', my: '문의', en: 'Inquiry' },
    'sub.board_faq': { ko: 'FAQ', my: 'FAQ', en: 'FAQ' }
  };

  function normLang(lang) {
    if (!lang) return 'ko';
    lang = String(lang).toLowerCase();
    if (lang === 'kr' || lang === 'ko') return 'ko';
    if (lang === 'mm' || lang === 'my') return 'my';
    return 'en';
  }

  function text(key, lang) {
    var row = T[key];
    if (!row) return null;
    lang = normLang(lang);
    return row[lang] || row.ko || '';
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
      if (val == null) return;
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
