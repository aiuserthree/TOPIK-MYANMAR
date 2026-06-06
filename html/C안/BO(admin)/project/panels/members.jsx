/* panels/members.jsx — 회원 관리 (TPKM_BO_5_1_*)
   - 필터/검색, 그리드, 상세 LP, 정보 수정 LP, 정지/탈퇴 모달, 비밀번호 초기화, CSV
   - 고객사 수정 0526: 탈퇴 시 진행 중 접수 자동 취소 안내
*/

function MembersPanel() {
  const state = useStore();
  const [stF, setStF] = useState('all');
  const [natF, setNatF] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const PER = 12;

  const [detailId, setDetailId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [suspendId, setSuspendId] = useState(null);
  const [withdrawId, setWithdrawId] = useState(null);
  const [resetId, setResetId] = useState(null);

  const nationalities = useMemo(() => Array.from(new Set(state.members.map(m => m.nation))), [state.members]);

  const filtered = useMemo(() => {
    let r = state.members.slice();
    if (stF !== 'all')  r = r.filter(m => m.status === stF);
    if (natF !== 'all') r = r.filter(m => m.nation === natF);
    if (q) {
      const qq = q.toLowerCase();
      r = r.filter(m => m.nameKo.includes(q) || m.nameEn.toLowerCase().includes(qq) || m.email.toLowerCase().includes(qq) || m.tel.includes(q));
    }
    return r.sort((a,b) => b.joinedAt.localeCompare(a.joinedAt));
  }, [state.members, stF, natF, q]);

  useEffect(() => setPage(1), [stF, natF, q]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER));
  const pageRows = filtered.slice((page-1)*PER, page*PER);

  const counts = useMemo(() => ({
    all: state.members.length,
    active: state.members.filter(m => m.status === 'active').length,
    inactive: state.members.filter(m => m.status === 'inactive').length,
    withdrawn: state.members.filter(m => m.status === 'withdrawn').length,
  }), [state.members]);

  const exportCSV = () => {
    DataStore.addAudit({ type: '회원', targetId: '—', action: '게시', memo: `회원 CSV 내보내기(${filtered.length}건) · 개인정보 마스킹 적용` });
    toastOk(`${filtered.length}건의 회원 CSV가 생성되었습니다.`);
  };

  return (
    <>
      <div className="panel-head">
        <div>
          <h1>회원 관리</h1>
          <div className="sub">FO 회원가입(STEP1~3) 회원 데이터 · 정보정정 신청은 본 패널에서 직접 반영</div>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={exportCSV}><I.Download style={{ width: 14, height: 14 }}/> CSV 다운로드</button>
        </div>
      </div>

      <div className="filterbar">
        <div className="chips">
          <button className={`chip ${stF === 'all' ? 'active' : ''}`} onClick={() => setStF('all')}>전체<span className="cnt">{counts.all}</span></button>
          <button className={`chip ${stF === 'active' ? 'active' : ''}`} onClick={() => setStF('active')}>활성<span className="cnt">{counts.active}</span></button>
          <button className={`chip ${stF === 'inactive' ? 'active' : ''}`} onClick={() => setStF('inactive')}>정지<span className="cnt">{counts.inactive}</span></button>
          <button className={`chip ${stF === 'withdrawn' ? 'active' : ''}`} onClick={() => setStF('withdrawn')}>탈퇴<span className="cnt">{counts.withdrawn}</span></button>
        </div>
        <div className="controls">
          <select className="select" value={natF} onChange={e => setNatF(e.target.value)}>
            <option value="all">전체 국적</option>
            {nationalities.map(n => <option key={n}>{n}</option>)}
          </select>
          <input className="input search" placeholder="이름·이메일·연락처 검색" value={q} onChange={e => setQ(e.target.value)}/>
        </div>
      </div>

      <div className="dg-wrap">
        <div className="dg-scroll">
          <table className="dg">
            <thead><tr>
              <th className="num">번호</th><th>한글성명</th><th>영문성명</th><th>이메일</th>
              <th>연락처</th><th>국적</th><th>가입일</th><th>마지막 로그인</th><th>상태</th><th>관리</th>
            </tr></thead>
            <tbody>
              {pageRows.map(m => (
                <tr key={m.id}>
                  <td className="num">{m.no}</td>
                  <td><a style={{ color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }} onClick={() => setDetailId(m.id)}>{m.nameKo}</a></td>
                  <td>{m.nameEn}</td>
                  <td className="muted">{m.email}</td>
                  <td className="code muted">{m.tel}</td>
                  <td>{m.nation}</td>
                  <td className="code muted">{m.joinedAt}</td>
                  <td className="code muted">{m.lastLogin}</td>
                  <td>
                    <Pill kind={m.status === 'active' ? 'active' : m.status === 'inactive' ? 'pay' : 'cancel'}>
                      {m.status === 'active' ? '활성' : m.status === 'inactive' ? '정지' : '탈퇴'}
                    </Pill>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="ibtn ghost" onClick={() => setDetailId(m.id)}><I.Eye style={{ width: 12, height: 12 }}/></button>
                      <button className="ibtn" onClick={() => setEditId(m.id)} disabled={m.status === 'withdrawn'}>수정</button>
                      <button className="ibtn" onClick={() => setResetId(m.id)} disabled={m.status === 'withdrawn'}>PW</button>
                      {m.status === 'active' && <button className="ibtn danger" onClick={() => setSuspendId(m.id)}>정지</button>}
                      {m.status === 'inactive' && <button className="ibtn" onClick={() => {
                        const x = state.members.find(y => y.id === m.id);
                        x.status = 'active';
                        DataStore.addAudit({ type: '회원', targetId: m.id, action: '수정', before: { status: 'inactive' }, after: { status: 'active' }, memo: '정지 해제' });
                        DataStore.notify();
                        toastOk('정지가 해제되었습니다.');
                      }}>해제</button>}
                      {m.status !== 'withdrawn' && <button className="ibtn danger" onClick={() => setWithdrawId(m.id)}>탈퇴</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="dg-foot">
          <div className="info">총 <b style={{ color: 'var(--text)', fontFamily: 'Inter' }}>{DataStore.fmtNum(filtered.length)}</b>건</div>
          <Pager page={page} total={totalPages} onPage={setPage}/>
        </div>
      </div>

      {detailId && <MemberDetailLP id={detailId} onClose={() => setDetailId(null)} onEdit={() => { setEditId(detailId); setDetailId(null); }}/>}
      {editId && <MemberEditLP id={editId} onClose={() => setEditId(null)}/>}
      {suspendId && <SuspendModal id={suspendId} onClose={() => setSuspendId(null)}/>}
      {withdrawId && <WithdrawModal id={withdrawId} onClose={() => setWithdrawId(null)}/>}
      {resetId && <PwResetLP id={resetId} onClose={() => setResetId(null)}/>}
    </>
  );
}

function MemberDetailLP({ id, onClose, onEdit }) {
  const state = useStore();
  const m = state.members.find(x => x.id === id);
  if (!m) return null;
  const myApplies = state.applicants.filter(a => a.email === m.email);
  const log = state.audit.filter(l => l.targetId === id);
  return (
    <LP open size="wide" title={`회원 상세 — ${m.nameKo}`} sub={`회원ID ${m.id}`} onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>닫기</button>
        <button className="btn btn-primary" onClick={onEdit}>정보 수정</button>
      </>}>
      <FieldSet legend="프로필" cols={2}>
        <KV k="한글 성명" v={m.nameKo}/>
        <KV k="영문 성명" v={m.nameEn}/>
        <KV k="이메일" v={m.email}/>
        <KV k="연락처" v={<span className="code-id">{m.tel}</span>}/>
        <KV k="국적" v={m.nation}/>
        <KV k="가입일" v={<span className="code-id">{m.joinedAt}</span>}/>
        <KV k="마지막 로그인" v={<span className="code-id">{m.lastLogin}</span>}/>
        <KV k="상태" v={<Pill kind={m.status === 'active' ? 'active' : m.status === 'inactive' ? 'pay' : 'cancel'}>{m.status === 'active' ? '활성' : m.status === 'inactive' ? '정지' : '탈퇴'}</Pill>}/>
        <KV k="마케팅 수신" v={m.marketing ? '동의' : '미동의'}/>
        {m.reason && <KV k="사유" v={m.reason}/>}
      </FieldSet>

      <FieldSet legend={`접수 이력 (${myApplies.length})`} cols={1}>
        {myApplies.length === 0 ? <div className="empty" style={{ padding: '20px 0' }}>접수 이력 없음</div> : (
          <table className="dg" style={{ fontSize: 12.5 }}>
            <thead><tr><th>회차</th><th>급수</th><th>시험장</th><th>상태</th><th>수험번호</th></tr></thead>
            <tbody>
              {myApplies.map(a => {
                const s = state.sessions.find(s => s.id === a.sessionId);
                return (
                  <tr key={a.id}>
                    <td>{s?.name}</td>
                    <td>{a.level}</td>
                    <td>{DataStore.venueName(a.venueId)}</td>
                    <td><Pill kind={a.status}>{DataStore.statusLabel(a.status)}</Pill></td>
                    <td className="code">{a.exam || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </FieldSet>

      <FieldSet legend={`관리자 처리 이력 (${log.length})`} cols={1}>
        <div className="timeline">
          {log.length === 0 && <div className="empty" style={{ padding: '20px 0' }}>이력 없음</div>}
          {log.map(l => (
            <div key={l.id} className="ev">
              <div className="when">{l.ts}</div>
              <div className="what">{l.type} · <b>{l.action}</b></div>
              <div className="who">처리자 <code className="code-id">{l.actor}</code></div>
              {l.memo && <div className="note">{l.memo}</div>}
            </div>
          ))}
        </div>
      </FieldSet>
    </LP>
  );
}

function MemberEditLP({ id, onClose }) {
  const state = useStore();
  const m = state.members.find(x => x.id === id);
  const [f, setF] = useState({ ...m });
  const [reason, setReason] = useState('');
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const save = () => {
    if (!reason.trim()) { toastErr('수정 사유를 입력해주세요.'); return; }
    const before = { ...m };
    Object.assign(m, f);
    DataStore.addAudit({ type: '회원', targetId: id, action: '수정', before, after: { ...m }, memo: reason });
    DataStore.notify();
    toastOk('회원 정보가 수정되었습니다. 회원에게 이메일 통지가 발송됩니다.');
    onClose();
  };
  return (
    <LP open title={`회원 정보 수정 — ${m.nameKo}`} sub="신원 식별 정보 직접 수정 · 사유 필수 · 처리 이력 자동 기록" onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>취소</button>
        <button className="btn btn-primary" onClick={save} disabled={!reason.trim()}>저장</button>
      </>}>
      <FieldSet legend="신원 정보" cols={2}>
        <FormRow label="한글 성명"><input className="input" value={f.nameKo} onChange={e => set('nameKo', e.target.value)}/></FormRow>
        <FormRow label="영문 성명"><input className="input" value={f.nameEn} onChange={e => set('nameEn', e.target.value)}/></FormRow>
        <FormRow label="이메일"><input className="input" value={f.email} onChange={e => set('email', e.target.value)}/></FormRow>
        <FormRow label="연락처"><input className="input" value={f.tel} onChange={e => set('tel', e.target.value)}/></FormRow>
        <FormRow label="국적"><input className="input" value={f.nation} onChange={e => set('nation', e.target.value)}/></FormRow>
        <FormRow label="마케팅 수신">
          <div className="seg">
            <button className={f.marketing ? 'active' : ''} onClick={() => set('marketing', true)} type="button">동의</button>
            <button className={!f.marketing ? 'active' : ''} onClick={() => set('marketing', false)} type="button">미동의</button>
          </div>
        </FormRow>
      </FieldSet>
      <FieldSet legend="수정 사유" cols={1}>
        <FormRow label="사유" required hint="이력 추적용 · 회원에게 노출되지 않음">
          <textarea className="textarea" rows="3" value={reason} onChange={e => setReason(e.target.value)} placeholder="예) 정보정정 신청 처리 — 생년월일 정정"/>
        </FormRow>
      </FieldSet>
    </LP>
  );
}

function SuspendModal({ id, onClose }) {
  const state = useStore();
  const m = state.members.find(x => x.id === id);
  const [reason, setReason] = useState('이용 약관 위반');
  const [other, setOther] = useState('');
  const final = reason === '기타' ? other : reason;
  const submit = () => {
    if (!final.trim()) { toastErr('사유를 입력해주세요.'); return; }
    const before = { status: m.status };
    m.status = 'inactive';
    m.reason = final;
    DataStore.addAudit({ type: '회원', targetId: id, action: '정지', before, after: { status: 'inactive' }, memo: final });
    DataStore.notify();
    toastOk('회원이 정지되었습니다. 활성 세션은 즉시 무효화됩니다.');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`회원 정지 — ${m.nameKo}`} danger
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>취소</button>
        <button className="btn btn-danger" onClick={submit}>정지</button>
      </>}>
      <FormRow label="정지 사유" required>
        <select className="select" value={reason} onChange={e => setReason(e.target.value)}>
          {['이용 약관 위반','반복적인 부정 행위','장기 미접속','보안 위협','기타'].map(r => <option key={r}>{r}</option>)}
        </select>
      </FormRow>
      {reason === '기타' && (
        <FormRow label="상세 사유" required>
          <textarea className="textarea" rows="2" value={other} onChange={e => setOther(e.target.value)}/>
        </FormRow>
      )}
    </Modal>
  );
}

function WithdrawModal({ id, onClose }) {
  const state = useStore();
  const m = state.members.find(x => x.id === id);
  const [reason, setReason] = useState('본인 요청');
  const myApplies = state.applicants.filter(a => a.email === m.email && !['cancel','rejected'].includes(a.status));
  const submit = () => {
    if (!reason.trim()) { toastErr('사유를 입력해주세요.'); return; }
    const before = { status: m.status };
    m.status = 'withdrawn';
    m.reason = reason;
    // 진행 중 접수 자동 취소 (고객사 수정 0526)
    myApplies.forEach(a => {
      const ab = { status: a.status };
      a.status = 'cancel';
      DataStore.addAudit({ type: '접수자', targetId: a.id, action: '취소', before: ab, after: { status: 'cancel' }, memo: `회원 탈퇴(${id})에 따른 자동 취소` });
    });
    DataStore.addAudit({ type: '회원', targetId: id, action: '탈퇴', before, after: { status: 'withdrawn' }, memo: `${reason} · 진행 중 접수 ${myApplies.length}건 자동 취소` });
    DataStore.notify();
    toastOk(`회원이 탈퇴 처리되었습니다. 진행 중 접수 ${myApplies.length}건이 자동 취소되었습니다.`);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`회원 탈퇴 — ${m.nameKo}`} danger
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>취소</button>
        <button className="btn btn-danger" onClick={submit}>탈퇴 처리</button>
      </>}>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
        탈퇴 처리 시 <b>현재 진행 중인 접수 내역이 모두 취소</b>됩니다.
      </div>
      {myApplies.length > 0 && (
        <div style={{ marginBottom: 12, padding: 10, background: 'var(--st-photo-bg)', color: 'var(--st-photo)', borderRadius: 6, fontSize: 12.5 }}>
          ⚠ 진행 중인 접수 <b>{myApplies.length}건</b>이 자동 취소됩니다:
          <ul style={{ marginTop: 6, paddingLeft: 16 }}>
            {myApplies.map(a => {
              const s = state.sessions.find(x => x.id === a.sessionId);
              return <li key={a.id}>{s?.name} · TOPIK {a.level} · {DataStore.statusLabel(a.status)}</li>;
            })}
          </ul>
        </div>
      )}
      <FormRow label="탈퇴 사유" required>
        <select className="select" value={reason} onChange={e => setReason(e.target.value)}>
          {['본인 요청','장기 미접속','관리자 처리','기타'].map(r => <option key={r}>{r}</option>)}
        </select>
      </FormRow>
    </Modal>
  );
}

function PwResetLP({ id, onClose }) {
  const state = useStore();
  const m = state.members.find(x => x.id === id);
  const [issued, setIssued] = useState(false);
  const tempPw = useMemo(() => 'tpkm' + Math.random().toString(36).slice(2, 8), [id]);
  const issue = () => {
    DataStore.addAudit({ type: '회원', targetId: id, action: '비밀번호초기화', memo: `임시 비밀번호 발급 · 이메일 전송(${m.email}) · 첫 로그인 시 변경 강제` });
    DataStore.notify();
    setIssued(true);
    toastOk('임시 비밀번호가 이메일로 전송되었습니다.');
  };
  return (
    <LP open size="sm" title={`비밀번호 초기화 — ${m.nameKo}`} sub={m.email} onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>닫기</button>
        {!issued && <button className="btn btn-primary" onClick={issue}>임시 비밀번호 발급</button>}
      </>}>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
        임시 비밀번호는 회원 이메일로 발송됩니다. 다음 로그인 시 변경이 강제됩니다.
      </div>
      {issued && (
        <div className="kv" style={{ background: 'var(--st-approved-bg)', borderColor: '#c8e5cd' }}>
          <span className="k">발급된 임시 비밀번호 (1회 노출)</span>
          <span className="v" style={{ fontFamily: 'Inter, monospace', color: 'var(--success)', letterSpacing: '0.04em' }}>{tempPw}</span>
        </div>
      )}
    </LP>
  );
}

window.MembersPanel = MembersPanel;
