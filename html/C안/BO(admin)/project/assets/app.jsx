/* ============================================================
   app.jsx — Admin shell (sidebar + topbar + router)
   ============================================================ */

const NAV = [
  { section: '메인' },
  { id: 'dashboard',   label: '대시보드',       icon: 'Dashboard' },

  { section: '접수' },
  { id: 'applicants',  label: '접수자 목록',     icon: 'Users',  badge: 'unreviewed' },
  { id: 'photos',      label: '사진 심사',       icon: 'Image',  badge: 'photoWait' },

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
  photos:     ['접수 관리', '사진 심사'],
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

function App() {
  // hash-based router (?#applicants)
  const initial = () => (location.hash.replace('#', '') || 'dashboard');
  const [route, setRoute] = useState(initial);
  const [sbOpen, setSbOpen] = useState(false);
  const state = useStore();

  // Boot: session check + load me into store
  useEffect(() => {
    const raw = sessionStorage.getItem('bo_session');
    if (!raw) { location.replace('admin-login.html?next=' + encodeURIComponent('admin.html')); return; }
    const me = JSON.parse(raw);
    DataStore.state.me = me;
    DataStore.notify();
    try { sessionStorage.setItem('tpkm_bo_admin', JSON.stringify({ role: me.role || 'super', name: me.name || me.id })); } catch (e) {}
    if (window.TOPIKBoCore) TOPIKBoCore.startSessionHeartbeat(me.id || me.name, me.name);
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
    sessionStorage.removeItem('bo_session');
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
    photos:     window.PhotosPanel,
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

  return (
    <>
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
            {['dashboard','applicants','photos'].includes(route) && (
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
            <button className="tb-iconbtn" title="알림">
              <I.Bell/>
              {(badges.unreviewed + badges.photoWait + badges.refundNew + badges.inquiryWait) > 0 && <span className="dot"></span>}
            </button>
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
