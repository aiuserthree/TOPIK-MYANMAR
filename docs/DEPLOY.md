# TOPIK Myanmar — 배포 준비 체크리스트

> **운영 DNS·고객사 IT 요청:** Vercel/Railway/Resend는 **현재 dev/UAT 임시** 구성입니다. 고객사 발송용 레코드 표는 스택 중립 [`고객사_DNS_요청_템플릿.md`](고객사_DNS_요청_템플릿.md) (임시 URL은 템플릿 **부록**).

DNS·이메일 도메인 검증 대기 중에도 아래 순서로 FO/API를 맞춰 두면, 검증 완료 후 바로 스모크 테스트할 수 있습니다.

---

## 1. FO (Vercel 정적)

| 단계 | 명령 / 설정 |
|------|-------------|
| 빌드 | `python3 build.py` — `html/C안/FO` + `html/shared` → `public/` |
| 배포 | Vercel (`vercel.json`의 `buildCommand` 동일) 또는 `vercel --prod` |
| API 연결 | `TOPIK_API_BASE=<API URL> python3 build.py` (미설정 시 Railway 레거시 URL) |
| FO 공개 URL | `PUBLIC_FO_BASE` (Railway)와 동일 origin 사용 권장 |

**임시 FO:** https://topik-myanmar.vercel.app  
**임시 API:** https://topikmyanmar-production.up.railway.app

커스텀 도메인 연결 시: Vercel 도메인 추가 → Railway `CORS_ORIGINS`·`PUBLIC_FO_BASE`·Google Console JS origins·`build.py` `API_META`를 함께 갱신.

---

## 2. API (Railway)

`api/.env.production.example` 기준. **실제 키는 Railway Variables에만** 넣고 repo에 커밋하지 않습니다.

| Variable | 용도 |
|----------|------|
| `APP_ENV` | `production` |
| `DATABASE_URL` | Railway PostgreSQL reference |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | `openssl rand -base64 48` (각각 별도) |
| `JWT_ACCESS_EXPIRES` / `JWT_REFRESH_EXPIRES` | 기본 `15m` / `7d` |
| `CORS_ORIGINS` | FO origin(들), 쉼표 구분 (와일드카드 금지) |
| `PUBLIC_FO_BASE` | FO 공개 URL (이메일 딥링크용, trailing `/` 없음) |
| `GOOGLE_CLIENT_ID` | GIS (비우면 Google 버튼 숨김) |
| `GOOGLE_CLIENT_SECRET` | 선택 (ID 토큰 검증만이면 필수 아님) |
| `STORAGE_PROVIDER` | `local`(기본, 디스크) 또는 `s3`. 사진 영구 저장(가입·프로필·접수 증명사진) |
| `UPLOAD_DIR` | (local) 사진 저장 경로. Railway는 휘발성 디스크 → **운영은 `s3` 권장** |
| `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY` / `S3_SECRET` | `STORAGE_PROVIDER=s3`일 때 필수. (미설정 시 경고+local 폴백) |
| `S3_ENDPOINT` / `S3_PREFIX` | (선택) MinIO/S3 호환 엔드포인트, 버킷 내 키 prefix |
| `MAIL_PROVIDER` | `resend` (운영 권장) |
| `RESEND_API_KEY` | Resend 대시보드 API 키 |
| `MAIL_FROM` | `TOPIK Myanmar <no-reply@chodrum.com>` (검증된 발신 도메인) |
| `MAIL_ADMIN_TO` | (선택) 문의·환불 신규 글 알림 수신 운영자 메일 |
| `INTERNAL_API_KEY` | (선택) `POST /internal/notifications/enqueue` 수동 재발송 |
| `ENABLE_PASSWORD_EXPIRY_CRON` | (선택) `true` — 로그인 안 하는 사용자용 일일 배치 |
| `PUBLIC_BO_BASE` | (선택) BO URL (메일 링크용) |

발송 메일 본문은 `api/src/lib/email-templates/` 시안 14종 HTML 렌더.

### 2.1 DB 초기화 — 운영 시드 + 첫 관리자 (운영 필수, dev 계정 사용 금지)

운영 DB는 **dev 시드(`npm run migrate`)를 쓰지 않습니다.** dev 시드에는 약한 비밀번호 관리자
(`admin-dev@topik-mm.local / DevOnly!2026`)와 데모 회원이 들어 있어 운영에 부적합합니다.
운영은 아래 순서로 초기화합니다.

```bash
cd api && npm install

# 1) 스키마 + 운영 시드(참조 데이터만: 국가/지역 코드, 데모/관리자 없음)
DATABASE_URL=<railway-postgres-url> npm run migrate:prod

# 2) 첫 관리자 생성 (bcrypt, 비밀번호는 입력 프롬프트 — 셸 히스토리에 안 남음)
DATABASE_URL=<railway-postgres-url> npm run create-admin -- --email <운영자메일> --name "<이름>"
#   → 8자+ / 영문·숫자·특수문자 포함. role 기본 super.
#   비대화형(CI): ADMIN_EMAIL=… ADMIN_NAME="…" ADMIN_PASSWORD='…' ADMIN_ROLE=super npm run create-admin
```

