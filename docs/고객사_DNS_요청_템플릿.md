# 고객사 DNS 설정 요청 템플릿 (TOPIK Myanmar)

> **용도:** 개발팀이 **실제 운영**에 쓸 웹 호스팅·API 호스팅·메일 발송 서비스 대시보드에서 발급받은 DNS **값**을 정리해, 고객사(주미얀마 대사관) **IT 담당자**에게 이메일·공문으로 전달할 때 복사·붙여넣기 합니다.  
> **관련:** `기능정의서/정책_합의_워크시트.md` §2.0, `DEPLOY.md`, `HANDOFF.md`  
> **임시 dev/UAT URL:** 본문이 아닌 **부록** [`현재 프로젝트 임시 구성 (2026-06)`](#부록-현재-프로젝트-임시-구성-2026-06) 참고.

**프로젝트:** TOPIK Myanmar 온라인 접수 (FO·BO·API)  
**작성일:** ____________ · **요청 발신:** ____________ (개발팀)  
**수신:** ____________ (고객사 IT / DNS 관리자)

---

## 1. 요청 개요 (이메일 본문 — 복사용)

```
제목: [TOPIK Myanmar] 프로덕션 DNS 레코드 등록 요청 — ____________

안녕하세요, ____________ 님.

TOPIK Myanmar 온라인 접수 시스템 정식 오픈을 위해 아래 DNS 레코드 등록을 요청드립니다.

■ 서비스 구성 (운영 확정 후 대시보드에서 값 발급)
  - 수험생 사이트(FO): 웹 호스팅 (정적·CDN)
  - 관리자 사이트(BO): 웹 호스팅 (FO와 별도 호스트·프로젝트 권장)
  - API 서버: API 호스팅 (TLS 종료·커스텀 도메인)
  - 트랜잭션 메일: 메일 발송 서비스 (SPF / DKIM / DMARC)

■ 확정이 필요한 도메인 (고객사 확정 후 개발팀이 표의 Value를 채워 재발송합니다)
  - 루트 도메인: ____________
  - FO: https://www.____________  (또는 non-www — 정책 합의 워크시트 §2.0.2)
  - BO: https://admin.____________
  - API: https://api.____________
  - 발신 메일: no-reply@____________

■ 일정
  - DNS 등록 완료 희망일: ____년 __월 __일 (정식 오픈 __일 전 권장: 최소 3일)
  - 전파(Propagation): 등록 후 24~48시간 소요 가능
  - 등록 완료 후 회신 부탁드립니다. 개발팀에서 SSL·메일·접속 검증을 진행합니다.

■ 첨부
  - 본 문서 §3~§7 DNS 레코드 표 (Type / Host / Value / TTL / Purpose)

문의: ____________ (개발팀 이메일) / ____________ (전화)
감사합니다.
```

---

## 2. 역할 분담·주의사항

| 구분 | 고객사 / IT | 개발팀 |
| --- | --- | --- |
| 도메인·서브도메인 이름 확정 | ● | ○ 제안 |
| DNS 레코드 **등록** | ● | — |
| 운영 호스팅·API·메일 서비스에서 **값** 확인 | — | ● |
| 등록 후 HTTPS·메일·CORS 검증 | ○ 회신 | ● |
| Google OAuth 동의 화면 URL | ● (법무 URL) | ● Console 설정 |

**주의**

1. **TTL:** 기본 3600(1시간) 권장. 오픈 직전 테스트 시 300으로 낮춘 뒤, 안정화 후 3600으로 복구 가능.
2. **전파:** 전 세계 DNS 반영까지 **최대 48시간**. 오픈 **3일 전** 등록 완료 권장 (체크리스트 NO.361).
3. **플랫폼 기본 URL:** `*.vercel.app`, `*.railway.app` 등 **호스팅 업체가 부여한 임시 URL**에는 **고객사 DNS 등록이 필요 없습니다.** 공식 FQDN(예: `www.____________`, `api.____________`)을 해당 서비스에 **연결할 때만** 아래 §3~§6 표를 채워 IT에 요청합니다. dev/UAT용 임시 URL은 **부록** 참고.
4. **비밀 정보:** API 키·DB 비밀번호는 DNS에 넣지 않습니다.

---

## 3. FO (수험생 사이트) — 웹 호스팅

**목표 FQDN:** `www.____________` (또는 `____________` — www 정책에 따름)

> **운영 웹 호스팅** 대시보드 → FO 프로젝트 → **도메인(Domains)** 에서 FQDN 추가 후, 화면에 표시되는 레코드를 **그대로** 아래에 기입합니다.

| Type | Host (Name) | Value | TTL | Purpose |
| --- | --- | --- | --- | --- |
| A | `@` 또는 apex | *(운영 웹 호스팅 대시보드에서 발급)* | 3600 | apex → FO 웹 호스팅 |
| CNAME | `www` | *(운영 웹 호스팅 대시보드에서 발급)* | 3600 | www → FO |
| — | — | — | — | *(호스팅이 A+CNAME 대신 다른 조합을 제시하면 그대로 따름)* |

**www 리다이렉트 (선택, §2.0.2 정책 확정 후)**

| Type | Host | Value | TTL | Purpose |
| --- | --- | --- | --- | --- |
| CNAME | `@` | `www.____________` | 3600 | apex → www (옵션: 호스팅 UI에서 Redirect) |
| 또는 | — | 호스팅 **도메인** 설정에서 apex→www 리다이렉트 | — | 권장: 호스팅 UI 설정 |

**검증 (개발팀):** `https://www.____________` 로드, SSL 자물쇠, FO 홈·API meta 정상.

---

## 4. BO (관리자 사이트) — 웹 호스팅

**목표 FQDN:** `admin.____________` (권장: FO와 **별도 서브도메인**)

> BO 전용 **운영 웹 호스팅** 프로젝트(또는 동일 계정 내 별도 사이트)의 **도메인** 탭에서 `admin.____________` 추가 후 표시값을 기입합니다.

| Type | Host | Value | TTL | Purpose |
| --- | --- | --- | --- | --- |
| CNAME | `admin` | *(운영 웹 호스팅 대시보드에서 발급)* | 3600 | 관리자 BO |
| A | `admin` | *(호스팅이 A를 요구할 경우 — 대시보드 안내값)* | 3600 | BO 전용 |

**검증:** `https://admin.____________/login.html` · API `CORS_ORIGINS`에 BO origin 추가 후 API 호출 성공.

---

## 5. API — API 호스팅

**목표 FQDN:** `api.____________`

> **운영 API 호스팅** → 서비스 → **커스텀 도메인(Custom Domain)** 에서 `api.____________` 추가 후 표시되는 CNAME(또는 A)을 기입합니다.

| Type | Host | Value | TTL | Purpose |
| --- | --- | --- | --- | --- |
| CNAME | `api` | *(API 호스팅 대시보드에서 발급)* | 3600 | API → TLS 종료 |

**검증 (개발팀):** `GET https://api.____________/health` → `{"status":"ok"}` · FO에서 API 호출·CORS 오류 없음.

**개발팀 후속 설정 (IT 등록 후):** API 환경변수 `CORS_ORIGINS`, `PUBLIC_FO_BASE`, `PUBLIC_BO_BASE`, FO 빌드 API URL — `DEPLOY.md` §1·§2 참고.

---

## 6. 이메일 발신 — SPF · DKIM · DMARC

**발신 도메인:** `____________` (예: MOFA 공식 도메인)  
**발신 주소 예:** `TOPIK Myanmar <no-reply@____________>`

> **메일 발송 서비스** 대시보드 → **도메인(Domains)** → 발신 도메인 추가 → **DNS Records** 화면 값을 **1:1**로 등록합니다.

| Type | Host | Value | TTL | Purpose |
| --- | --- | --- | --- | --- |
| TXT | `@` 또는 루트 | `v=spf1 include:____________` *(메일 서비스 SPF 안내값)* | 3600 | SPF — 발신 서버 허용 |
| CNAME | `____________._domainkey` *(메일 서비스 표기명)* | *(메일 서비스 DKIM 호스트 — 대시보드에서 발급)* | 3600 | DKIM — 서명 검증 |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:____________` | 3600 | DMARC — 초기 none 권장, 추후 quarantine/reject |

**추가 레코드:** 메일 서비스 대시보드에 **MX** 또는 추가 TXT가 있으면 동일하게 등록.

**검증 (개발팀):** 발신 도메인 상태 **Verified**(또는 동등) → FO 회원가입 인증 메일·비밀번호 재설정 발송 성공 (`MAIL_PROVIDER`·`MAIL_FROM` 일치).

---

## 7. 선택 — Google OAuth (간편가입)

DNS 레코드는 **없음**. 고객사·개발팀 합의 사항만 기록합니다.

| 항목 | 값 |
| --- | --- |
| Google Cloud 프로젝트 소유 | ____________ (대사관 권장) — 개발팀 **Editor** 권한 또는 고객사 Console 설정 후 **Client ID 전달** |
| OAuth Client ID 전략 | **단일 Client ID** — Vercel URL로 먼저 등록, prod FQDN 확정 후 **동일 클라이언트**에 origin 추가 |
| 동의 화면 — 앱명·로고 | ____________ |
| Authorized JavaScript origins (현재) | FO: `https://topik-myanmar.vercel.app` · BO: `https://topik-myanmar-c-bo.vercel.app` *(필요 시)* |
| Authorized JavaScript origins (prod 확정 후) | `https://www.____________` *(동일 클라이언트에 추가)* |
| 개인정보처리방침 URL (동의 화면) | `https://www.____________/privacy.html` **(운영 필수)** |

---

## 8. 등록 완료 후 검증 체크리스트 (개발팀)

| # | 확인 항목 | 기대 결과 |
| --- | --- | --- |
| 1 | DNS 전파 | `dig www.____________` / 온라인 DNS checker에서 신규 Value 반영 |
| 2 | FO HTTPS | SSL Labs 또는 브라우저 자물쇠 정상 |
| 3 | BO HTTPS | `admin.____________` 로그인 페이지 |
| 4 | API health | `/health` OK, FO·BO API 호출 CORS 통과 |
| 5 | 메일 도메인 | 발신 도메인 **Verified**, 테스트 메일 수신 |
| 6 | www 통일 | apex ↔ www 한 방향 301 (정책에 따름) |
| 7 | 스모크 | `DEPLOY.md` §5 시나리오 1~8 |

**완료 회신 템플릿 (IT → 개발팀)**

```
등록 완료일: ____년 __월 __일 __시
등록한 레코드: (위 표 Host 목록)
특이사항: ____________
```

---

## 9. 연락처 (기입)

| 역할 | 성명 | 이메일 | 전화 |
| --- | --- | --- | --- |
| 고객사 IT / DNS | | | |
| 고객사 운영 담당 | | | |
| 개발팀 기술 담당 | | | |
| 개발팀 PM | | | |

---

## 부록: 현재 프로젝트 임시 구성 (2026-06)

> **dev/UAT 전용** — 아래 URL·도메인은 **고객사 DNS 등록 대상이 아닙니다.** 정식 오픈 시 §3~§6에 **운영 확정** 호스팅·메일 서비스 대시보드 값으로 IT 요청서를 다시 작성합니다.

| 서비스 | 임시 URL / 설정 | 비고 |
| --- | --- | --- |
| FO (웹) | https://topik-myanmar.vercel.app | Vercel — `*.vercel.app` DNS 불필요 |
| BO (웹) | https://topik-myanmar-c-bo.vercel.app | Vercel 프로젝트 `topik-myanmar-c-bo` |
| API | https://topikmyanmar-production.up.railway.app | Railway — `*.up.railway.app` DNS 불필요 |
| 메일 | no-reply@chodrum.com (Resend Pending) | Resend + chodrum.com — MOFA 도메인 확정 시 §6 절차 반복 |

**문서:** `docs/기능정의서/정책_합의_워크시트.md` §2.0 · `docs/DEPLOY.md` · `docs/HANDOFF.md`
