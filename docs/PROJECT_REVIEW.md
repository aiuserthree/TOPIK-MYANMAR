# TOPIK Myanmar 프로젝트 종합 리뷰

**기준 디자인 소스:** `html/C안/FO/`, `html/C안/BO(admin)/project/`  
**검토일:** 2026-06-06  
**방법:** 실제 파일 glob/grep·소스 읽기 기준 (추정 없음)

---

## A. FO 현황 요약

### A.1 HTML 페이지 (25개)

| 구분 | 파일 | 용도 | API 연동 |
|------|------|------|----------|
| **홈** | `index.html` | 히어로, D-Day, 공지 미리보기, FAQ 요약, 회차 | `TopikApi` (회차, FAQ) |
| **계정** | `login.html` | 이메일/비밀번호, Google, 아이디 찾기, 비번 찾기 | auth 전체 |
| | `signup.html` | 3단계 가입 + 사진 + Google | auth/register, verify, Google |
| | `password-reset.html` | 비밀번호 재설정 | forgot/verify/reset |
| | `mypage.html` | 접수 확인·취소·확인증 | me, applications, cancel |
| | `mypage-profile.html` | 프로필·비번·탈퇴·사진 | me PATCH, change-password, withdraw |
| **접수** | `register.html` | 4단계 시험 접수 + 임시저장 | exam-rounds/venues, draft, submit |
| | `apply-howto.html` | 접수 방법 안내 | 정적 |
| | `ticket.html` | 수험표 안내 + topik.go.kr 링크 | 선택적 `getMyApplications` (로그인 시) |
| **TOPIK 안내** | `guide-overview.html` | 시험 개요 (+ 회차 API) | exam-rounds |
| | `guide-intro.html` | 시험 소개 | 정적 |
| | `guide-questions.html` | 문항 구성 | 정적 |
| | `guide-evaluation.html` | 평가 기준 | 정적 |
| **TOPIK 규정** | `rules-notice.html`, `rules-answer.html`, `rules-fee.html`, `rules-id.html` | 규정 4종 | 정적 |
| **게시판** | `notice.html` | 공지 목록/상세 SPA | `fo-notices.js` → notices API |
| | `faq.html` | FAQ 아코디언 | faq API |
| | `qna.html` | 문의 게시판 | `fo-board.js` → board API |
| | `refund-correction.html` | 환불·정보정정 | `fo-board.js` |
| **약관** | `terms.html`, `privacy.html`, `marketing.html` | 약관 본문 | `fetch /api/v1/terms/:type` (api-client 없이) |
| **기타** | `404.html` | 에러 | 정적 |

**IA 문서:** [`html/C안/FO/docs/00_IA.md`](../html/C안/FO/docs/00_IA.md) (및 `01_common.md` ~ `07_account.md`) — 25페이지와 대체로 일치.

### A.2 에셋·JS·CSS

| 경로 | 역할 |
|------|------|
| `assets/styles.css` | 전역 FO 스타일 |
| `assets/common.js` | GNB/Footer/Drawer/Tabbar, 로그인 가드, 언어 토글, i18n 부트 |
| `assets/fo-notices.js` | 공지 목록/상세 |
| `assets/fo-board.js` | 문의·환불 게시판 CRUD/댓글 |
| `assets/photo-upload.js` | 가입/프로필 사진 업로드 UI |
| `shared/topik-i18n-content.js` | KO/MY/EN 페이지 본문 번역 (`TOPIKPageI18n`) |
| `html/shared/api-client.js` | FO API 클라이언트 (`TopikApi`) — HTML에서 `shared/api-client.js`로 참조 |
| `assets/favicon.svg`, `favicon.ico`, `robots.txt`, `sitemap.xml`, `vercel.json` | 메타/배포 |

**누락 파일 (참조만 존재):**

- `shared/roster-codes.js` — `signup.html`, `register.html`, `mypage-profile.html`에서 `<script src="shared/roster-codes.js">` 참조하나 **저장소 어디에도 없음**

