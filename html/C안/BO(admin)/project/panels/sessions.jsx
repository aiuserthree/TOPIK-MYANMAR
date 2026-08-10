/* panels/sessions.jsx — 회차 관리 (TPKM_BO_3_1_*) */

function SessionsPanel() {
  const state = useStore();
  const [edit, setEdit] = useState(null); // {id} or {new:true}
  const [delId, setDelId] = useState(null);
  const canCreate = DataStore.can('sessions', 'create');
  const canEdit = DataStore.can('sessions', 'edit');
  const canDelete = DataStore.can('sessions', 'delete');
  const isSuperAdmin = state.me?.role === 'super';
  const canCreateRound = isSuperAdmin && canCreate;
  const canEditRound = isSuperAdmin && canEdit;
  const canRevokeRound = isSuperAdmin && canDelete;
  const revokeTarget = delId ? state.sessions.find(x => x.id === delId) : null;

  const sessions = state.sessions.slice().sort((a,b) => (b.examDate || '').localeCompare(a.examDate || ''));

  const isApiRoundId = (id) => id != null && id !== '' && /^\d+$/.test(String(id));
  const nextMockSessionId = () => {
    const nums = state.sessions.map((s) => {
      const m = String(s.id || '').match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    });
    return 's' + ((nums.length ? Math.max(...nums) : 0) + 1);
  };

  const save = async (data) => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const editing = isApiRoundId(data.id);
      const ok = await DataStore.apiSaveSession({ ...data, _isNew: !editing });
      if (ok) {
        toastOk(editing ? `${data.name} 정보가 수정되었습니다.` : `${data.name} 회차가 등록되었습니다.`);
        setEdit(null);
      }
      return;
    }
    const session = data.id ? state.sessions.find(s => s.id === data.id) : null;
    if (session) {
      const before = { ...session };
      Object.assign(session, data);
      DataStore.addAudit({ type: '회차', targetId: session.id, action: '수정', before, after: { ...session }, memo: '회차 수정' });
      toastOk(`${session.name} 정보가 수정되었습니다.`);
    } else {
      const id = nextMockSessionId();
      const nw = { id, applicants: 0, ...data };
      state.sessions.push(nw);
      DataStore.addAudit({ type: '회차', targetId: id, action: '생성', after: { ...nw }, memo: '회차 신규 등록' });
      toastOk(`${nw.name} 회차가 등록되었습니다.`);
    }
    DataStore.notify();
    setEdit(null);
  };

  const duplicate = async (s) => {
    const nextNo = Math.max(0, ...state.sessions.map((x) => Number(x.no) || 0)) + 1;
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiSaveSession({
        no: nextNo,
        name: `제${nextNo}회 TOPIK(복제)`,
        applyStart: s.applyStart,
        applyEnd: s.applyEnd,
        payStart: s.payStart,
        payEnd: s.payEnd,
        examDate: s.examDate,
        resultDate: s.resultDate || '',
        cap: s.cap,
        capI: s.capI,
        capII: s.capII,
        feeI: s.feeI,
        feeII: s.feeII,
        venues: (s.venues || []).map(String),
        _isNew: true,
      });
      if (ok) toastOk('회차가 복제되었습니다.');
      return;
    }
    const id = nextMockSessionId();
    const copy = { ...s, id, no: nextNo, name: `제${nextNo}회 TOPIK(복제)`, status: 'planned', applicants: 0 };
    state.sessions.push(copy);
    DataStore.addAudit({ type: '회차', targetId: id, action: '생성', after: { ...copy }, memo: `복제: ${s.name}` });
    DataStore.notify();
    toastOk('회차가 복제되었습니다.');
  };

  const remove = async () => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiRevokeSession(delId);
      if (ok) {
        setDelId(null);
        toastOk('회차가 폐지되었습니다. 동일 회차 번호로 재등록할 수 있습니다.');
      }
      return;
    }
    const s = state.sessions.find(x => x.id === delId);
    if (!s) return;
    const before = { ...s };
    state.sessions.splice(state.sessions.indexOf(s), 1);
    state.applicants = state.applicants.filter(a => a.sessionId !== s.id);
    DataStore.addAudit({ type: '회차', targetId: s.id, action: '폐지', before, memo: '회차 폐지·초기화' });
    DataStore.notify();
    setDelId(null);
    toastOk('회차가 폐지되었습니다. 동일 회차 번호로 재등록할 수 있습니다.');
  };

  return (
    <>
      <div className="panel-head">
        <div>
          <h1>회차 관리</h1>
          <div className="sub">시험 회차를 등록·수정·복제합니다. 모든 변경은 처리 이력에 자동 기록됩니다.</div>
        </div>
        <div className="actions">
          <button className="btn btn-primary" disabled={!canCreateRound} title={!isSuperAdmin ? '회차 등록·폐지는 최고관리자(super)만 가능합니다.' : ''} onClick={() => setEdit({ new: true })}><I.Plus style={{ width: 14, height: 14 }}/> 회차 등록</button>
        </div>
      </div>

      <div className="dg-wrap">
        <div className="dg-scroll">
          <table className="dg">
            <thead>
              <tr>
                <th>회차</th><th>회차명</th><th>접수기간</th><th>시험일</th><th>발표일</th>
                <th className="num">정원(전체/Ⅰ/Ⅱ)</th><th className="num">접수자(전체/Ⅰ/Ⅱ)</th><th>응시료(Ⅰ/Ⅱ)</th><th>시험장</th><th>상태</th><th>관리</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => {
                const isRevoked = s.status === 'revoked';
                const isOpen = s.status === 'open', isClosed = s.status === 'closed';
                const statusKind = isRevoked ? 'retired' : isOpen ? 'approved' : isClosed ? 'cancel' : 'applied';
                const statusLabel = isRevoked ? '폐지' : isOpen ? '접수중' : isClosed ? '마감' : '예정';
                return (
                  <tr key={s.id} style={isRevoked ? { opacity: 0.6 } : undefined}>
                    <td className="code-id">{s.no}회</td>
                    <td><b>{s.name}</b></td>
                    <td className="code">{s.applyStart} ~ {s.applyEnd}</td>
                    <td className="code">{s.examDate}</td>
                    <td className="code muted">{DataStore.fmtResultDate(s.resultDate)}</td>
                    <td className="num">{fmtCapTriple(s.cap, s.capI, s.capII)}</td>
                    <td className="num">{DataStore.fmtNum(s.applicants || 0)} / {DataStore.fmtNum(s.applicantsI || 0)} / {DataStore.fmtNum(s.applicantsII || 0)}</td>
                    <td className="code">{DataStore.fmtNum(s.feeI)}/{DataStore.fmtNum(s.feeII)}</td>
                    <td>{s.venues.length}개소</td>
                    <td><Pill kind={statusKind}>{statusLabel}</Pill></td>
                    <td>
                      <div className="row-actions">
                        {!isRevoked && <>
                          <button className="ibtn" disabled={!canEditRound} title={!isSuperAdmin ? '최고관리자(super) 전용' : ''} onClick={() => setEdit({ id: s.id })}><I.Edit style={{ width: 12, height: 12 }}/> 수정</button>
                          <button className="ibtn" disabled={!canCreateRound} title={!isSuperAdmin ? '최고관리자(super) 전용' : ''} onClick={() => duplicate(s)}><I.Copy style={{ width: 12, height: 12 }}/> 복제</button>
                          <button className="ibtn danger" disabled={!canRevokeRound} title={!isSuperAdmin ? '회차 폐지는 최고관리자(super)만 가능합니다.' : ''} onClick={() => setDelId(s.id)}><I.Trash style={{ width: 12, height: 12 }}/></button>
                        </>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {edit && <SessionEditLP edit={edit} onClose={() => setEdit(null)} onSave={save}/>}
      {delId && revokeTarget && (
        <Modal open onClose={() => setDelId(null)} title="회차 폐지" danger
          footer={<>
            <button className="btn btn-secondary" onClick={() => setDelId(null)}>취소</button>
            <button className="btn btn-danger" onClick={remove}>폐지</button>
          </>}>
          <div>
            <b>{revokeTarget.name}</b> ({revokeTarget.no}회) 회차를 폐지하시겠습니까?
            <br/><br/>
            <span className="muted">해당 회차의 <b>접수자·접수 데이터가 모두 삭제</b>되며, 회차 번호({revokeTarget.no}회)를 다시 등록할 수 있습니다.</span>
          </div>
        </Modal>
      )}
    </>
  );
}

function SessionEditLP({ edit, onClose, onSave }) {
  const state = useStore();
  const [busy, setBusy] = useState(false);
  const existing = edit.id ? state.sessions.find(s => s.id === edit.id) : null;
  const nextNo = state.sessions.length
    ? Math.max(...state.sessions.map(s => Number(s.no) || 0)) + 1
    : 1;

  function addDaysYmd(ymd, days) {
    if (!ymd) return '';
    const parts = ymd.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function suggestPayDates(applyEnd) {
    return { payStart: addDaysYmd(applyEnd, 3), payEnd: addDaysYmd(applyEnd, 5) };
  }

  const [f, setF] = useState(() => existing ? {
    ...existing,
    venues: (existing.venues || []).map(String),
    resultDate: existing.resultDate || '',
    payStart: existing.payStart || '',
    payEnd: existing.payEnd || '',
    cap: existing.cap != null ? Number(existing.cap) : 0,
    capI: existing.capI != null ? Number(existing.capI) : 0,
    capII: existing.capII != null ? Number(existing.capII) : 0,
    feeI: existing.feeI != null ? Number(existing.feeI) : 0,
    feeII: existing.feeII != null ? Number(existing.feeII) : 0,
    no: existing.no != null ? Number(existing.no) : nextNo,
  } : {
    no: nextNo,
    name: '',
    applyStart: '', applyEnd: '', payStart: '', payEnd: '', examDate: '', resultDate: '',
    cap: 1000, capI: 0, capII: 0, feeI: 25, feeII: 25, venues: [], status: 'planned'
  });

  useEffect(() => { if (!f.name && !existing) setF(s => ({ ...s, name: `제${s.no}회 TOPIK` })); }, []);

  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const selectAllOnFocus = (e) => e.target.select();
  const parseRequiredInt = (raw) => {
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? 0 : n;
  };
  const toggleVenue = (vid) => setF(s => {
    const venues = (s.venues || []).map(String);
    const id = String(vid);
    return { ...s, venues: venues.includes(id) ? venues.filter(x => x !== id) : [...venues, id] };
  });
  const venues = (f.venues || []).map(String);
  const cap = Number(f.cap);
  const capI = Number(f.capI);
  const capII = Number(f.capII);
  const feeI = Number(f.feeI);
  const feeII = Number(f.feeII);

  const validateApplyWindow = (start, end) => {
    if (!start || !end) return true;
    if (end < start) {
      toastErr('접수 마감일은 접수 시작일 이후여야 합니다.');
      return false;
    }
    return true;
  };

  const scheduleOk = f.applyStart && f.applyEnd && f.payStart && f.payEnd && f.examDate
    && f.applyStart <= f.applyEnd
    && f.applyEnd <= f.payStart
    && f.payStart <= f.payEnd
    && f.payEnd <= f.examDate
    && (!f.resultDate || f.examDate <= f.resultDate);
  const valid = f.name.trim()
    && scheduleOk
    && !Number.isNaN(cap) && cap >= 0
    && !Number.isNaN(capI) && capI >= 0
    && !Number.isNaN(capII) && capII >= 0
    && !Number.isNaN(feeI) && feeI > 0
    && !Number.isNaN(feeII) && feeII > 0
    && venues.length > 0;

  const submit = async () => {
    if (!valid || busy) return;
    if (!validateApplyWindow(f.applyStart, f.applyEnd)) return;
    setBusy(true);
    try {
      await onSave(f);
    } finally {
      setBusy(false);
    }
  };

  return (
    <LP open title={existing ? `회차 수정 — ${existing.name}` : '회차 등록'} sub={existing ? `회차 ID ${existing.id}` : '신규 회차'}
      onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>취소</button>
        <button type="button" className="btn btn-primary" disabled={!valid || busy} onClick={submit}>{busy ? '처리 중…' : (existing ? '저장' : '등록')}</button>
      </>}>
      <FieldSet legend="기본 정보" cols={2}>
        <FormRow label="회차 번호" required>
          <input type="number" className="input" value={f.no} onFocus={selectAllOnFocus} onChange={e => set('no', parseRequiredInt(e.target.value))}/>
        </FormRow>
        <FormRow label="회차명" required>
          <input className="input" value={f.name} onChange={e => set('name', e.target.value)}/>
        </FormRow>
        <FormRow label="접수 상태">
          <div className="input" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-2)', color: 'var(--text-2)', cursor: 'default' }}>
            {existing
              ? ({ planned: '예정', open: '접수중', closed: '마감', revoked: '폐지' }[f.status] || f.status)
              : '저장 시 접수기간 기준 자동 설정'}
          </div>
          <span className="hint">접수 시작일 00:00(MMT) 이전=예정 · 기간 내=접수중 · 마감일 23:59(MMT) 이후=마감. 폐지는 목록에서 별도 처리.</span>
        </FormRow>
        <FormRow label="전체 정원 (인원)" required>
          <input type="number" className="input" min={0} value={f.cap || 0} onFocus={selectAllOnFocus} onChange={e => set('cap', parseRequiredInt(e.target.value))}/>
          <span className="hint">Ⅰ·Ⅱ 동시 접수자도 1명으로 계산합니다. 0 = 미정(무제한).</span>
        </FormRow>
      </FieldSet>

      <FieldSet legend="급수별 정원 (접수 원서 수)" cols={2}>
        <FormRow label="TOPIK Ⅰ 정원">
          <input type="number" className="input" min={0} value={f.capI || 0} onFocus={selectAllOnFocus} onChange={e => set('capI', parseRequiredInt(e.target.value))}/>
          <span className="hint">{existing ? `현재 접수 ${DataStore.fmtNum(existing.applicantsI || 0)}건 · ` : ''}0 = 미정(무제한)</span>
        </FormRow>
        <FormRow label="TOPIK Ⅱ 정원">
          <input type="number" className="input" min={0} value={f.capII || 0} onFocus={selectAllOnFocus} onChange={e => set('capII', parseRequiredInt(e.target.value))}/>
          <span className="hint">{existing ? `현재 접수 ${DataStore.fmtNum(existing.applicantsII || 0)}건 · ` : ''}0 = 미정(무제한)</span>
        </FormRow>
        <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--text-3)' }}>
          ※ 급수별 정원은 전체 정원과 별개로 적용됩니다. 둘 중 하나라도 차면 해당 급수 접수가 마감됩니다.
          Ⅰ·Ⅱ를 함께 접수한 사람은 전체 정원 1명 + Ⅰ 1건 + Ⅱ 1건으로 계산됩니다.
        </div>
      </FieldSet>

      <FieldSet legend="일정" cols={2}>
        <FormRow label="접수 시작일" required>
          <input type="date" className="input" value={f.applyStart} onChange={e => {
            const v = e.target.value;
            if (f.applyEnd && v && f.applyEnd < v) {
              toastErr('접수 마감일은 접수 시작일 이후여야 합니다.');
              return;
            }
            set('applyStart', v);
          }}/>
        </FormRow>
        <FormRow label="접수 마감일" required>
          <input type="date" className="input" value={f.applyEnd} onChange={e => {
            const v = e.target.value;
            if (f.applyStart && v && v < f.applyStart) {
              toastErr('접수 마감일은 접수 시작일 이후여야 합니다.');
              return;
            }
            setF(s => {
              const next = { ...s, applyEnd: v };
              if (!existing && v) {
                const suggested = suggestPayDates(v);
                if (!s.payStart) next.payStart = suggested.payStart;
                if (!s.payEnd) next.payEnd = suggested.payEnd;
              }
              return next;
            });
          }}/>
        </FormRow>
        <FormRow label="응시료 납부 시작일 (오프라인)" required>
          <input type="date" className="input" value={f.payStart} onChange={e => {
            const v = e.target.value;
            if (f.applyEnd && v && v < f.applyEnd) {
              toastErr('응시료 납부 시작일은 접수 마감일 이후여야 합니다.');
              return;
            }
            if (f.payEnd && v && f.payEnd < v) {
              toastErr('응시료 납부 마감일은 납부 시작일 이후여야 합니다.');
              return;
            }
            set('payStart', v);
          }}/>
        </FormRow>
        <FormRow label="응시료 납부 마감일 (오프라인)" required>
          <input type="date" className="input" value={f.payEnd} onChange={e => {
            const v = e.target.value;
            if (f.payStart && v && v < f.payStart) {
              toastErr('응시료 납부 마감일은 납부 시작일 이후여야 합니다.');
              return;
            }
            if (f.examDate && v && f.examDate < v) {
              toastErr('응시료 납부 마감일은 시험일 이전이어야 합니다.');
              return;
            }
            set('payEnd', v);
          }}/>
        </FormRow>
        <FormRow label="시험일" required><input type="date" className="input" value={f.examDate} onChange={e => set('examDate', e.target.value)}/></FormRow>
        <FormRow label="합격발표일"><input type="date" className="input" value={f.resultDate} onChange={e => set('resultDate', e.target.value)} placeholder="미정 시 비워두기"/></FormRow>
      </FieldSet>

      <FieldSet legend="응시료(USD)" cols={2}>
        <FormRow label="TOPIK Ⅰ" required><input type="number" step="1" min={1} className="input" value={f.feeI} onFocus={selectAllOnFocus} onChange={e => set('feeI', parseRequiredInt(e.target.value))}/></FormRow>
        <FormRow label="TOPIK Ⅱ" required><input type="number" step="1" min={1} className="input" value={f.feeII} onFocus={selectAllOnFocus} onChange={e => set('feeII', parseRequiredInt(e.target.value))}/></FormRow>
      </FieldSet>

      <FieldSet legend="시험장 다중 선택">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {state.venues.filter(v => v.active).map(v => (
            <label key={v.id} className="kv" style={{ cursor: 'pointer', flexDirection: 'row', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
              <input type="checkbox" checked={venues.includes(String(v.id))} onChange={() => toggleVenue(v.id)}/>
              <div>
                <div className="k">{v.region} · 코드 {v.code}</div>
                <div className="v" style={{ fontSize: 13, fontWeight: 500 }}>{v.nameKo}</div>
              </div>
            </label>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>※ 활성 시험장만 선택할 수 있습니다.</div>
      </FieldSet>

      {!valid && (
        <div style={{ padding: 10, background: 'var(--st-photo-bg)', color: 'var(--st-photo)', borderRadius: 6, fontSize: 12.5 }}>
          ※ 모든 필수 항목 입력 + 일정 순서(접수시작 ≤ 접수마감 ≤ 응시료납부 ≤ 시험일) + 시험장 1개 이상 선택이 필요합니다. 정원 0은 미정을 의미합니다. 합격발표일은 미정 시 비워두세요.
          {!venues.length && state.venues.filter(v => v.active).length === 0 && (
            <><br/>활성 시험장이 없습니다. 시험장 관리에서 먼저 등록·활성화해 주세요.</>
          )}
        </div>
      )}
    </LP>
  );
}

window.SessionsPanel = SessionsPanel;
