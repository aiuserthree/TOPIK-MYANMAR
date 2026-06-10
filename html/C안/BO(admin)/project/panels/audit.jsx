/* panels/audit.jsx — 관리자 처리 이력 (TPKM_BO_6_2_*) */

const AUDIT_TYPES = ['접수자','사진','회차','시험장','공지','FAQ','환불·정정','문의','회원','약관','관리자계정'];
const AUDIT_ACTIONS_F = ['생성','수정','삭제','승인','반려','수납','수납취소','게시','폐지','정지','탈퇴','비밀번호초기화','로그인','로그아웃','수험번호부여','취소'];

function AuditPanel() {
  const state = useStore();
  useEffect(() => {
    if (DataStore.isApiMode && DataStore.isApiMode() && DataStore.reloadAudit) DataStore.reloadAudit();
  }, []);
  const me = state.me;
  const myRole = me?.role || 'super';
  const canSeeAll = myRole === 'super';

  // 일반/조회는 본인 이력만
  const baseLog = useMemo(() => canSeeAll ? state.audit : state.audit.filter(l => l.actor === me?.id), [state.audit, canSeeAll, me]);

  const [actorF, setActorF] = useState('all');
  const [typeF, setTypeF] = useState('all');
  const [actionF, setActionF] = useState('all');
  const [range, setRange] = useState(0); // 0=all, 7, 30
  const [targetQ, setTargetQ] = useState('');
  const [page, setPage] = useState(1);
  const PER = 25;
  const [detailId, setDetailId] = useState(null);

  const filtered = useMemo(() => {
    let r = baseLog.slice();
    if (actorF !== 'all') r = r.filter(l => l.actor === actorF);
    if (typeF !== 'all')  r = r.filter(l => l.type === typeF);
    if (actionF !== 'all') r = r.filter(l => l.action === actionF);
    if (range > 0) {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - range);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      r = r.filter(l => l.ts.slice(0, 10) >= cutoffStr);
    }
    if (targetQ) r = r.filter(l => l.targetId && l.targetId.includes(targetQ));
    return r;
  }, [baseLog, actorF, typeF, actionF, range, targetQ]);

  useEffect(() => setPage(1), [actorF, typeF, actionF, range, targetQ]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER));
  const rows = filtered.slice((page-1)*PER, page*PER);

  const exportCSV = () => {
    const headers = ['시각', '처리자', 'IP', '유형', '대상ID', '액션', '메모'];
    const rows = filtered.map(l => [l.ts, l.actor, l.ip, l.type, l.targetId, l.action, l.memo || '']);
    const fn = '처리이력_' + new Date().toISOString().slice(0, 10) + '.csv';
    const after = () => {
      DataStore.addAudit({ type: '관리자계정', targetId: '—', action: '게시', memo: `처리 이력 CSV 내보내기(${filtered.length}건)` });
      toastOk(`${filtered.length}건의 처리 이력 CSV를 생성했습니다.`);
    };
    if (window.TOPIKExport && TOPIKExport.downloadCsv) { TOPIKExport.downloadCsv(fn, headers, rows).then(after); }
    else after();
  };

  return (
    <>
      <div className="panel-head">
        <div>
          <h1>관리자 처리 이력</h1>
          <div className="sub">{canSeeAll ? '모든 관리자의 처리 이력을 조회합니다.' : <span>본인 처리 이력만 조회됩니다 (권한: <b>{DataStore.roleLabel(myRole)}</b>)</span>}</div>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" disabled={!canSeeAll} onClick={exportCSV}>
            <I.Download style={{ width: 14, height: 14 }}/> CSV 내보내기
          </button>
        </div>
      </div>

      <div className="filterbar">
        <div className="chips">
          <button className={`chip ${range === 0 ? 'active' : ''}`} onClick={() => setRange(0)}>전체 기간<span className="cnt">{baseLog.length}</span></button>
          <button className={`chip ${range === 7 ? 'active' : ''}`} onClick={() => setRange(7)}>최근 7일</button>
          <button className={`chip ${range === 30 ? 'active' : ''}`} onClick={() => setRange(30)}>최근 30일</button>
        </div>
        <div className="controls">
          <select className="select" value={actorF} onChange={e => setActorF(e.target.value)} disabled={!canSeeAll}>
            <option value="all">전체 처리자</option>
            {state.admins.map(a => <option key={a.id} value={a.id}>{a.id} · {a.name}</option>)}
          </select>
          <select className="select" value={typeF} onChange={e => setTypeF(e.target.value)}>
            <option value="all">전체 유형</option>
            {AUDIT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="select" value={actionF} onChange={e => setActionF(e.target.value)}>
            <option value="all">전체 액션</option>
            {AUDIT_ACTIONS_F.map(a => <option key={a}>{a}</option>)}
          </select>
          <input className="input search" placeholder="대상 ID 검색" value={targetQ} onChange={e => setTargetQ(e.target.value)}/>
        </div>
      </div>

      <div className="dg-wrap">
        <div className="dg-scroll">
          <table className="dg">
            <thead><tr>
              <th>시각</th><th>처리자</th><th>IP</th><th>유형</th><th>대상 ID</th>
              <th>액션</th><th>메모</th><th>상세</th>
            </tr></thead>
            <tbody>
              {rows.map(l => (
                <tr key={l.id}>
                  <td className="code">{l.ts}</td>
                  <td><code className="code-id">{l.actor}</code></td>
                  <td className="code muted">{l.ip}</td>
                  <td>{l.type}</td>
                  <td className="code">{l.targetId}</td>
                  <td><span className={`pill ${l.action === '승인' || l.action === '생성' || l.action === '수납' ? 'pill-approved' : l.action === '반려' || l.action === '삭제' || l.action === '폐지' || l.action === '취소' ? 'pill-rejected' : 'pill-applied'}`}>{l.action}</span></td>
                  <td className="muted" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.memo || '—'}</td>
                  <td>
                    <button className="ibtn ghost" onClick={() => setDetailId(l.id)}><I.Eye style={{ width: 12, height: 12 }}/></button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan="8"><div className="empty"><div className="ttl">조건에 맞는 이력이 없습니다</div></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="dg-foot">
          <div className="info">총 <b style={{ color: 'var(--text)', fontFamily: 'Inter' }}>{DataStore.fmtNum(filtered.length)}</b>건</div>
          <Pager page={page} total={totalPages} onPage={setPage}/>
        </div>
      </div>

      {detailId && <AuditDetailLP id={detailId} onClose={() => setDetailId(null)}/>}
    </>
  );
}

function AuditDetailLP({ id, onClose }) {
  const state = useStore();
  const l = state.audit.find(x => x.id === id);
  if (!l) return null;
  const linkHash = ({
    접수자: 'applicants', 사진: 'applicants', 회차: 'sessions', 시험장: 'venues',
    공지: 'notices', FAQ: 'faq', '환불·정정': 'refunds', 문의: 'inquiries',
    회원: 'members', 약관: 'terms', 관리자계정: 'admins',
  })[l.type];
  return (
    <LP open size="wide" title={`처리 이력 상세 — ${l.action}`} sub={`${l.type} · ${l.targetId}`} onClose={onClose}
      footer={<>
        {linkHash && <a className="btn btn-secondary" href={`#${linkHash}`} onClick={onClose}>관련 화면 바로가기 →</a>}
        <button className="btn btn-primary" onClick={onClose}>닫기</button>
      </>}>
      <FieldSet legend="기본" cols={2}>
        <KV k="처리 시각" v={<code className="code-id">{l.ts}</code>}/>
        <KV k="액션" v={<span className="pill" style={{ background: 'var(--bg-3)' }}>{l.action}</span>}/>
        <KV k="처리자" v={<><code className="code-id">{l.actor}</code></>}/>
        <KV k="IP" v={<code className="code-id">{l.ip}</code>}/>
        <KV k="유형" v={l.type}/>
        <KV k="대상 ID" v={<code className="code-id">{l.targetId}</code>}/>
        <KV k="로그 ID" v={<code className="code-id">{l.id}</code>}/>
      </FieldSet>

      <FieldSet legend="처리 사유" cols={1}>
        <div style={{ background: 'var(--bg-2)', padding: 10, borderRadius: 6, fontSize: 13, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>
          {l.memo || '—'}
        </div>
      </FieldSet>

      {(l.before || l.after) && (
        <FieldSet legend="변경 내용 (Diff)" cols={1}>
          <div className="diff">
            <div>
              <div className="h">Before</div>
              <pre className="before">{l.before ? JSON.stringify(l.before, null, 2) : '— 이전 값 없음'}</pre>
            </div>
            <div>
              <div className="h">After</div>
              <pre className="after">{l.after ? JSON.stringify(l.after, null, 2) : '— 이후 값 없음'}</pre>
            </div>
          </div>
        </FieldSet>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
        ※ 처리 이력은 append-only — 수정/삭제 불가. 최소 3년 보존 권장.
      </div>
    </LP>
  );
}

window.AuditPanel = AuditPanel;
