/* panels/admin-access-log.jsx — 관리자 접근 로그 (TPKM_BO_6_6_*) */

const ADMIN_ACCESS_ACTIONS_F = ['로그인', '로그아웃', '세션만료', '로그인실패'];

function AdminAccessLogPanel() {
  const state = useStore();
  useEffect(() => {
    if (DataStore.isApiMode && DataStore.isApiMode() && DataStore.reloadAdminAccessLogs) {
      DataStore.reloadAdminAccessLogs();
    }
  }, []);
  const myRole = state.me?.role || 'super';
  const canSeeAll = myRole === 'super';

  const [adminF, setAdminF] = useState('all');
  const [actionF, setActionF] = useState('all');
  const [resultF, setResultF] = useState('all');
  const [range, setRange] = useState(0);
  const [ipQ, setIpQ] = useState('');
  const [page, setPage] = useState(1);
  const PER = 25;
  const [detailId, setDetailId] = useState(null);

  const baseLog = state.adminAccessLogs || [];

  const filtered = useMemo(() => {
    let r = baseLog.slice();
    if (adminF !== 'all') r = r.filter(l => l.adminId === adminF);
    if (actionF !== 'all') r = r.filter(l => l.action === actionF);
    if (resultF !== 'all') r = r.filter(l => l.result === resultF);
    if (range > 0) {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - range);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      r = r.filter(l => l.ts.slice(0, 10) >= cutoffStr);
    }
    if (ipQ) r = r.filter(l => l.ip && l.ip.includes(ipQ));
    return r;
  }, [baseLog, adminF, actionF, resultF, range, ipQ]);

  useEffect(() => setPage(1), [adminF, actionF, resultF, range, ipQ]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER));
  const rows = filtered.slice((page - 1) * PER, page * PER);

  const exportCSV = () => {
    const headers = ['시각', '관리자 ID', '이름', 'IP', '액션', '결과', 'User-Agent', '메모'];
    const csvRows = filtered.map(l => [l.ts, l.adminId, l.name, l.ip, l.action, l.result, l.userAgent || '', l.memo || '']);
    const fn = '관리자접근로그_' + new Date().toISOString().slice(0, 10) + '.csv';
    const after = () => {
      DataStore.addAudit({ type: '관리자계정', targetId: '—', action: '게시', memo: `관리자 접근 로그 CSV보내기(${filtered.length}건)` });
      toastOk(`${filtered.length}건의 접근 로그 CSV를 생성했습니다.`);
    };
    if (window.TOPIKExport && TOPIKExport.downloadCsv) { TOPIKExport.downloadCsv(fn, headers, csvRows).then(after); }
    else after();
  };

  if (!canSeeAll) {
    return (
      <div className="panel-head">
        <div>
          <h1>관리자 접근 로그</h1>
          <div className="sub" style={{ color: 'var(--st-photo)' }}>최고관리자만 조회할 수 있습니다. 현재 권한: <b>{DataStore.roleLabel(myRole)}</b></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="panel-head">
        <div>
          <h1>관리자 접근 로그</h1>
          <div className="sub">관리자 로그인·로그아웃·세션 만료·로그인 실패 이력을 조회합니다. (append-only · 최소 3년 보존 권장)</div>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={exportCSV}>
            <I.Download style={{ width: 14, height: 14 }}/> CSV보내기
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
          <select className="select" value={adminF} onChange={e => setAdminF(e.target.value)}>
            <option value="all">전체 관리자</option>
            {state.admins.map(a => <option key={a.id} value={a.id}>{a.id} · {a.name}</option>)}
          </select>
          <select className="select" value={actionF} onChange={e => setActionF(e.target.value)}>
            <option value="all">전체 액션</option>
            {ADMIN_ACCESS_ACTIONS_F.map(a => <option key={a}>{a}</option>)}
          </select>
          <select className="select" value={resultF} onChange={e => setResultF(e.target.value)}>
            <option value="all">전체 결과</option>
            <option>성공</option>
            <option>실패</option>
          </select>
          <input className="input search" placeholder="IP 검색" value={ipQ} onChange={e => setIpQ(e.target.value)}/>
        </div>
      </div>

      <div className="dg-wrap">
        <div className="dg-scroll">
          <table className="dg">
            <thead><tr>
              <th>시각</th><th>관리자 ID</th><th>이름</th><th>IP</th>
              <th>액션</th><th>결과</th><th>메모</th><th>상세</th>
            </tr></thead>
            <tbody>
              {rows.map(l => (
                <tr key={l.id}>
                  <td className="code">{l.ts}</td>
                  <td><code className="code-id">{l.adminId}</code></td>
                  <td>{l.name}</td>
                  <td className="code muted">{l.ip}</td>
                  <td><span className={`pill ${l.action === '로그인' ? 'pill-approved' : l.action === '로그인실패' ? 'pill-rejected' : 'pill-applied'}`}>{l.action}</span></td>
                  <td><span className={`pill ${l.result === '성공' ? 'pill-approved' : 'pill-rejected'}`}>{l.result}</span></td>
                  <td className="muted" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.memo || '—'}</td>
                  <td>
                    <button className="ibtn ghost" onClick={() => setDetailId(l.id)}><I.Eye style={{ width: 12, height: 12 }}/></button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan="8"><div className="empty"><div className="ttl">조건에 맞는 로그가 없습니다</div></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="dg-foot">
          <div className="info">총 <b style={{ color: 'var(--text)', fontFamily: 'Inter' }}>{DataStore.fmtNum(filtered.length)}</b>건</div>
          <Pager page={page} total={totalPages} onPage={setPage}/>
        </div>
      </div>

      {detailId && <AdminAccessDetailLP id={detailId} onClose={() => setDetailId(null)}/>}
    </>
  );
}

function AdminAccessDetailLP({ id, onClose }) {
  const state = useStore();
  const l = (state.adminAccessLogs || []).find(x => x.id === id);
  if (!l) return null;
  return (
    <LP open size="wide" title={`관리자 접근 로그 상세 — ${l.action}`} sub={`${l.adminId} · ${l.ts}`} onClose={onClose}
      footer={<>
        {l.adminId !== 'unknown' && <a className="btn btn-secondary" href="#admins" onClick={onClose}>관리자 계정 바로가기 →</a>}
        <button className="btn btn-primary" onClick={onClose}>닫기</button>
      </>}>
      <FieldSet legend="기본" cols={2}>
        <KV k="접근 시각" v={<code className="code-id">{l.ts}</code>}/>
        <KV k="액션" v={<span className="pill" style={{ background: 'var(--bg-3)' }}>{l.action}</span>}/>
        <KV k="관리자 ID" v={<code className="code-id">{l.adminId}</code>}/>
        <KV k="이름" v={l.name}/>
        <KV k="IP" v={<code className="code-id">{l.ip}</code>}/>
        <KV k="결과" v={<span className={`pill ${l.result === '성공' ? 'pill-approved' : 'pill-rejected'}`}>{l.result}</span>}/>
        <KV k="로그 ID" v={<code className="code-id">{l.id}</code>}/>
      </FieldSet>
      <FieldSet legend="환경 정보" cols={1}>
        <KV k="User-Agent" v={<code className="code-id" style={{ fontSize: 12, wordBreak: 'break-all' }}>{l.userAgent || '—'}</code>}/>
        <KV k="메모" v={l.memo || '—'}/>
      </FieldSet>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
        ※ 접근 로그는 수정/삭제 불가(append-only). 로그인 5회 실패 시 30분 잠금 정책 적용.
      </div>
    </LP>
  );
}

window.AdminAccessLogPanel = AdminAccessLogPanel;