### A.3 API 의존성 (`html/shared/api-client.js` → `TopikApi`)

| 영역 | 엔드포인트 |
|------|-----------|
| **인증** | `POST /api/v1/auth/login`, `refresh`, `register`, `send-verification-code`, `verify-email`, `google/config`, `google`, `find-email`, `forgot-password`, `verify-reset-code`, `reset-password` |
| **회원** | `GET/PATCH /api/v1/me`, `POST /me/change-password`, `POST /me/withdraw` |
| **접수** | `GET/PUT/DELETE /api/v1/application-draft`, `POST /application-submissions`, `GET /applications`, `POST .../cancel` |
| **시험** | `GET /api/v1/exam-rounds`, `GET /api/v1/exam-venues` |
| **콘텐츠** | `GET /api/v1/notices`, `GET /notices/:id`, `GET /api/v1/faq`, `GET /api/v1/terms/:type` |
| **게시판** | `GET/POST /api/v1/board/posts`, `GET/POST .../comments` |
| **파일** | `GET /api/v1/files/:id` (+ `?token=`) |
| **헬스** | `GET /health` |

- `USE_API=false` 또는 base URL 없으면 **데모 로그인**(`demo-local` 토큰) + `localStorage` 폴백
- `register.html`: API 미연결 시 `localStorage` 키 `tpkm_register_draft_v1` 폴백
- 기본 API base: `build.py`가 `<meta name="topik-api-base">` 주입 (기본 Railway URL)

### A.4 i18n (KO / MY / EN)

- **UI 언어 저장:** `localStorage.tpkm_lang` (`KO`|`MY`|`EN`, 기본 `KO`)
- **메커니즘:** `common.js` → 동적 로드 `shared/topik-i18n-content.js` → `[data-i18n-content="key"]` 갱신
- **폴백:** MY→EN→KO, EN→KO
- **API 다국어:** FAQ `?lang=`, 약관 `?lang=ko|my|en`, Google 로그인 `preferred_lang`
- **메뉴 i18n:** `common.js`의 `MENU_I18N` / `SUB_I18N` 키

### A.5 정책·구현 차이 (주의)

- **0527 수험표:** IA·`common.js` — `ticket.html`은 로그인 가드 **제외**. 구현은 비로그인도 topik.go.kr 안내 가능, 로그인 시 수험번호 공개 건 표시 (`getMyApplications`).
- **로그인 필수 5메뉴:** 시험 접수, 접수 확인, 환불·정정, 문의 (수험표 제외) — `common.js` `PROTECTED` Set과 일치.

---

## B. BO(admin) 현황 요약

### B.1 `project/` 구조

```text
html/C안/BO(admin)/project/
├── admin-login.html          # 관리자 로그인 (mock)
├── admin.html                # SPA 셸 (~4800줄, 패널 JSX 인라인 번들)
├── assets/
│   ├── admin.css, fo-styles.css
│   ├── app.jsx, common.jsx, data.js   # 소스 (admin.html에 인라인 복제)
│   └── bo-export-bridge.js
├── panels/*.jsx              # 14개 패널 소스 (admin.html에 인라인)
├── shared/
│   ├── topik-bo-core.js, topik-export.js, topik-lib-loader.js, topik-mail.js
│   └── topik-i18n-content.js
├── docs/                     # IA + 패널별 기능정의 (00~06, frontend/)
├── uploads/                  # 기능정의서·FO handoff 사본
└── screenshots/              # 01~03 대시보드/접수자 캡처
```

### B.2 14개 패널 및 기능

