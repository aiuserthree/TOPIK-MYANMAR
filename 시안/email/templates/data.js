/* ============================================================
   TOPIK Myanmar — Transactional Email Templates
   Data layer: themes + content + sample values
   KO master content. Three visual concepts (A / B / C).
   ============================================================ */
(function () {
  // ---- Shared footer config --------------------------------
  const FOOTER = {
    sendingNote: "본 메일은 발신 전용입니다. 회신하셔도 답변을 받으실 수 없습니다.",
    supportLabel: "문의",
    operator: "주미얀마 대한민국 대사관 운영 · 국립국제교육원(NIIED) 주관",
    copyright: "© {year} TOPIK Myanmar. All rights reserved.",
    marketingNote:
      "본 메일은 광고성 정보 수신에 동의하신 회원에게 발송되었습니다. 수신을 원하지 않으시면 아래 수신거부를 눌러 주세요.",
    unsubscribeLabel: "수신거부",
  };

  // ---- Sample values (for live preview rendering) ----------
  const SAMPLE = {
    userName: "민 텟 아웅",
    userNameEn: "Min Thet Aung",
    siteUrl: "topik-myanmar.example",
    siteUrlFull: "https://topik-myanmar.example",
    supportEmail: "support@topik-myanmar.com",
    supportBoardUrl: "https://topik-myanmar.example/qna",
    year: "2026",
    // signup
    verificationCode: "482915",
    expiresMinutes: "5",
    // password
    email: "m****@gmail.com",
    // approve / reject
    applicantNo: "MMR-098-00471",
    roundName: "제98회",
    level: "TOPIK Ⅱ",
    examDate: "2026.05.17 (일)",
    venueName: "양곤 시험장 (YGN-01)",
    myPageUrl: "https://topik-myanmar.example/mypage",
    noticeUrl: "https://topik-myanmar.example/notice",
    refundUrl: "https://topik-myanmar.example/refund-correction",
    rejectReason: "제출하신 정보가 신분증과 일치하지 않습니다.",
    rejectCode: "정보 불일치",
    photoRejectReason: "정면 사진이 아닙니다. 얼굴이 정면을 향하도록 다시 촬영해 주세요.",
    photoRejectCode: "정면 아님",
    editProfileUrl: "https://topik-myanmar.example/mypage-profile.html",
    // temp pw
    temporaryPassword: "Tmp9#kQ2m",
    loginUrl: "https://topik-myanmar.example/login",
    adminUsername: "admin_kyaw",
    boLoginUrl: "https://admin.topik-myanmar.example/login",
    // board
    boardName: "환불·정보정정신청",
    postTitle: "응시료 환불 신청합니다",
    postId: "R-2026-0142",
    submittedAt: "2026.04.03 14:22",
    category: "환불 신청",
    secretFlag: "예 (비밀글)",
    postUrl: "https://topik-myanmar.example/refund-correction/142",
    boPostUrl: "https://admin.topik-myanmar.example/board/142",
    activityType: "공식 답변",
    // marketing
    noticeTitle: "제98회 TOPIK 접수 안내 및 유의사항",
    noticeCategory: "접수",
    publishedAt: "2026.04.01",
    unsubscribeUrl: "https://topik-myanmar.example/unsubscribe?token=••••",
    // account status (suspend / withdraw)
    accountAction: "suspended",
    accountStatusLabel: "정지",
    statusReason: "부정 접수 의심 — 운영 정책 위반",
    statusUntil: "2026.07.01",
    canceledApplications: "2",
    // member info change (BO)
    changedAt: "2026.04.03 15:40",
    changedBy: "관리자(admin_kyaw)",
    changedFieldsSummary: "연락처 · 국적",
    changeDiffHtml:
      "연락처: 09-421-xxx → 09-555-1234\n국적: 미얀마 → 태국",
    // password expiry reminder (6 months)
    lastPasswordChange: "2025.09.15",
    daysSincePwChange: "195",
    passwordChangeUrl: "https://topik-myanmar.example/mypage/profile#password",
  };

  // ---- Theme token sets ------------------------------------
  const FONT = "'Pretendard','Pretendard JP',-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
  const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

  const THEMES = {
    A: {
      id: "A",
      label: "공식형",
      tagline: "정부·기관 신뢰감. 네이비 밴드 헤더, 각진 버튼, 하이라인 구분선.",
      font: FONT, mono: MONO,
      pageBg: "#eef1f6", cardBg: "#ffffff",
      ink: "#14213d", body: "#3a4252", sub: "#6b7280",
      primary: "#1a4fa0", primaryDark: "#143b78", onPrimary: "#ffffff",
      accentTint: "#eaf1fb", line: "#dce3ef",
      cardRadius: 8, btnRadius: 6, codeRadius: 8, noticeRadius: 8,
      cardPad: 36, outerPad: 24,
      headerStyle: "band", headerBg: "#1a4fa0", headerInk: "#ffffff",
      topStripe: "", logoStyle: "wordmark",
      eyebrowStyle: "rule", btnStyle: "solid",
      footerStyle: "light", useEnEyebrow: false,
      status: { positive: "#0a7d3c", warn: "#b76b00", negative: "#c8322b" },
      statusTint: { positive: "#e7f6ee", warn: "#fdf2e2", negative: "#fcebea" },
    },
    B: {
      id: "B",
      label: "카드형",
      tagline: "친근한 포털. TK 배지 로고, 둥근 카드·버튼, 컬러 상태 칩.",
      font: FONT, mono: MONO,
      pageBg: "#e8edf5", cardBg: "#ffffff",
      ink: "#1b2330", body: "#434b5c", sub: "#79818f",
      primary: "#1a4fa0", primaryDark: "#143b78", onPrimary: "#ffffff",
      accentTint: "#eef4ff", line: "#e4eaf3",
      cardRadius: 20, btnRadius: 12, codeRadius: 14, noticeRadius: 14,
      cardPad: 32, outerPad: 28,
      headerStyle: "white", headerBg: "#ffffff", headerInk: "#1a4fa0",
      topStripe: "#1a4fa0", logoStyle: "badge",
      eyebrowStyle: "pill", btnStyle: "solid",
      footerStyle: "light", useEnEyebrow: false,
      status: { positive: "#0a7d3c", warn: "#b76b00", negative: "#c8322b" },
      statusTint: { positive: "#e7f6ee", warn: "#fdf2e2", negative: "#fcebea" },
    },
    C: {
      id: "C",
      label: "에디토리얼형",
      tagline: "모던 에디토리얼. 영문 eyebrow·인덱스, 직각 모서리, 다크 푸터, 모노 숫자.",
      font: FONT, mono: MONO,
      pageBg: "#ffffff", cardBg: "#ffffff",
      ink: "#0e1c33", body: "#2f3947", sub: "#7a828c",
      primary: "#1a4fa0", primaryDark: "#0e1c33", onPrimary: "#ffffff",
      accentTint: "#f4f6fa", line: "#e6e9ef",
      cardRadius: 0, btnRadius: 0, codeRadius: 0, noticeRadius: 0,
      cardPad: 44, outerPad: 0,
      headerStyle: "minimal", headerBg: "#ffffff", headerInk: "#0e1c33",
      topStripe: "", logoStyle: "minimal",
      eyebrowStyle: "caps", btnStyle: "arrow",
      footerStyle: "dark", useEnEyebrow: true,
      status: { positive: "#0a7d3c", warn: "#b76b00", negative: "#c8322b" },
      statusTint: { positive: "#eef6f1", warn: "#faf3e8", negative: "#f9edec" },
    },
  };

  // ---- DB / email_outbox.template_key (snake_case) ----------
  // preview `key` (kebab) ↔ production `templateKey`. See 시안/email/README.md
  const DEFAULT_THEME = "C";

  // ---- Templates (KO master; gap 3종은 i18n ko/my/en) ---------
  // previewOnly: true → 미리보기용(기능정의서 발송 트리거 없음).
  // transactional 14종 = 기존 11 + 갭 3(정지·탈퇴 / 회원정보수정 / 6개월 비번).
  // specRef: 기능정의서 화면 ID 또는 검증 사항 출처.
  // block types: paragraph | code | infoTable | notice | reasonBox | steps
  const LAYOUT_PREVIEW = {
      key: "layout",
      previewOnly: true,
      specRef: "— (공통 HTML 골격, 단독 발송 없음)",
      nav: "공통 레이아웃",
      navNo: "00",
      group: "미리보기",
      trigger: "모든 트랜잭션 메일 공통 — 헤더 · 본문 · CTA · 푸터 골격 (미리보기 전용)",
      subject: "[TOPIK Myanmar] 메일 제목이 들어갑니다",
      preheader: "받은편지함 미리보기에 노출되는 한 줄 요약입니다.",
      eyebrowKo: "안내", eyebrowEn: "NOTICE", indexNo: "00",
      h1: "이메일 제목 (H1)",
      intro:
        "{userName} 님, 안녕하세요. 본문 첫 문단은 메일의 목적을 한두 문장으로 안내합니다. 이 레이아웃은 모든 트랜잭션 메일에서 공통으로 사용됩니다.",
      blocks: [
        { type: "paragraph", text: "본문 영역에는 안내 문구, 강조 박스, 정보 표, 인증코드 등 메일 유형에 맞는 요소가 들어갑니다. 단일 컬럼, 모바일 320px까지 대응합니다." },
        { type: "notice", tone: "info", text: "강조가 필요한 안내는 이렇게 박스로 표시합니다." },
      ],
      ctas: [{ label: "기본 동작 버튼", href: "{siteUrl}", kind: "primary" }],
      variables: ["userName", "siteUrl", "supportEmail", "year"],
  };

  const TRANSACTIONAL = [
    {
      key: "signup-verify",
      templateKey: "signup_verify_code",
      specRef: "FO/06 TPKM_FO_6_2_1 — 회원가입 STEP1 이메일 인증",
      nav: "회원가입 이메일 인증",
      navNo: "01",
      group: "인증·계정",
      trigger: "FO 회원가입 STEP1 — [인증코드 발송]",
      subject: "[TOPIK Myanmar] 이메일 인증코드 안내",
      preheader: "인증코드 6자리를 입력해 회원가입을 완료하세요. (유효시간 5분)",
      eyebrowKo: "이메일 인증", eyebrowEn: "EMAIL VERIFICATION", indexNo: "01",
      h1: "이메일 인증코드",
      intro:
        "{userName} 님, TOPIK Myanmar 회원가입을 진행하고 있습니다. 아래 인증코드를 회원가입 화면에 입력해 이메일 인증을 완료해 주세요.",
      blocks: [
        { type: "code", label: "인증코드", value: "{verificationCode}", sub: "유효시간 {expiresMinutes}분" },
        { type: "paragraph", text: "인증코드는 발송 시점부터 {expiresMinutes}분간 유효합니다. 시간이 지났다면 인증코드를 다시 요청해 주세요." },
        { type: "notice", tone: "info", text: "본인이 요청하지 않은 경우 이 메일을 무시하셔도 됩니다." },
      ],
      ctas: [],
      variables: ["userName", "verificationCode", "expiresMinutes"],
    },

    {
      key: "password-reset",
      templateKey: "password_reset",
      specRef: "FO/06 TPKM_FO_6_1_3 — 비밀번호 찾기(일반 가입, 인증코드 30분)",
      nav: "비밀번호 재설정",
      navNo: "02",
      group: "인증·계정",
      trigger: "FO 비밀번호 찾기 — 일반 가입 계정 (구글 가입 미발송)",
      subject: "[TOPIK Myanmar] 비밀번호 재설정 안내",
      preheader: "아래 인증코드를 비밀번호 찾기 화면에 입력하고 30분 안에 새 비밀번호를 설정하세요.",
      eyebrowKo: "비밀번호 재설정", eyebrowEn: "PASSWORD RESET", indexNo: "02",
      h1: "비밀번호 재설정 인증코드",
      intro:
        "{userName} 님, 비밀번호 재설정 요청을 접수했습니다. 아래 인증코드를 비밀번호 찾기 화면에 입력한 뒤 새 비밀번호를 설정해 주세요.",
      blocks: [
        { type: "code", label: "인증코드", value: "{verificationCode}", sub: "유효시간 30분" },
        { type: "notice", tone: "warn", text: "이 코드는 발송 후 30분간만 유효하며, 한 번만 사용할 수 있습니다." },
        { type: "paragraph", text: "본인이 요청하지 않았다면 이 메일을 무시하세요. 비밀번호는 변경되지 않습니다." },
      ],
      ctas: [],
      variables: ["userName", "verificationCode"],
    },

    {
      key: "approve-notice",
      templateKey: "application_approved",
      specRef: "BO/02 TPKM_BO_2_1_5 — 접수 승인 이메일 통지(0526)",
      nav: "접수 승인 완료",
      navNo: "03",
      group: "접수 심사",
      trigger: "BO 접수자 목록 — 승인 처리",
      subject: "[TOPIK Myanmar] 접수 승인 완료 안내",
      preheader: "접수가 승인되었습니다. 다음 단계는 오프라인 응시료 수납입니다.",
      eyebrowKo: "접수 승인 완료", eyebrowEn: "APPLICATION APPROVED", indexNo: "03",
      h1: "접수가 승인되었습니다",
      intro: "{userName} 님, 신청하신 TOPIK 접수가 정상적으로 승인되었습니다.",
      blocks: [
        { type: "infoTable", rows: [["회차", "{roundName}"], ["급수", "{level}"], ["시험일", "{examDate}"], ["시험장", "{venueName}"]] },
        { type: "steps", title: "다음 단계", items: ["오프라인 응시료 수납 (수납처·일정은 공지 참고)", "수납 확인 후 정해진 날짜에 수험번호 일괄 부여", "마이페이지·접수확인에서 수험번호 확인"] },
        { type: "notice", tone: "info", text: "수험번호는 이메일로 발송되지 않습니다. 응시료 수납이 확인된 후 정해진 날짜에 마이페이지·접수확인에서 확인하실 수 있습니다." },
      ],
      ctas: [{ label: "마이페이지", href: "{myPageUrl}", kind: "primary" }],
      variables: ["userName", "applicantNo", "roundName", "level", "examDate", "venueName"],
    },

    {
      key: "reject-notice",
      templateKey: "application_rejected",
      specRef: "BO/02 TPKM_BO_2_1_6 — 접수 반려 이메일 통지(0526)",
      nav: "접수 반려",
      navNo: "04",
      group: "접수 심사",
      trigger: "BO 접수자 목록 — 반려(사유 필수)",
      subject: "[TOPIK Myanmar] 접수 반려 안내",
      preheader: "접수가 반려되었습니다. 사유를 확인하고 다시 접수해 주세요.",
      eyebrowKo: "접수 반려", eyebrowEn: "APPLICATION REJECTED", indexNo: "04",
      h1: "접수가 반려되었습니다",
      intro: "{userName} 님, 아쉽게도 신청하신 접수가 반려되었습니다. 아래 사유를 확인해 주세요.",
      blocks: [
        { type: "infoTable", rows: [["회차", "{roundName}"], ["접수번호", "{applicantNo}"]] },
        { type: "reasonBox", tone: "negative", title: "반려 사유 — {rejectCode}", reason: "{rejectReason}" },
        { type: "paragraph", text: "마이페이지에서 기존 접수를 취소한 뒤 다시 접수하실 수 있습니다. 환불 또는 정보 정정이 필요하시면 게시판으로 신청해 주세요." },
      ],
      ctas: [
        { label: "마이페이지", href: "{myPageUrl}", kind: "primary" },
        { label: "환불·정보정정신청", href: "{refundUrl}", kind: "secondary" },
      ],
      variables: ["userName", "applicantNo", "roundName", "rejectReason", "rejectCode"],
    },

    {
      key: "photo-reject-notice",
      templateKey: "photo_rejected",
      specRef: "BO/02 TPKM_BO_2_1_3 — 사진 심사 반려 이메일 통지(0526)",
      nav: "사진 심사 반려",
      navNo: "05",
      group: "접수 심사",
      trigger: "BO 접수자 목록 — 사진 심사 인라인 패널 반려",
      subject: "[TOPIK Myanmar] 증명사진 심사 반려 안내",
      preheader: "증명사진이 반려되었습니다. 마이페이지에서 사진을 다시 등록해 주세요.",
      eyebrowKo: "증명사진 심사", eyebrowEn: "PHOTO REVIEW", indexNo: "05",
      h1: "증명사진을 다시 등록해 주세요",
      intro:
        "{userName} 님, 등록하신 증명사진이 심사 기준에 맞지 않아 반려되었습니다. 접수 자체는 유지되며, 사진만 다시 등록하시면 됩니다.",
      blocks: [
        { type: "reasonBox", tone: "warn", title: "반려 사유 — {photoRejectCode}", reason: "{photoRejectReason}" },
        { type: "paragraph", text: "여권용 정면 사진(모자·선글라스 미착용, 컬러, 선명)으로 다시 등록하시면 재심사가 진행됩니다." },
      ],
      ctas: [{ label: "사진 재등록하기", href: "{editProfileUrl}", kind: "primary" }],
      variables: ["userName", "photoRejectReason", "photoRejectCode", "editProfileUrl"],
    },

    {
      key: "member-temp-password",
      templateKey: "temp_password",
      specRef: "BO/05 TPKM_BO_5_1_8 — 회원 비밀번호 초기화",
      nav: "회원 임시 비밀번호",
      navNo: "06",
      group: "인증·계정",
      badge: "FO 회원",
      trigger: "BO 회원 관리 — 비밀번호 초기화",
      subject: "[TOPIK Myanmar] 임시 비밀번호 안내",
      preheader: "임시 비밀번호로 로그인 후 반드시 새 비밀번호로 변경해 주세요.",
      eyebrowKo: "임시 비밀번호", eyebrowEn: "TEMPORARY PASSWORD", indexNo: "06",
      h1: "임시 비밀번호 안내",
      intro:
        "{userName} 님, 관리자에 의해 임시 비밀번호가 발급되었습니다. 아래 임시 비밀번호로 로그인해 주세요.",
      blocks: [
        { type: "code", label: "임시 비밀번호", value: "{temporaryPassword}", sub: "로그인 후 즉시 변경 권장", mono: true },
        { type: "notice", tone: "warn", text: "보안을 위해 로그인 후 반드시 새 비밀번호로 변경해 주세요." },
      ],
      ctas: [{ label: "로그인", href: "{loginUrl}", kind: "primary" }],
      variables: ["userName", "temporaryPassword", "loginUrl"],
    },

    {
      key: "admin-temp-password",
      templateKey: "temp_password_admin",
      specRef: "BO/06 TPKM_BO_6_1_4 — 관리자 비밀번호 초기화",
      nav: "관리자 임시 비밀번호",
      navNo: "07",
      group: "인증·계정",
      badge: "BO 관리자",
      trigger: "BO 관리자 계정 — 비밀번호 초기화",
      subject: "[TOPIK Myanmar BO] 임시 비밀번호 안내",
      preheader: "관리자 시스템 임시 비밀번호입니다. 첫 로그인 시 반드시 변경하세요.",
      eyebrowKo: "관리자 임시 비밀번호", eyebrowEn: "ADMIN ACCESS", indexNo: "07",
      h1: "관리자 임시 비밀번호",
      intro:
        "{adminUsername} 님, 관리자 시스템(BO) 계정의 임시 비밀번호가 발급되었습니다.",
      blocks: [
        { type: "infoTable", rows: [["관리자 ID", "{adminUsername}"]] },
        { type: "code", label: "임시 비밀번호", value: "{temporaryPassword}", sub: "첫 로그인 시 변경 강제", mono: true },
        { type: "notice", tone: "negative", text: "임시 비밀번호는 타인에게 절대 공유하지 마세요. 첫 로그인 시 비밀번호 변경이 강제됩니다." },
      ],
      ctas: [{ label: "관리자 로그인", href: "{boLoginUrl}", kind: "primary" }],
      variables: ["adminUsername", "temporaryPassword", "boLoginUrl"],
    },

    {
      key: "board-submission-received",
      templateKey: "board_refund_received",
      specRef: "FO/05 TPKM_FO_5_2_2 — 환불·정보정정 작성 시 작성자 통지",
      nav: "게시글 접수 확인",
      navNo: "08",
      group: "게시판",
      trigger: "환불·정보정정신청 글 제출 직후 (작성자 본인)",
      subject: "[TOPIK Myanmar] {boardName} 접수 확인",
      preheader: "작성하신 글이 정상적으로 접수되었습니다.",
      eyebrowKo: "접수 확인", eyebrowEn: "SUBMISSION RECEIVED", indexNo: "08",
      h1: "글이 정상적으로 접수되었습니다",
      intro:
        "{userName} 님, 작성하신 글이 정상적으로 접수되었습니다. 처리 상태는 이메일과 게시판을 통해 안내드립니다.",
      blocks: [
        { type: "infoTable", rows: [["게시판", "{boardName}"], ["제목", "{postTitle}"], ["접수번호", "{postId}"], ["접수일시", "{submittedAt}"], ["처리 상태", "접수"]] },
      ],
      ctas: [{ label: "게시글 보기", href: "{postUrl}", kind: "primary" }],
      variables: ["userName", "boardName", "postTitle", "postId", "submittedAt", "postUrl"],
    },

    {
      key: "board-admin-new-post",
      templateKey: "board_admin_new_post",
      specRef: "FO/05 TPKM_FO_5_2_2 · TPKM_FO_5_3_2 — 게시글 제출 시 운영자 통지",
      nav: "운영자 신규 접수 알림",
      navNo: "09",
      group: "게시판",
      badge: "BO 관리자",
      trigger: "게시글 제출 시 운영자 알림",
      subject: "[TOPIK Myanmar BO] 신규 {boardName} 접수",
      preheader: "새로운 게시글이 접수되었습니다. BO에서 처리해 주세요.",
      eyebrowKo: "신규 접수 알림", eyebrowEn: "NEW SUBMISSION", indexNo: "09",
      h1: "신규 게시글이 접수되었습니다",
      intro: "새로운 게시글이 접수되었습니다. 아래 정보를 확인하고 처리해 주세요.",
      blocks: [
        { type: "infoTable", rows: [["작성자", "{userName}"], ["게시판", "{boardName}"], ["유형", "{category}"], ["제목", "{postTitle}"], ["접수일시", "{submittedAt}"], ["비밀글", "{secretFlag}"]] },
        { type: "notice", tone: "info", text: "비밀글은 본문이 메일에 포함되지 않습니다. 관리자에서 직접 확인해 주세요." },
      ],
      ctas: [{ label: "관리자에서 처리하기", href: "{boPostUrl}", kind: "primary" }],
      variables: ["userName", "boardName", "category", "postTitle", "secretFlag", "boPostUrl"],
    },

    {
      key: "board-activity",
      templateKey: "board_reply",
      specRef: "FO/05 · BO/04 — 답변완료·댓글·상태변경 이메일(0526)",
      nav: "게시판 활동 알림",
      navNo: "10",
      group: "게시판",
      trigger: "관리자 답글·댓글·상태변경 (작성자↔관리자)",
      subject: "[TOPIK Myanmar] {boardName} 답변/댓글 알림",
      preheader: "작성하신 글에 새로운 활동이 있습니다.",
      eyebrowKo: "답변/댓글 알림", eyebrowEn: "ACTIVITY", indexNo: "10",
      h1: "새로운 {activityType}이 등록되었습니다",
      intro: "{userName} 님, 작성하신 글에 새로운 활동이 있습니다.",
      blocks: [
        { type: "infoTable", rows: [["게시판", "{boardName}"], ["제목", "{postTitle}"], ["활동", "{activityType}"]] },
        { type: "notice", tone: "info", text: "비밀글의 내용은 메일에 포함되지 않습니다. 로그인 후 게시판에서 확인해 주세요." },
      ],
      ctas: [{ label: "게시글 보기", href: "{postUrl}", kind: "primary" }],
      variables: ["userName", "boardName", "postTitle", "activityType", "postUrl"],
    },

    {
      key: "marketing-notice",
      templateKey: "notice_marketing",
      specRef: "BO/04 TPKM_BO_4_1 — 공지 신규 게시·마케팅 수신 동의(0527)",
      nav: "마케팅 공지 알림",
      navNo: "11",
      group: "마케팅",
      marketing: true,
      trigger: "BO 공지사항 신규 게시 — 마케팅 수신 동의 회원",
      subject: "[TOPIK Myanmar] 새 공지사항 안내",
      preheader: "새로운 공지사항이 등록되었습니다.",
      eyebrowKo: "새 공지사항", eyebrowEn: "NOTICE", indexNo: "11",
      h1: "새 공지사항이 등록되었습니다",
      intro: "TOPIK Myanmar에 새로운 공지사항이 등록되었습니다.",
      blocks: [
        { type: "infoTable", rows: [["제목", "{noticeTitle}"], ["카테고리", "{noticeCategory}"], ["게시일", "{publishedAt}"]] },
        { type: "paragraph", text: "공지 전문은 사이트에서 확인하실 수 있습니다." },
      ],
      ctas: [{ label: "공지사항 보기", href: "{noticeUrl}", kind: "primary" }],
      variables: ["noticeTitle", "noticeCategory", "publishedAt", "noticeUrl", "unsubscribeUrl"],
    },

    // ---- Gap templates (C안 에디토리얼 · KO/MY/EN) -----------------
    {
      key: "account-status",
      templateKey: "account_status",
      specRef: "BO/05 TPKM_BO_5_1_5(정지) · TPKM_BO_5_1_6(탈퇴) — 회원 상태 변경",
      nav: "계정 정지·탈퇴",
      navNo: "12",
      group: "회원·계정",
      trigger: "BO 회원 관리 — 정지 또는 탈퇴 처리 완료 시 (meta.accountAction: suspended | withdrawn)",
      variables: [
        "userName", "accountAction", "accountStatusLabel", "statusReason", "statusUntil",
        "canceledApplications", "supportEmail", "supportBoardUrl", "siteUrl",
      ],
      i18n: {
        ko: {
          subject: "[TOPIK Myanmar] 회원 계정 {accountStatusLabel} 안내",
          preheader: "회원 계정이 {accountStatusLabel} 처리되었습니다. 사유와 기간을 확인해 주세요.",
          eyebrowKo: "계정 상태", eyebrowEn: "ACCOUNT STATUS", indexNo: "12",
          h1: "회원 계정이 {accountStatusLabel}되었습니다",
          intro:
            "{userName} 님, TOPIK Myanmar 회원 계정이 관리자에 의해 {accountStatusLabel} 처리되었습니다. 아래 내용을 확인해 주세요.",
          blocks: [
            {
              type: "infoTable",
              rows: [
                ["처리 구분", "{accountStatusLabel}"],
                ["사유", "{statusReason}"],
                ["적용 기간", "{statusUntil}"],
              ],
            },
            {
              type: "notice",
              tone: "warn",
              showWhen: { accountAction: "suspended" },
              text:
                "정지 기간 동안 로그인·시험 접수·마이페이지 이용이 제한됩니다. 문의가 필요하시면 문의 게시판을 이용해 주세요.",
            },
            {
              type: "notice",
              tone: "negative",
              showWhen: { accountAction: "withdrawn" },
              text:
                "탈퇴 처리 시 진행 중이던 접수 {canceledApplications}건이 자동 취소되었습니다. 환불은 응시료 규정에 따릅니다. 동일 이메일 재가입은 30일간 제한될 수 있습니다.",
            },
            {
              type: "paragraph",
              text: "본인이 요청하지 않은 처리라면 즉시 {supportEmail} 으로 문의해 주세요.",
            },
          ],
          ctas: [],
        },
        my: {
          subject: "[TOPIK Myanmar] အဖွဲ့ဝင်အကောင့် {accountStatusLabel} အကြောင်းကြားချက်",
          preheader: "သင့်အကောင့်ကို {accountStatusLabel} လုပ်ဆောင်ထားပါသည်။ အကြောင်းရင်းနှင့် ကာလကို စစ်ဆေးပါ။",
          eyebrowKo: "အကောင့်အခြေအနေ", eyebrowEn: "ACCOUNT STATUS", indexNo: "12",
          h1: "အဖွဲ့ဝင်အကောင့်ကို {accountStatusLabel} လုပ်ဆောင်ပြီးပါပြီ",
          intro:
            "{userName} ရှင့်၊ TOPIK Myanmar အဖွဲ့ဝင်အကောင့်ကို အုပ်ချုပ်ရေးမှူးက {accountStatusLabel} လုပ်ဆောင်ထားပါသည်။ အောက်ပါအချက်အလက်များကို သေချာစစ်ဆေးပါ။",
          blocks: [
            {
              type: "infoTable",
              rows: [
                ["လုပ်ဆောင်ချက်", "{accountStatusLabel}"],
                ["အကြောင်းရင်း", "{statusReason}"],
                ["သက်တမ်းကာလ", "{statusUntil}"],
              ],
            },
            {
              type: "notice",
              tone: "warn",
              showWhen: { accountAction: "suspended" },
              text:
                "ရပ်ဆိုင်းကာလအတွင်း ဝင်ရောက်ခြင်း၊ စာရင်းသွင်းခြင်းနှင့် My Page အသုံးပြုခြင်းကို ကန့်သတ်ထားပါသည်။",
            },
            {
              type: "notice",
              tone: "negative",
              showWhen: { accountAction: "withdrawn" },
              text:
                "အဖွဲ့ဝင်မှ ထွက်ခွာပါက လက်ရှိ စာရင်းသွင်းမှု {canceledApplications} ခု အလိုအလျောက် ပယ်ဖျက်ပါသည်။ ပြန်အမ်းငွေသည် စာမေးပွဲကြေးစည်းမျဉ်းအရ ဆောင်ရွက်ပါသည်။",
            },
            {
              type: "paragraph",
              text: "ဤလုပ်ဆောင်ချက်ကို သင်တောင်းဆိုခြင်းမရှိပါက ချက်ချင်း {supportEmail} သို့ ဆက်သွယ်ပါ။",
            },
          ],
          ctas: [],
        },
        en: {
          subject: "[TOPIK Myanmar] Account {accountStatusLabel} notice",
          preheader: "Your membership account has been {accountStatusLabel}. Please review the reason and period.",
          eyebrowKo: "계정 상태", eyebrowEn: "ACCOUNT STATUS", indexNo: "12",
          h1: "Your account has been {accountStatusLabel}",
          intro:
            "Dear {userName}, your TOPIK Myanmar account has been {accountStatusLabel} by an administrator. Please review the details below.",
          blocks: [
            {
              type: "infoTable",
              rows: [
                ["Action", "{accountStatusLabel}"],
                ["Reason", "{statusReason}"],
                ["Effective period", "{statusUntil}"],
              ],
            },
            {
              type: "notice",
              tone: "warn",
              showWhen: { accountAction: "suspended" },
              text:
                "While suspended, login, exam registration, and My Page access are restricted.",
            },
            {
              type: "notice",
              tone: "negative",
              showWhen: { accountAction: "withdrawn" },
              text:
                "If withdrawn, {canceledApplications} in-progress application(s) were automatically cancelled. Refunds follow the fee policy. Re-registration with the same email may be restricted for 30 days.",
            },
            {
              type: "paragraph",
              text: "If you did not request this action, please contact us immediately at {supportEmail}.",
            },
          ],
          ctas: [],
        },
      },
    },

    {
      key: "member-info-changed",
      templateKey: "member_info_changed",
      specRef: "BO/05 TPKM_BO_5_1_4 — 관리자 회원 정보 수정 후 회원 통지 + diff",
      nav: "회원정보 수정 통지",
      navNo: "13",
      group: "회원·계정",
      trigger: "BO 회원 관리 — 정보 수정 LP 저장 시 (처리 이력 diff 동봉)",
      variables: [
        "userName", "changedAt", "changedBy", "changedFieldsSummary", "changeDiffHtml",
        "myPageUrl", "supportEmail", "supportBoardUrl",
      ],
      i18n: {
        ko: {
          subject: "[TOPIK Myanmar] 회원정보 변경 안내",
          preheader: "관리자에 의해 회원정보가 변경되었습니다. 변경 항목을 확인해 주세요.",
          eyebrowKo: "회원정보 변경", eyebrowEn: "PROFILE UPDATE", indexNo: "13",
          h1: "회원정보가 변경되었습니다",
          intro:
            "{userName} 님, TOPIK Myanmar 운영 담당자가 회원정보를 수정했습니다. 변경 내역은 아래와 같으며, 마이페이지·진행 중 접수에도 반영됩니다.",
          blocks: [
            {
              type: "infoTable",
              rows: [
                ["변경 일시", "{changedAt}"],
                ["처리자", "{changedBy}"],
                ["변경 항목", "{changedFieldsSummary}"],
              ],
            },
            {
              type: "reasonBox",
              tone: "info",
              title: "변경 내역",
              reason: "{changeDiffHtml}",
            },
            {
              type: "notice",
              tone: "info",
              text:
                "본인이 요청하지 않은 변경이라면 즉시 문의 게시판 또는 {supportEmail}으로 연락해 주세요. 계정 보호를 위해 비밀번호 변경을 권장합니다.",
            },
          ],
          ctas: [
            { label: "마이페이지", href: "{myPageUrl}", kind: "primary" },
            { label: "문의 게시판", href: "{supportBoardUrl}", kind: "secondary" },
          ],
        },
        my: {
          subject: "[TOPIK Myanmar] အဖွဲ့ဝင်အချက်အလက် ပြောင်းလဲမှု အကြောင်းကြားချက်",
          preheader: "အုပ်ချုပ်ရေးမှူးက သင့်အချက်အလက်ကို ပြင်ဆင်ထားပါသည်။",
          eyebrowKo: "အချက်အလက်ပြောင်းလဲမှု", eyebrowEn: "PROFILE UPDATE", indexNo: "13",
          h1: "အဖွဲ့ဝင်အချက်အလက် ပြင်ဆင်ပြီးပါပြီ",
          intro:
            "{userName} ရှင့်၊ TOPIK Myanmar အုပ်ချုပ်ရေးမှူးက သင့်အဖွဲ့ဝင်အချက်အလက်ကို ပြင်ဆင်ထားပါသည်။ My Page နှင့် လက်ရှိ စာရင်းသွင်းမှုများတွင်လည်း ထင်ဟပ်ပါသည်။",
          blocks: [
            {
              type: "infoTable",
              rows: [
                ["ပြင်ဆင်သည့်အချိန်", "{changedAt}"],
                ["လုပ်ဆောင်သူ", "{changedBy}"],
                ["ပြင်ဆင်သည့်အကွက်", "{changedFieldsSummary}"],
              ],
            },
            {
              type: "reasonBox",
              tone: "info",
              title: "ပြောင်းလဲမှုအသေးစိတ်",
              reason: "{changeDiffHtml}",
            },
            {
              type: "notice",
              tone: "info",
              text:
                "သင်တောင်းဆိုမထားသော ပြောင်းလဲမှုဖြစ်ပါက ချက်ချင်း ဆက်သွယ်ပါ။ လုံခြုံရေးအတွက် စကားဝှက်ပြောင်းရန် အကြံပြုပါသည်။",
            },
          ],
          ctas: [
            { label: "My Page", href: "{myPageUrl}", kind: "primary" },
            { label: "မေးမြန်းစာမျက်နှာ", href: "{supportBoardUrl}", kind: "secondary" },
          ],
        },
        en: {
          subject: "[TOPIK Myanmar] Profile update notice",
          preheader: "An administrator updated your membership profile. Please review the changes.",
          eyebrowKo: "회원정보 변경", eyebrowEn: "PROFILE UPDATE", indexNo: "13",
          h1: "Your profile has been updated",
          intro:
            "Dear {userName}, a TOPIK Myanmar administrator updated your membership information. The changes below are also reflected on My Page and any in-progress applications.",
          blocks: [
            {
              type: "infoTable",
              rows: [
                ["Updated at", "{changedAt}"],
                ["Processed by", "{changedBy}"],
                ["Fields changed", "{changedFieldsSummary}"],
              ],
            },
            {
              type: "reasonBox",
              tone: "info",
              title: "Change details",
              reason: "{changeDiffHtml}",
            },
            {
              type: "notice",
              tone: "info",
              text:
                "If you did not request this update, contact us immediately via the inquiry board or {supportEmail}. We recommend changing your password.",
            },
          ],
          ctas: [
            { label: "My Page", href: "{myPageUrl}", kind: "primary" },
            { label: "Inquiry board", href: "{supportBoardUrl}", kind: "secondary" },
          ],
        },
      },
    },

    {
      key: "password-expiry-reminder",
      templateKey: "password_expiry_reminder",
      specRef: "FO/06 TPKM_FO_6_3 — 비밀번호 6개월 변경 권고(0526) + 배치/로그인 유도",
      nav: "비밀번호 변경 권고",
      navNo: "14",
      group: "회원·계정",
      trigger: "마지막 변경일 6개월 경과 — 배치 또는 로그인 직후 (구글 간편가입 제외)",
      variables: [
        "userName", "lastPasswordChange", "daysSincePwChange", "passwordChangeUrl",
        "loginUrl", "supportEmail",
      ],
      i18n: {
        ko: {
          subject: "[TOPIK Myanmar] 비밀번호 변경 권고 안내",
          preheader: "마지막 변경 후 6개월이 경과했습니다. 계정 보호를 위해 비밀번호를 변경해 주세요.",
          eyebrowKo: "비밀번호 정책", eyebrowEn: "PASSWORD POLICY", indexNo: "14",
          h1: "비밀번호 변경을 권장합니다",
          intro:
            "{userName} 님, 계정 보호 및 대리접수 방지를 위해 6개월마다 비밀번호 변경을 권장합니다. 마지막 변경일로부터 {daysSincePwChange}일이 경과했습니다.",
          blocks: [
            {
              type: "infoTable",
              rows: [
                ["마지막 변경일", "{lastPasswordChange}"],
                ["경과 일수", "{daysSincePwChange}일"],
              ],
            },
            {
              type: "notice",
              tone: "warn",
              text:
                "8자 이상, 영문·숫자·특수문자를 조합한 새 비밀번호 사용을 권장합니다. 타인과 공유하지 마세요.",
            },
            {
              type: "paragraph",
              text: "Google 계정으로 가입하신 경우 비밀번호는 Google에서 관리되므로 본 메일을 무시하셔도 됩니다.",
            },
          ],
          ctas: [
            { label: "비밀번호 변경", href: "{passwordChangeUrl}", kind: "primary" },
            { label: "로그인", href: "{loginUrl}", kind: "secondary" },
          ],
        },
        my: {
          subject: "[TOPIK Myanmar] စကားဝှက်ပြောင်းရန် အကြံပြုချက်",
          preheader: "နောက်ဆုံးပြောင်းလဲမှု ၆ လ ကျော်ပါပြီ။ အကောင့်လုံခြုံရေးအတွက် စကားဝှက်ကို ပြောင်းပါ။",
          eyebrowKo: "စကားဝှက်မူဝါဒ", eyebrowEn: "PASSWORD POLICY", indexNo: "14",
          h1: "စကားဝှက်ပြောင်းရန် အကြံပြုပါသည်",
          intro:
            "{userName} ရှင့်၊ အကောင့်လုံခြုံရေးနှင့် ကိုယ်စားလှယ်ဝင်ရောက်မှုကာကွယ်ရန် ၆ လတစ်ကြိမ် စကားဝှက်ပြောင်းရန် အကြံပြုပါသည်။ နောက်ဆုံးပြောင်းလဲမှု {daysSincePwChange} ရက်အကြာတွင် ရောက်ရှိပါသည်။",
          blocks: [
            {
              type: "infoTable",
              rows: [
                ["နောက်ဆုံးပြောင်းသည့်ရက်", "{lastPasswordChange}"],
                ["ကြာမြင့်သည့်ရက်", "{daysSincePwChange} ရက်"],
              ],
            },
            {
              type: "notice",
              tone: "warn",
              text:
                "အနည်းဆုံး ၈ လုံး၊ အင်္ဂလိပ်၊ နံပါတ်နှင့် အထူးအက္ခရာ ပေါင်းစပ်ပါ။ အခြားသူနှင့် မျှဝေမထားပါနှင့်။",
            },
            {
              type: "paragraph",
              text: "Google အကောင့်ဖြင့် မှတ်ပုံတင်ထားပါက Google က စကားဝှက်ကို စီမံပါသည် — ဤစာကို လျစ်လျူရှုနိုင်ပါသည်။",
            },
          ],
          ctas: [
            { label: "စကားဝှက်ပြောင်းရန်", href: "{passwordChangeUrl}", kind: "primary" },
            { label: "ဝင်ရောက်ရန်", href: "{loginUrl}", kind: "secondary" },
          ],
        },
        en: {
          subject: "[TOPIK Myanmar] Password change recommended",
          preheader: "Six months have passed since your last password change. Please update your password.",
          eyebrowKo: "비밀번호 정책", eyebrowEn: "PASSWORD POLICY", indexNo: "14",
          h1: "We recommend changing your password",
          intro:
            "Dear {userName}, to protect your account and prevent proxy registration, we recommend changing your password every six months. It has been {daysSincePwChange} days since your last change.",
          blocks: [
            {
              type: "infoTable",
              rows: [
                ["Last changed", "{lastPasswordChange}"],
                ["Days elapsed", "{daysSincePwChange} days"],
              ],
            },
            {
              type: "notice",
              tone: "warn",
              text:
                "Use at least 8 characters with letters, numbers, and symbols. Do not share your password with others.",
            },
            {
              type: "paragraph",
              text: "If you signed up with Google, your password is managed by Google — you may disregard this message.",
            },
          ],
          ctas: [
            { label: "Change password", href: "{passwordChangeUrl}", kind: "primary" },
            { label: "Sign in", href: "{loginUrl}", kind: "secondary" },
          ],
        },
      },
    },
  ];

  /** Flatten i18n gap templates to KO fields for rail/meta (preview defaults). */
  function withKoDefaults(tpl) {
    if (!tpl.i18n || !tpl.i18n.ko) return tpl;
    const ko = tpl.i18n.ko;
    return {
      ...tpl,
      subject: ko.subject,
      preheader: ko.preheader,
      eyebrowKo: ko.eyebrowKo,
      eyebrowEn: ko.eyebrowEn,
      indexNo: ko.indexNo,
      h1: ko.h1,
      intro: ko.intro,
      blocks: ko.blocks,
      ctas: ko.ctas,
    };
  }

  function koFieldsFromTpl(tpl) {
    return {
      subject: tpl.subject,
      preheader: tpl.preheader,
      eyebrowKo: tpl.eyebrowKo,
      eyebrowEn: tpl.eyebrowEn,
      indexNo: tpl.indexNo,
      h1: tpl.h1,
      intro: tpl.intro,
      blocks: tpl.blocks,
      ctas: tpl.ctas,
    };
  }

  /** Attach MY/EN packs (i18n_packs.js) to KO-only templates for preview + registry. */
  function attachLocalePacks(tpl) {
    if (tpl.i18n) return tpl;
    const packs = (window.TOPIK_I18N_PACKS || {})[tpl.key];
    if (!packs) return tpl;
    return {
      ...tpl,
      i18n: {
        ko: koFieldsFromTpl(tpl),
        my: packs.my,
        en: packs.en,
      },
    };
  }

  const TRANSACTIONAL_I18N = TRANSACTIONAL.map(attachLocalePacks);
  const TRANSACTIONAL_RENDER = TRANSACTIONAL_I18N.map(withKoDefaults);

  const TEMPLATES = [LAYOUT_PREVIEW, ...TRANSACTIONAL_RENDER];
  const TEMPLATE_BY_KEY = Object.fromEntries(
    TRANSACTIONAL_I18N.concat([LAYOUT_PREVIEW]).map((t) => [t.key, t])
  );
  const TEMPLATE_BY_TEMPLATE_KEY = Object.fromEntries(
    TRANSACTIONAL_I18N.filter((t) => t.templateKey).map((t) => [t.templateKey, t])
  );

  /** 14 transactional types for email_outbox (snake_case keys). */
  const TEMPLATE_REGISTRY = TRANSACTIONAL_I18N.filter((t) => t.templateKey).map((t) => ({
    templateKey: t.templateKey,
    previewKey: t.key,
    nav: t.nav,
    navNo: t.navNo,
    group: t.group,
    locales: t.i18n ? ["ko", "my", "en"] : ["ko"],
  }));

  window.TOPIK = {
    THEMES,
    TEMPLATES,
    TRANSACTIONAL,
    TRANSACTIONAL_I18N,
    TRANSACTIONAL_RENDER,
    LAYOUT_PREVIEW,
    TEMPLATE_BY_KEY,
    TEMPLATE_BY_TEMPLATE_KEY,
    TEMPLATE_REGISTRY,
    DEFAULT_THEME,
    FOOTER,
    SAMPLE,
    FONT,
    MONO,
    withKoDefaults,
  };
})();
