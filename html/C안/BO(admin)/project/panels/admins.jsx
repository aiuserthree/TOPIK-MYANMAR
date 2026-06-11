/* panels/admins.jsx — 관리자 계정 관리 (TPKM_BO_6_1_*)
   - 계정 목록 · 등록 · 수정 · 비밀번호 초기화 · 비활성/해제
   - 권한 매트릭스(TPKM_BO_6_5)는 별도 메뉴(panels/permissions.jsx)
*/

function AdminsPanel() {
  const state = useStore();
  const myRole = state.me?.role || 'super';
  const canManage = myRole === 'super';

  return (
    <>
      <div className="panel-head">
        <div>
          <h1>관리자 계정 관리</h1>
          <div className="sub">여러 명이 별도 아이디로 동시 접속 · 최고관리자만 관리 · 모든 변경은 처리 이력에 기록됩니다.</div>
        </div>
      </div>

      {!canManage && (
        <div style={{ padding: 14, background: 'var(--st-photo-bg)', color: 'var(--st-photo)', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
          ⓘ 최고관리자(super)만 계정을 관리할 수 있습니다. 현재 권한: <b>{DataStore.roleLabel(myRole)}</b> (조회 전용)
        </div>
      )}

      <AdminAccounts canManage={canManage}/>
    </>
  );
}

function AdminAccounts({ canManage }) {
  const state = useStore();
  const [edit, setEdit] = useState(null);
  const [resetId, setResetId] = useState(null);
  const [toggleId, setToggleId] = useState(null);

  const list = state.admins.slice().sort((a,b) => a.id.localeCompare(b.id));

  const save = async (data) => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiSaveAdmin(data);
      if (ok) {
        toastOk(data._isNew ? '관리자 계정이 등록되었습니다.' : '관리자 계정이 수정되었습니다.');
        setEdit(null);
      }
      return;
    }
    if (data.id && state.admins.find(a => a.id === data.id && a !== state.admins.find(x => x.id === data.id) && data._isNew)) {
      toastErr('이미 사용 중인 아이디입니다.'); return;
    }
    if (data._isNew) {
      // unique id
      if (state.admins.some(a => a.id === data.id)) { toastErr('이미 사용 중인 아이디입니다.'); return; }
      const nw = { id: data.id, name: data.name, email: data.email, role: data.role, status: 'active', lastLogin: '—', lastIp: '—', note: data.note || '' };
      state.admins.push(nw);
      DataStore.addAudit({ type: '관리자계정', targetId: nw.id, action: '생성', after: { ...nw }, memo: '계정 신규 등록 · 초기 비밀번호 첫 로그인 시 변경 강제' });
      toastOk('관리자 계정이 등록되었습니다. 초기 비밀번호가 이메일로 전송됩니다.');
    } else {
      const a = state.admins.find(x => x.id === data.id);
      const before = { ...a };
      Object.assign(a, data);
      DataStore.addAudit({ type: '관리자계정', targetId: a.id, action: '수정', before, after: { ...a }, memo: '계정 수정' });
      toastOk('관리자 계정이 수정되었습니다.');
    }
    DataStore.notify();
    setEdit(null);
  };

  const doReset = async () => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const temp = await DataStore.apiResetAdminPassword(resetId);
      if (temp) {
        setResetId(null);
        toast(`임시 비밀번호 ${temp} · 발급 완료`, { type: 'success', title: '비밀번호 초기화', duration: 5000 });
      }
      return;
    }
    const a = state.admins.find(x => x.id === resetId);
    const temp = 'tpkm' + Math.random().toString(36).slice(2,8);
    DataStore.addAudit({ type: '관리자계정', targetId: a.id, action: '비밀번호초기화', memo: `임시 비밀번호 발급 · 이메일 ${a.email} · 첫 로그인 시 변경 강제` });
    DataStore.notify();
    setResetId(null);
    toast(`임시 비밀번호 ${temp} · 이메일 전송 완료`, { type: 'success', title: '비밀번호 초기화', duration: 5000 });
  };

  const doToggle = async (reason) => {
    const a = state.admins.find(x => x.id === toggleId);
    if (a.email === state.me?.id || a.email === state.me?.email || a.id === state.me?.id) {
      toastErr('본인 계정은 비활성화할 수 없습니다.'); setToggleId(null); return;
    }
    const nextStatus = a.status === 'active' ? 'inactive' : 'active';
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiToggleAdmin(toggleId, nextStatus, reason);
      if (ok) {
        setToggleId(null);
        toastOk(`계정이 ${nextStatus === 'active' ? '활성화' : '비활성화'}되었습니다.`);
      }
      return;
    }
    const before = { status: a.status };
    a.status = nextStatus;
    DataStore.addAudit({ type: '관리자계정', targetId: a.id, action: '수정', before, after: { status: a.status }, memo: `${a.status === 'inactive' ? '비활성화' : '활성화'} · 사유: ${reason}` });
    DataStore.notify();
    setToggleId(null);
    toastOk(`계정이 ${a.status === 'active' ? '활성화' : '비활성화'}되었습니다. 활성 세션은 즉시 무효화됩니다.`);
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-primary" disabled={!canManage} onClick={() => setEdit({ _isNew: true })}>
          <I.Plus style={{ width: 14, height: 14 }}/> 관리자 등록
        </button>
      </div>
      <div className="dg-wrap">
        <div className="dg-scroll">
          <table className="dg">
            <thead><tr>
              <th>아이디</th><th>이름</th><th>이메일</th><th>권한 등급</th>
              <th>마지막 로그인</th><th>마지막 IP</th><th>상태</th><th>비고</th><th>관리</th>
            </tr></thead>
            <tbody>
              {list.map(a => (
                <tr key={a.id}>
                  <td><code className="code-id">{a.id}</code></td>
                  <td><b>{a.name}</b></td>
                  <td className="muted">{a.email}</td>
                  <td><span className={`tag role-${a.role}`}>{DataStore.roleLabel(a.role)}</span></td>
                  <td className="code muted">{a.lastLogin}</td>
                  <td className="code muted">{a.lastIp}</td>
                  <td><Pill kind={a.status === 'active' ? 'active' : 'inactive'}>{a.status === 'active' ? '활성' : '비활성'}</Pill></td>
                  <td className="muted" style={{ maxWidth: 180, overflow:'hidden', textOverflow:'ellipsis' }}>{a.note || '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="ibtn" disabled={!canManage} onClick={() => setEdit({ id: a.id })}><I.Edit style={{ width: 12, height: 12 }}/></button>
                      <button className="ibtn" disabled={!canManage} onClick={() => setResetId(a.id)}>PW 초기화</button>
                      <button className="ibtn danger" disabled={!canManage || a.email === state.me?.id || a.email === state.me?.email || a.id === state.me?.id} onClick={() => setToggleId(a.id)}>
                        {a.status === 'active' ? '비활성' : '활성화'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {edit && <AdminEditLP edit={edit} onClose={() => setEdit(null)} onSave={save}/>}
      {resetId && (
        <Modal open onClose={() => setResetId(null)} title="비밀번호 초기화"
          footer={<>
            <button className="btn btn-secondary" onClick={() => setResetId(null)}>취소</button>
            <button className="btn btn-primary" onClick={doReset}>임시 비밀번호 발급</button>
          </>}>
          <div>해당 관리자의 임시 비밀번호를 발급하고 이메일로 전송합니다. 첫 로그인 시 변경이 강제됩니다.</div>
        </Modal>
      )}
      {toggleId && (() => {
        const a = state.admins.find(x => x.id === toggleId);
        return (
          <ConfirmModal open title={`계정 ${a.status === 'active' ? '비활성화' : '활성화'} — ${a.name}`}
            danger={a.status === 'active'}
            confirmText={a.status === 'active' ? '비활성화' : '활성화'}
            message="사유를 입력하세요. 활성 세션은 즉시 무효화됩니다."
            onClose={() => setToggleId(null)}
            needReason
            reasonOptions={['휴직/퇴직','보안 사유','직무 변경','기타']}
            onConfirm={doToggle}/>
        );
      })()}
    </>
  );
}

function AdminEditLP({ edit, onClose, onSave }) {
  const state = useStore();
  const a0 = edit.id ? state.admins.find(x => x.id === edit.id) : null;
  const [f, setF] = useState(a0 ? { ...a0, _isNew: false } : {
    id: '', name: '', email: '', role: 'general', note: '', pw: '',
    _isNew: true,
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const isApi = DataStore.isApiMode && DataStore.isApiMode();
  const pwRuleOk = (p) => p && p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);
  const valid = isApi
    ? (f.name && /^.+@.+\..+$/.test(f.email) && (!f._isNew || pwRuleOk(f.pw)))
    : (/^[A-Za-z0-9]{4,30}$/.test(f.id) && f.name && /^.+@.+\..+$/.test(f.email) && (!f._isNew || pwRuleOk(f.pw)));
  return (
    <LP open size="sm" title={a0 ? `계정 수정 — ${a0.name}` : '관리자 계정 등록'} onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>취소</button>
        <button className="btn btn-primary" disabled={!valid} onClick={() => onSave(f)}>{a0 ? '저장' : '등록'}</button>
      </>}>
      <FieldSet legend="계정" cols={2}>
        {!isApi && (
          <FormRow label="아이디" required hint="4~30자 영숫자, unique">
            <input className="input" value={f.id} disabled={!!a0} onChange={e => set('id', e.target.value)} maxLength={30}/>
          </FormRow>
        )}
        {isApi && a0 && (
          <FormRow label="계정 ID">
            <input className="input" value={f.id} disabled/>
          </FormRow>
        )}
        <FormRow label="이름" required>
          <input className="input" value={f.name} onChange={e => set('name', e.target.value)}/>
        </FormRow>
        <FormRow label="이메일" required span={2}>
          <input className="input" value={f.email} onChange={e => set('email', e.target.value)} placeholder="user@embassy.kr"/>
        </FormRow>
        <FormRow label="권한 등급" required>
          <select className="select" value={f.role} onChange={e => set('role', e.target.value)}>
            <option value="super">최고관리자 — 전체</option>
            <option value="general">일반관리자 — 접수·콘텐츠</option>
            <option value="viewer">조회관리자 — 읽기 전용</option>
          </select>
        </FormRow>
        {f._isNew && (
          <FormRow label="초기 비밀번호" required hint="8자 이상 · 영문+숫자+특수문자 · 첫 로그인 시 변경 강제">
            <input className="input" type="text" value={f.pw} onChange={e => set('pw', e.target.value)} minLength={8} autoComplete="new-password" placeholder="예) Temp1234!"/>
          </FormRow>
        )}
        <FormRow label="비고" span={2}>
          <input className="input" value={f.note || ''} onChange={e => set('note', e.target.value)} placeholder="예) 콘텐츠 편집 담당"/>
        </FormRow>
      </FieldSet>
    </LP>
  );
}

window.AdminsPanel = AdminsPanel;
