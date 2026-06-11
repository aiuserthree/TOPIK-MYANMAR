# FO·BO 기능 격차 점검 (고객사 전달용)

> **기준일:** 2026-06-11  
> **기준 문서:** 본 폴더 `FO/*.xlsx`, `BO/*.xlsx` (v1.31) 및 `docs/기능정의서/FO|BO/*.md`  
> **구현 기준:** `html/C안/FO/`, `html/C안/BO(admin)/project/`, `apps/api/`  
> **범위:** 기능만 (인프라·법무·DNS·SMTP 운영 제외는 별도 [`00_인프라_배포_참고.md`](00_인프라_배포_참고.md))

---

## 요약

| 구분 | 스펙 대비 | 비고 |
| --- | --- | --- |
| **FO** | 핵심 플로우(가입·접수·마이페이지·게시판·공지) **구현** | 운영 SMTP·**편의지원 FO UI 보류**·i18n 잔여 구간 |
| **BO** | 접수·회차·콘텐츠·회원·관리자 **구현** | 권한 매트릭스·환불→회원반영·SMTP 운영 |

**2026-06-08 ~ 06-10 반영 요약:** Google 탈퇴, 공지 다국어·이전/다음글, 게시판 본인 수정·삭제, 비밀번호 만료 팝업, BO 공지 MY/EN·노출기간·휴지통, 접수 `rev`/409, 조회관리자 UI 제한, 답변 이력·대댓글, 관리자 첫 로그인 비밀번호 변경 등 **코드 반영 완료**.

**2026-06-11 반영 요약 (P0/P1/P2):** 필수 약관 서버 검증, FO `form-validation.js`, 비밀번호 규칙·**동일 비번 차단**, OTP **6회 실패 잠금**(`V013`), 증명사진 **2MB·미등록 제출 차단**, 공지 카테고리 `lang` 반영. **편의지원 FO UI는 보류**(API·BO 채번만).

---

## FO — 구현 완료 (기능정의서 대비)

| 영역 | 기능정의서 | 구현 |
| --- | --- | --- |
| 00 공통 | GNB 4대 메뉴, 언어 KO/MY/EN, 모바일 메뉴, 로그인 가드, **푸터 개인정보처리방침 볼드** | `common.js`, `styles.css` |
| 01 메인 | D-Day, 공지 5건, FAQ | API 연동 |
| 02~03 안내·규정 | 8개 정적 페이지 | HTML 8종 |
| 04 접수 | 4단계 원서, 임시저장, Ⅰ+Ⅱ 동시 접수, **필수 약관·증명사진 제출 검증**, 마이페이지 배지·취소 | `register.html`, `mypage.html` |
| 04 수험표 | 비로그인 안내 + topik.go.kr (0527) | `ticket.html` |
| 05 게시판 | 공지·FAQ·환불·정정·문의, 비밀글·댓글, **본인 글 수정·삭제**(답변 전) | `fo-notices.js`, `fo-board.js`, `board.py` PATCH/DELETE |
| 05 공지 | **다국어 제목·본문**(KO/MY/EN), **이전글/다음글**, 언어 전환 시 상세 재조회 | `notice.html`, `content.py` `_notice_localized` |
| 06 계정 | 이메일 가입·로그인·내정보·비번찾기, **Google 간편 로그인/가입**, **Google 탈퇴** | `signup.html`, `login.html`, `mypage-profile.html`, `me.py` |
| 06 계정 | **비밀번호 6개월 변경 로그인 팝업** (이메일 계정) | `login.html` `#modalPwExpiry`, `auth.py` |
| 06 계정 | **이메일 인증·비번 재설정** API·FO 연동, **OTP 6회 실패 잠금**, **동일 비번 변경·재설정 차단** | `auth.py`, `signup.html`, `password-reset.html`, `me.py` |

---

## FO — 미구현·부분 구현

### P0 (운영 설정 — 코드 완료, 배포 환경 필요)

