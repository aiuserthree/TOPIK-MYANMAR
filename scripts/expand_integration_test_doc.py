#!/usr/bin/env python3
"""Expand 통합테스트_시나리오.md with friendlier, step-by-step instructions."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "docs/통합테스트/통합테스트_시나리오.md"
DST = SRC  # overwrite in place

FO = "http://localhost:8080"
BO = "http://localhost:8081"
API = "http://localhost:8000"

FO_USER = ("demo@topik-mm.local", "DemoUser!2026")
BO_ADMIN = ("admin-dev@topik-mm.local", "DevOnly!2026")

MODULE_META = {
    "AUTH-FO": {
        "title": "FO 인증 (로그인·토큰·아이디/비밀번호 찾기)",
        "desc": "응시자 사이트(FO)에서 로그인, 로그아웃, 세션 유지, 아이디·비밀번호 찾기가 정상 동작하는지 검증합니다.",
        "base": f"{FO}/login.html",
    },
    "AUTH-BO": {
        "title": "BO 관리자 인증",
        "desc": "백오피스(BO) 관리자 로그인, 역할별 권한, 비밀번호 변경 게이트, 세션 만료를 검증합니다.",
        "base": f"{BO}/admin-login.html",
    },
    "SIGNUP": {
        "title": "FO 회원가입",
        "desc": "이메일 OTP 인증 → 기본정보 → 약관 동의 3단계 회원가입과 Google 가입 흐름을 검증합니다.",
        "base": f"{FO}/signup.html",
    },
    "APPLY-FO": {
        "title": "FO 시험 접수",
        "desc": "시험 접수 4단계, 임시저장, 마이페이지, 수험표 출력 등 응시자 접수 전 과정을 검증합니다.",
        "base": f"{FO}/register.html",
    },
    "APPLY-BO": {
        "title": "BO 접수자 관리",
        "desc": "접수자 목록, 사진 심사, 오프라인 수납, 승인·반려, 수험번호 부여,보내기를 검증합니다.",
        "base": f"{BO}/admin.html#applicants",
    },
    "EXAM-BO": {
        "title": "BO 회차·시험장",
        "desc": "시험 회차 생성·상태 변경, 시험장 CRUD, 회차-시험장 매핑을 검증합니다.",
        "base": f"{BO}/admin.html#sessions",
    },
    "CONTENT": {
        "title": "콘텐츠 (공지·FAQ·약관·D-Day)",
        "desc": "FO 홈·게시 콘텐츠와 BO 공지·FAQ·약관 관리가 연동되는지 검증합니다.",
        "base": f"{FO}/index.html",
    },
    "BOARD": {
        "title": "게시판 (문의·환불·정정·댓글)",
        "desc": "FO 문의·환불·정정 신청과 BO 처리, 댓글·첨부·비밀글을 검증합니다.",
        "base": f"{FO}/qna.html",
    },
    "MEMBER": {
        "title": "회원 (FO 프로필·BO 회원 관리)",
        "desc": "내정보 수정, 비밀번호 변경, 탈퇴, BO 회원 조회·정지를 검증합니다.",
        "base": f"{FO}/mypage-profile.html",
    },
    "TERMS": {
        "title": "약관 버전·동의",
        "desc": "약관 게시·폐지, 가입 시 동의 저장, FO 약관 페이지 표시를 검증합니다.",
        "base": f"{FO}/terms.html",
    },
    "SYSTEM": {
        "title": "시스템 (관리자·권한·감사·헬스)",
        "desc": "관리자 계정 CRUD, 권한 UI, 처리 이력, API 헬스체크를 검증합니다.",
        "base": f"{BO}/admin.html#admins",
    },
    "CROSS": {
        "title": "FO ↔ BO 연동 (End-to-End)",
        "desc": "FO에서 발생한 데이터가 BO에 반영되고, BO 처리 결과가 FO에 표시되는 전체 흐름을 검증합니다.",
        "base": FO,
    },
    "EDGE": {
        "title": "경계값·보안·동시성",
        "desc": "입력 한계, 악의적 입력, 동시 수정, JWT 변조 등 예외·보안 상황을 검증합니다.",
        "base": FO,
    },
}

PRIORITY_DESC = {
    "P0": "핵심 — 실패 시 서비스 운영·응시자 주요 업무가 중단됩니다. 반드시 통과해야 합니다.",
    "P1": "중요 — 부분 기능·정책 격차·UX 이슈. 릴리스 전 확인이 권장됩니다.",
    "P2": "보조 — 경계값·보안·동시성 등. 시간이 허용될 때 수행합니다.",
}

# page path hints from step text
PAGE_HINTS = [
    (r"login\.html|login\b", f"{FO}/login.html", "로그인"),
    (r"signup\.html|signup\b|register body|가입", f"{FO}/signup.html", "회원가입"),
    (r"register\.html|register\b|접수", f"{FO}/register.html", "시험 접수"),
    (r"mypage-profile", f"{FO}/mypage-profile.html", "내정보 수정"),
    (r"mypage\.html|mypage\b", f"{FO}/mypage.html", "접수 확인(마이페이지)"),
    (r"ticket\.html|ticket\b", f"{FO}/ticket.html", "수험표 출력"),
    (r"password-reset", f"{FO}/password-reset.html", "비밀번호 재설정"),
    (r"index\.html|index\b|홈", f"{FO}/index.html", "메인 홈"),
    (r"notice\.html|notice\b|공지", f"{FO}/notice.html", "공지사항"),
    (r"faq\.html|faq\b", f"{FO}/faq.html", "FAQ"),
    (r"terms\.html|terms\b", f"{FO}/terms.html", "이용약관"),
    (r"privacy", f"{FO}/privacy.html", "개인정보처리방침"),
    (r"qna\.html|qna\b|문의", f"{FO}/qna.html", "문의게시판"),
    (r"refund|환불", f"{FO}/refund-correction.html", "환불·정보정정"),
    (r"admin-login", f"{BO}/admin-login.html", "관리자 로그인"),
    (r"admin\.html|#applicants", f"{BO}/admin.html#applicants", "접수자 목록"),
    (r"#sessions", f"{BO}/admin.html#sessions", "회차 관리"),
    (r"#venues", f"{BO}/admin.html#venues", "시험장 관리"),
    (r"#notices", f"{BO}/admin.html#notices", "공지사항 관리"),
    (r"#faq", f"{BO}/admin.html#faq", "FAQ 관리"),
    (r"#refunds", f"{BO}/admin.html#refunds", "환불·정보정정 관리"),
    (r"#inquiries", f"{BO}/admin.html#inquiries", "문의 게시판 관리"),
    (r"#members", f"{BO}/admin.html#members", "회원 관리"),
    (r"#terms", f"{BO}/admin.html#terms", "약관 관리"),
    (r"#admins", f"{BO}/admin.html#admins", "관리자 계정"),
    (r"#permissions", f"{BO}/admin.html#permissions", "관리자 권한"),
    (r"#audit", f"{BO}/admin.html#audit", "처리 이력"),
    (r"#dashboard", f"{BO}/admin.html#dashboard", "대시보드"),
    (r"GET /health", f"{API}/health", "API 헬스체크"),
    (r"GET /health/mail", f"{API}/health/mail", "메일 헬스체크"),
    (r"GET /health/db", f"{API}/health/db", "DB 헬스체크"),
]

STEP_EXPANSIONS = [
    (r"이메일 로그인 성공|이메일.*비밀번호|login.*입력|로그인 클릭", [
        f"브라우저에서 `{FO}/login.html` 을 엽니다.",
        "이메일 입력란에 테스트 계정 이메일을 입력합니다. (예: `demo@topik-mm.local`)",
        "비밀번호 입력란에 해당 계정 비밀번호를 입력합니다. (예: `DemoUser!2026`)",
        "화면 하단 **로그인** 버튼을 클릭합니다.",
    ]),
    (r"admin-dev|DevOnly|관리자 로그인", [
        f"브라우저에서 `{BO}/admin-login.html` 을 엽니다.",
        "이메일(`adminEmail`)에 `admin-dev@topik-mm.local` 을 입력합니다.",
        "비밀번호(`adminPw`)에 `DevOnly!2026` 을 입력합니다.",
        "**로그인** 버튼을 클릭합니다.",
    ]),
    (r"틀린 비밀번호|wrong|틀린 pw", [
        f"`{FO}/login.html` 에서 올바른 이메일과 **의도적으로 틀린** 비밀번호(예: `WrongPass!999`)를 입력합니다.",
        "**로그인** 버튼을 클릭합니다.",
    ]),
    (r"빈 필드|비우고", [
        "이메일·비밀번호 입력란을 모두 비워 둡니다.",
        "**로그인** 버튼을 클릭합니다.",
    ]),
    (r"remember|로그인 유지", [
        "**로그인 유지** 체크박스를 선택합니다.",
        "정상 계정으로 로그인합니다.",
        "브라우저 개발자 도구(F12) → Application → Local Storage에서 refresh token 저장 여부를 확인합니다.",
    ]),
    (r"\?next=|next=", [
        "로그아웃 상태에서 로그인이 필요한 페이지(예: `register.html`)에 직접 접속합니다.",
        "로그인 화면으로 리다이렉트된 뒤, 정상 로그인을 완료합니다.",
        "로그인 성공 후 원래 가려던 페이지로 자동 이동하는지 확인합니다.",
    ]),
    (r"로그아웃|logout", [
        "로그인된 상태에서 상단 GNB의 **로그아웃** 버튼을 클릭합니다.",
        "확인 대화상자가 뜨면 **확인**을 선택합니다.",
    ]),
    (r"modalFindId|아이디 찾기", [
        f"`{FO}/login.html` 에서 **아이디 찾기** 링크를 클릭해 모달을 엽니다.",
        "가입 시 등록한 이름, 생년월일(8자리), 연락처를 입력합니다.",
        "**확인** 버튼을 클릭합니다.",
    ]),
    (r"modalFindPw|비밀번호 찾기|OTP 발송", [
        f"`{FO}/login.html` 에서 **비밀번호 찾기** 링크를 클릭합니다.",
        "가입된 이메일 주소를 입력하고 **인증코드 발송**을 클릭합니다.",
        "SMTP 미설정 시 화면에 표시되는 `dev_code`를 확인하거나, 실제 메일함에서 6자리 코드를 확인합니다.",
    ]),
    (r"password-reset|새 비번", [
        f"OTP 인증을 마친 뒤 `{FO}/password-reset.html` 로 이동합니다.",
        "새 비밀번호와 비밀번호 확인란에 동일한 값(8자 이상, 영문·숫자·특수문자 포함)을 입력합니다.",
        "**비밀번호 변경** 버튼을 클릭합니다.",
    ]),
    (r"su-email|인증코드 발송|OTP", [
        f"`{FO}/signup.html` 1단계에서 미가입 이메일(예: `test-new-001@example.com`)을 입력합니다.",
        "**인증코드 발송** 버튼을 클릭합니다.",
        "화면 안내 또는 `dev_code`에서 6자리 인증코드를 확인합니다.",
    ]),
    (r"6자리|OTP 확인", [
        "발송된 6자리 인증코드를 입력란에 입력합니다.",
        "**확인** 버튼을 클릭합니다.",
    ]),
    (r"register\.html 1단계|회차", [
        f"FO에 로그인한 뒤 `{FO}/register.html` 을 엽니다.",
        "1단계에서 접수 가능한 회차 카드를 선택합니다.",
        "응시 급수(Ⅰ·Ⅱ 또는 동시)를 선택합니다.",
        "시험장 드롭다운에서 시험장을 선택합니다.",
    ]),
    (r"임시저장|draft", [
        "시험 접수 작성 중 **저장 후 나가기** 또는 임시저장 버튼을 클릭합니다.",
        "확인 메시지 후 마이페이지 또는 홈으로 이동합니다.",
        "다시 `register.html` 에 진입해 이전 입력값이 복원되는지 확인합니다.",
    ]),
    (r"제출|application-submissions", [
        f"`{FO}/register.html` **1단계**: 회차 선택 → 급수(Ⅰ/Ⅱ) 선택 → 시험장 선택 → **다음**.",
        "**2단계**: 프로필 정보 확인(필요 시 수정) → **다음**.",
        "**3단계**: 응시 전 확인 체크리스트 5항목 모두 체크 → **다음**.",
        "**4단계**: 최종 확인 화면에서 회차·급수·시험장·응시료를 검토합니다.",
        "필수 약관 동의에 체크한 뒤 **접수 제출** 버튼을 클릭합니다.",
        f"완료 안내 후 `{FO}/mypage.html` 에 접수 건이 생성됐는지 확인합니다.",
    ]),
    (r"가입 완료|modalDone", [
        f"`{FO}/signup.html` 3단계에서 필수·선택 약관을 동의합니다.",
        "**가입 완료** 버튼을 클릭합니다.",
        "완료 모달에서 **로그인 하러 가기**를 클릭해 로그인 화면으로 이동합니다.",
    ]),
    (r"modalCancel|접수 취소", [
        f"`{FO}/mypage.html` 에서 취소 가능한 접수 건의 **접수 취소** 버튼을 클릭합니다.",
        "취소 사유를 입력하고 확인 모달에서 **확인**을 선택합니다.",
    ]),
    (r"#applicants|접수 목록", [
        f"BO에 관리자로 로그인 후 `{BO}/admin.html#applicants` 로 이동합니다.",
        "상단 회차 드롭다운에서 테스트 대상 회차(예: 제107회)를 선택합니다.",
        "접수자 목록이 로드될 때까지 기다립니다.",
    ]),
    (r"사진.*승인|photo-review|LP", [
        "접수자 목록에서 사진 심사 대기 건의 썸네일을 클릭해 라이트박스(LP)를 엽니다.",
        "사진을 확인한 뒤 **승인** 버튼을 클릭합니다.",
        "목록에서 해당 건 상태가 갱신되는지 확인합니다.",
    ]),
    (r"반려\+사유|rejectModal", [
        "대상 접수 건의 **반려** 버튼을 클릭합니다.",
        "반려 사유를 반드시 입력합니다. (빈 값이면 제출되지 않아야 함)",
        "**확인**을 클릭해 반려를 완료합니다.",
    ]),
    (r"payModal|오프라인 수납|payment", [
        f"BO `{BO}/admin.html#applicants` 에서 사진 승인이 끝난 접수 건을 찾습니다.",
        "해당 행의 **수납 처리** 버튼을 클릭해 수납 모달을 엽니다.",
        "수납 일시, 금액(USD), 메모(선택)를 입력합니다.",
        "**수납 완료** 버튼을 클릭합니다.",
        "목록에서 상태가 갱신되는지 확인합니다.",
    ]),
    (r"approveModal|접수 승인", [
        "사진 승인 + 수납이 완료된 건에서 **승인** 버튼을 클릭합니다.",
        "승인 확인 모달에서 **확인**을 선택합니다.",
    ]),
    (r"examModal|수험번호|assign-exam", [
        "승인 완료(`applied`) 상태 접수 건을 선택합니다.",
        "**수험번호 부여** 버튼을 클릭합니다.",
        "모달에서 부여 대상을 확인하고 **부여**를 실행합니다. (최고관리자 권한 필요)",
    ]),
    (r"글쓰기|POST /board", [
        f"로그인 후 `{FO}/qna.html` 에서 **글쓰기** 버튼을 클릭합니다.",
        "제목·본문을 입력합니다. (필수 항목 모두 채움)",
        "**등록** 버튼을 클릭합니다.",
    ]),
    (r"GET /health", [
        f"브라우저 또는 curl로 `{API}/health` 에 GET 요청을 보냅니다.",
        '응답 JSON에서 `"status": "ok"` (또는 동등한 정상 표기)를 확인합니다.',
    ]),
    (r"전체 플로우|signup.*register.*BO|FO 가입", [
        f"**[FO] 회원가입** — `{FO}/signup.html` 에서 새 이메일로 3단계 가입을 완료합니다. (OTP는 화면의 dev_code 사용 가능)",
        f"**[FO] 로그인** — 가입한 계정으로 `{FO}/login.html` 에 로그인합니다.",
        f"**[FO] 시험 접수** — `{FO}/register.html` 1~4단계를 진행해 **접수 제출**까지 완료합니다.",
        f"**[BO] 로그인** — `{BO}/admin-login.html` 에서 관리자로 로그인 후 `#applicants` 로 이동합니다.",
        "**[BO] 사진 승인** — 방금 접수한 응시자 행의 사진 썸네일 → 라이트박스 → **승인**.",
        "**[BO] 수납** — 해당 행 **수납 처리** → 금액·일시 입력 → **수납 완료**.",
        "**[BO] 접수 승인** — **승인** 버튼으로 최종 승인합니다.",
        "**[BO] 수험번호** — (선택) **수험번호 부여** 실행.",
        f"**[FO] 결과 확인** — `{FO}/mypage.html` 에서 상태가 **승인완료**인지, `{FO}/ticket.html` 에서 수험번호 표시를 확인합니다.",
    ]),
]

EXPECTED_CHECKS = [
    (r"200|201|성공", "HTTP 응답 코드가 성공(200 또는 201)입니다."),
    (r"401", "인증 실패(401)가 반환되고, 로그인 유도 메시지 또는 배너가 표시됩니다."),
    (r"403", "권한 없음(403)이 반환되거나 해당 버튼·메뉴가 비활성화됩니다."),
    (r"404", "리소스를 찾을 수 없음(404) 또는 '일치하는 정보 없음' 안내가 표시됩니다."),
    (r"409", "충돌(409) — 중복 접수·이중 취소 등 정책 위반 시 적절한 오류가 표시됩니다."),
    (r"422", "입력 검증 실패(422) 또는 화면에서 제출이 차단됩니다."),
    (r"423|ACCOUNT_LOCKED|잠금", "계정 잠금(423) 안내와 잠금 해제까지 남은 시간이 표시됩니다."),
    (r"토큰 저장|JWT|refresh", "브라우저 Local Storage에 access/refresh 토큰이 저장됩니다."),
    (r"토큰 삭제|logout", "토큰이 삭제되고 비로그인 UI(로그인·회원가입 버튼)로 전환됩니다."),
    (r"GNB|마이페이지", "상단 메뉴에 사용자 이름과 **마이페이지**·**로그아웃**이 표시됩니다."),
    (r"errBanner|오류|배너", "화면 상단 또는 입력란 근처에 오류 안내 배너/메시지가 표시됩니다."),
    (r"마스킹", "이메일 일부가 `***` 형태로 마스킹되어 표시됩니다."),
    (r"dev_code", "SMTP 미설정 환경에서 화면에 개발용 인증코드(`dev_code`)가 표시됩니다."),
    (r"approved|승인", "접수 상태가 '승인완료'로 변경되고 FO 마이페이지에도 반영됩니다."),
    (r"rejected|반려", "접수 상태가 '반려'로 변경되고 FO에서 반려 사유를 확인할 수 있습니다."),
    (r"수험번호", "13자리 수험번호가 부여되어 FO 수험표·마이페이지에 표시됩니다."),
    (r"login\?next=|redirect|이동", "로그인하지 않은 사용자가 보호 페이지 접근 시 로그인 화면으로 이동합니다."),
    (r"gap|미구현", "⚠️ 알려진 격차: 기대 기능이 아직 구현되지 않았을 수 있습니다. 실제 동작을 기록해 이슈로 등록합니다."),
    (r"sanitize|esc|XSS", "스크립트가 실행되지 않고 텍스트로 이스케이프되어 표시됩니다."),
    (r"print|인쇄", "인쇄 미리보기 또는 `@media print` 스타일이 적용된 화면이 열립니다."),
    (r"localStorage", "브라우저 Local Storage에 해당 키 값이 저장·삭제됩니다."),
    (r"xlsx|zip|보내기", "파일 다운로드가 시작되고 확장자·용량이 정상입니다."),
    (r"POST payment|payment", "수납 API가 성공하고 접수 상태·수납 일시가 그리드에 반영됩니다."),
    (r"POST application-submissions|접수 제출", "접수 제출 API(201) 성공 후 마이페이지에 새 접수 건이 보입니다."),
    (r"POST approve|승인", "접수 상태가 **승인완료**로 변경됩니다."),
    (r"POST cancel", "접수 상태가 **취소**로 변경되고 BO 목록에도 반영됩니다."),
    (r"verified=true", "이메일 인증 완료 표시(체크 또는 다음 단계 버튼 활성화)가 나타납니다."),
    (r"modalDone", "가입 완료 축하 모달이 뜨고 **로그인** 이동 링크가 동작합니다."),
    (r"ddayGrid|D-Day|카운트", "홈 화면 D-Day 영역에 접수 마감까지 남은 시간이 1초마다 갱신됩니다."),
    (r"필터", "선택한 필터 조건에 맞는 행만 목록에 남습니다."),
    (r"disabled|차단", "버튼이 비활성화되거나 제출 시 오류 안내가 표시됩니다."),
]


PRECOND_MAP = {
    "가입 완료": [
        "FO 데모 계정 `demo@topik-mm.local` / `DemoUser!2026` 이 시드에 존재하는지 확인합니다.",
        "필요 시 `python scripts/seed_dev.py` 를 실행합니다.",
    ],
    "4단계": [
        f"FO에 로그인한 뒤 `{FO}/register.html` 1~3단계까지 진행해 **4단계 최종 확인** 화면까지 도달합니다.",
    ],
    "seed_dev": [
        "`python scripts/seed_dev.py` 실행 후 제107회·데모 계정·샘플 콘텐츠가 있는지 확인합니다.",
    ],
    "가입 계정": [
        "이미 가입된 FO 계정을 사용합니다. (기본: `demo@topik-mm.local`)",
    ],
    "미가입": [
        "아직 가입하지 않은 새 이메일을 준비합니다. (예: `testuser-001@example.com`)",
    ],
    "로그인": [
        f"FO: `{FO}/login.html` 에서 `demo@topik-mm.local` 로 로그인합니다.",
    ],
    "로그인 상태": [
        f"FO에 `demo@topik-mm.local` 로 로그인한 상태를 유지합니다.",
    ],
    "비로그인": [
        "시크릿/프라이빗 창을 열거나 **로그아웃**하여 비로그인 상태를 만듭니다.",
    ],
    "미로그인": [
        "시크릿/프라이빗 창을 열거나 **로그아웃**하여 비로그인 상태를 만듭니다.",
    ],
    "admin": [
        f"BO: `{BO}/admin-login.html` 에서 `admin-dev@topik-mm.local` / `DevOnly!2026` 로 로그인합니다.",
    ],
    "dev 시드": [
        "`python scripts/seed_dev.py` 실행 후 제107회·데모 계정이 있는지 확인합니다.",
    ],
    "approved photo": [
        "FO에서 접수를 제출한 뒤, BO 접수자 목록에서 해당 건의 **사진 승인**을 먼저 완료합니다.",
    ],
    "photo pending": [
        "사진 심사 대기(`photo pending`) 상태의 접수 건이 1건 이상 있어야 합니다.",
    ],
    "paid": [
        "해당 접수 건이 **수납 완료** 상태여야 합니다.",
    ],
    "paid+photo": [
        "사진 승인과 오프라인 수납이 모두 완료된 접수 건이 필요합니다.",
    ],
    "applied": [
        "접수 제출은 완료됐으나 수험번호가 아직 없는 `applied` 상태 건이 필요합니다.",
    ],
    "assigned": [
        "BO에서 **수험번호 부여**가 완료된 접수 건이 필요합니다.",
    ],
    "rejected": [
        "BO에서 **반려** 처리된 접수 건이 필요합니다.",
    ],
    "E2E": [
        "서버 3종(API·FO·BO) 실행 및 `seed_dev.py` 완료 상태에서 전체 흐름을 처음부터 진행합니다.",
    ],
    "SMTP": [
        "`apps/api/.env` SMTP 설정 후 API를 재시작합니다.",
    ],
    "super": [
        "BO **최고관리자(super)** 계정으로 로그인합니다. (기본: `admin-dev@topik-mm.local`)",
    ],
    "viewer": [
        "BO **조회전용(viewer)** 계정이 필요합니다. 없으면 관리자 계정 메뉴에서 생성합니다.",
    ],
    "general": [
        "BO **일반관리자(general)** 계정으로 로그인합니다.",
    ],
}


def expand_precondition(raw: str, module: str) -> list[str]:
    lines = [
        "문서 상단 [테스트 환경 준비](#테스트-환경-준비)의 서버·시드·계정이 갖춰져 있어야 합니다.",
        "",
    ]
    meta = MODULE_META.get(module, {})
    if meta.get("base"):
        lines.append(f"- **시작 화면:** `{meta['base']}`")
        lines.append("")

    raw_s = raw.strip()
    raw_l = raw_s.lower()
    extra: list[str] = []

    if not raw_s or raw_s in ("없음", "none", "-"):
        extra.append("추가 준비 없음. 시크릿 창에서 바로 시작해도 됩니다.")
    else:
        matched = False
        for key, hints in PRECOND_MAP.items():
            if key.lower() in raw_l or key in raw_s:
                extra.extend(hints)
                matched = True
                break
        if not matched:
            if "접수" in raw_s:
                extra.append("FO에서 시험 접수 1건 이상이 있어야 합니다. 없으면 `register.html`에서 신규 제출합니다.")
            elif "가입 정보" in raw_s:
                extra.append("데모 계정 정보와 일치하는 값을 사용합니다. (이름: 데모사용자, 생년월일: 19900101, 연락처: 09123456789)")
            elif "코드 발송" in raw_s or "otp" in raw_l:
                extra.append("회원가입 1단계에서 인증코드 발송을 먼저 완료합니다.")
            elif "draft" in raw_l:
                extra.append("시험 접수 화면에서 **임시저장**을 한 번 수행해 둡니다.")
            elif "2 admin" in raw_l or "2탭" in raw_s:
                extra.append("동일 계정으로 브라우저 탭 2개(또는 서로 다른 관리자 2명)를 준비합니다.")
            else:
                extra.append(f"**조건:** {raw_s}")

    lines.append("**이 시나리오에서 추가로 확인할 것**")
    for e in extra:
        lines.append(f"- {e}")
    return lines


def guess_pages(steps: list[str], module: str) -> list[tuple[str, str]]:
    text = " ".join(steps)
    found = []
    seen = set()
    for pat, url, label in PAGE_HINTS:
        if re.search(pat, text, re.I):
            if url not in seen:
                found.append((label, url))
                seen.add(url)
    if not found:
        base = MODULE_META.get(module, {}).get("base")
        if base:
            found.append((MODULE_META[module]["title"], base))
    return found


def expand_steps(steps: list[str], module: str, title: str) -> list[str]:
    text = " ".join(steps) if steps else title
    for pat, expanded in STEP_EXPANSIONS:
        if re.search(pat, title, re.I) or re.search(pat, text, re.I):
            return expanded

    pages = guess_pages(steps, module)
    result = []
    if pages:
        result.append(f"브라우저에서 `{pages[0][1]}` 을(를) 엽니다.")
    for i, step in enumerate(steps, 1):
        detail = _detailize_step(step, module)
        result.append(detail)
    if not result:
        result.append("시나리오 제목과 사전 준비를 확인한 뒤, 해당 화면에서 기능을 수행합니다.")
    return result


def _detailize_step(step: str, module: str) -> str:
    s = step.strip()
    mapping = {
        "login.html": f"`{FO}/login.html` 페이지에서 작업합니다.",
        "register.html": f"`{FO}/register.html` (시험 접수) 화면에서 작업합니다.",
        "mypage.html": f"`{FO}/mypage.html` (접수 확인) 화면에서 작업합니다.",
        "signup": f"`{FO}/signup.html` 회원가입 화면에서 작업합니다.",
        "#applicants": f"BO `{BO}/admin.html#applicants` 접수자 목록에서 작업합니다.",
        "admin.html": f"BO `{BO}/admin.html` 관리 화면에서 작업합니다.",
        "index.html": f"FO `{FO}/index.html` 홈 화면에서 작업합니다.",
        "POST ": f"API `{API}` 로 {s} 요청을 보냅니다. (개발자 도구 Network 탭 또는 curl 사용)",
        "GET ": f"API `{API}` 로 {s} 요청을 보냅니다.",
        "PATCH ": f"API `{API}` 로 {s} 요청을 보냅니다.",
        "PUT ": f"API `{API}` 로 {s} 요청을 보냅니다.",
    }
    for key, val in mapping.items():
        if key in s:
            return val
    if module.startswith("AUTH-BO") or "admin" in s.lower():
        return f"BO 화면에서 다음을 수행합니다: **{s}**"
    if "FO" in module or module in ("SIGNUP", "APPLY-FO", "CONTENT", "BOARD", "MEMBER", "TERMS"):
        return f"FO 화면에서 다음을 수행합니다: **{s}**"
    return f"다음 동작을 수행합니다: **{s}**"


TITLE_EXPECTED = {
    r"이메일 로그인 성공": "200, 토큰 저장, GNB 마이페이지 표시",
    r"접수 제출": "POST application-submissions 201",
    r"오프라인 수납": "POST payment",
    r"FO 가입": "FO mypage approved",
}


def resolve_expected(expected: str, title: str) -> str:
    for pat, val in TITLE_EXPECTED.items():
        if re.search(pat, title):
            return val
    if expected and not expected.startswith("HTTP 응답 코드가 성공"):
        return expected
    return expected or title


def expand_expected(expected: str, title: str = "") -> list[str]:
    expected = resolve_expected(expected, title)
    checks: list[str] = []
    seen: set[str] = set()
    for pat, msg in EXPECTED_CHECKS:
        if re.search(pat, expected, re.I):
            if msg not in seen:
                checks.append(msg)
                seen.add(msg)
    if not checks:
        checks.append(f"기대 동작: {expected}")
    checks.append("오류가 없으면 Network 탭에서 API 응답 코드와 응답 본문을 한 번 확인합니다.")
    return checks


def make_summary(title: str, module: str) -> str:
    t = title
    if "성공" in t:
        return f"{MODULE_META.get(module, {}).get('title', module)} 영역에서 '{t.split(':')[-1].strip()}' 흐름이 정상 완료되는지 확인합니다."
    if "실패" in t or "틀린" in t or "거부" in t or "차단" in t or "미" in t[:2]:
        return f"잘못된 입력·권한·상태일 때 시스템이 안전하게 거부하고 사용자에게 안내하는지 확인합니다. ({t})"
    if "gap" in t.lower():
        return f"알려진 구현 격차 항목입니다. 현재 동작을 기록하고 기대와 다른 점을 이슈로 남깁니다."
    return f"{MODULE_META.get(module, {}).get('title', module)} 관련 '{t.split(':')[-1].strip()}' 기능이 설계대로 동작하는지 확인합니다."


def _parse_compact(body: str) -> list[dict]:
    pattern = re.compile(
        r"### (TC-[^:]+): ([^\n]+)\n"
        r"- \*\*모듈\*\*: ([^\n]+)\n"
        r"- \*\*우선순위\*\*: ([^\n]+)\n"
        r"- \*\*사전조건\*\*: ([^\n]+)\n"
        r"- \*\*테스트 단계\*\*:\n((?:  \d+\. [^\n]+\n?)+)"
        r"- \*\*기대결과\*\*: ([^\n]+)"
        r"(?:\n- \*\*비고\*\*: ([^\n]+))?",
        re.MULTILINE,
    )
    cases = []
    for m in pattern.finditer(body):
        steps_raw = m.group(6)
        steps = [ln.strip().lstrip("0123456789. ") for ln in steps_raw.strip().split("\n") if ln.strip()]
        title = m.group(2).strip()
        cases.append(
            {
                "id": m.group(1),
                "title": title,
                "module": m.group(3).strip(),
                "priority": m.group(4).strip(),
                "precond": normalize_precond(m.group(5).strip(), title, m.group(3).strip()),
                "steps": steps,
                "expected": resolve_expected(m.group(7).strip(), title),
                "note": (m.group(8) or "").strip(),
            }
        )
    return cases


def _parse_expanded(body: str) -> list[dict]:
    """Parse already-expanded doc (re-run safe)."""
    chunks = re.split(r"(?=### TC-)", body)
    cases = []
    for chunk in chunks:
        m = re.match(r"### (TC-[^:]+): ([^\n]+)", chunk)
        if not m:
            continue
        mod_m = re.search(r"\| \*\*모듈\*\* \| ([A-Z]+(?:-[A-Z]+)?)", chunk)
        pri_m = re.search(r"\| \*\*우선순위\*\* \| (P[0-2])", chunk)
        orig_pre_m = re.search(r"\| \*\*원본 사전조건\*\* \| ([^\|]+)", chunk)
        orig_exp_m = re.search(r"\| \*\*원본 기대결과\*\* \| ([^\|]+)", chunk)
        # 원본 필드는 구버전 호환용; 없으면 제목 기반 추론
        note_m = re.search(r"#### 비고\n\n> (.+)", chunk)
        proc_m = re.search(r"#### 테스트 절차\n\n((?:\d+\. .+(?:\n|$))+)", chunk)
        check_m = re.search(r"#### 확인 포인트\n\n((?:- \[ \] .+(?:\n|$))+)", chunk)

        steps: list[str] = []
        if proc_m:
            raw_steps = [
                re.sub(r"^\d+\.\s*", "", ln).strip()
                for ln in proc_m.group(1).strip().split("\n")
                if ln.strip()
            ]
            # 짧은 원본 단계만 유지; 이미 확장된 절차는 제목 기반으로 재생성
            if raw_steps and all(len(s) < 60 and "http://" not in s for s in raw_steps):
                steps = raw_steps

        expected = orig_exp_m.group(1).strip() if orig_exp_m else ""
        if not expected and check_m:
            for ln in check_m.group(1).split("\n"):
                ln = ln.strip().lstrip("- [ ] ").strip()
                if "Network 탭" in ln or not ln:
                    continue
                if ln.startswith("기대 동작:"):
                    expected = ln.replace("기대 동작:", "").strip()
                else:
                    expected = ln
                break

        precond = orig_pre_m.group(1).strip() if orig_pre_m else ""
        if not precond:
            add_m = re.search(r"\*\*이 시나리오(?:에서 추가로 확인할 것| 추가 준비)\*\*\n((?:- .+\n?)+)", chunk)
            if add_m:
                precond = " / ".join(
                    ln.strip().lstrip("- ").replace("**조건:**", "").strip()
                    for ln in add_m.group(1).strip().split("\n")
                    if ln.strip()
                )

        title = m.group(2).strip()
        module = mod_m.group(1) if mod_m else "UNKNOWN"
        precond = normalize_precond(precond, title, module)
        cases.append(
            {
                "id": m.group(1),
                "title": title,
                "module": module,
                "priority": pri_m.group(1) if pri_m else "P1",
                "precond": precond,
                "steps": steps,
                "expected": expected,
                "note": note_m.group(1).strip() if note_m else "",
            }
        )
    return cases


TITLE_PRECOND = {
    r"이메일 로그인 성공": "가입 완료 계정",
    r"잘못된 비밀번호": "가입 계정",
    r"빈 필드": "없음",
    r"로그인 유지": "없음",
    r"\?next=": "비로그인",
    r"로그아웃": "로그인 상태",
    r"아이디 찾기 성공": "가입 정보 일치",
    r"아이디 찾기 불일치": "없음",
    r"접수 제출": "4단계",
    r"미로그인 차단": "비로그인",
    r"오프라인 수납": "approved photo",
    r"접수 승인": "paid+photo",
    r"수험번호 부여": "applied",
    r"FO 가입": "E2E",
    r"seed dev E2E": "seed_dev",
}


def normalize_precond(raw: str, title: str, module: str) -> str:
    for pat, val in TITLE_PRECOND.items():
        if re.search(pat, title):
            return val
    if not raw or len(raw) > 100 or "예:" in raw or "문서 상단" in raw or raw.startswith("시나리오별"):
        return infer_precond(title, module)
    if "새 이메일" in raw and "로그인" in title:
        return "가입 완료 계정"
    return raw.strip()


def infer_precond(title: str, module: str) -> str:
    t = title.lower()
    if "비로그인" in title or "미로그인" in title:
        return "비로그인"
    if "로그인 성공" in title or "로그인 유지" in title:
        return "가입 완료 계정" if "성공" in title else "없음"
    if "로그인" in title and "실패" not in title:
        return "로그인 상태"
    if "가입" in title or "otp" in t or "signup" in t:
        return "미가입 이메일" if "중복" not in title else "가입 계정"
    if "admin" in t or module == "AUTH-BO":
        return "dev 시드"
    if "viewer" in t:
        return "viewer 계정"
    if "super" in t or "수험번호" in title:
        return "super"
    if "수납" in title:
        return "approved photo"
    if "승인" in title and "BO" in module:
        return "paid+photo"
    if "e2e" in t or "전체" in title:
        return "E2E"
    if "smtp" in t:
        return "SMTP on"
    return "없음"


def parse_cases(content: str) -> tuple[str, list[dict]]:
    marker = "# 시나리오 목록"
    idx = content.find(marker)
    body = content[idx + len(marker) :] if idx != -1 else content

    cases = _parse_compact(body)
    if not cases:
        cases = _parse_expanded(body)
    return "", cases


def render_case(c: dict) -> str:
    mod = c["module"]
    pri = c["priority"]
    lines = [
        f"### {c['id']}: {c['title']}",
        "",
        "| 항목 | 내용 |",
        "| --- | --- |",
        f"| **모듈** | {mod} — {MODULE_META.get(mod, {}).get('title', mod)} |",
        f"| **우선순위** | {pri} — {PRIORITY_DESC.get(pri, '')} |",
        f"| **한 줄 요약** | {make_summary(c['title'], mod)} |",
        "",
        "#### 사전 준비",
        "",
    ]
    for pl in expand_precondition(c["precond"], mod):
        lines.append(pl)
    lines.extend(["", "#### 테스트 절차", ""])
    expanded = expand_steps(c["steps"], mod, c["title"])
    for i, step in enumerate(expanded, 1):
        lines.append(f"{i}. {step}")
    lines.extend(["", "#### 확인 포인트", ""])
    for chk in expand_expected(c["expected"], c["title"]):
        lines.append(f"- [ ] {chk}")
    if c["note"]:
        lines.extend(["", "#### 비고", "", f"> {c['note']}"])
    lines.append("")
    return "\n".join(lines)


def render_header(original: str, count: int) -> str:
    return f"""# 통합 테스트 시나리오

