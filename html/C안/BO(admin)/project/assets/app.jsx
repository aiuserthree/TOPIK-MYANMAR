/* ============================================================
   app.jsx — Admin shell (sidebar + topbar + router)
   ============================================================ */

const NAV = [
  { section: '메인' },
  { id: 'dashboard',   label: '대시보드',       icon: 'Dashboard' },

  { section: '접수' },
  { id: 'applicants',  label: '접수자 목록',     icon: 'Users',  badge: 'unreviewed' },

  { section: '시험 운영' },
  { id: 'sessions',    label: '회차 관리',       icon: 'Calendar' },
  { id: 'venues',      label: '시험장 관리',     icon: 'Pin' },

  { section: '콘텐츠' },
  { id: 'notices',     label: '공지사항',        icon: 'Bell' },
  { id: 'faq',         label: 'FAQ',           icon: 'Help' },
  { id: 'refunds',     label: '환불·정보정정',   icon: 'RefreshCcw', badge: 'refundNew' },
  { id: 'inquiries',   label: '문의 게시판',     icon: 'Mail',   badge: 'inquiryWait' },

  { section: '회원·약관' },
  { id: 'members',     label: '회원 관리',       icon: 'Users' },
  { id: 'terms',       label: '약관 관리',       icon: 'FileText' },

  { section: '시스템' },
  { id: 'admins',      label: '관리자 계정',     icon: 'ShieldCheck' },
  { id: 'permissions', label: '관리자 권한',     icon: 'Lock' },
  { id: 'audit',       label: '처리 이력',       icon: 'History' },
];

const PANEL_TITLE = Object.fromEntries(NAV.filter(n => n.id).map(n => [n.id, n.label]));
const CRUMB = {
  dashboard:  ['메인', '대시보드'],
  applicants: ['접수 관리', '접수자 목록'],
  sessions:   ['시험 관리', '회차 관리'],
  venues:     ['시험 관리', '시험장 관리'],
  notices:    ['콘텐츠 관리', '공지사항'],
  faq:        ['콘텐츠 관리', 'FAQ'],
  refunds:    ['콘텐츠 관리', '환불·정보정정'],
  inquiries:  ['콘텐츠 관리', '문의 게시판'],
  members:    ['회원·약관 관리', '회원 관리'],
  terms:      ['회원·약관 관리', '약관 관리'],
  admins:     ['시스템', '관리자 계정 관리'],
  permissions:['시스템', '관리자 권한 관리'],
  audit:      ['시스템', '처리 이력'],
};

// ===== 첫 로그인 비밀번호 변경 강제 (must_change_password) =====
function PasswordField({ label, value, onChange, show, onToggleShow, placeholder, autoComplete, required }) {
  return (
    <div className="form-row">
      <label className="label">{label}{required && <span className="req"> *</span>}</label>
      <div className="pw-wrap">
        <input
          className="input"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button type="button" className="pw-toggle" onClick={onToggleShow}>
          {show ? '숨기기' : '표시'}
        </button>
      </div>
    </div>
  );
}

