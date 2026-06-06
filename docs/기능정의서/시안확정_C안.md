# 시안 확정 — C안 (FO · BO · 이메일)

**확정일:** 2026-06-02 (백로그 #4 기준)

## 요약

| 영역 | 확정 시안 | 소스 경로 |
|------|-----------|-----------|
| FO 화면 | **C안** | `html/C안/FO/` |
| BO 화면 | **C안** | `html/C안/BO(admin)/` |
| 트랜잭션 이메일 | **C안 에디토리얼** | `시안/email/` (`THEMES.C`, 14종) |

A안·B안 HTML은 참고·비교용으로 유지합니다. **신규 기능·FO 배포 산출물은 C안 FO**가 기준입니다.

## FO 배포

| 단계 | 경로 |
|------|------|
| 소스 | `html/C안/FO/` |
| 빌드 | `python3 build.py` |
| 산출 | `public/` (루트 `index.html` 등) |
| 공통 JS | `html/shared/` + FO `shared/` merge → `public/shared/` |
| **운영 (목표)** | IwinV Web VPS nginx — `https://www.topik-myanmar.com` |
| **부록 (과거)** | Vercel `vercel.json` — 임시 dev/UAT만 |

상세: [`IWINV_SETUP.md`](../IWINV_SETUP.md), `배포_아키텍처.md`.

## 이메일

- 미리보기: `시안/email/README.md`
- 11종 기존 + 갭 3종 = **14종** `template_key` 등록
- API: `apps/api/app/lib/mail.py` + `email_render.py` — **SMTP(IwinV 테라웹메일) 운영**, `email_outbox` 워커 구현 (템플릿 렌더는 2종 우선 구현)

## 관련 체크리스트

- 189: 템플릿 14종 (C안 에디토리얼)
- 185–186: 갭 3종 트리거 — 템플릿 `[p]`, SMTP 연동 `[ ]`
- **정책 합의 (463–484):** `정책_합의_워크시트.md` — 고객사·운영팀 확정값 작성 후 프로덕션 착수