| # | 기능정의서 요구 | 현재 상태 | 조치 |
| --- | --- | --- | --- |
| 1 | **이메일 인증·비번 재설정** | API·FO **구현 완료**. SMTP 미설정 시 `dev_code`만 (운영 불가) | 테라웹메일 DNS·SMTP 설정 |
| 2 | **Google 간편 로그인/가입** | API·FO **구현 완료**. `GOOGLE_CLIENT_ID` 없으면 UI 비활성 | Google Cloud 앱 등록·환경변수 |

### P1 (부분·정책)

| # | 기능정의서 요구 | 현재 상태 |
| --- | --- | --- |
| 3 | **편의지원(장애인)** 접수 UI | **2026-06-11 보류** — API·BO 채번(`accommodation_requested`)만, FO UI **의도적 미제공** |
| 4 | 일반글 댓글 **공개/비공개 선택** | 비밀글은 `is_secret` 연동. 일반글 **댓글별 공개 범위 FO UI·API 필드 없음** |
| 5 | i18n **전 페이지 완전 검수** | 키 기반 전환·0609 버튼명 번역 반영. 동적 문자열·API 카테고리 라벨 등 **MY/EN 누락 구간 잔존** |
| 6 | 공지 **카테고리 라벨** 다국어 | API `notice_category_label(category, lang)` **MY/EN 반영** (정적 UI 문자열 i18n은 잔여) |

### P2 (향후·nice-to-have)

- D-Day 서버 시각 동기화, 공지 전문 검색, OG 태그, TOPIK 안내 BO CMS 연동

### 보류·정책 결정 (미구현 예정)

| # | 기능정의서 요구 | 결정 | 대안 |
| --- | --- | --- | --- |
| — | 약관 개정 **재동의** (FO 로그인 차단·모달) | **구현 안 함** (2026-06-10 확정) | 약관 개정 시 **이메일 안내**로 대체 예정 |
| — | BO 사이드바 배지 **1분 자동 갱신** | **구현 안 함** (2026-06-10 확정) | 로그인·페이지 이동·수동 새로고침 시 갱신 |

---

## BO — 구현 완료 (기능정의서 대비)

| 영역 | 기능정의서 | 구현 |
| --- | --- | --- |
| 00 공통 | 로그인, 사이드바, 회차 컨텍스트, **첫 로그인 비밀번호 변경 게이트** | `admin-login.html`, `app.jsx` `ChangePasswordGate` |
| 01 대시보드 | KPI, 최근 접수·게시판 | `dashboard.jsx` + API |
| 02 접수 | 사진심사·수납 통합, 채번, xlsx/zip, **`rev`/`If-Match`/409 UX** | `applicants.jsx`, `bo-api-bridge.js` `handleMutation` |
| 03 시험 | 회차·시험장 CRUD, **조회관리자 복제 버튼 비활성** | `sessions.jsx`, `venues.jsx` |
| 04 콘텐츠 | 공지·FAQ·환불·문의, **공지 MY/EN 저장**, **노출 시작/종료**, **휴지통·복원** | `notices.jsx`, `bo-api-bridge.js`, `V009` 마이그레이션 |
| 04 콘텐츠 | 환불·정정·문의 **답변 이력**, **대댓글**, 공식답변·댓글 구분 | `refunds.jsx`, `inquiries.jsx`, `board-comments.jsx` |
| 05 회원·약관 | 회원·약관·동의 이력, **이메일(로그인 ID) 수정 불가** | `members.jsx`, `terms.jsx` |
| 06 시스템 | 관리자·처리 이력, **조회관리자 UI 버튼 비활성**(접수 상세 등) | `admins.jsx`, `audit.jsx`, `applicants.jsx` |
| 06 시스템 | **관리자·회원 접근 로그**, **권한 변경 이력** (super, V012) | `admin-access-log.jsx`, `member-access-log.jsx`, `perm-history.jsx` |
| 06 시스템 | 알림 **이메일** outbox·트리거·마케팅 발송 | `mail.py`, `email_notify.py`, `admin_api.py` |

---

