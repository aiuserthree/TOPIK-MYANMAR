/* panels/permissions.jsx — 관리자 권한 관리 (TPKM_BO_6_5_*)
   편집형 권한 매트릭스:
   - 등급(역할) 선택 후 각 메뉴의 권한 액션을 체크/해제로 설정
   - 섹션(구분) 헤더의 「전체선택」 체크박스로 구분 단위 일괄 적용
   - 권장값: 최고=모든 액션, 일반=운영 액션, 조회=read-only
   - 최고관리자만 편집 · 저장 시 처리 이력 기록
*/

const ROLE_DEFS = [
  { role: 'super',   tag: 'role-super',   title: '최고관리자', en: 'super',   rec: '모든 액션 허용 (권장)' },
  { role: 'general', tag: 'role-general', title: '일반관리자', en: 'general', rec: '운영 액션 (접수·콘텐츠) 권장' },
  { role: 'viewer',  tag: 'role-viewer',  title: '조회관리자', en: 'viewer',  rec: 'read-only (조회 전용) 권장' },
];

// section-header / row checkbox supporting indeterminate
function TriCheck({ checked, indeterminate, disabled, onChange, label }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !checked && indeterminate; }, [checked, indeterminate]);
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} style={{ width: 16, height: 16 }}/>
      {label && <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>{label}</span>}
    </label>
  );
}