| 패널 | 파일 | 주요 기능 (mock DataStore) |
|------|------|---------------------------|
| 1 | `dashboard.jsx` | KPI 10종, 회차 컨텍스트, 최근 접수/공지/환불/문의, 처리 이력 |
| 2 | `applicants.jsx` | 필터·검색·그리드, 승인/반려, 오프라인 수납/취소, 사진 심사 LP, 13자리 수험번호 일괄부여, 연명부 Excel, 사진 ZIP, 인쇄 |
| 3 | `photos.jsx` | 사진 심사 카드 갤러리, 승인/반려(사유) |
| 4 | `sessions.jsx` | 회차 CRUD, 접수기간·응시료·시험장 매핑, 상태(open/closed/planned) |
| 5 | `venues.jsx` | 시험장 CRUD, venue_code 2자리, 활성/비활성 |
| 6 | `notices.jsx` | 공지 CRUD, 카테고리, 고정, 마케팅 발송 UI |
| 7 | `faq.jsx` | FAQ CRUD, KO/MY/EN, 정렬 |
| 8 | `refunds.jsx` | 환불·정보정정 목록/상세/답변/상태 |
| 9 | `inquiries.jsx` | 문의 게시판 관리, 답변, 비밀글 |
| 10 | `members.jsx` | 회원 목록/상세/수정, 정지/탈퇴, 비번 초기화, CSV |
| 11 | `terms.jsx` | 약관 버전 draft/게시/폐지, 미리보기, 동의 이력 |
| 12 | `admins.jsx` | 관리자 계정 CRUD, 역할(super/general/viewer) |
| 13 | `permissions.jsx` | 메뉴별 권한 매트릭스 (조회/생성·수정·삭제) |
| 14 | `audit.jsx` | 처리 이력 필터·검색·상세 |

**IA:** `project/docs/IA.md` + `uploads/*기능정의서*.md` — 패널·모달 ID와 정합.

### B.3 기술 스택

| 항목 | 내용 |
|------|------|
| UI | React **18.3.1 UMD (development 빌드)** + `@babel/standalone` |
| 라우팅 | Hash (`admin.html#applicants`) |
| 상태 | `window.DataStore` — **순수 JS mock**, `assets/data.js` / `admin.html` 인라인 |
| 인증 | `sessionStorage.bo_session` — **아무 ID/PW나 로그인 성공** (데모) |
| API | **실 API 호출 없음** — README·`api/README.md`의 "BO(admin)는 의도적으로 미연장"과 일치 |
|보내기 | `topik-export.js` + `bo-export-bridge.js` (클라이언트 mock Excel/ZIP) |
| FO 링크 | 탑바 `../../FO/index.html` (상대 경로) |

### B.4 `html/C안/BO/` (stub) vs BO(admin)

| | `BO(admin)/project/` | `html/C안/BO/` |
|--|---------------------|----------------|
| HTML | `admin-login.html`, `admin.html` | **없음** |
| UI | React 14패널 풀 콘솔 | JS 4개만: `bo-api-data.js`, `panels/notices.js`, `faq.js`, `photos.js` |
| API | Mock | README상 API 연동 stub 의도 (파일 일부 미확인/경로 이슈) |
| `build-bo.py` 입력 | ❌ 가리키지 않음 | ✅ `html/C안/BO/`만 복사 |

**결론:** authoritative UI = **BO(admin)**; `build-bo.py`·`BO/` stub·문서(DEPLOY §5)의 "정적 BO HTML" 설명은 **불일치**.

---

## C. 신규 스택 gap — `apps/web`, `apps/api`

### C.1 `apps/web` (Vite 6 + React 19 + TS + Tailwind 4)

**현재:** `src/pages/Home.tsx` 1페이지, 라우트 `/`만 (`App.tsx`).

| FO 페이지 (25) | apps/web | Gap |
|----------------|----------|-----|
| 전체 25 HTML | Home placeholder 1 | **24페이지 + 공통 레이아웃/i18n/API 레이어 미구현** |
| GNB/Footer/Tabbar | 없음 | `common.js` 동등 컴포넌트 필요 |
| `TopikApi` 연동 | Vite proxy만 (`/api`→8000) | fetch 레이어 없음 |

