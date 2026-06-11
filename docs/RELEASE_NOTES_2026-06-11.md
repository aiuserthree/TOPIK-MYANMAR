# 릴리스 노트 — 2026-06-11

> Git 커밋: `7d6a400` (P0) · `9903690` (P1·비밀번호) · `eb43c28` (P2) · `8a81cb1` (P1 i18n) · `188dd07` (P2 i18n) · 편의지원 UI 제거(후속)

운영 URL: `https://www.topik-myanmar.com` · `https://admin.topik-myanmar.com`

---

## 1. FO·API 정책·검증 강화

### 회원가입·인증

| 항목 | FO | API |
|------|----|-----|
| 비밀번호 | 8자 이상 + **영문·숫자·특수문자 각 1자** (STEP2·완료 시 검증) | `is_valid_password()` |
| 생년월일·연락처 | 숫자만 입력 (`form-validation.js`) | `normalize_birth_date`, 만 14세 |
| 이메일 OTP | 발송 전 이메일 형식 검증 | `is_valid_email` |
| OTP 6회 실패 | 재발송 안내, 입력 초기화 | `OTP_EXCEEDED`, 코드 폐기 (`V013`) |
| 필수 약관 | STEP3 클라이언트 + 서버 | `service`·`privacy` 필수 (`consents.py`) |

### 로그인·비밀번호

| 항목 | 내용 |
|------|------|
| 아이디 찾기 | 생년월일 8자리·연락처 숫자만 + 형식 검증 |
| 비밀번호 찾기/재설정 | 안내 문구 **「필수」**, OTP 6회 실패 시 재발송 |
| 내정보 비밀번호 변경 | **현재 비밀번호와 동일한 새 비밀번호 불가** (FO·API) |
| 6개월 변경 권고 | 로그인 성공 시 `#modalPwExpiry` 팝업 (`password_change_due`) |

### 시험 접수·프로필

| 항목 | 내용 |
|------|------|
| 접수 약관 | `terms_agreed` API 수신·저장·필수 검증 |
| 증명사진 | **미등록 시 접수 제출 차단** (FO) |
| 증명사진 용량 | FO·API **2MB 상한** 통일 |
| 마이페이지 | 생년월일·만 나이·직업/동기/목적 클라이언트 검증 |

### 공통

- `html/shared/form-validation.js` — FO 공통 검증 모듈
- `html/shared/api-client.js` — FO 버전과 동기화 (Google 탈퇴, profile_incomplete 등)
- 공지 `category_label` — `lang=my|en` 반영

---

## 2. 의도적으로 미제공·보류

| 항목 | 상태 |
|------|------|
| **편의지원(장애인) FO UI** | **2026-06-11 보류** — API·BO 채번 로직만 유지, 응시자 화면 없음 |
| Google 로그인/가입 | 코드 완료, **`GOOGLE_CLIENT_ID` 운영 env 필요** |
| 이메일 OTP·알림 | 코드 완료, **SMTP·`ENABLE_EMAIL_WORKER` 운영 env 필요** |
| 일반글 댓글 공개/비공개 | 미구현 |
| FO API 오류·동적 UI i18n | **2026-06-11 완료** (`188dd07`) — BO admin API 한글 오류는 FO 범위 밖 |
| i18n 육안 최종 검수 | 고객사·QA 전 페이지 MY/EN 검수 권장 |

---

## 3. FO P2 i18n (API 오류·동적 UI)

### API (`apps/api/app/lib/fo_messages.py`)

| 항목 | 내용 |
|------|------|
| 로케일 헤더 | FO `api-client.js` → `X-TPKM-Locale: ko\|my\|en` (`resolve_request_locale`) |
| 오류 헬퍼 | `fo_api_error(code, msg_key, lang, **params)` — auth·applications·me·board·content·files |
| 메시지 카탈로그 | KO/MY/EN `_CATALOG` — OTP 잔여 횟수, 약관 누락, 접수 상태 등 동적 치환 |

### FO 클라이언트

| 항목 | 내용 |
|------|------|
| 정적 UI | `shared/topik-i18n-content.js` + `[data-i18n-content]` |
| 동적 UI | `window.TPKMBt.bt()` / `btf()` — login·signup·register·mypage·ticket·refund·photo-upload 등 |
| 오류 표시 | `parseError()` → `err.{code}` 우선, 서버 `message` 폴백 |

---

## 4. DB 마이그레이션

- **V013** — `email_verification_codes.failed_attempts`, `password_reset_tokens.failed_attempts`

배포 시 `scripts/run-migrations.sh` 또는 `deploy-all-from-git.sh` 포함 실행 필요.

---

## 5. 운영 배포

```bash
cd /opt/myanmar-v2
git fetch origin
bash scripts/deploy-all-from-git.sh
```

확인:

```bash
curl -s http://127.0.0.1:8000/health
grep -n "OTP_MAX_FAIL\|form-validation" apps/api/app/routers/auth.py html/C안/FO/signup.html 2>/dev/null | head -3
```

---

## 6. 관련 문서

- [FO 사용 가이드](./사용가이드/FO_사용가이드.md)
- [통합 테스트 시나리오](./통합테스트/통합테스트_시나리오.md)
- [FO·BO 기능 격차 점검](./기능정의서/고객사%20전달/01_FO_BO_기능격차_점검.md)
