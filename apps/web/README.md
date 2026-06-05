# TOPIK Myanmar Web

Vite + React + TypeScript 기반의 신규 FO/BO 화면 개발 시작점입니다. 기존 `html/` 정적 화면은 유지하고, 새 화면은 `apps/web`에서 단계적으로 재구현합니다.

## Getting Started

```bash
cd apps/web
cp .env.example .env.local
npm install
npm run dev
```

브라우저에서 [http://localhost:5173](http://localhost:5173)을 엽니다.

개발 서버는 `/api` 요청을 `http://127.0.0.1:8000`으로 프록시합니다.

## 환경 변수

```env
VITE_API_URL=/api
```

- 로컬 개발: `/api` (Vite dev proxy 사용)
- 프로덕션(nginx): 빌드 시 `VITE_API_URL=/api` 또는 `https://YOUR_DOMAIN/api`

FastAPI 개발 서버 기본 주소는 `http://localhost:8000`입니다.

## 주요 명령

```bash
npm run dev      # 개발 서버 (port 5173)
npm run build    # 프로덕션 빌드 → dist/
npm run preview  # dist/ 미리보기
npm run lint     # ESLint
```

## 기술 스택

- Vite + React + TypeScript
- React Router
- Tailwind CSS v4
- ESLint

## 개발 메모

현재는 화면 placeholder만 포함합니다. 실제 기능 이전 시 기존 `html/C안/FO`, `html/C안/BO`, `html/shared`의 사용자 흐름과 API 호출을 기준으로 페이지 단위로 옮깁니다.

## Learn More

- [Vite Documentation](https://vite.dev/)
- [React Router Documentation](https://reactrouter.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