> **목적:** TOPIK Myanmar 서비스(응시자 FO · 관리자 BO · API)가 기획대로 동작하는지 사람이 직접 따라 할 수 있도록 검증합니다.
> **대상 독자:** QA 담당자, 개발자, 운영 담당자 — 기술 용어를 몰라도 단계별로 따라 할 수 있게 작성했습니다.
> **시나리오 수:** {count}건
> **작성·갱신:** 2026-06-10

---

## 이 문서 읽는 방법

1. **아래 [테스트 환경 준비](#테스트-환경-준비)** 를 먼저 완료합니다.
2. **우선순위 P0** 시나리오부터 순서대로 수행합니다. (P0 실패 = 출시 차단 수준)
3. 각 시나리오는 **사전 준비 → 테스트 절차 → 확인 포인트** 순으로 읽습니다.
4. 확인 포인트의 `[ ]` 항목을 직접 체크하며 결과를 기록합니다.
5. **비고**에 `gap`이 있으면 알려진 미구현·정책 격차입니다. 실제 동작을 메모해 두세요.

### 시나리오 ID 규칙

| 접두어 | 의미 | 예시 |
| --- | --- | --- |
| `TC-AUTH-FO` | FO 로그인·인증 | 이메일 로그인 성공 |
| `TC-SIGNUP` | FO 회원가입 | OTP 인증 |
| `TC-APPLY-FO` | FO 시험 접수 | 4단계 제출 |
| `TC-APPLY-BO` | BO 접수자 관리 | 사진 승인·수납 |
| `TC-CROSS` | FO↔BO 연동 | 가입→접수→승인 전체 |
| `TC-EDGE` | 경계·보안 | XSS, 동시 수정 |

---

## 테스트 환경 준비

### 1. 서버 실행 (터미널 3개)

**API (포트 8000)**

```bash
cd apps/api
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

`Address already in use`가 나오면 이미 실행 중이므로 그대로 진행합니다.

**FO 응시자 사이트 (포트 8080)**

```bash
cd html/C안/FO
python3 -m http.server 8080
```

**BO 관리자 사이트 (포트 8081)**

```bash
cd "html/C안/BO(admin)/project"
python3 -m http.server 8081
```

### 2. DB 시드 (최초 1회 또는 DB 초기화 후)

```bash
cd /Users/jhcho/Documents/Myanmar_v2.0
python scripts/seed_dev.py
```

제107회 시험 회차, 지역 코드, 데모 FO/BO 계정, 샘플 공지·FAQ·약관이 생성됩니다.

### 3. 접속 주소

| 구분 | URL |
| --- | --- |
| FO 홈 | [{FO}/index.html]({FO}/index.html) |
| FO 로그인 | [{FO}/login.html]({FO}/login.html) |
| BO 로그인 | [{BO}/admin-login.html]({BO}/admin-login.html) |
| API 문서 | [{API}/docs]({API}/docs) |

### 4. 테스트 계정

| 구분 | 이메일 | 비밀번호 | 비고 |
| --- | --- | --- | --- |
| FO 응시자 | `demo@topik-mm.local` | `DemoUser!2026` | 이름: 데모사용자, 생년월일: 19900101 |
| BO 최고관리자 | `admin-dev@topik-mm.local` | `DevOnly!2026` | 역할: super |

### 5. 테스트 시 유용한 도구

- **브라우저 개발자 도구 (F12)** → Network 탭: API 요청·응답 코드 확인
- **Application → Local Storage**: 로그인 토큰 저장·삭제 확인
- **시크릿/프라이빗 창**: 로그아웃 상태·신규 가입 테스트에 사용
- **curl** 예: `curl -s {API}/health | python3 -m json.tool`

### 6. SMTP (메일 발송 테스트 시)

`apps/api/.env`에 `SMTP_PASS` 등을 설정한 뒤 **API를 반드시 재시작**합니다. (uvicorn `--reload`는 `.env` 변경을 자동 반영하지 않습니다.)

```bash
python scripts/test_smtp.py --to 본인@이메일.com --dry-run   # 설정 확인
python scripts/test_smtp.py --to 본인@이메일.com             # 실발송
```

---

## 모듈 분류

| 모듈 | 설명 | 대표 화면 |
| --- | --- | --- |
| AUTH-FO | FO 로그인·토큰·아이디/비번 찾기 | `{FO}/login.html` |
| AUTH-BO | BO 관리자 인증·역할·비번 변경 | `{BO}/admin-login.html` |
| SIGNUP | FO 회원가입 3단계·OTP·Google | `{FO}/signup.html` |
| APPLY-FO | FO 시험 접수·마이페이지·수험표 | `{FO}/register.html` |
| APPLY-BO | BO 접수자·사진·수납·수험번호 | `{BO}/admin.html#applicants` |
| EXAM-BO | BO 회차·시험장 | `{BO}/admin.html#sessions` |
| CONTENT | 공지·FAQ·약관·D-Day | `{FO}/index.html` |
| BOARD | 문의·환불·정정·댓글 | `{FO}/qna.html` |
| MEMBER | FO/BO 회원 프로필·탈퇴 | `{FO}/mypage-profile.html` |
| TERMS | 약관 버전·동의 | `{FO}/terms.html` |
| SYSTEM | 관리자·권한·audit·health | `{BO}/admin.html` |
| CROSS | FO↔BO End-to-End | FO + BO |
| EDGE | 경계값·악의입력·동시성 | — |

## 우선순위

| 등급 | 의미 | 권장 |
| --- | --- | --- |
| **P0** | 핵심 사용자/운영 워크플로 — 실패 시 출시 차단 | 매 릴리스 필수 |
| **P1** | 부분 구현·정책 격차·UX — 기능은 동작하나 완성도 이슈 | 릴리스 전 권장 |
| **P2** | edge·보안·동시성 — 시간 허용 시 | 정기 점검 |

---

## 권장 테스트 순서 (처음 전체 점검 시)

1. **환경·헬스** — `TC-SYSTEM-007`~`009`, 서버 접속 확인
2. **FO 인증·가입** — `TC-AUTH-FO-*`, `TC-SIGNUP-*`
3. **FO 접수·마이페이지** — `TC-APPLY-FO-*`
4. **BO 인증·회차·시험장** — `TC-AUTH-BO-*`, `TC-EXAM-BO-*`
5. **BO 접수 처리** — `TC-APPLY-BO-*`
6. **콘텐츠·게시판** — `TC-CONTENT-*`, `TC-BOARD-*`
7. **연동 E2E** — `TC-CROSS-*` (가장 중요: `TC-CROSS-001`, `TC-CROSS-015`)
8. **경계·보안** — `TC-EDGE-*`

## 테스트 결과 기록 양식 (복사해 사용)

각 시나리오 수행 후 아래 형식으로 메모하면 추적이 쉽습니다.

```
시나리오 ID: TC-XXXX-NNN
테스트 일시: 2026-06-10 14:30
테스트 담당: 홍길동
결과: PASS / FAIL / BLOCKED / N/A
실제 확인 내용: (예: 로그인 후 GNB에 '데모사용자' 표시됨)
실패 시 스크린샷·Network 응답: (경로 또는 코드)
비고: (gap 항목이면 현재 동작 기록)
```

---

# 시나리오 목록

"""


def render_module_section(module: str) -> str:
    meta = MODULE_META.get(module)
    if not meta:
        return ""
    return f"""
---

## {meta['title']} (`{module}`)

{meta['desc']}

> 시작 화면: `{meta.get('base', '')}`

"""


def main() -> None:
    content = SRC.read_text(encoding="utf-8")
    _, cases = parse_cases(content)
    if not cases:
        raise SystemExit("No test cases parsed")

    out = [render_header(content, len(cases))]
    current_module = None
    for c in cases:
        if c["module"] != current_module:
            current_module = c["module"]
            out.append(render_module_section(current_module))
        out.append(render_case(c))

    DST.write_text("\n".join(out), encoding="utf-8")
    print(f"Expanded {len(cases)} cases → {DST}")


if __name__ == "__main__":
    main()
