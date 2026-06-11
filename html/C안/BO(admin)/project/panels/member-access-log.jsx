/* panels/member-access-log.jsx — 회원 접근 로그 (TPKM_BO_6_7_*) */

const MEMBER_ACCESS_ACTIONS_F = ['로그인', '로그아웃', '페이지접근', '로그인실패'];

function MemberAccessLogPanel() {
  const state = useStore();
  useEffect(() => {
    if (DataStore.isApiMode && DataStore.isApiMode() && DataStore.reloadMemberAccessLogs) {
      DataStore.reloadMemberAccessLogs();
    }
  }, []);
  const myRole = state.me?.role || 'super';
  const canSeeAll = myRole === 'super';

  const [memberF, setMemberF] = useState('all');
  const [actionF, setActionF] = useState('all');
  const [resultF, setResultF] = useState('all');
  const [range, setRange] = useState(0);
  const [emailQ, setEmailQ] = useState('');
  const [page, setPage] = useState(1);
  const PER = 25;
  const [detailId, setDetailId] = useState(null);

  const baseLog = state.memberAccessLogs || [];

  const filtered = useMemo(() => {
    let r = baseLog.slice();
    if (memberF !== 'all') r = r.filter(l => l.email === memberF);
    if (actionF !== 'all') r = r.filter(l => l.action === actionF);
    if (resultF !== 'all') r = r.filter(l => l.result === resultF);
    if (range > 0) {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - range);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      r = r.filter(l => l.ts.slice(0, 10) >= cutoffStr);
    }
    if (emailQ) r = r.filter(l => l.email && l.email.includes(emailQ));
    return r;
  }, [baseLog, memberF, actionF, resultF, range, emailQ]);

  useEffect(() => setPage(1), [memberF, actionF, resultF, range, emailQ]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER));
  const rows = filtered.slice((page - 1) * PER, page * PER);

  const exportCSV = () => {
    const headers = ['시각', '한글성명', '영문성명', '이메일', 'IP', '액션', '경로', '결과', 'User-Agent', '메모'];
    const csvRows = filtered.map(l => [l.ts, l.nameKo, l.nameEn, l.email, l.ip, l.action, l.path || '', l.result, l.userAgent || '', l.memo || '']);
    const fn = '회원접근로그_' + new Date().toISOString().slice(0, 10) + '.csv';
    const after = () => {
      DataStore.addAudit({ type: '관리자계정', targetId: '—', action: '게시', memo: `회원 접근 로그 CSV보내기(${filtered.length}건)` });
      toastOk(`${filtered.length}건의 접근 로그 CSV를 생성했습니다.`);
    };
    if (window.TOPIKExport && TOPIKExport.downloadCsv) { TOPIKExport.downloadCsv(fn, headers, csvRows).then(after); }
    else after();
  };

  if (!canSeeAll) {
    return (
      <div className="panel-head">
        <div>
          <h1>회원 접근 로그</h1>
          <div className="sub" style={{ color: 'var(--st-photo)' }}>최고관리자만 조회할 수 있습니다. 현재 권한: <b>{DataStore.roleLabel(myRole)}</b></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="panel-head">
        <div>
          <h1>회원 접근 로그</h1>
          <div className="sub">회원 로그인·로그아웃·페이지 접근 이력을 조회합니다. 개인정보 접근 감사 자료로 활용됩니다.</div>
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
          <select className="select" value={memberF} onChange={e => setMemberF(e.target.value)}>
            <option value="all">전체 회원</option>
            {state.members.filter(m => m.status === 'active').slice(0, 20).map(m => (
              <option key={m.id} value={m.email}>{m.nameKo || m.name} · {m.email}</option>
            ))}
          </select>
          <select className="select" value={actionF} onChange={e => setActionF(e.target.value)}>
            <option value="all">전체 액션</option>
            {MEMBER_ACCESS_ACTIONS_F.map(a => <option key={a}>{a}</option>)}
          </select>
          <select className="select" value={resultF} onChange={e => setResultF(e.target.value)}>
            <option value="all">전체 결과</option>
            <option>성공</option>
            <option>실패</option>
          </select>
          <input className="input search" placeholder="이메일 검색" value={emailQ} onChange={e => setEmailQ(e.target.value)}/>
        </div>
      </div>

      <div className="dg-wrap">
        <div className="dg-scroll">
          <table className="dg">
            <thead><tr>
              <th>시각</th><th>이메일</th><th>IP</th>
              <th>액션</th><th>경로</th><th>결과</th><th>상세</th>
            </tr></thead>
            <tbody>
              {rows.map(l => (
                <tr key={l.id}>
                  <td className="code">{l.ts}</td>
                  <td className="muted" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.email}</td>
                  <td className="code muted">{l.ip}</td>
                  <td><span className={`pill ${l.action === '로그인' ? 'pill-approved' : l.action === '로그인실패' ? 'pill-rejected' : 'pill-applied'}`}>{l.action}</span></td>
                  <td className="code">{l.path || '—'}</td>
                  <td><span className={`pill ${l.result === '성공' ? 'pill-approved' : 'pill-rejected'}`}>{l.result}</span></td>
                  <td>
                    <button className="ibtn ghost" onClick={() => setDetailId(l.id)}><I.Eye style={{ width: 12, height: 12 }}/></button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan="7"><div className="empty"><div className="ttl">조건에 맞는 로그가 없습니다</div></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="dg-foot">
          <div className="info">총 <b style={{ color: 'var(--text)', fontFamily: 'Inter' }}>{DataStore.fmtNum(filtered.length)}</b>건</div>
          <Pager page={page} total={totalPages} onPage={setPage}/>
        </div>
      </div>

      {detailId && <MemberAccessDetailLP id={detailId} onClose={() => setDetailId(null)}/>}
    </>
  );
}

function MemberAccessDetailLP({ id, onClose }) {
  const state = useStore();
  const l = (state.memberAccessLogs || []).find(x => x.id === id);
  if (!l) return null;
  return (
    <LP open size="wide" title={`회원 접근 로그 상세 — ${l.action}`} sub={`${l.email} · ${l.ts}`} onClose={onClose}
      footer={<>
        {l.memberId && <a className="btn btn-secondary" href="#members" onClick={onClose}>회원 관리 바로가기 →</a>}
        <button className="btn btn-primary" onClick={onClose}>닫기</button>
      </>}>
      <FieldSet legend="기본" cols={2}>
        <KV k="접근 시각" v={<code className="code-id">{l.ts}</code>}/>
        <KV k="액션" v={<span className="pill" style={{ background: 'var(--bg-3)' }}>{l.action}</span>}/>
        <KV k="한글성명" v={l.nameKo || '—'}/>
        <KV k="영문성명" v={l.nameEn || '—'}/>
        <KV k="이메일" v={l.email}/>
        <KV k="IP" v={<code className="code-id">{l.ip}</code>}/>
        <KV k="경로" v={<code className="code-id">{l.path || '—'}</code>}/>
        <KV k="결과" v={<span className={`pill ${l.result === '성공' ? 'pill-approved' : 'pill-rejected'}`}>{l.result}</span>}/>
        <KV k="로그 ID" v={<code className="code-id">{l.id}</code>}/>
      </FieldSet>
      <FieldSet legend="환경 정보" cols={1}>
        <KV k="User-Agent" v={<code className="code-id" style={{ fontSize: 12, wordBreak: 'break-all' }}>{l.userAgent || '—'}</code>}/>
        <KV k="메모" v={l.memo || '—'}/>
      </FieldSet>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
        ※ 개인정보 접근 로그 — 누가·언제·어떤 데이터를 조회했는지 감사 추적용. 수정/삭제 불가.
      </div>
    </LP>
  );
}

window.MemberAccessLogPanel = MemberAccessLogPanel;