이후 운영자는 **BO 로그인 → 시험장 관리 → 회차 관리 → 공지/FAQ/약관 관리** 순으로 실데이터를 입력합니다
(DB 직접 접근 불필요). 추가 관리자도 `create-admin`을 다시 실행해 생성/갱신합니다.

- **운영 시드에 없는 것(=고객사 입력 대기):** 실제 시험장(이름·주소·정원·venue_code), 실제 회차(접수기간·시험일·응시료·정원), 약관/개인정보 **최종 법무 문안**, 실제 관리자 이메일.
- 직업/응시동기/응시목적 코드(연명부)는 DB 테이블이 아니라 앱 상수입니다(`api/src/lib/admin-helpers.ts`, `html/shared/roster-codes.js`) — 별도 시드 불필요.
- `prod_seed.sql`은 재실행 안전(`ON CONFLICT DO NOTHING`). 지역 추가가 필요하면 동일 형식으로 INSERT.

**이메일 트리거 (운영):** FO 로그인·가입·비번 재설정·게시판·탈퇴; BO 접수 승인/반려·사진심사·게시판 답변·회원 수정·임시비번·공지 마케팅(`POST .../notices/:id/send-marketing`); 비밀번호 6개월 권고는 **로그인 시** 자동 enqueue (30일 쿨다운). Internal enqueue는 수동 재발송·외부 워커용.

로컬 참고: `api/.env.example`, 상세 Railway 절차는 `docs/기능정의서/API_배포_가이드_Railway.md`.

---

## 3. Resend — chodrum.com 도메인 검증