## BO — 미구현·부분 구현

### P0 (운영 설정)

| # | 요구 | 현재 상태 |
| --- | --- | --- |
| 1 | 알림 **이메일** (승인·반려·마케팅 등) | 코드·outbox **구현 완료**. **SMTP·`ENABLE_EMAIL_WORKER` 운영 설정** 필요 |

### P1

| # | 기능정의서 요구 | 현재 상태 |
| --- | --- | --- |
| 2 | **권한 매트릭스** (메뉴별 CRUD) | `permissions.jsx` **정적 UI만**, API는 coarse role(`super`/`admin`/`readonly`) |
| 3 | **동시 수정 rev/409** (회원 등) | 접수 처리 **`If-Match`·409 메시지 구현**. 회원 수정 등 **일부 패널 `rev` 미전송** |
| 4 | 환불·정정 → **회원 정보 반영** | `applyMemberFix` **데모**(회원 패널 이동만, API 미연동) |
| 5 | readonly 관리자 **UI 버튼 비활성** | 접수·회차·공지 등 **주요 패널 반영**. 환불·문의 등 **패널별 `can()` 의존, 배너·일관성 미흡** |
| 6 | 환불·정정 **목록 답변 상태** | 상세·FO는 답변 이력 표시. 목록 `has_admin_reply`가 **컬럼 기준**이라 공식댓글만 있을 때 **불일치 가능** |

### P2

- 대시보드 KPI 드릴다운, 사진 회전 저장, 2FA, WebSocket 집계

---

## 우선 조치 (개발)

| 순위 | 항목 | FO/BO | 비고 |
| --- | --- | --- | --- |
| 1 | SMTP·Google OAuth **운영 환경 설정** | FO+BO+API | 코드 완료, 배포만 |
| 2 | `register.html` **편의지원** 체크 UI | FO | **보류** — 고객사 요청 시 재개 |
| 3 | 환불·정정 **`applyMemberFix`** 회원 반영 | BO+API | 데모 → 실연동 |
| 4 | 권한 매트릭스 **서버 반영** 또는 역할별 가드 정리 | BO+API | 정적 UI 유지 vs API 확장 결정 |
| 5 | 일반글 댓글 **공개/비공개** FO UI | FO+API | `CreateCommentBody` 확장 |

---

## 체크리스트 연동

`docs/기능정의서/개발자_체크리스트.md` — 2026-06-09 `audit_checklist_status.py --apply` 기준.  
**2026-06-10 코드 반영으로 아래 항목은 체크리스트 재감사 시 `[x]` 또는 `[p]` 상향 예상:**

| 영역 | 항목 (요약) | 이전 | 현재(코드 기준) |
| --- | --- | --- | --- |
| FO | Google 탈퇴 | `[p]` | `[x]` |
| FO | 공지 다국어·이전/다음글 | `[p]` | `[x]` |
| FO | 게시판 본인 수정·삭제 | `[ ]` | `[x]` |
| FO | 비밀번호 6개월 팝업 | `[p]` | `[x]` |
| FO | OTP 6회 실패·비밀번호 검증·필수 약관 | `[ ]` | `[x]` |
| FO | 편의지원 FO UI | `[ ]` | **보류** |
| BO | 공지 MY/EN·노출기간·휴지통 | `[p]` | `[x]` |
| BO | 접수 `rev`/409 | `[p]` | `[x]` |
| BO | 조회관리자 UI | `[p]` | `[x]` |
| 공통 | 이메일 트리거 | `[p]` | `[p]` (SMTP 대기) |

재실행: `python3 docs/기능정의서/scripts/audit_checklist_status.py --apply`

---

## 관련 문서

- [`00_인프라_배포_참고.md`](00_인프라_배포_참고.md)
- [`../개발자_체크리스트.md`](../개발자_체크리스트.md)
- [`../../PROJECT_REVIEW.md`](../../PROJECT_REVIEW.md)
- [`../../system_design/agreement-checklist.md`](../../system_design/agreement-checklist.md)
