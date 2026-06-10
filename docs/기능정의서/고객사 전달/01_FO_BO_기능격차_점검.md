# FO·BO 기능 격차 점검 (고객사 전달용)

> **기준일:** 2026-06-09  
> **기준 문서:** 본 폴더 `FO/*.xlsx`, `BO/*.xlsx` (v1.31) 및 `docs/기능정의서/FO|BO/*.md`  
> **구현 기준:** `html/C안/FO/`, `html/C안/BO(admin)/project/`, `apps/api/`  
> **범위:** 기능만 (인프라·법무·DNS·SMTP 운영 제외는 별도 [`00_인프라_배포_참고.md`](00_인프라_배포_참고.md))

---

## 요약

| 구분 | 스펙 대비 | 비고 |
| --- | --- | --- |
| **FO** | 핵심 플로우(가입·접수·마이페이지·게시판) **구현** | 공지 다국어·게시글 수정·Google 탈퇴 등 격차 |
| **BO** | 접수·회차·콘텐츠·회원·관리자 **구현** | 권한 매트릭스·rev 충돌 UX·공지 MY/EN 저장 등 격차 |

---

## FO — 구현 완료 (기능정의서 대비)

| 영역 | 기능정의서 | 구현 |
| --- | --- | --- |
| 00 공통 | GNB 4대 메뉴, 언어 KO/MY/EN, 모바일 메뉴, 로그인 가드 | `common.js` |
| 01 메인 | D-Day, 공지 5건, FAQ | API 연동 |
| 02~03 안내·규정 | 8개 정적 페이지 | HTML 8종 |
| 04 접수 | 4단계 원서, 임시저장, Ⅰ+Ⅱ 동시 접수, 마이페이지 배지·취소 | `register.html`, `mypage.html` |
| 04 수험표 | 비로그인 안내 + topik.go.kr (0527) | `ticket.html` |
| 05 게시판 | 공지·FAQ·환불·정정·문의, 비밀글·댓글 | `fo-notices.js`, `fo-board.js` |
| 06 계정 | 이메일 가입·로그인·내정보·비번찾기 | `signup.html`, `mypage-profile.html` |

---

## FO — 미구현·부분 구현

### P0 (사용자 워크플로 차단)

| # | 기능정의서 요구 | 현재 상태 | 조치 |
| --- | --- | --- | --- |
| 1 | **Google 가입 회원 탈퇴** (0526) | `/me/withdraw` 비밀번호 필수 → Google 계정 탈퇴 불가 | API·FO Google 재확인 또는 별도 탈퇴 분기 |
| 2 | **이메일 인증·비번 재설정** | API 있음, **SMTP 미설정 시** `dev_code`만 (운영 불가) | 테라웹메일 DNS·SMTP 설정 |
| 3 | **Google 간편 로그인/가입** | `GOOGLE_CLIENT_ID` 없으면 비활성 | Google Cloud 앱 등록 |

### P1 (부분·정책)

| # | 기능정의서 요구 | 현재 상태 |
| --- | --- | --- |
| 4 | 공지 **다국어 본문** (KO/MY/EN) | API·FO **KO 단일** (`body_html`) |
| 5 | 공지 상세 **이전글/다음글** | `fo-notices.js` 미구현 |
| 6 | 게시판 **본인 글 수정·삭제** (답변 전) | API PATCH/DELETE 없음 |
| 7 | 일반글 댓글 **공개/비공개 선택** | `is_secret`만, 댓글별 공개 범위 없음 |
| 8 | 비밀번호 6개월 변경 **로그인 팝업** | 배너·이메일만, 팝업 없음 |
| 9 | **편의지원(장애인)** 접수 UI | API·채번 로직 있음, `register.html` 입력 없음 |
| 10 | 약관 개정 **재동의** 모달 | BO 약관 버전만, FO 로그인 시 차단 없음 |
| 11 | i18n **전 페이지 완전 검수** | 키 기반 전환 있으나 MY/EN 누락 구간 존재 |