1. [Resend](https://resend.com) → **Domains** → `chodrum.com` 추가
2. Cafe24 DNS에 표시된 레코드 추가 (SPF/DKIM 등 — Resend 안내 그대로)
3. Resend에서 **Verified** 확인 (전파는 수 분~48시간)
4. Railway에 `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `MAIL_FROM=TOPIK Myanmar <no-reply@chodrum.com>` 설정 후 재배포
5. Resend **Logs**에서 첫 발송 성공 여부 확인

**고객사 MOFA 도메인 전환 시:** Resend에 새 도메인 검증 → Railway `MAIL_FROM`만 변경 (코드/FO 빌드 불필요). FO URL·CORS는 별도.

---

## 4. Google Cloud Console (Sign-In)

1. **APIs & Services → Credentials → OAuth client ID** (Web application)
2. **Authorized JavaScript origins**에 모든 FO origin 추가  
   예: `https://topik-myanmar.vercel.app`, 로컬 `http://localhost:8080`
3. Railway `GOOGLE_CLIENT_ID` 설정
4. FO 회원가입/로그인에서 Google 버튼 노출·로그인 스모크

GIS ID 토큰 방식 — redirect URI는 이 플로우에 필수 아님.

---

## 5. DNS 검증 후 스모크 테스트

| # | 시나리오 | 기대 |
|---|----------|------|
| 1 | `GET {API}/health` | `{ "status": "ok" }` |
| 2 | FO 홈 로드 | favicon 404 없음, API meta 로드 |
| 3 | 회원가입 — 인증코드 발송 | 메일 수신, `mail_delivered: true` (개발자 도구) |
| 4 | 회원가입 완료 → 로그인 | JWT·마이페이지 |
| 5 | 비밀번호 재설정 | 메일 + 코드로 변경 |
| 6 | 공지 목록/상세 | 읽기 |
| 7 | (로그인 후) 접수 플로우 | STEP 진행 (시드 데이터 있을 때) |
| 8 | BO — 접수 승인/반려·사진 반려·게시판 답글 | 시안 C안 HTML 메일 발송 (`api/README.md` admin curl) |

BO API: `POST /api/v1/admin/...` (운영은 §2.1 `create-admin`으로 만든 계정으로 로그인. dev/로컬에 한해 `admin-dev@topik-mm.local` / `DevOnly!2026`).

추가 스모크(콘텐츠 관리): 회차 생성(`POST /admin/exam-rounds`) → 접수개시(`/status`) → 시험장 생성(`/admin/exam-venues`) → 공지 작성+발행(`/admin/notices` + `/publish`) → FAQ 생성 → FO에서 `GET /api/v1/notices`·`/api/v1/faq`·`/api/v1/terms/:type`에 노출 확인. (예시 curl은 `api/README.md` "BO content management" 참조.)

**BO 운영 백오피스 (접수→수납→수험번호→연명부) — go-live 노트:**
- 정적 BO 화면(React 미사용): `html/C안/BO/` — `login.html` + `applications.html`(접수자 목록·사진심사·수납·수험번호 일괄부여·연명부 엑셀·사진 ZIP) + **콘텐츠/운영 관리** `rounds.html`(회차)·`venues.html`(시험장)·`notices.html`(공지)·`faq.html`(FAQ)·`terms.html`(약관). 상단 nav로 이동. `html/shared/bo-api-client.js` + `assets/bo-common.js`로 실제 API 연동.
- BO는 FO와 **별도 호스팅** (`build.py`는 FO만 `public/`로 복사). BO 배포 시 `html/C안/BO/`와 `html/shared/`를 함께 올리고, 그 origin을 Railway `CORS_ORIGINS`에 추가.
- **사진 영구 저장 필수:** Railway 컨테이너 디스크는 재배포 시 초기화되므로 운영은 `STORAGE_PROVIDER=s3` + S3 버킷 권장(연명부 사진 ZIP이 실데이터에 의존). `local`은 로컬/스테이징 검증용.
- 13자리 수험번호 규칙·부여 시점(수납 마감 후 일괄)·노출 시점(`exam_number_visible_at`)은 `api/README.md` 및 `docs/기능정의서/BO/02_접수관리_기능정의서.md` 참조.
- **회차·시험장·공지·FAQ·약관은 이제 BO 화면에서 직접 CRUD 가능** (DB 접근 불필요). 운영자는 회차 관리에서 신규 회차를 개설(접수기간/응시료/정원/시험장 매핑)하고 접수개시·마감을, 시험장 관리에서 시험장(venue_code 2자리)을 등록합니다. 신규 테이블 없음 — `V001` 스키마 그대로 사용.

실패 시: Railway 로그, Resend Logs, `email_outbox` 상태(`failed`), `CORS_ORIGINS` 오타 확인.

---

## 6. 셀프호스팅 (Railway 없이)

고객사 VPS·자체 서버에 **Fastify API + PostgreSQL**만 올리고, FO/BO는 기존처럼 **Vercel 정적**을 쓰는 구성입니다. `railway.toml`은 레거시 PaaS용으로 남겨 두어도 되며, 필수는 아닙니다.

| 단계 | 작업 |
|------|------|
| 1 | `cp api/.env.production.example api/.env.production` — JWT·CORS·메일·S3 등 (`api/.env.production.example` 변수 표 참고) |
| 2 | repo 루트 `.env`에 `POSTGRES_PASSWORD=<강한 비밀번호>` (compose 전용, 커밋 금지) |
| 3 | `docker compose -f docker-compose.prod.yml up -d --build` — Postgres는 내부망만, API는 `127.0.0.1:3000` |
| 4 | 컨테이너 부팅 시 `migrate.js --prod` 자동 실행(참조 시드만). 첫 관리자: `docker compose -f docker-compose.prod.yml exec api npm run create-admin -- --email <메일> --name "<이름>"` |
| 5 | `CORS_ORIGINS`에 FO·BO Vercel origin 추가. `PUBLIC_FO_BASE` / `PUBLIC_BO_BASE`를 실제 FO·BO URL로 |
| 6 | FO·BO 빌드: `TOPIK_API_BASE=https://api.<고객도메인> python3 build.py` 및 `python3 build-bo.py` → Vercel 재배포 (변경 없음: `vercel.json`·Root Directory) |
| 7 | (권장) `docker-compose.prod.yml`의 Caddy/nginx 주석 해제해 443 TLS 종료 |

운영 시드·관리자 생성 상세는 §2.1과 동일(`migrate:prod`, dev 시드 금지). 사진 영구 저장은 `STORAGE_PROVIDER=s3` 권장(컨테이너 디스크 휘발성).

---

## 7. 로컬 (선택, Resend 없이)

```bash
docker compose up -d
cd api && cp .env.example .env && npm install && npm run migrate && npm run dev
python3 build.py && cd public && python3 -m http.server 8080
```

`MAIL_PROVIDER=console`이면 API가 `dev_code`를 **development**에서만 반환. 운영(`APP_ENV=production`)에서는 노출하지 않음.

```bash
curl -s http://localhost:3000/health
curl -s -X POST http://localhost:3000/api/v1/auth/request-password-reset \
  -H 'Content-Type: application/json' -d '{"email":"test@example.com"}'
```

---

## 8. 관련 문서

- `README.md` — 저장소 개요
- `docs/기능정의서/배포_아키텍처.md`
- `docs/기능정의서/API_배포_가이드_Railway.md`
- `docs/기능정의서/정책_합의_워크시트.md` §2.0 — 고객사 도메인·이메일 결정 사항
- `docs/고객사_DNS_요청_템플릿.md` — 고객사 IT에 보낼 DNS 레코드 요청서(복사용)
- `api/README.md` — 엔드포인트 요약