function ChangePasswordGate({ onDone }) {
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const pwRuleOk = /[A-Za-z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw);
  const valid = pw.length >= 8 && pwRuleOk && pw === pw2;

  const goToLogin = () => {
    if (window.TopikBoApi) TopikBoApi.logout();
    location.replace('admin-login.html?next=' + encodeURIComponent('admin.html' + location.hash));
  };

  useEffect(() => {
    if (!window.TopikBoApi || !TopikBoApi.isAuthenticated()) {
      goToLogin();
    }
  }, []);

  const finishPasswordChange = () => {
    try {
      if (typeof window.toastOk === 'function') {
        window.toastOk('비밀번호가 변경되었습니다. 다시 로그인해 주세요.');
      }
    } catch (e) { /* toast optional */ }
    if (window.TopikBoApi) TopikBoApi.logout();
    location.replace('admin-login.html?pw_changed=1');
  };

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    const curPw = cur.trim();
    const newPw = pw.trim();
    const newPw2 = pw2.trim();
    if (!curPw) { setErr('현재(임시) 비밀번호를 입력해 주세요.'); return; }
    if (newPw.length < 8) { setErr('새 비밀번호는 8자 이상이어야 합니다.'); return; }
    if (!/[A-Za-z]/.test(newPw) || !/\d/.test(newPw) || !/[^A-Za-z0-9]/.test(newPw)) {
      setErr('새 비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.'); return;
    }
    if (newPw !== newPw2) { setErr('새 비밀번호가 일치하지 않습니다.'); return; }
    if (newPw === curPw) { setErr('새 비밀번호는 현재 비밀번호와 달라야 합니다.'); return; }
    if (!window.TopikBoApi || !TopikBoApi.changeMyPassword) { setErr('API 클라이언트를 불러오지 못했습니다.'); return; }
    setBusy(true);
    TopikBoApi.changeMyPassword(curPw, newPw, newPw2).then(function (res) {
      if (res.ok) {
        finishPasswordChange();
        return;
      }
      setBusy(false);
      if (res.status === 401) {
        setErr('로그인 세션이 만료되었습니다. 아래 「로그인 페이지로」에서 다시 로그인한 뒤 비밀번호를 변경해 주세요.');
        return;
      }
      setErr(TopikBoApi.parseError(res) || '비밀번호 변경에 실패했습니다.');
    }).catch(function () { setBusy(false); setErr('요청 중 오류가 발생했습니다.'); });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'linear-gradient(180deg,#F6F8FB,#EDF1F7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 420, background: '#fff', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 20px 60px rgba(15,27,45,.10)', padding: 28 }}>
        <h2 style={{ fontSize: 19, marginBottom: 6 }}>비밀번호 변경이 필요합니다</h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 18 }}>첫 로그인(또는 비밀번호 초기화) 후에는 보안을 위해 비밀번호를 변경해야 합니다. 변경 전에는 다른 기능을 사용할 수 없습니다.</p>
        {err && <div style={{ padding: '9px 12px', background: 'var(--danger-50)', border: '1px solid #f5c8ce', color: 'var(--danger)', borderRadius: 6, fontSize: 12.5, marginBottom: 12 }}>{err}</div>}
        <PasswordField
          label="현재(임시) 비밀번호"
          value={cur}
          onChange={e => setCur(e.target.value)}
          show={showCur}
          onToggleShow={() => setShowCur(s => !s)}
          autoComplete="current-password"
        />
        <PasswordField
          label="새 비밀번호"
          value={pw}
          onChange={e => setPw(e.target.value)}
          show={showPw}
          onToggleShow={() => setShowPw(s => !s)}
          placeholder="8자 이상 · 영문+숫자+특수문자"
          autoComplete="new-password"
          required
        />
        <PasswordField
          label="새 비밀번호 확인"
          value={pw2}
          onChange={e => setPw2(e.target.value)}
          show={showPw2}
          onToggleShow={() => setShowPw2(s => !s)}
          autoComplete="new-password"
          required
        />
        <button className="btn btn-primary btn-block" style={{ marginTop: 16, height: 44 }} type="submit" disabled={!valid || busy}>
          {busy ? '변경 중…' : '비밀번호 변경'}
        </button>
        <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 10, height: 40 }} onClick={goToLogin}>
          로그인 페이지로
        </button>
      </form>
    </div>
  );
}