**우선 이전 후보 (문서·IA 기준):** signup → register → mypage → login → notice/faq → board

### C.2 `apps/api` (FastAPI)

**현재 구현:**

| Method | Path |
|--------|------|
| GET | `/health` |
| GET | `/api/v1/auth/status` (placeholder) |

**FO+BO에 필요하나 미구현 (레거시 `api/README.md` 계약 기준 ~80+ 엔드포인트):**

- FO auth/me/application/exam-rounds/notices/faq/terms/board/files 전부
- BO `/api/v1/admin/*` 전부 (applications, payment, photo-review, exam-numbers, roster.xlsx, photos.zip, notices/faq/terms CRUD, exam-rounds/venues, users, admin-users, board reply 등)
- Internal `/internal/notifications/*`
- ORM model, repository, JWT, S3 storage, email worker — **없음** (config/database 스캐폴드만)

---

## D. 레거시 스택 정합성

### D.1 `api/` (Fastify)

| 항목 | 상태 |
|------|------|
| `api/README.md` | **가장 완전한 API 계약서** — FO/BO 전 엔드포인트·이메일·수험번호 규칙 기술 |
| `api/src/index.ts` | 20+ route 모듈 import |
| **실제 존재 소스** | `index.ts`, `lib/validation.ts`, `routes/me.ts`, `routes/application-drafts.ts`, `routes/auth-signup.ts` **5파일만** |
| `package.json`, `routes/admin/*`, `lib/storage.ts` 등 | **없음** → `npm run dev` **불가** |
| README가 가리키는 BO HTML | `html/C안/BO/login.html` 등 — **저장소에 없음** |

### D.2 빌드 스크립트

| 스크립트 | 입력 | 출력 | 정합성 |
|----------|------|------|--------|
| `build.py` | `html/C안/FO` + `html/shared` | `public/` | FO 경로 ✅ |
| `build-bo.py` | `html/C안/BO` (stub) + `html/shared` | `public-bo/` | **BO(admin) 미반영 ❌** — HTML 없어 배포 무의미 |

**`build.py` 치명적 이슈:** FO의 `shared/topik-i18n-content.js` 복사 후 `html/shared/`로 **`shared/` 전체를 rmtree·교체** → Vercel 빌드 시 **i18n JS 유실** (`html/shared/`에는 `api-client.js`만 존재).  
동일 이슈: `roster-codes.js`는 FO HTML이 참조하나 `html/shared/`에도 FO `shared/`에도 **없음**.

### D.3 `html/shared/`

| 파일 | 상태 |
|------|------|
| `api-client.js` | ✅ FO 전 API 래퍼 (716줄, Phase 0~1+ 수준) |
| `bo-api-client.js` | ❌ 문서·README 언급, **미존재** |
| `bo-common.js` | ❌ 미존재 |
| `roster-codes.js` | ❌ FO 3페이지 참조, **미존재** |

---

## E. 문서 정합성 (파일별)

| 문서 | FO/BO(admin) 대비 | 판정 |
|------|-------------------|------|
| **`docs/DEV_SPEC.md`** | FO/BO(admin) 경로·14패널·build-bo gap·V005만 존재 — **대체로 정확** | ⚠️ §11.2 "FO **7개** HTML" → **실제 25개**. 그 외 구조·갭 서술은 맞음 |
| **`docs/IWINV_SETUP.md`** | `apps/web/dist` + FastAPI, BO handoff=`BO(admin)`, build-bo 불일치, `/admin/` nginx — **정확** | ✅ |
| **`MIGRATION.md`** | V001~V005 적용 안내, apps 스캐폴드 — **정확** (V001~V004 파일 없음은 DEV_SPEC과 동일) | ✅ |
| **`docs/DEPLOY.md`** | FO `build.py` — **정확** | ⚠️ §5·§6 BO = `html/C안/BO/` + `login.html`/`applications.html`/`bo-api-client.js` — **구식·오류** (실제 BO UI는 BO(admin), stub에 HTML 없음) |
| **`api/README.md`** | API 계약·FO 연동 — **정확한 설계 문서** | ⚠️ "Static BO UI = html/C안/BO/" — **저장소와 불일치**; 소스 트리 가정은 현 워크스페이스와 불일치 |
| **`html/C안/FO/docs/00_IA.md`** | 25페이지 IA — FO HTML과 **일치** | ✅ |
| **`html/C안/BO(admin)/project/docs/IA.md`** | 14패널 IA — 패널 JSX와 **일치** | ✅ |
| **`docs/기능정의서/*`** | handoff `uploads/`에 BO 기능정의서 사본 존재; 루트 `docs/기능정의서/`는 도메인·정책 위주 | 참고용 (FO/BO 화면 spec은 BO(admin)/uploads가 더 직접적) |