### P2 (향후·nice-to-have)

- D-Day 서버 시각 동기화, 공지 전문 검색, OG 태그, TOPIK 안내 BO CMS 연동

---

## BO — 구현 완료 (기능정의서 대비)

| 영역 | 기능정의서 | 구현 |
| --- | --- | --- |
| 00 공통 | 로그인, 사이드바, 회차 컨텍스트 | `admin-login.html`, `app.jsx` |
| 01 대시보드 | KPI, 최근 접수·게시판 | `dashboard.jsx` + API |
| 02 접수 | 사진심사·수납 통합, 채번, xlsx/zip | `applicants.jsx` + `admin_api` |
| 03 시험 | 회차·시험장 CRUD | `sessions.jsx`, `venues.jsx` |
| 04 콘텐츠 | 공지·FAQ·환불·문의 | `notices.jsx` 등 + bridge |
| 05 회원·약관 | 회원·약관·동의 이력, **이메일(로그인 ID) 수정 불가** | `members.jsx`, `terms.jsx` |
| 06 시스템 | 관리자·처리 이력 | `admins.jsx`, `audit.jsx` |

---

## BO — 미구현·부분 구현

### P0

| # | 요구 | 현재 상태 |
| --- | --- | --- |
| 1 | 알림 **이메일** (승인·반려·마케팅 등) | 코드·outbox 완료, **SMTP 운영 설정** 필요 |

### P1

| # | 기능정의서 요구 | 현재 상태 |
| --- | --- | --- |
| 2 | **권한 매트릭스** (메뉴별 CRUD) | `permissions.jsx` **로컬 UI만**, API coarse role |
| 3 | **동시 수정 rev/409** UX | API `rev` 있음, **BO `If-Match` 미전송** |
| 4 | 공지 **MY/EN 저장** | BO 편집 UI 있으나 `apiSaveNotice` **KO만 전송** |
| 5 | 공지 **노출 시작/종료** 일시 | BO LP 필드만, API·DB 없음 |
| 6 | 환불·정정 → **회원 정보 반영** | `applyMemberFix` 데모(패널 이동만) |
| 7 | 사이드바 배지 **1분 자동 갱신** | 초기 로드만 |
| 8 | readonly 관리자 **UI 버튼 비활성** | API 일부 403, BO UI 불완전 |
| 9 | 공지 **soft-delete·휴지통** | `is_published=false`만 |

### P2

- 대시보드 KPI 드릴다운, 사진 회전 저장, 2FA, WebSocket 집계

---

## 우선 조치 (개발)

| 순위 | 항목 | FO/BO |
| --- | --- | --- |
| 1 | Google 계정 탈퇴 분기 | FO+API |
| 2 | BO 접수 처리 `rev` + 409 메시지 | BO |
| 3 | 공지 MY/EN DB·API·FO 연동 | BO+API+FO |
| 4 | 게시판 본인 글 수정·삭제 | FO+API |
| 5 | 권한 매트릭스 서버 반영 또는 역할별 가드 정리 | BO+API |
| 6 | `register.html` 편의지원 체크 | FO |

---

## 체크리스트 연동

`docs/기능정의서/개발자_체크리스트.md` — 2026-06-09 `audit_checklist_status.py --apply` 갱신:

- DB·스키마·API 연동: 다수 `[x]` 반영
- 이메일 트리거: `[p]` (SMTP 대기)
- Google·rev·탈퇴: 수동 `[p]` 반영

재실행: `python3 docs/기능정의서/scripts/audit_checklist_status.py --apply`

---

## 관련 문서

- [`00_인프라_배포_참고.md`](00_인프라_배포_참고.md)
- [`../개발자_체크리스트.md`](../개발자_체크리스트.md)
- [`../../PROJECT_REVIEW.md`](../../PROJECT_REVIEW.md)
- [`../../system_design/agreement-checklist.md`](../../system_design/agreement-checklist.md)
