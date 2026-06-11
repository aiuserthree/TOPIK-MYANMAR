/* panels/perm-history.jsx — 권한 변경 이력 (TPKM_BO_6_8_*) */

const PERM_CHANGE_TYPES = ['메뉴 권한 변경', '등급 변경', '액션 추가', '액션 제거'];

function PermHistoryPanel() {
  const state = useStore();
  useEffect(() => {
    if (DataStore.isApiMode && DataStore.isApiMode() && DataStore.reloadPermHistory) {
      DataStore.reloadPermHistory();
    }
  }, []);
  const myRole = state.me?.role || 'super';
  const canSeeAll = myRole === 'super';

  const [actorF, setActorF] = useState('all');
  const [changeF, setChangeF] = useState('all');
  const [targetF, setTargetF] = useState('all');
  const [range, setRange] = useState(0);
  const [page, setPage] = useState(1);
  const PER = 25;
  const [detailId, setDetailId] = useState(null);

  const baseLog = state.permHistory || [];

  const targets = useMemo(() => [...new Set(baseLog.map(l => l.target))], [baseLog]);

  const filtered = useMemo(() => {
    let r = baseLog.slice();
    if (actorF !== 'all') r = r.filter(l => l.actor === actorF);
    if (changeF !== 'all') r = r.filter(l => l.changeType === changeF);
    if (targetF !== 'all') r = r.filter(l => l.target === targetF);
    if (range > 0) {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - range);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      r = r.filter(l => l.ts.slice(0, 10) >= cutoffStr);
    }
    return r;
  }, [baseLog, actorF, changeF, targetF, range]);

  useEffect(() => setPage(1), [actorF, changeF, targetF, range]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER));
  const rows = filtered.slice((page - 1) * PER, page * PER);

  const exportCSV = () => {
    const headers = ['시각', '변경자', 'IP', '대상', '변경 유형', '등급', '메뉴', '메모'];
    const csvRows = filtered.map(l => [l.ts, l.actor, l.ip, l.target, l.changeType, l.role, l.menu, l.memo || '']);
    const fn = '권한변경이력_' + new Date().toISOString().slice(0, 10) + '.csv';
    const after = () => {
      DataStore.addAudit({ type: '관리자계정', targetId: '권한매트릭스', action: '게시', memo: `권한 변경 이력 CSV보내기(${filtered.length}건)` });
      toastOk(`${filtered.length}건의 권한 변경 이력 CSV를 생성했습니다.`);
    };
    if (window.TOPIKExport && TOPIKExport.downloadCsv) { TOPIKExport.downloadCsv(fn, headers, csvRows).then(after); }
    else after();
  };

  if (!canSeeAll) {
    return (
      <div className="panel-head">
        <div>
          <h1>권한 변경 이력</h1>
          <div className="sub" style={{ color: 'var(--st-photo)' }}>최고관리자만 조회할 수 있습니다. 현재 권한: <b>{DataStore.roleLabel(myRole)}</b></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="panel-head">
        <div>
          <h1>권한 변경 이력</h1>
          <div className="sub">관리자 권한 매트릭스·등급 변경 이력을 조회합니다. 권한 변경 시 활성 세션은 다음 요청에서 새 권한이 적용됩니다.</div>
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
          <select className="select" value={actorF} onChange={e => setActorF(e.target.value)}>
            <option value="all">전체 변경자</option>
            {state.admins.filter(a => a.role === 'super').map(a => (
              <option key={a.id} value={a.id}>{a.id} · {a.name}</option>
            ))}
          </select>
          <select className="select" value={changeF} onChange={e => setChangeF(e.target.value)}>
            <option value="all">전체 변경 유형</option>
            {PERM_CHANGE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="select" value={targetF} onChange={e => setTargetF(e.target.value)}>
            <option value="all">전체 대상</option>
            {targets.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="dg-wrap">
        <div className="dg-scroll">
          <table className="dg">
            <thead><tr>
              <th>시각</th><th>변경자</th><th>IP</th><th>대상</th>
              <th>변경 유형</th><th>등급/메뉴</th><th>메모</th><th>상세</th>
            </tr></thead>
            <tbody>
              {rows.map(l => (
                <tr key={l.id}>
                  <td className="code">{l.ts}</td>
                  <td><code className="code-id">{l.actor}</code></td>
                  <td className="code muted">{l.ip}</td>
                  <td className="code">{l.target}</td>
                  <td><span className="pill pill-applied">{l.changeType}</span></td>
                  <td className="muted">{l.target === '권한매트릭스' ? `${DataStore.roleLabel(l.role)} · ${l.menu}` : DataStore.roleLabel(l.role)}</td>
                  <td className="muted" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.memo || '—'}</td>
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

      {detailId && <PermHistoryDetailLP id={detailId} onClose={() => setDetailId(null)}/>}
    </>
  );
}

function PermHistoryDetailLP({ id, onClose }) {
  const state = useStore();
  const l = (state.permHistory || []).find(x => x.id === id);
  if (!l) return null;
  return (
    <LP open size="wide" title={`권한 변경 상세 — ${l.changeType}`} sub={`${l.target} · ${l.ts}`} onClose={onClose}
      footer={<>
        <a className="btn btn-secondary" href="#permissions" onClick={onClose}>관리자 권한 바로가기 →</a>
        <button className="btn btn-primary" onClick={onClose}>닫기</button>
      </>}>
      <FieldSet legend="기본" cols={2}>
        <KV k="변경 시각" v={<code className="code-id">{l.ts}</code>}/>
        <KV k="변경 유형" v={<span className="pill" style={{ background: 'var(--bg-3)' }}>{l.changeType}</span>}/>
        <KV k="변경자" v={<code className="code-id">{l.actor}</code>}/>
        <KV k="IP" v={<code className="code-id">{l.ip}</code>}/>
        <KV k="대상" v={<code className="code-id">{l.target}</code>}/>
        <KV k="등급" v={DataStore.roleLabel(l.role)}/>
        {l.menu !== '—' && <KV k="메뉴" v={<code className="code-id">{l.menu}</code>}/>}
        <KV k="로그 ID" v={<code className="code-id">{l.id}</code>}/>
      </FieldSet>

      <FieldSet legend="변경 사유" cols={1}>
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
        ※ 권한 변경 이력은 append-only. 활성 세션은 다음 API 요청 시 새 권한이 적용됩니다.
      </div>
    </LP>
  );
}

window.PermHistoryPanel = PermHistoryPanel;
