const stackCards = [
  ["Frontend", "Vite + React + TypeScript"],
  ["Backend", "FastAPI + SQLAlchemy"],
  ["Database", "PostgreSQL on Iwinv VPS"],
] as const;

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-20">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">
          TOPIK Myanmar
        </p>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          미얀마 TOPIK 접수 서비스를 Vite + React로 새로 준비합니다.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
          기존 정적 HTML FO/BO와 Fastify API는 유지하고, 신규 화면과 API는
          `apps/web`과 `apps/api`에서 단계적으로 마이그레이션합니다.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {stackCards.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/10 p-5">
              <p className="text-sm text-sky-300">{label}</p>
              <p className="mt-2 font-medium text-slate-100">{value}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
