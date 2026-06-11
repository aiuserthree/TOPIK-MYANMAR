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
      ko: '<strong>문의</strong><br>support@topik-myanmar.com<br>업무시간 월–금 09:00–17:00 (UTC+6:30)',
      my: '<strong>ဆက်သွယ်ရန်</strong><br>support@topik-myanmar.com<br>တနင်္လ–သောကြာ 09:00–17:00 (UTC+6:30)',
      en: '<strong>Contact</strong><br>support@topik-myanmar.com<br>Mon–Fri 09:00–17:00 (UTC+6:30)'
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
    'go.lead': { ko: '한국어능력시험(TOPIK)의 정의·목적과 시행 기관, 응시 자격을 안내합니다.', my: 'ကိုရီးယားဘာသာ ကျွမ်းကျင်မှု စာမေးပွဲ (TOPIK) ၏ အဓိပ္ပါယ်·ရည်ရွယ်ချက်၊ ကျင်းပသည့် အဖွဲ့အစည်းနှင့် ဖြေဆိုခွင့် အရည်အချင်းကို လမ်းညွှန်ပေးသည်။', en: 'Definition and purpose of TOPIK, the administering bodies, and eligibility.' },
    'go.h_what': { ko: 'TOPIK이란?', my: 'TOPIK ဆိုသည်မှာ', en: 'What is TOPIK?' },
    'go.h_purpose': { ko: '응시 목적', my: 'ဖြေဆိုရခြင်း ရည်ရွယ်ချက်', en: 'Purpose of the test' },
    'go.h_schedule': { ko: '연간 시험 일정 (2026)', my: 'နှစ်စဉ် စာမေးပွဲ အချိန်ဇယား (2026)', en: 'Annual test schedule (2026)' },
    'gi.lead': { ko: 'TOPIK Ⅰ과 TOPIK Ⅱ의 구분 및 등급별 활용처를 안내합니다.', my: 'TOPIK Ⅰ နှင့် TOPIK Ⅱ ၏ ကွာခြားချက်နှင့် အဆင့်အလိုက် အသုံးချရာနေရာများကို လမ်းညွှန်ပေးသည်။', en: 'How TOPIK I and TOPIK II differ, and where each level is used.' },
    'gi.h_uses': { ko: '미얀마 응시자의 주요 활용처', my: 'မြန်မာ ဖြေဆိုသူများအတွက် အဓိက အသုံးချမှုများ', en: 'Key uses for test-takers in Myanmar' },
    'gq.lead': { ko: '영역별 문항 수와 점수 배분, 시험 시간을 안내합니다.', my: 'ပိုင်းအလိုက် မေးခွန်းအရေအတွက်၊ အမှတ်ခွဲဝေမှုနှင့် စာမေးပွဲ အချိန်ကို လမ်းညွှန်ပေးသည်။', en: 'Number of questions, score allocation, and test time by section.' },
    'ge.lead': { ko: '등급별 합격 점수, 채점 방식, 성적 인정 기간을 안내합니다.', my: 'အဆင့်အလိုက် အောင်မှတ်၊ အမှတ်ပေးနည်းနှင့် ရမှတ် သက်တမ်းကို လမ်းညွှန်ပေးသည်။', en: 'Passing scores by level, scoring method, and validity period.' },
    'ge.h_t1': { ko: 'TOPIK Ⅰ 등급별 합격 점수', my: 'TOPIK Ⅰ အဆင့်အလိုက် အောင်မှတ်', en: 'TOPIK I passing scores by level' },
    'ge.h_t2': { ko: 'TOPIK Ⅱ 등급별 합격 점수', my: 'TOPIK Ⅱ အဆင့်အလိုက် အောင်မှတ်', en: 'TOPIK II passing scores by level' },
    'ge.h_scoring': { ko: '채점 방식', my: 'အမှတ်ပေးနည်း', en: 'Scoring method' },
    'ge.h_validity': { ko: '성적 인정 기간', my: 'ရမှတ် သက်တမ်း', en: 'Validity period' },
    'ge.h_grading': { ko: '등급 부여 방식', my: 'အဆင့်သတ်မှတ်နည်း', en: 'Grading method' },
    'ge.h_report': { ko: '성적표 발급', my: 'ရမှတ်လက်မှတ် ထုတ်ပေးခြင်း', en: 'Score report issuance' },

    /* ── 본문: TOPIK 규정 (rules-*) ── */
    'rn.lead': { ko: '시험 당일 입실·신분 확인·휴대 금지 물품 및 부정행위 규정을 반드시 확인해 주세요.', my: 'စာမေးပွဲနေ့တွင် ဝင်ရောက်ခြင်း၊ အထောက်အထား စစ်ဆေးခြင်း၊ ယူဆောင်ခွင့်မပြုသော ပစ္စည်းများနှင့် မသမာမှု စည်းမျဉ်းများကို သေချာ စစ်ဆေးပါ။', en: 'Check entry, ID verification, prohibited items, and misconduct rules for test day.' },
    'rn.h_entry': { ko: '입실 및 신분 확인', my: 'ဝင်ရောက်ခြင်းနှင့် အထောက်အထား စစ်ဆေးခြင်း', en: 'Entry and ID verification' },
    'rn.h_prohibited': { ko: '휴대 금지 물품', my: 'ယူဆောင်ခွင့်မပြုသော ပစ္စည်းများ', en: 'Prohibited items' },
    'rn.h_during': { ko: '시험 진행 중 준수 사항', my: 'စာမေးပွဲအတွင်း လိုက်နာရန်', en: 'Rules during the test' },
    'rn.h_penalty': { ko: '부정행위 제재', my: 'မသမာမှု အရေးယူခြင်း', en: 'Penalties for misconduct' },
    'ra.lead': { ko: 'OMR 마킹·쓰기 답안지 작성법 및 사용 가능한 필기구 안내입니다.', my: 'OMR အမှတ်ခြစ်နည်း၊ ရေးသားဖြေဆိုခြင်း အဖြေလွှာ ဖြည့်နည်းနှင့် အသုံးပြုခွင့်ရှိသော ရေးကိရိယာများကို လမ်းညွှန်ပေးသည်။', en: 'How to mark OMR, complete the writing sheet, and which pens are allowed.' },
    'ra.h_tools': { ko: '사용 가능한 필기구', my: 'အသုံးပြုခွင့်ရှိသော ရေးကိရိယာ', en: 'Permitted writing tools' },
    'ra.h_omr': { ko: 'OMR 카드 마킹 방법', my: 'OMR ကတ် အမှတ်ခြစ်နည်း', en: 'How to mark the OMR card' },
    'ra.h_writing': { ko: '쓰기 답안지 작성 (TOPIK Ⅱ)', my: 'ရေးသားဖြေဆိုခြင်း အဖြေစာရွက် (TOPIK Ⅱ)', en: 'Writing answer sheet (TOPIK II)' },
    'ra.h_code': { ko: '응시자 코드·수험번호 기재', my: 'ဖြေဆိုသူ ကုဒ် · ဖြေဆိုမှတ်ပုံတင်နံပါတ် ဖြည့်သွင်းခြင်း', en: 'Candidate code & exam number entry' },
    'rf.lead': { ko: '응시료 금액, 결제 방법, 환불 정책을 안내합니다. (2026 기준)', my: 'ဖြေဆိုကြေး ပမာဏ၊ ငွေပေးချေနည်းနှင့် ငွေပြန်အမ်း မူဝါဒကို လမ်းညွှန်ပေးသည်။ (2026 အခြေခံ)', en: 'Fee amount, payment method, and refund policy (as of 2026).' },
    'rf.h_fee': { ko: '응시료', my: 'ဖြေဆိုကြေး', en: 'Test fee' },
    'rf.h_payment': { ko: '결제 방법', my: 'ငွေပေးချေနည်း', en: 'Payment method' },
    'rf.h_refund': { ko: '환불 정책', my: 'ငွေပြန်အမ်း မူဝါဒ', en: 'Refund policy' },
    'rf.h_receipt': { ko: '영수증 발급', my: 'ပြေစာ ထုတ်ပေးခြင်း', en: 'Receipt issuance' },
    'ri.lead': { ko: '시험 당일 인정 신분증 종류 및 미소지 시 대응 안내입니다.', my: 'စာမေးပွဲနေ့တွင် လက်ခံသော အထောက်အထား အမျိုးအစားများနှင့် မပါပါက ဆောင်ရွက်ရမည့်အရာကို လမ်းညွှန်ပေးသည်။', en: 'Accepted ID types for test day and what to do if you have none.' },
    'ri.h_accepted': { ko: '인정 신분증', my: 'လက်ခံသော အထောက်အထား', en: 'Accepted ID' },
    'ri.h_unaccepted': { ko: '불인정 신분증', my: 'လက်မခံသော အထောက်အထား', en: 'Unaccepted ID' },
    'ri.h_missing': { ko: '신분증 미소지 시', my: 'အထောက်အထား မပါပါက', en: 'If you have no ID' },
    'ri.h_match': { ko: '신분증 사진과 응시자 일치 확인', my: 'အထောက်အထားဓာတ်ပုံနှင့် ဖြေဆိုသူ ကိုက်ညီမှု စစ်ဆေးခြင်း', en: 'Matching ID photo with the candidate' },

    /* ── 공통 GNB/드로어/탭바 (common.js Lang.t 렌더 — ko/my/en 모두 필요) ── */
    'brand.sub': { ko: '주미얀마 대한민국 대사관', my: 'မြန်မာနိုင်ငံရှိ ကိုရီးယားသံရုံး', en: 'Embassy of the Republic of Korea in Myanmar' },
    'menu.all': { ko: '전체 메뉴', my: 'မီနူးအားလုံး', en: 'All menu' },
    'tab.home': { ko: '홈', my: 'ပင်မ', en: 'Home' },
    'tab.apply': { ko: '접수', my: 'လျှောက်ရန်', en: 'Apply' },
    'tab.board': { ko: '게시판', my: 'ဘုတ်', en: 'Board' },
    'tab.my': { ko: '마이', my: 'ကျွန်ုပ်', en: 'My' },
    'msg.logout_confirm': { ko: '로그아웃 하시겠습니까?', my: 'ထွက်ရန် သေချာပါသလား။', en: 'Do you want to sign out?' },

    /* ── 공통 버튼/라벨 (여러 페이지 공유) ── */
    'btn.next': { ko: '다음', my: 'ရှေ့သို့', en: 'Next' },
    'btn.prev': { ko: '이전', my: 'နောက်သို့', en: 'Previous' },
    'btn.cancel': { ko: '취소', my: 'ပယ်ဖျက်', en: 'Cancel' },
    'btn.submit': { ko: '제출', my: 'တင်သွင်းရန်', en: 'Submit' },
    'btn.confirm': { ko: '확인', my: 'အတည်ပြု', en: 'Confirm' },
    'btn.close': { ko: '닫기', my: 'ပိတ်ရန်', en: 'Close' },
    'btn.save': { ko: '저장', my: 'သိမ်းရန်', en: 'Save' },
    'btn.list': { ko: '← 목록으로', my: '← စာရင်းသို့', en: '← Back to list' },
    'btn.write': { ko: '글쓰기', my: 'ရေးသားရန်', en: 'Write' },
    'btn.search': { ko: '검색', my: 'ရှာဖွေ', en: 'Search' },
    'lbl.required_mark': { ko: '필수', my: 'မဖြစ်မနေ', en: 'Required' },

    /* ── 게시판(fo-board.js 동적 렌더 — TPKMLang.t 사용, ko/my/en 필요) ── */
    'board.comments': { ko: '댓글', my: 'မှတ်ချက်များ', en: 'Comments' },
    'board.no_comments': { ko: '아직 등록된 댓글이 없습니다.', my: 'မှတ်ချက် မရှိသေးပါ။', en: 'No comments yet.' },
    'board.comment_ph': { ko: '댓글을 입력하세요', my: 'မှတ်ချက် ရေးသားပါ', en: 'Write a comment' },
    'board.reply_ph': { ko: '답글을 입력하세요', my: 'ပြန်ကြားချက် ရေးသားပါ', en: 'Write a reply' },
    'board.post': { ko: '등록', my: 'တင်ရန်', en: 'Post' },
    'board.reply': { ko: '답글', my: 'ပြန်ကြားရန်', en: 'Reply' },
    'board.posting': { ko: '등록 중…', my: 'တင်နေသည်…', en: 'Posting…' },
    'board.login_to_comment': { ko: '댓글을 작성하려면 로그인이 필요합니다.', my: 'မှတ်ချက်ရေးရန် အကောင့်ဝင်ရန် လိုအပ်သည်။', en: 'Sign in to write a comment.' },
    'board.admin': { ko: '관리자', my: 'စီမံခန့်ခွဲသူ', en: 'Admin' },
    'board.admin_reply': { ko: '답변', my: 'အဖြေ', en: 'Reply' },
    'board.loading': { ko: '불러오는 중…', my: 'ဖွင့်နေသည်…', en: 'Loading…' },
    'board.empty': { ko: '등록된 게시글이 없습니다.', my: 'ပို့စ် မရှိသေးပါ။', en: 'No posts yet.' },
    'board.network_err': { ko: '네트워크 오류입니다.', my: 'ကွန်ရက် ချို့ယွင်းမှု ဖြစ်ပွားသည်။', en: 'A network error occurred.' },
    'board.locked_msg': { ko: '비밀글입니다. 작성자·관리자만 열람할 수 있습니다.', my: 'လျှို့ဝှက်ပို့စ်ဖြစ်သည်။ ရေးသားသူ/စီမံခန့်ခွဲသူသာ ကြည့်ရှုနိုင်သည်။', en: 'Secret post. Only the author/admin can view it.' },
    'board.secret_label': { ko: '비밀글', my: 'လျှို့ဝှက်ပို့စ်', en: 'Secret post' },
    'board.mine': { ko: '본인', my: 'ကိုယ်တိုင်', en: 'Me' },
    'board.enter_comment': { ko: '댓글 내용을 입력해 주세요.', my: 'မှတ်ချက် အကြောင်းအရာ ထည့်ပါ။', en: 'Please enter your comment.' },
    'board.load_fail': { ko: '게시글을 불러올 수 없습니다', my: 'ပို့စ်ကို ဖွင့်၍မရပါ', en: 'Could not load the post' },
    'board.submitting': { ko: '제출 중…', my: 'တင်သွင်းနေသည်…', en: 'Submitting…' },
    'board.server_err': { ko: '서버에 연결할 수 없습니다.', my: 'ဆာဗာသို့ ချိတ်ဆက်၍မရပါ။', en: 'Cannot connect to the server.' },
    'board.submitted': { ko: '접수되었습니다.', my: 'တင်သွင်းပြီးပါပြီ။', en: 'Submitted.' },
    'board.title_len': { ko: '제목을 100자 이내로 입력해 주세요.', my: 'ခေါင်းစဉ်ကို စာလုံး ၁၀၀ အတွင်း ထည့်ပါ။', en: 'Please enter a title within 100 characters.' },
    'board.body_len': { ko: '내용을 10자 이상 입력해 주세요.', my: 'အကြောင်းအရာကို စာလုံး ၁၀ လုံးအထက် ထည့်ပါ။', en: 'Please enter at least 10 characters.' },
    'board.qna_default': { ko: '문의', my: 'စုံစမ်းမေးမြန်းရန်', en: 'Inquiry' },
    'board.write_pw': { ko: '비밀글 비밀번호를 4자 이상 입력해 주세요.', my: 'လျှို့ဝှက်ပို့စ် စကားဝှက်ကို စာလုံး ၄ လုံးအထက် ထည့်ပါ။', en: 'Enter a secret-post password of at least 4 characters.' },
    'board.max_files': { ko: '첨부파일은 최대 {n}개까지 첨부할 수 있습니다.', my: 'ပူးတွဲဖိုင် အများဆုံး {n} ခုအထိ တွဲနိုင်သည်။', en: 'You can attach up to {n} files.' },

    /* 게시판 첨부파일 */
    'board.attachments': { ko: '첨부파일', my: 'ပူးတွဲဖိုင်များ', en: 'Attachments' },
    'board.uploading': { ko: '업로드 중…', my: 'အပ်လုဒ်တင်နေသည်…', en: 'Uploading…' },
    'board.upload_fail': { ko: '업로드 실패', my: 'အပ်လုဒ်မအောင်မြင်ပါ', en: 'Upload failed' },
    'board.upload_wait': { ko: '파일 업로드가 끝날 때까지 기다려 주세요.', my: 'ဖိုင်တင်ပြီးသည်အထိ စောင့်ပါ။', en: 'Please wait until the upload finishes.' },
    'board.file_too_big': { ko: '파일 크기는 5MB 이하여야 합니다.', my: 'ဖိုင်အရွယ်အစား 5MB အောက် ဖြစ်ရမည်။', en: 'Each file must be 5MB or smaller.' },
    'board.file_type': { ko: 'jpg, png, pdf 형식만 첨부할 수 있습니다.', my: 'jpg, png, pdf ဖိုင်အမျိုးအစားသာ ပူးတွဲနိုင်သည်။', en: 'Only jpg, png, and pdf files are allowed.' },
    'board.file_select': { ko: '파일 선택', my: 'ဖိုင်ရွေးရန်', en: 'Choose files' },
    'board.file_remove': { ko: '삭제', my: 'ဖျက်ရန်', en: 'Remove' },
    'board.download': { ko: '다운로드', my: 'ဒေါင်းလုဒ်', en: 'Download' },

    /* 게시판 비밀글 잠금 해제 */
    'board.unlock_enter_pw': { ko: '비밀번호를 입력해 주세요.', my: 'စကားဝှက် ထည့်ပါ။', en: 'Please enter the password.' },
    'board.unlock_wrong': { ko: '비밀번호가 일치하지 않습니다.', my: 'စကားဝှက် မကိုက်ညီပါ။', en: 'The password is incorrect.' },
    'board.unlock_wrong_left': { ko: '비밀번호가 일치하지 않습니다. (남은 횟수 {n}회)', my: 'စကားဝှက် မကိုက်ညီပါ။ (ကျန် {n} ကြိမ်)', en: 'Incorrect password. ({n} attempts left)' },
    'board.unlock_locked': { ko: '비밀번호를 여러 번 잘못 입력하여 일시적으로 잠겼습니다. 잠시 후 다시 시도해 주세요.', my: 'စကားဝှက် အကြိမ်များစွာ မှားယွင်းသဖြင့် ယာယီ ပိတ်ထားသည်။ ခဏအကြာတွင် ပြန်စမ်းပါ။', en: 'Locked due to repeated incorrect passwords. Please try again later.' },
    'board.unlocking': { ko: '확인 중…', my: 'စစ်ဆေးနေသည်…', en: 'Checking…' },

    /* ── 증명사진 규격 (photo-upload.js · signup/register) ── */
    'photo.spec_title': { ko: '증명사진 규격 안내', my: 'သက်သေခံ ဓာတ်ပုံ စံချိန်စံညွှန်း', en: 'ID photo requirements' },
    'photo.spec_1': { ko: '여권용 정면 컬러 사진 (JPG) · 흰색·단색 배경', my: 'ပတ်စ်ပို့သုံး ရှေ့မျက်နှာ အရောင်ဓာတ်ပုံ (JPG) · အဖြူ/တစ်ရောင်တည်း နောက်ခံ', en: 'Passport-style frontal color photo (JPG) · white/plain background' },
    'photo.spec_2': { ko: '최근 6개월 이내 촬영한 사진', my: 'လွန်ခဲ့သော ၆ လအတွင်း ရိုက်ထားသော ဓာတ်ပုံ', en: 'Taken within the last 6 months' },
    'photo.spec_3': { ko: '모자·학사모·선글라스·이어폰 착용 금지', my: 'ဦးထုပ်·ဘွဲ့ဦးထုပ်·နေကာမျက်မှန်·နားကြပ် တပ်ဆင်ခြင်း မပြုရ', en: 'No hats/caps, sunglasses, or earphones' },
    'photo.spec_4': { ko: '앞머리로 얼굴(눈썹·눈)을 가리지 않음', my: 'ရှေ့ဆံပင်ဖြင့် မျက်နှာ (မျက်ခုံး·မျက်လုံး) ကို မဖုံးအုပ်ရ', en: 'Bangs must not cover the face (eyebrows/eyes)' },
    'photo.spec_5': { ko: '위·아래·좌·우가 아닌 정면 사진', my: 'အပေါ်·အောက်·ဘယ်·ညာ မဟုတ်ဘဲ ရှေ့မျက်နှာ တည့်တည့်', en: 'A frontal photo, not tilted up/down/left/right' },
    'photo.spec_6': { ko: '흑백·흐릿·불분명한 사진 불가', my: 'အဖြူအမည်း·ဝါးဝါး·မရှင်းသော ဓာတ်ပုံ မရ', en: 'No black-and-white, blurry, or unclear photos' },
    'photo.spec_7': { ko: '연예인·타인 등 본인이 아닌 사진 불가', my: 'အနုပညာရှင်·သူတစ်ပါး စသည့် မိမိမဟုတ်သော ဓာတ်ပုံ မရ', en: 'No photos of celebrities or other people' },
    'photo.spec_filename': { ko: '파일명은 접수 후 시스템이 수험번호로 자동 관리합니다.', my: 'ဖိုင်အမည်ကို လျှောက်ထားပြီးနောက် စနစ်က ဖြေဆိုသူနံပါတ်ဖြင့် အလိုအလျောက် စီမံသည်။', en: 'The file name is managed automatically by the system using your exam number.' },
    'photo.spec_note': { ko: '부적합 사진은 사진 심사에서 반려되어 응시·성적 처리가 불가할 수 있습니다. 접수 단계에서는 사진 변경이 불가하므로 가입·수정 시 신중히 등록해 주세요.', my: 'မသင့်လျော်သော ဓာတ်ပုံများကို ဓာတ်ပုံစိစစ်ရာတွင် ပယ်ချနိုင်ပြီး ဖြေဆိုခွင့်·ရမှတ်ဆောင်ရွက်မှု မရနိုင်ပါ။ လျှောက်ထားဆဲအဆင့်တွင် ဓာတ်ပုံ ပြောင်းလဲ၍မရသဖြင့် မှတ်ပုံတင်/ပြင်ဆင်စဉ် ဂရုတစိုက် တင်ပါ။', en: 'Unsuitable photos may be rejected in review, making the exam/score processing impossible. Photos cannot be changed during registration, so upload carefully at sign-up.' },
    'photo.err_select': { ko: '파일을 선택해 주세요.', my: 'ဖိုင် ရွေးချယ်ပါ။', en: 'Please select a file.' },
    'photo.err_type': { ko: 'JPG·PNG 형식만 업로드할 수 있습니다.', my: 'JPG·PNG ဖိုင်အမျိုးအစားသာ တင်နိုင်သည်။', en: 'Only JPG/PNG files can be uploaded.' },
    'photo.err_size': { ko: '파일 크기는 2MB 이하여야 합니다.', my: 'ဖိုင်အရွယ်အစား 2MB အောက် ဖြစ်ရမည်။', en: 'The file must be 2MB or smaller.' },
    'photo.preview': { ko: '사진<br>미리보기', my: 'ဓာတ်ပုံ<br>အစမ်းကြည့်', en: 'Photo<br>preview' },
    'photo.preview_alt': { ko: '증명사진 미리보기', my: 'သက်သေခံ ဓာတ်ပုံ အစမ်းကြည့်', en: 'ID photo preview' },

    /* ── 공지/FAQ (fo-notices.js 등 공용 동적 렌더 — ko/my/en) ── */
    /* ── 폼 검증 (val.*) ── */
    'val.birth_format': { ko: '생년월일을 YYYYMMDD 8자리로 입력해 주세요.', my: 'မွေးနေ့ကို YYYYMMDD ၈ လုံးဖြင့် ထည့်ပါ။', en: 'Enter your date of birth as 8 digits (YYYYMMDD).' },
    'val.birth_age': { ko: '만 {age}세 미만은 회원가입할 수 없습니다.', my: 'အသက် {age} နှစ်အောက် မှတ်ပုံတင်၍ မရပါ။', en: 'You must be at least {age} years old to sign up.' },
    'val.roster_codes': { ko: '직업·응시동기·응시목적을 선택해 주세요.', my: 'အလုပ်အကိုင်·ဖြေဆိုရခြင်း အကြောင်းရင်း·ရည်ရွယ်ချက်ကို ရွေးပါ။', en: 'Please select occupation, reason, and purpose.' },
    'val.email': { ko: '유효한 이메일을 입력해 주세요.', my: 'မှန်ကန်သော အီးမေးလ် ထည့်ပါ။', en: 'Please enter a valid email address.' },
    'val.password_rule': { ko: '비밀번호는 8자 이상, 영문·숫자·특수문자를 각각 포함해야 합니다.', my: 'စကားဝှက်သည် အနည်းဆုံး ၈ လုံး၊ အက္ခရာ·ဂဏန်း·သင်္ကေတ တစ်ခုစီ ပါရမည်။', en: 'Password must be 8+ characters and include a letter, number, and symbol.' },
    'val.password_mismatch': { ko: '비밀번호 확인이 일치하지 않습니다.', my: 'စကားဝှက် အတည်ပြုချက် မကိုက်ညီပါ။', en: 'Password confirmation does not match.' },
    'val.pw_min': { ko: '영문·숫자·특수문자를 각각 포함하여 8자 이상 입력해 주세요.', my: 'အက္ခရာ·ဂဏန်း·သင်္ကေတ တစ်ခုစီ ပါဝင်သော ၈ လုံးအထက် ထည့်ပါ။', en: 'Enter 8+ characters including a letter, number, and symbol.' },
    'val.pw_new_mismatch': { ko: '새 비밀번호가 서로 일치하지 않습니다.', my: 'စကားဝှက်အသစ် မကိုက်ညီပါ။', en: 'New passwords do not match.' },
    'val.code_6': { ko: '6자리 인증코드를 입력해 주세요.', my: '၆ လုံး အတည်ပြုကုဒ် ထည့်ပါ။', en: 'Enter the 6-digit verification code.' },
    'val.required_fields': { ko: '한글 성명, 영문 성명, 연락처는 필수입니다.', my: 'ကိုရီးယားအမည်၊ အင်္ဂလိပ်အမည်၊ ဆက်သွယ်ရန်နံပါတ် လိုအပ်သည်။', en: 'Korean name, English name, and phone are required.' },
    'val.verify_first': { ko: '먼저 인증코드를 확인해 주세요.', my: 'အရင် အတည်ပြုကုဒ် စစ်ဆေးပါ။', en: 'Please verify the code first.' },

    /* ── 공통 메시지 (common.*) ── */
    'common.no_server': { ko: '서버에 연결할 수 없습니다.', my: 'ဆာဗာနှင့် ချိတ်ဆက်၍ မရပါ။', en: 'Cannot connect to the server.' },
    'common.no_server_retry': { ko: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.', my: 'ဆာဗာနှင့် ချိတ်ဆက်၍ မရပါ။ ခဏနေ ပြန်စမ်းပါ။', en: 'Cannot connect to the server. Please try again shortly.' },
    'common.network_err': { ko: '네트워크 오류입니다.', my: 'ကွန်ရက် အမှားဖြစ်သည်။', en: 'Network error.' },
    'common.network_err_detail': { ko: '네트워크 오류입니다. 연결 상태를 확인해 주세요.', my: 'ကွန်ရက် အမှားဖြစ်သည်။ ချိတ်ဆက်မှု စစ်ဆေးပါ။', en: 'Network error. Please check your connection.' },
    'common.checking': { ko: '확인 중…', my: 'စစ်ဆေးနေသည်…', en: 'Checking…' },
    'common.sending': { ko: '발송 중…', my: 'ပို့နေသည်…', en: 'Sending…' },
    'common.verifying': { ko: '확인 중…', my: 'အတည်ပြုနေသည်…', en: 'Verifying…' },
    'common.saving': { ko: '저장 중…', my: 'သိမ်းနေသည်…', en: 'Saving…' },
    'common.resend_ok': { ko: '인증코드를 다시 발송했습니다.', my: 'အတည်ပြုကုဒ် ပြန်ပို့ပြီးပါပြီ။', en: 'Verification code resent.' },
    'common.login_required': { ko: '로그인이 필요합니다.', my: 'ဝင်ရောက်ရန် လိုအပ်သည်။', en: 'Sign-in required.' },
    'common.session_expired': { ko: '로그인이 만료되었습니다. 다시 로그인해 주세요.', my: 'ဝင်ရောက်မှု သက်တမ်းကုန်ပြီ။ ပြန်ဝင်ပါ။', en: 'Your session expired. Please sign in again.' },
    'common.processing': { ko: '접수 정보를 확인하는 중입니다. 잠시 후 다시 시도해 주세요.', my: 'လျှောက်လွှာ အချက်အလက် စစ်ဆေးနေသည်။ ခဏနေ ပြန်စမ်းပါ။', en: 'Checking registration info. Please try again shortly.' },
    'common.generic_err': { ko: '요청을 처리할 수 없습니다.', my: 'တောင်းဆိုမှုကို ဆောင်ရွက်၍ မရပါ။', en: 'Unable to process the request.' },
    'common.conflict': { ko: '이미 처리된 요청입니다.', my: 'ဤတောင်းဆိုမှုကို ပြီးသား ဆောင်ရွက်ပြီးပါပြီ။', en: 'This request was already processed.' },
    'common.rate_limit': { ko: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', my: 'တောင်းဆိုမှု များလွန်းသည်။ ခဏနေ ပြန်စမ်းပါ။', en: 'Too many requests. Please try again later.' },
    'common.api_disabled': { ko: 'API 연결이 설정되지 않았습니다.', my: 'API ချိတ်ဆက်မှု မပြင်ဆင်ရသေးပါ။', en: 'API connection is not configured.' },

    /* ── API 오류 코드 (err.*) ── */
    'err.GENERIC': { ko: '요청을 처리할 수 없습니다.', my: 'တောင်းဆိုမှုကို ဆောင်ရွက်၍ မရပါ။', en: 'Unable to process the request.' },
    'err.UNAUTHORIZED': { ko: '로그인이 필요합니다.', my: 'ဝင်ရောက်ရန် လိုအပ်သည်။', en: 'Sign-in required.' },
    'err.INVALID_CREDENTIALS': { ko: '이메일 또는 비밀번호가 올바르지 않습니다.', my: 'အီးမေးလ် သို့မဟုတ် စကားဝှက် မမှန်ပါ။', en: 'Incorrect email or password.' },
    'err.ACCOUNT_LOCKED': { ko: '로그인 시도 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.', my: 'ဝင်ရောက်မှု ကြိုးပမ်းချက် များလွန်းသည်။ ခဏနေ ပြန်စမ်းပါ။', en: 'Too many sign-in attempts. Please try again later.' },
    'err.ACCOUNT_INACTIVE': { ko: '이용이 제한된 계정입니다.', my: 'ဤအကောင့်ကို အသုံးပြု၍မရပါ။', en: 'This account is restricted.' },
    'err.OTP_EXCEEDED': { ko: '인증코드 확인에 6회 실패했습니다. [재발송]으로 새 코드를 받아 주세요.', my: 'အတည်ပြုကုဒ် ၆ ကြိမ် မအောင်မြင်ပါ။ [ပြန်ပို့ရန်] ဖြင့် ကုဒ်အသစ် ရယူပါ။', en: '6 failed code attempts. Use [Resend] to get a new code.' },
    'err.INVALID_CODE': { ko: '인증코드가 올바르지 않거나 만료되었습니다.', my: 'အတည်ပြုကုဒ် မမှန်ပါ သို့မဟုတ် သက်တမ်းကုန်ပြီ။', en: 'Invalid or expired verification code.' },
    'err.INVALID_TOKEN': { ko: '인증이 만료되었습니다. 다시 시도해 주세요.', my: 'အတည်ပြုမှု သက်တမ်းကုန်ပြီ။ ပြန်စမ်းပါ။', en: 'Authentication expired. Please try again.' },
    'err.EMAIL_ALREADY_REGISTERED': { ko: '이미 가입된 이메일입니다.', my: 'ဤအီးမေးလ်ဖြင့် မှတ်ပုံတင်ပြီးသားဖြစ်သည်။', en: 'This email is already registered.' },
    'err.SERVICE_UNAVAILABLE': { ko: '서비스를 일시적으로 이용할 수 없습니다.', my: 'ဝန်ဆောင်မှုကို ယာယီ အသုံးပြု၍မရပါ။', en: 'Service temporarily unavailable.' },
    'err.VALIDATION_ERROR': { ko: '입력값을 확인해 주세요.', my: 'ထည့်သွင်းချက်ကို စစ်ဆေးပါ။', en: 'Please check your input.' },
    'err.NOT_FOUND': { ko: '요청한 정보를 찾을 수 없습니다.', my: 'တောင်းဆိုထားသော အချက်အလက် မတွေ့ပါ။', en: 'Requested information not found.' },
    'err.AGE_RESTRICTED': { ko: '만 14세 미만은 회원가입할 수 없습니다.', my: 'အသက် ၁၄ နှစ်အောက် မှတ်ပုံတင်၍ မရပါ။', en: 'You must be at least 14 years old to sign up.' },
    'err.ROUND_NOT_OPEN': { ko: '접수 가능한 회차가 아닙니다.', my: 'လျှောက်ထားနိုင်သော အကြိမ်ရေ မဟုတ်ပါ။', en: 'This session is not open for registration.' },
    'err.INVALID_VENUE': { ko: '유효하지 않은 시험장입니다.', my: 'မမှန်သော စာစစ်ဌာန ဖြစ်သည်။', en: 'Invalid exam venue.' },
    'err.ALREADY_SUBMITTED': { ko: '이미 접수 진행 중인 내역이 있습니다.', my: 'လျှောက်ထားမှု ဆောင်ရွက်ဆဲ ရှိပြီးသားဖြစ်သည်။', en: 'You already have a registration in progress.' },
    'err.ALREADY_CANCELLED': { ko: '이미 취소된 접수입니다.', my: 'ပယ်ဖျက်ပြီးသား လျှောက်လွှာဖြစ်သည်။', en: 'This registration is already cancelled.' },
    'err.CANNOT_CANCEL': { ko: '수납 완료된 접수는 취소할 수 없습니다.', my: 'ကြေးသွင်းပြီးသော လျှောက်လွှာကို ပယ်ဖျက်၍ မရပါ။', en: 'Paid registrations cannot be cancelled.' },
    'err.RATE_LIMITED': { ko: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', my: 'တောင်းဆိုမှု များလွန်းသည်။ ခဏနေ ပြန်စမ်းပါ။', en: 'Too many requests. Please try again later.' },
    'err.NETWORK': { ko: '네트워크 오류입니다. 연결 상태를 확인해 주세요.', my: 'ကွန်ရက် အမှားဖြစ်သည်။ ချိတ်ဆက်မှု စစ်ဆေးပါ။', en: 'Network error. Please check your connection.' },
    'err.API_DISABLED': { ko: 'API 연결이 설정되지 않았습니다.', my: 'API ချိတ်ဆက်မှု မပြင်ဆင်ရသေးပါ။', en: 'API connection is not configured.' },
    'err.CONFLICT': { ko: '이미 처리된 요청입니다.', my: 'ဤတောင်းဆိုမှုကို ပြီးသား ဆောင်ရွက်ပြီးပါပြီ။', en: 'This request was already processed.' },

    /* ── 카드 상태 (card.*) ── */
    'card.photo': { ko: '사진 심사중', my: 'ဓာတ်ပုံ စိစစ်နေဆဲ', en: 'Photo review' },
    'card.pay': { ko: '수납 대기', my: 'ကြေးသွင်း စောင့်ဆိုင်း', en: 'Payment pending' },
    'card.in_progress': { ko: '접수 진행중', my: 'လျှောက်ထားမှု ဆောင်ရွက်ဆဲ', en: 'Registration in progress' },
    'card.review': { ko: '심사 진행중', my: 'စိစစ်မှု ဆောင်ရွက်ဆဲ', en: 'Under review' },

    /* ── 회원가입 JS (su.err_*) ── */
    'su.err_name_ko': { ko: '한글 성명을 입력해 주세요.', my: 'ကိုရီးယား အမည် ထည့်ပါ။', en: 'Please enter your Korean name.' },
    'su.err_name_en': { ko: '영문 성명을 입력해 주세요.', my: 'အင်္ဂလိပ် အမည် ထည့်ပါ။', en: 'Please enter your English name.' },
    'su.err_profile_codes': { ko: '성별·국적·제1언어를 선택해 주세요.', my: 'ကျား/မ·နိုင်ငံသား·ပထမဘာသာစကား ရွေးပါ။', en: 'Please select gender, nationality, and first language.' },
    'su.err_phone': { ko: '연락처를 입력해 주세요.', my: 'ဆက်သွယ်ရန်နံပါတ် ထည့်ပါ။', en: 'Please enter your phone number.' },
    'su.err_photo': { ko: '증명사진을 등록해 주세요.', my: 'သက်သေခံ ဓာတ်ပုံ တင်ပါ။', en: 'Please upload an ID photo.' },
    'su.err_email': { ko: '이메일을 입력해 주세요.', my: 'အီးမေးလ် ထည့်ပါ။', en: 'Please enter your email.' },
    'su.err_email_fmt': { ko: '올바른 이메일 형식을 입력해 주세요.', my: 'မှန်ကန်သော အီးမေးလ် ပုံစံ ထည့်ပါ။', en: 'Please enter a valid email format.' },
    'su.err_otp_timeout': { ko: '인증 시간이 초과되었습니다. [재발송]을 눌러 주세요.', my: 'အတည်ပြုချိန် ကျော်လွန်ပြီ။ [ပြန်ပို့ရန်] နှိပ်ပါ။', en: 'Verification timed out. Press [Resend].' },
    'su.err_google_expired': { ko: 'Google 인증이 만료되었습니다. Step 1에서 다시 시도해 주세요.', my: 'Google အတည်ပြုမှု သက်တမ်းကုန်ပြီ။ အဆင့် ၁ တွင် ပြန်စမ်းပါ။', en: 'Google authentication expired. Try again in Step 1.' },
    'su.err_terms': { ko: '필수 약관에 동의해 주세요.', my: 'လိုအပ်သော စည်းကမ်းများကို သဘောတူပါ။', en: 'Please agree to the required terms.' },
    'su.err_email_verify': { ko: '이메일 인증을 완료해 주세요.', my: 'အီးမေးလ် အတည်ပြုမှု ပြီးမြောက်အောင် လုပ်ပါ။', en: 'Please complete email verification.' },
    'su.err_google_step1': { ko: 'Google 계정으로 Step 1을 완료해 주세요.', my: 'Google အကောင့်ဖြင့် အဆင့် ၁ ပြီးမြောက်အောင် လုပ်ပါ။', en: 'Complete Step 1 with your Google account.' },
    'su.err_google_retry': { ko: 'Google 인증이 만료되었습니다. 다시 시도해 주세요.', my: 'Google အတည်ပြုမှု သက်တမ်းကုန်ပြီ။ ပြန်စမ်းပါ။', en: 'Google authentication expired. Please try again.' },
    'su.err_server_retry': { ko: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.', my: 'ဆာဗာနှင့် ချိတ်ဆက်၍ မရပါ။ ခဏနေ ပြန်စမ်းပါ။', en: 'Cannot connect to the server. Please try again shortly.' },
    'su.err_timeout': { ko: '서버 응답이 지연되고 있습니다. 잠시 후 재발송을 눌러 주세요.', my: 'ဆာဗာ တုံ့ပြန်မှု နောက်ကျနေသည်။ ခဏနေ ပြန်ပို့ရန် နှိပ်ပါ။', en: 'Server response is delayed. Press resend shortly.' },
    'su.otp_hint_delay': { ko: '이메일 발송이 지연될 수 있습니다. 메일이 오면 6자리 코드를 입력해 주세요. (유효 5분)', my: 'အီးမေးလ် ပို့ဆောင်မှု နောက်ကျနိုင်သည်။ ရောက်လျှင် ၆ လုံးကုဒ် ထည့်ပါ။ (သက်တမ်း ၅ မိနစ်)', en: 'Email delivery may be delayed. Enter the 6-digit code when it arrives. (valid 5 min)' },
    'su.otp_hint': { ko: '이메일로 발송된 6자리 코드를 입력해 주세요. (유효 5분)', my: 'အီးမေးလ်သို့ ပို့ထားသော ၆ လုံးကုဒ် ထည့်ပါ။ (သက်တမ်း ၅ မိနစ်)', en: 'Enter the 6-digit code sent to your email. (valid 5 min)' },

    /* ── 로그인 JS (login.js_*) ── */
    'login.js_find_fields': { ko: '이름, 생년월일, 연락처를 모두 입력해 주세요.', my: 'အမည်၊ မွေးနေ့၊ ဆက်သွယ်ရန်နံပါတ် အားလုံး ထည့်ပါ။', en: 'Please enter name, date of birth, and phone.' },
    'login.js_go_login': { ko: '로그인하러 가기', my: 'ဝင်ရောက်ရန် သွားမည်', en: 'Go to sign in' },
    'login.js_find_none': { ko: '입력하신 정보와 일치하는 계정을 찾을 수 없습니다. 입력 내용을 다시 확인해 주세요.', my: 'ထည့်ထားသော အချက်အလက်နှင့် ကိုက်ညီသော အကောင့် မတွေ့ပါ။ ပြန်စစ်ဆေးပါ။', en: 'No account matches the information entered. Please check again.' },
    'login.js_find_match': { ko: '입력하신 정보와 일치하는 계정입니다.', my: 'ထည့်ထားသော အချက်အလက်နှင့် ကိုက်ညီသော အကောင့်ဖြစ်သည်။', en: 'Accounts matching your information:' },
    'login.js_acct_google': { ko: 'Google 계정', my: 'Google အကောင့်', en: 'Google account' },
    'login.js_acct_email': { ko: '일반 가입', my: 'အီးမေးလ် မှတ်ပုံတင်', en: 'Email sign-up' },
    'login.js_no_email': { ko: '입력하신 이메일로 가입된 계정이 없습니다.', my: 'ဤအီးမေးလ်ဖြင့် မှတ်ပုံတင်ထားသော အကောင့် မရှိပါ။', en: 'No account is registered with this email.' },
    'login.js_google_only': { ko: '입력하신 이메일은 Google 계정으로 가입된 계정입니다. 구글 로그인을 이용해 주세요.', my: 'ဤအီးမေးလ်သည် Google အကောင့်ဖြင့် မှတ်ပုံတင်ထားသည်။ Google ဖြင့် ဝင်ပါ။', en: 'This email was registered with Google. Please use Google sign-in.' },
    'login.js_fields_required': { ko: '이메일과 비밀번호를 모두 입력해 주세요.', my: 'အီးမေးလ်နှင့် စကားဝှက် နှစ်ခုလုံး ထည့်ပါ။', en: 'Please enter both email and password.' },
    'login.js_signing_in': { ko: '로그인 중…', my: 'ဝင်ရောက်နေသည်…', en: 'Signing in…' },

    /* ── 비밀번호 재설정 JS (pwr.js_*) ── */
    'pwr.js_verify_ok': { ko: '✓ 인증이 완료되었습니다. 새 비밀번호를 설정해 주세요.', my: '✓ အတည်ပြုပြီး။ စကားဝှက်အသစ် သတ်မှတ်ပါ။', en: '✓ Verified. Please set a new password.' },
    'pwr.js_verified': { ko: '인증 완료', my: 'အတည်ပြုပြီး', en: 'Verified' },
    'pwr.js_otp_exceeded': { ko: '인증코드 확인에 6회 실패했습니다. [재발송]으로 새 코드를 받아 주세요.', my: 'အတည်ပြုကုဒ် ၆ ကြိမ် မအောင်မြင်ပါ။ [ပြန်ပို့ရန်] ဖြင့် ကုဒ်အသစ် ရယူပါ။', en: '6 failed attempts. Use [Resend] for a new code.' },
    'pwr.js_pw_weak': { ko: '약함', my: 'အားနည်း', en: 'Weak' },
    'pwr.js_pw_mid': { ko: '보통', my: 'အလယ်အလတ်', en: 'Fair' },
    'pwr.js_pw_good': { ko: '강함', my: 'အားကောင်း', en: 'Strong' },
    'pwr.js_pw_very': { ko: '매우 강함', my: 'အလွန်အားကောင်း', en: 'Very strong' },
    'pwr.js_pw_meta': { ko: ' · 영문+숫자+특수문자 8자 이상 필수', my: ' · အက္ခရာ+ဂဏန်း+သင်္ကေတ ၈ လုံးအထက် လိုအပ်', en: ' · Letters + numbers + symbols, 8+ chars required' },
    'pwr.js_show': { ko: '표시', my: 'ပြရန်', en: 'Show' },
    'pwr.js_hide': { ko: '숨김', my: 'ဖျောက်ရန်', en: 'Hide' },

    /* ── 접수 JS (reg.err_*) ── */
    'reg.err_level': { ko: '응시 급수를 1개 이상 선택해 주세요.', my: 'ဖြေဆိုအဆင့် အနည်းဆုံး တစ်ခု ရွေးပါ။', en: 'Select at least one test level.' },
    'reg.err_level_locked': { ko: '진행 중인 급수는 선택할 수 없습니다.', my: 'ဆောင်ရွက်ဆဲ အဆင့်ကို ရွေးလို့ မရပါ။', en: 'In-progress levels cannot be selected.' },
    'reg.err_reapply_locked': { ko: '심사 진행 중인 급수는 재접수할 수 없습니다.', my: 'စိစစ်နေဆဲ အဆင့်ကို ပြန်လျှောက်လို့ မရပါ။', en: 'Levels under review cannot be re-applied.' },
    'reg.err_round': { ko: '응시 회차를 선택해 주세요.', my: 'ဖြေဆိုမည့် အကြိမ်ရေ ရွေးပါ။', en: 'Please select an exam session.' },
    'reg.err_venue': { ko: '시험장을 선택해 주세요.', my: 'စာစစ်ဌာန ရွေးပါ။', en: 'Please select a venue.' },
    'reg.err_terms': { ko: '약관에 동의해 주세요.', my: 'စည်းကမ်းများကို သဘောတူပါ။', en: 'Please agree to the terms.' },
    'reg.err_no_photo': { ko: '증명사진이 등록되어 있지 않습니다. 마이페이지에서 사진을 등록한 뒤 접수해 주세요.', my: 'သက်သေခံ ဓာတ်ပုံ မတင်ရသေးပါ။ ကျွန်ုပ်စာမျက်နှာတွင် တင်ပြီး လျှောက်ထားပါ။', en: 'No ID photo on file. Upload one on My page before registering.' },
    'reg.err_draft_saved': { ko: '작성 중인 접수 정보가 임시 저장되었습니다.\n다음에 시험 접수 화면에 다시 들어오시면 이어서 작성할 수 있습니다.', my: 'လျှောက်လွှာ အချက်အလက် ယာယီသိမ်းပြီးပါပြီ။\nနောက်တစ်ကြိမ် ပြန်ဝင်ပါက ဆက်လက် ရေးသားနိုင်ပါသည်။', en: 'Your draft was saved.\nReturn to registration later to continue.' },

    /* ── 마이페이지 프로필 JS (mpp.js_*) ── */
    'mpp.js_saved': { ko: '회원정보가 저장되었습니다.', my: 'အဖွဲ့ဝင် အချက်အလက် သိမ်းပြီးပါပြီ။', en: 'Profile saved.' },
    'mpp.js_pw_changed': { ko: '비밀번호가 변경되었습니다.\n보안을 위해 다시 로그인해 주세요.', my: 'စကားဝှက် ပြောင်းလဲပြီးပါပြီ။\nလုံခြုံရေးအတွက် ပြန်ဝင်ပါ။', en: 'Password changed.\nPlease sign in again for security.' },
    'mpp.js_pw_empty': { ko: '변경할 비밀번호를 입력해 주세요.', my: 'ပြောင်းလဲမည့် စကားဝှက် ထည့်ပါ။', en: 'Enter a new password to change.' },
    'mpp.js_pw_cur': { ko: '현재 비밀번호를 입력해 주세요.', my: 'လက်ရှိ စကားဝှက် ထည့်ပါ။', en: 'Enter your current password.' },
    'mpp.js_pw_same': { ko: '새 비밀번호는 현재 비밀번호와 달라야 합니다.', my: 'စကားဝှက်အသစ်သည် လက်ရှိစကားဝှက်နှင့် မတူရပါ။', en: 'New password must differ from the current one.' },
    'mpp.js_pw_confirm': { ko: '새 비밀번호 확인이 일치하지 않습니다.', my: 'စကားဝှက်အသစ် အတည်ပြုချက် မကိုက်ညီပါ။', en: 'New password confirmation does not match.' },
    'mpp.js_leave_done': { ko: '회원 탈퇴가 완료되었습니다.\n진행 중이던 접수 내역은 모두 취소 처리되었습니다. 이용해 주셔서 감사합니다.', my: 'အဖွဲ့ဝင် မှတ်ပုံတင်မှု ပယ်ဖျက်ပြီးပါပြီ။\nဆောင်ရွက်ဆဲ လျှောက်လွှာများ ပယ်ဖျက်ပြီးပါပြီ။ ကျေးဇူးတင်ပါသည်။', en: 'Your account was deleted.\nIn-progress registrations were cancelled. Thank you.' },
    'mpp.js_photo_fail': { ko: '기본정보는 저장되었지만 사진 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.', my: 'အချက်အလက် သိမ်းပြီးသော်လည်း ဓာတ်ပုံ တင်ခြင်း မအောင်မြင်ပါ။ ခဏနေ ပြန်စမ်းပါ။', en: 'Profile saved but photo upload failed. Please try again shortly.' },
    'mpp.js_changing': { ko: '변경 중…', my: 'ပြောင်းလဲနေသည်…', en: 'Changing…' },

    'nt.loading': { ko: '공지를 불러오는 중…', my: 'ကြေညာချက် ဖွင့်နေသည်…', en: 'Loading notices…' },
    'nt.fail': { ko: '공지를 불러올 수 없습니다.', my: 'ကြေညာချက် ဖွင့်၍မရပါ။', en: 'Could not load notices.' },
    'nt.none': { ko: '공지가 없습니다.', my: 'ကြေညာချက် မရှိပါ။', en: 'No notices.' },
    'nt.empty_home': { ko: '등록된 공지가 없습니다.', my: 'ကြေညာချက် မရှိသေးပါ။', en: 'No notices yet.' },
    'nt.search_none': { ko: '검색 조건에 맞는 공지가 없습니다.', my: 'ရှာဖွေမှုနှင့် ကိုက်ညီသော ကြေညာချက် မရှိပါ။', en: 'No notices match your search.' },
    'nt.views': { ko: '조회', my: 'ကြည့်ရှုမှု', en: 'Views' },
    'nt.attachments': { ko: '첨부파일', my: 'ပူးတွဲဖိုင်များ', en: 'Attachments' },
    'nt.detail_loading': { ko: '로딩 중입니다.', my: 'ဖွင့်နေသည်…', en: 'Loading…' },
    'nt.load_fail': { ko: '공지를 불러올 수 없습니다', my: 'ကြေညာချက် ဖွင့်၍မရပါ', en: 'Could not load the notice' }
  };

  /* 페이지별 사전(window.TPKM_PAGE_I18N)을 중앙 사전(T)에 병합. 페이지 HTML 안에서
     <script>로 정의해두면 빈 화면/충돌 없이 페이지 단위 번역을 추가할 수 있다. */
  function mergePageDict() {
    var pd = g.TPKM_PAGE_I18N;
    if (!pd) return;
    if (Array.isArray(pd)) {
      pd.forEach(function (d) { if (d) Object.assign(T, d); });
    } else {
      Object.assign(T, pd);
    }
  }

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

  function dispatchLangChange(lang) {
    try {
      document.dispatchEvent(new CustomEvent('tpkm:langchange', { detail: { lang: lang } }));
    } catch (e) { /* old browsers */ }
  }

  function currentLang() {
    if (g.TPKMLang && g.TPKMLang.get) return normLang(g.TPKMLang.get());
    if (g.TMI18N && g.TMI18N.getLang) return normLang(g.TMI18N.getLang());
    if (g.TMI18n && g.TMI18n.getLang) return normLang(g.TMI18n.getLang());
    return 'ko';
  }

  function bt(key, fallback) {
    var v = text(key, currentLang());
    return hasText(v) ? v : (fallback || '');
  }

  function btf(key, fallback, vars) {
    var s = bt(key, fallback);
    if (!vars) return s;
    Object.keys(vars).forEach(function (k) {
      s = s.split('{' + k + '}').join(String(vars[k]));
    });
    return s;
  }

  function skipI18nContent(el) {
    return el.classList.contains('has-photo');
  }

  function apply(lang) {
    lang = normLang(lang);
    if (lang === 'ko') {
      document.querySelectorAll('[' + STORE_ORIG + ']').forEach(function (el) {
        if (skipI18nContent(el)) return;
        var orig = el.getAttribute(STORE_ORIG);
        if (el.hasAttribute('data-i18n-content-html')) el.innerHTML = orig;
        else if (el.hasAttribute('data-i18n-content-placeholder')) el.placeholder = orig;
        else el.textContent = orig;
      });
      dispatchLangChange(lang);
      return;
    }
    document.querySelectorAll('[data-i18n-content]').forEach(function (el) {
      if (skipI18nContent(el)) return;
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
    dispatchLangChange(lang);
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
    mergePageDict();
    hookExistingI18n();
    var lang = 'ko';
    if (g.TMI18N && g.TMI18N.getLang) lang = g.TMI18N.getLang();
    else if (g.TPKMLang && g.TPKMLang.get) lang = g.TPKMLang.get();
    else if (g.TMI18n && g.TMI18n.getLang) lang = g.TMI18n.getLang();
    apply(lang);
  }

  g.TPKMBt = { bt: bt, btf: btf, text: text, currentLang: currentLang, normLang: normLang };
  g.TOPIKPageI18n = { T: T, text: text, bt: bt, btf: btf, apply: apply, normLang: normLang, boot: boot, mergePageDict: mergePageDict };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