function PermissionsPanel() {
  const state = useStore();
  const myRole = state.me?.role || 'super';
  const canManage = myRole === 'super';

  const sections = DataStore.permSections;
  const actLabel = (a) => DataStore.permActions[a] || a;

  const [role, setRole] = useState('super');
  // working draft (deep clone of state.perms)
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(state.perms)));
  const cur = draft[role] || {};

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(state.perms), [draft, state.perms]);

  // counts per role (active admins)
  const roleCount = useMemo(() => {
    const c = { super: 0, general: 0, viewer: 0 };
    state.admins.forEach(a => { if (c[a.role] !== undefined && a.status === 'active') c[a.role]++; });
    return c;
  }, [state.admins]);

  const setMenuActions = (menuId, actions) => {
    setDraft(d => ({ ...d, [role]: { ...d[role], [menuId]: actions } }));
  };
  const toggleAction = (menu, act) => {
    if (!canManage) return;
    const have = cur[menu.id] || [];
    const next = have.includes(act) ? have.filter(a => a !== act) : [...have, act];
    // keep canonical order
    setMenuActions(menu.id, menu.actions.filter(a => next.includes(a)));
  };
  const toggleMenuAll = (menu, on) => {
    if (!canManage) return;
    setMenuActions(menu.id, on ? menu.actions.slice() : []);
  };
  const toggleSectionAll = (sec, on) => {
    if (!canManage) return;
    setDraft(d => {
      const r = { ...d[role] };
      sec.menus.forEach(m => { r[m.id] = on ? m.actions.slice() : []; });
      return { ...d, [role]: r };
    });
  };

  // section selection state
  const sectionState = (sec) => {
    let total = 0, on = 0;
    sec.menus.forEach(m => { total += m.actions.length; on += (cur[m.id] || []).length; });
    return { all: total > 0 && on === total, none: on === 0, some: on > 0 && on < total };
  };
  const menuState = (m) => {
    const on = (cur[m.id] || []).length, total = m.actions.length;
    return { all: total > 0 && on === total, none: on === 0, some: on > 0 && on < total };
  };

  const applyRecommended = () => {
    setDraft(d => ({ ...d, [role]: DataStore.recommendedPerms(role) }));
    toast(`${DataStore.roleLabel(role)} 권장값을 적용했습니다. 저장하면 반영됩니다.`);
  };
  const resetDraft = () => setDraft(JSON.parse(JSON.stringify(state.perms)));
  const save = () => {
    if (!canManage) return;
    if (DataStore.isApiMode && DataStore.isApiMode() && DataStore.staticPermissions) {
      toastErr('API 모드에서는 정적 권한만 지원합니다. 변경 사항을 저장할 수 없습니다.');
      return;
    }
    // diff summary
    const before = JSON.parse(JSON.stringify(state.perms));
    state.perms = JSON.parse(JSON.stringify(draft));
    DataStore.addAudit({ type: '관리자계정', targetId: '권한매트릭스', action: '수정', before, after: state.perms, memo: '권한 매트릭스 변경 저장' });
    DataStore.notify();
    toastOk('권한 매트릭스가 저장되었습니다.', { title: '저장 완료', type: 'success' });
  };

  const exportMatrix = () => {
    DataStore.addAudit({ type: '관리자계정', targetId: '권한매트릭스', action: '게시', memo: '권한 매트릭스 내보내기(CSV)' });
    toastOk('권한 매트릭스를 CSV로 내보냈습니다.');
  };

  const totalOn = useMemo(() => {
    let n = 0; sections.forEach(s => s.menus.forEach(m => n += (cur[m.id] || []).length)); return n;
  }, [cur, sections]);

  return (
    <>
      <div className="panel-head">
        <div>
          <h1>관리자 권한 관리</h1>
          <div className="sub">등급 선택 후 각 메뉴의 권한 액션을 체크/해제하세요 · 섹션 「전체선택」으로 구분 단위 일괄 적용 · 최고관리자만 편집</div>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={exportMatrix}><I.Download style={{ width: 14, height: 14 }}/> 내보내기</button>
        </div>
      </div>

      {DataStore.isApiMode && DataStore.isApiMode() && DataStore.staticPermissions && (
        <div style={{ padding: 14, background: '#eef4ff', color: '#1d4ed8', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
          ⓘ API 모드: 권한 매트릭스는 <b>1차 고정(정적)</b>입니다. 역할별 권한 API는 추후 제공 예정이며, 현재 화면은 클라이언트 기본값을 표시합니다.
        </div>
      )}

      {!canManage && (
        <div style={{ padding: 14, background: 'var(--st-photo-bg)', color: 'var(--st-photo)', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
          ⓘ 최고관리자(super)만 권한을 편집할 수 있습니다. 현재 권한: <b>{DataStore.roleLabel(myRole)}</b> (조회 전용)
        </div>
      )}

      {/* 등급 선택 + 권장값 */}
      <div className="acard" style={{ marginBottom: 16 }}>
        <div className="acard-body" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div className="seg">
            {ROLE_DEFS.map(r => (
              <button key={r.role} className={role === r.role ? 'active' : ''} onClick={() => setRole(r.role)}>
                {r.title} <span style={{ fontFamily: 'Inter', opacity: 0.6, marginLeft: 2 }}>{roleCount[r.role]}</span>
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: 'var(--text-3)' }}>
            <span className={`tag ${ROLE_DEFS.find(r => r.role === role).tag}`} style={{ marginRight: 8 }}>{DataStore.roleLabel(role)}</span>
            권장: {ROLE_DEFS.find(r => r.role === role).rec} · 현재 <b style={{ color: 'var(--text-2)', fontFamily: 'Inter' }}>{totalOn}</b>개 액션 허용
          </div>
          <button className="ibtn" disabled={!canManage} onClick={applyRecommended}><I.RefreshCcw style={{ width: 13, height: 13 }}/> 권장값 적용</button>
        </div>
      </div>

      {/* 편집 매트릭스 */}
      <div className="acard">
        <div className="acard-head">
          <h3>{DataStore.roleLabel(role)} 권한 설정</h3>
          <span className="meta">구분(섹션)별 「전체선택」 지원</span>
        </div>
        <div className="acard-body flush">
          {sections.map(sec => {
            const ss = sectionState(sec);
            return (
              <div key={sec.id} style={{ borderBottom: '1px solid var(--border)' }}>
                {/* section header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#FAFBFD' }}>
                  <TriCheck checked={ss.all} indeterminate={ss.some} disabled={!canManage}
                    onChange={() => toggleSectionAll(sec, !ss.all)}
                    label={`${sec.title}  ·  전체선택`}/>
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{sec.menus.length}개 메뉴</span>
                </div>
                {/* menu rows */}
                {sec.menus.map(m => {
                  const ms = menuState(m);
                  const have = cur[m.id] || [];
                  return (
                    <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12, padding: '10px 16px', alignItems: 'center', borderTop: '1px solid var(--border)' }} className="perm-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TriCheck checked={ms.all} indeterminate={ms.some} disabled={!canManage}
                          onChange={() => toggleMenuAll(m, !ms.all)}/>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{m.label}</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {m.actions.map(a => {
                          const on = have.includes(a);
                          return (
                            <button key={a} type="button" disabled={!canManage}
                              onClick={() => toggleAction(m, a)}
                              className="perm-chip"
                              data-on={on}>
                              <span className="bx">{on && <I.Check style={{ width: 11, height: 11 }}/>}</span>
                              {actLabel(a)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* sticky save bar */}
      {canManage && (
        <div style={{ position: 'sticky', bottom: 0, marginTop: 16, padding: '12px 16px', background: '#fff', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 13, color: dirty ? 'var(--accent)' : 'var(--text-3)' }}>
            {dirty ? '● 저장되지 않은 변경 사항이 있습니다.' : '변경 사항 없음 · 모든 변경은 처리 이력에 기록됩니다.'}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" disabled={!dirty} onClick={resetDraft}>되돌리기</button>
            <button className="btn btn-primary" disabled={!dirty} onClick={save}>변경 사항 저장</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, padding: 14, background: 'var(--bg-2)', borderRadius: 8, fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.7 }}>
        등급 변경(계정별)은 <a href="#admins" style={{ color: 'var(--primary)' }}>관리자 계정 관리</a>에서 수행합니다. 권한 검증은 서버에서 강제됩니다(클라이언트 메뉴 숨김만으로 보호되지 않음). 세밀한 RBAC는 향후 확장 항목입니다.
      </div>

      <style>{`
        .perm-chip {
          display: inline-flex; align-items: center; gap: 5px;
          height: 28px; padding: 0 10px 0 6px;
          border: 1px solid var(--border-strong); border-radius: 6px;
          background: #fff; color: var(--text-3);
          font-size: 12px; font-weight: 500;
          transition: all .12s var(--ease);
        }
        .perm-chip .bx {
          width: 15px; height: 15px; border-radius: 4px;
          border: 1.5px solid var(--border-strong); background: #fff;
          display: inline-flex; align-items: center; justify-content: center;
          color: #fff; flex: 0 0 auto;
        }
        .perm-chip[data-on="true"] {
          background: var(--primary-50); border-color: var(--primary); color: var(--primary);
        }
        .perm-chip[data-on="true"] .bx { background: var(--primary); border-color: var(--primary); }
        .perm-chip:not([disabled]):hover { border-color: var(--primary); }
        .perm-chip[disabled] { cursor: default; opacity: .55; }
        .perm-row:hover { background: #FAFBFD; }
        @media (max-width: 700px) { .perm-row { grid-template-columns: 1fr !important; } }
      `}</style>
    </>
  );
}

window.PermissionsPanel = PermissionsPanel;