---

## F. 우선순위 권장 작업 목록

### P0 — 배포·런타임 차단

1. **`build.py` 수정:** `html/shared` 복사 시 `topik-i18n-content.js`(및 `roster-codes.js`) **merge** — 덮어쓰기로 i18n/roster 유실 방지
2. **`roster-codes.js` 복원/작성** — signup/register/mypage-profile 필수
3. **`build-bo.py` 입력 경로** → `html/C안/BO(admin)/project/` (또는 handoff를 deployable 경로로 이동)
4. **`db/migrations` V001~V004 복원** — V005는 `users(id)` FK; 단독 적용 불가
5. **레거시 `api/` 전체 소스 복원** 또는 **FastAPI로 계약 이전 착수** — FO `TopikApi`가 호출하는 API 없으면 운영 불가

### P1 — 운영 MVP

6. **FastAPI (또는 복원 Fastify) FO API:** auth → me → exam-rounds/venues → application-draft/submissions → notices/faq/terms → board → files(S3)
7. **IwinV FO:** 단기 — `build.py` FO 정적 + FastAPI; 중기 — `apps/web` 페이지 이전 (signup/register/mypage 우선)
8. **BO 운영 UI 결정:** (a) BO(admin) mock을 `/admin/` 정적 제공 + API 연동 layer 신규 작성, 또는 (b) README 설계대로 **비-React** BO HTML 재구현 (`bo-api-client.js`)
9. **FastAPI BO admin 라우터** — applicants/photos/payment/exam-numbers/export 우선

### P2 — 완성·정리

10. `apps/web` 전 FO 25페이지 + i18n + 라우팅 이전
11. BO(admin) React CDN → `apps/web` 관리자 영역 이전 (또는 정적 BO HTML 통합)
12. `packages/shared` — enum/상수(직업·응시동기·roster 코드) 공유
13. 문서 정리: `DEPLOY.md` BO 섹션, `DEV_SPEC.md` FO 페이지 수, `api/README.md` BO 경로
14. BO(admin) `admin.html` — React **production** 빌드·패널 분리 번들 (현재 development UMD + 4800줄 인라인)
15. Alembic revision 또는 SQL migration 체계 확정

---

## G. IwinV 배포 관점 체크리스트

### G.1 Web VPS (`115.68.222.58`)

- [ ] `git clone` → `/opt/myanmar-v2`
- [ ] **FO 경로 결정**
  - 목표: `apps/web/dist/` (현재 **미구현** → interim: `python3 build.py` → nginx 정적 또는 FO handoff 직접)
  - [ ] `build.py` i18n/roster merge 수정 후 FO 빌드 검증
- [ ] **BO 경로**
  - [ ] `ln -sf ".../BO(admin)/project" /opt/myanmar-v2/bo-handoff` ([`IWINV_SETUP.md`](IWINV_SETUP.md) §1.11)
  - [ ] nginx `location /admin/` → handoff 정적
  - [ ] `build-bo.py`는 현재 **사용 불가** (stub만 복사)