function App() {
  // hash-based router (?#applicants)
  const initial = () => (location.hash.replace('#', '') || 'dashboard');
  const [route, setRoute] = useState(initial);
  const [sbOpen, setSbOpen] = useState(false);
  const [mustChange, setMustChange] = useState(false);
  const state = useStore();

  // Boot: token + session check + load me into store + API data
  useEffect(() => {
    if (!window.TopikBoApi || !TopikBoApi.isAuthenticated()) {
      location.replace('admin-login.html?next=' + encodeURIComponent('admin.html' + location.hash));
      return;
    }
    const raw = TopikBoApi.getSessionRaw();
    let me;
    try {
      me = JSON.parse(raw);
    } catch (e) {
      TopikBoApi.logout();
      location.replace('admin-login.html?next=' + encodeURIComponent('admin.html' + location.hash));
      return;
    }
    if (DataStore.normalizeRole) me.role = DataStore.normalizeRole(me.role);
    DataStore.state.me = me;
    DataStore.notify();
    setMustChange(!!me.must_change_password);
    try { sessionStorage.setItem('tpkm_bo_admin', JSON.stringify({ role: me.role || 'super', name: me.name || me.id })); } catch (e) {}
    if (window.TOPIKBoCore) TOPIKBoCore.startSessionHeartbeat(me.id || me.name, me.name);
    if (!me.must_change_password && DataStore.initFromApi) DataStore.initFromApi();
  }, []);

  useEffect(() => {
    const fn = () => setRoute(location.hash.replace('#', '') || 'dashboard');
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);

  useEffect(() => { setSbOpen(false); window.scrollTo(0, 0); }, [route]);

  const navigate = useCallback((id) => { location.hash = id; }, []);
  const logout = useCallback(() => {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    DataStore.addAudit({ type: '관리자계정', targetId: state.me?.id || '', action: '로그아웃', memo: '' });
    if (window.TopikBoApi) TopikBoApi.logout();
    location.replace('admin-login.html');
  }, [state.me]);

  const badges = DataStore.badges();
  const me = state.me;

  // session switcher (header)
  const activeSession = state.sessions.find(s => s.id === state.activeSessionId);

  // pick panel
  const PanelByRoute = {
    dashboard:  window.DashboardPanel,
    applicants: window.ApplicantsPanel,
    sessions:   window.SessionsPanel,
    venues:     window.VenuesPanel,
    notices:    window.NoticesPanel,
    faq:        window.FaqPanel,
    refunds:    window.RefundsPanel,
    inquiries:  window.InquiriesPanel,
    members:    window.MembersPanel,
    terms:      window.TermsPanel,
    admins:     window.AdminsPanel,
    permissions:window.PermissionsPanel,
    audit:      window.AuditPanel,
  };
  const Panel = PanelByRoute[route] || PanelByRoute.dashboard;

  if (mustChange) {
    return <ChangePasswordGate onDone={() => setMustChange(false)}/>;
  }

  return (
    <>
      {(state.apiError || state.apiLoading) && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          padding: '10px 16px', fontSize: 13, textAlign: 'center',
          background: state.apiError ? '#fde8e8' : '#eef4ff',
          color: state.apiError ? '#b42318' : '#1d4ed8',
          borderBottom: '1px solid rgba(0,0,0,.08)',
        }}>
          {state.apiLoading ? 'API 데이터 로딩 중…' : `API 오류: ${state.apiError}`}
        </div>
      )}
      <div className="app">
        {/* Sidebar */}
        <aside className={`sb ${sbOpen ? 'open' : ''}`}>
          <div className="sb-brand">
            <div className="mark">T</div>
            <div className="name">TOPIK Myanmar<small>ADMIN CONSOLE</small></div>
          </div>
          <nav className="sb-nav">
            {NAV.map((item, idx) => item.section
              ? <div className="sb-section-title" key={'s' + idx}>{item.section}</div>
              : (
                <button key={item.id}
                  className={`sb-link ${route === item.id ? 'active' : ''}`}
                  onClick={() => navigate(item.id)}>
                  {React.createElement(I[item.icon] || I.Dashboard, { className: 'ico' })}
                  <span className="label">{item.label}</span>
                  {item.badge && badges[item.badge] > 0 && <span className="badge-count">{badges[item.badge]}</span>}
                </button>
              )
            )}
          </nav>
          <div className="sb-foot">
            <div className="sb-user">
              <div className="avatar">{me?.name?.slice(0,1) || 'A'}</div>
              <div className="meta">
                <div className="nm">{me?.name || '관리자'}</div>
                <div className="rl">{DataStore.roleLabel(me?.role || 'super')} · {me?.id}</div>
              </div>
            </div>
            <button className="sb-logout" onClick={logout}>
              <I.LogOut style={{ width: 14, height: 14 }}/> 로그아웃
            </button>
          </div>
        </aside>
        <div className={`sb-backdrop ${sbOpen ? 'open' : ''}`} onClick={() => setSbOpen(false)}></div>

        {/* Topbar */}
        <header className="tb">
          <button className="ham" onClick={() => setSbOpen(s => !s)}><I.Menu/></button>
          <div>
            <div className="tb-crumb">
              {(CRUMB[route] || []).map((c, i, arr) => (
                <React.Fragment key={c+i}>
                  <span>{c}</span>
                  {i < arr.length - 1 && <span className="sep">›</span>}
                </React.Fragment>
              ))}
            </div>
            <div className="tb-title">{PANEL_TITLE[route] || '대시보드'}</div>
          </div>
          <div className="tb-spacer"></div>
          <div className="tb-actions">
            {/* Session switcher — context for applicant/exam panels */}
            {['dashboard','applicants'].includes(route) && (
              <select
                className="select"
                style={{ height: 36, fontSize: 13, minWidth: 200 }}
                value={state.activeSessionId}
                onChange={e => DataStore.setSession(e.target.value)}>
                {state.sessions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status === 'open' ? '진행중' : s.status === 'planned' ? '예정' : '종료'})
                  </option>
                ))}
              </select>
            )}
            <a className="tb-iconbtn" href="../../FO/index.html" target="_blank" rel="noopener" title="사이트 보기(새 창)">
              <I.ExternalLink/>
            </a>
            <div className="tb-user" title={me?.id}>
              <div className="avatar">{me?.name?.slice(0,1) || 'A'}</div>
              <div className="meta">
                <div className="nm">{me?.name || '관리자'}</div>
                <div className="rl">{DataStore.roleLabel(me?.role || 'super')}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="mn" key={route}>
          {Panel ? <Panel/> : <div className="empty"><div className="ttl">패널 로드 중…</div></div>}
        </main>
      </div>

      <ToastHost/>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
