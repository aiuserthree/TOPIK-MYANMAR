# TOPIK Myanmar — 이메일 템플릿 (시안)

**확정 디자인:** C안 에디토리얼 (`THEMES.C`). FO/BO 운영 시안도 C안 기준 — `docs/기능정의서/시안확정_C안.md`.

HTML/CSS/JS만 사용. 렌더 결과는 SMTP 워커가 `email_outbox.body_html`에 저장하는 형태를 가정합니다.

## 미리보기

```bash
cd "/Users/jhcho/Documents/Myanmar/시안/email"
python3 -m http.server 8765
```

브라우저: [http://localhost:8765/](http://localhost:8765/) → `TOPIK Myanmar 이메일 템플릿.html`

- 기본 컨셉: **C안 (에디토리얼)**
- 갭 3종: **KO / MY / EN** 토글로 본문 확인
- `account-status` 샘플: `SAMPLE.accountAction` = `suspended` | `withdrawn` (`data.js`에서 변경 후 새로고침)

## 파일

| 경로 | 역할 |
|------|------|
| `templates/data.js` | 테마(A/B/C), 14종 트랜잭션 정의, `templateKey`, 샘플 변수 |
| `templates/render.js` | 테이블 레이아웃 + 인라인 CSS HTML 생성 (`locale`, `showWhen`) |
| `TOPIK Myanmar 이메일 템플릿.html` | 미리보기 UI |
| `index.html` | 위 HTML로 리다이렉트 |

## `email_outbox.template_key` (14종)

프로덕션 키는 **snake_case**. 미리보기 `key`는 kebab-case.

| template_key | 한글명 | preview `key` | locale |
|--------------|--------|---------------|--------|
| `signup_verify_code` | 회원가입 이메일 인증 | `signup-verify` | ko |
| `password_reset` | 비밀번호 재설정 | `password-reset` | ko |
| `application_approved` | 접수 승인 완료 | `approve-notice` | ko |
| `application_rejected` | 접수 반려 | `reject-notice` | ko |
| `photo_rejected` | 증명사진 심사 반려 | `photo-reject-notice` | ko |
| `temp_password` | 회원 임시 비밀번호 | `member-temp-password` | ko |
| `temp_password_admin` | 관리자 임시 비밀번호 | `admin-temp-password` | ko |
| `board_refund_received` | 게시글 접수 확인(환불·정정) | `board-submission-received` | ko |
| `board_admin_new_post` | 운영자 신규 접수 알림 | `board-admin-new-post` | ko |
| `board_reply` | 게시판 활동(답변·댓글·상태) | `board-activity` | ko |
| `notice_marketing` | 마케팅 공지 알림 | `marketing-notice` | ko |
| `account_status` | 계정 정지·탈퇴 | `account-status` | **ko, my, en** |
| `member_info_changed` | 회원정보 수정 통지 | `member-info-changed` | **ko, my, en** |
| `password_expiry_reminder` | 비밀번호 6개월 변경 권고 | `password-expiry-reminder` | **ko, my, en** |

### 미발송 (템플릿 없음 · 체크 187–188)

- FO 접수 완료 모달만 (접수 완료 메일 없음)
- 수험번호 일괄 부여 후 메일 없음

### API 보조 키 (향후 분리 가능)

- `inquiry_answered` — 문의 답변 완료: 현재 `board_reply`와 동일 렌더로 처리 가능
- 문의 작성자 접수 확인 메일: **미발송** (운영자 통지만)

## 프로토타입 연동

`html/shared/topik-mail.js` — `TOPIKMail.enqueue({ templateKey, locale, to, payload })` 가 outbox mock에 적재. HTML 본문은 서버에서 `시안/email/templates` 렌더러를 호출하거나, 빌드 시 동일 로직을 이식합니다.

`exports/email/` 디렉터리는 사용하지 않습니다. canonical 소스는 **`시안/email/`** 입니다.

## 참고 명세

- `docs/기능정의서/REST_API_명세_초안.md` §4.8 `email_outbox`
- `docs/기능정의서/DB스키마_초안.md` §4.17
- FO/06, BO/05 회원·비밀번호 정책