- [ ] FastAPI systemd `myanmar-api` :8000
- [ ] nginx `/` → FO dist, `/api/` → FastAPI
- [ ] `apps/api/.env`, `apps/web/.env.production` chmod 600
- [ ] certbot SSL

### G.2 DB VPS (`115.68.227.1`)

- [ ] PostgreSQL `topik_myanmar`, `topik_app` (Web IP만 5432 허용)
- [ ] **V001~V005 migration 전체 적용** (현재 V005만 있음)
- [ ] 운영 시드(국가/지역 코드) — dev 시드 금지
- [ ] `create-admin`으로 첫 BO 관리자
- [ ] 일일 `pg_dump` cron

### G.3 Object Storage (IwinV S3)

- [ ] `STORAGE_PROVIDER=s3`, bucket private
- [ ] FO 사진(가입/프로필/접수), BO 사진 ZIP·썸네일
- [ ] `GET /api/v1/files/:id` API 프록시 (presigned redirect 금지 — CORS)

### G.4 환경·연동

- [ ] `CORS_ORIGINS` — FO origin (+ BO 별도 subdomain 시 추가)
- [ ] `PUBLIC_FO_BASE`, `PUBLIC_BO_BASE` — 실제 도메인
- [ ] Google OAuth Authorized JavaScript origins — FO URL
- [ ] IwinV SMTP — `SMTP_USER`/`SMTP_PASS`·`MAIL_FROM` 발신 주소 일치
- [ ] `JWT_SECRET` / refresh secret (FastAPI 또는 Fastify)
- [ ] FO `<meta name="topik-api-base">` 또는 `TOPIK_API_BASE` — IwinV API URL

### G.5 스모크 (IwinV go-live)

- [ ] `GET /health`, `GET /health/db`
- [ ] FO 25페이지 정적 로드 (404/favicon/i18n/roster)
- [ ] 회원가입 → 로그인 → 접수 draft/submit → mypage
- [ ] 공지/FAQ/약관 API 노출
- [ ] BO `/admin/` 로드 (현재 mock 로그인)
- [ ] BO API: 접수 승인/수납/수험번호/연명부·ZIP (API 구현 후)
- [ ] S3 사진 업로드·`<img src>` 표시

---

## 요약 매트릭스

| 영역 | authoritative | 저장소 실태 | Gap 심각도 |
|------|---------------|-------------|-----------|
| FO UI | `html/C안/FO/` (25 HTML) | ✅ 존재, API 연동 코드 풍부 | roster-codes 누락, build i18n 유실 |
| BO UI | `BO(admin)/project/` (14 패널) | ✅ mock 프로토타입 완성 | API·production 빌드 없음 |
| BO deploy | BO(admin) | `build-bo.py` → stub `BO/` | **Critical** |
| API | `api/README.md` 계약 | FastAPI placeholder + Fastify 5파일 | **Critical** |
| DB | V001~V005 | V005만 | **Critical** |
| 신규 FE | apps/web | Home 1p | **Major** |
| 문서 | DEV_SPEC, IWINV | 대체로 정확 | DEPLOY BO 섹션, DEV_SPEC "7페이지" 구식 |

**핵심 결론:** FO·BO(admin) handoff는 **화면·IA·기능 범위 기준으로 상당히 완성**되어 있으나, **배포 스크립트·공유 JS·DB·백엔드·신규 apps 스택이 handoff를 따라가지 못하는 상태**입니다. IwinV 운영 전 P0(빌드·migration·API·누락 JS) 해결이 선행되어야 합니다.

---

## 관련 문서

- [`DEV_SPEC.md`](DEV_SPEC.md) — 개발 스펙
- [`IWINV_SETUP.md`](IWINV_SETUP.md) — IwinV VPS 운영
- [`DEPLOY.md`](DEPLOY.md) — Vercel/Railway·셀프호스트 체크리스트
- [`MIGRATION.md`](../MIGRATION.md) — 재개발 스캐폴드
