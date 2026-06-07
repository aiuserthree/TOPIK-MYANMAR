/* panels/inquiries.jsx — 문의게시판 관리 (TPKM_BO_4_4_*)
   - 전체/일반/비밀 탭, 카테고리, 상태(답변대기/답변완료), 검색
   - 답변 작성·답변 완료 처리(토글), 댓글/대댓글
*/

const INQ_CATS = ['접수','시험','기타'];

function InquiriesPanel() {
  const state = useStore();
  const [tab, setTab] = useState('all'); // all|public|secret
  const [catF, setCatF] = useState('all');
  const [stF, setStF] = useState('all');
  const [q, setQ] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [delId, setDelId] = useState(null);

  const filtered = useMemo(() => {
    let r = state.inquiries.slice();
    if (tab === 'public') r = r.filter(x => !x.secret);
    if (tab === 'secret') r = r.filter(x => x.secret);
    if (catF !== 'all') r = r.filter(x => x.cat === catF);
    if (stF !== 'all') r = r.filter(x => x.status === stF);
    if (q) r = r.filter(x => x.title.toLowerCase().includes(q.toLowerCase()) || x.author.includes(q));
    return r.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }, [state.inquiries, tab, catF, stF, q]);

  const remove = async () => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiDeleteBoardPost(delId, 'inquiry');
      if (ok) { setDelId(null); toastOk('삭제되었습니다.'); }
      return;
    }
    const i = state.inquiries.find(x => x.id === delId);
    state.inquiries.splice(state.inquiries.indexOf(i), 1);
    DataStore.addAudit({ type: '문의', targetId: i.id, action: '삭제', before: { ...i }, memo: '' });
    DataStore.notify();
    setDelId(null);
    toastOk('삭제되었습니다.');
  };

  return (
    <>
      <div className="panel-head">
        <div>
          <h1>문의 게시판 관리</h1>
          <div className="sub">전체/일반/비밀글 분리 · 비밀글 열람 시 처리 이력 자동 기록</div>
        </div>
      </div>

      <div className="filterbar">
        <div className="chips">
          {[['all','전체'],['public','일반'],['secret','비밀']].map(([k, l]) => (
            <button key={k} className={`chip ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
              {l}<span className="cnt">{k === 'all' ? state.inquiries.length : state.inquiries.filter(x => (k === 'secret' ? x.secret : !x.secret)).length}</span>
            </button>
          ))}
        </div>
        <div className="controls">
          <select className="select" value={catF} onChange={e => setCatF(e.target.value)}>
            <option value="all">전체 카테고리</option>
            {INQ_CATS.map(c => <option key={c}>{c}</option>)}
          </select>
          <select className="select" value={stF} onChange={e => setStF(e.target.value)}>
            <option value="all">전체 상태</option>
            <option value="wait">답변대기</option>
            <option value="done">답변완료</option>
          </select>
          <input className="input search" placeholder="제목·작성자 검색" value={q} onChange={e => setQ(e.target.value)}/>
        </div>
      </div>

      <div className="dg-wrap">
        <div className="dg-scroll">
          <table className="dg">
            <thead><tr>
              <th className="num">번호</th><th>공개</th><th>카테고리</th><th>제목</th><th>작성자</th>
              <th>작성일</th><th>상태</th><th>담당자</th><th>관리</th>
            </tr></thead>
            <tbody>
              {filtered.map(i => (
                <tr key={i.id}>
                  <td className="num">{i.no}</td>
                  <td>{i.secret ? <I.Lock style={{ width: 14, height: 14, color: 'var(--text-3)' }}/> : <I.Eye style={{ width: 14, height: 14, color: 'var(--text-3)' }}/>}</td>
                  <td><span className="pill" style={{ background: 'var(--bg-3)' }}>{i.cat}</span></td>
                  <td><a style={{ color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }} onClick={() => setDetailId(i.id)}>{i.title}</a></td>
                  <td className="muted">{i.author}</td>
                  <td className="code muted">{i.createdAt}</td>
                  <td><Pill kind={i.status === 'done' ? 'done' : 'waiting'}>{i.status === 'done' ? '답변완료' : '답변대기'}</Pill></td>
                  <td className="muted">{i.assignee || '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="ibtn" onClick={() => setDetailId(i.id)}><I.Eye style={{ width: 12, height: 12 }}/></button>
                      <button className="ibtn danger" onClick={() => setDelId(i.id)}><I.Trash style={{ width: 12, height: 12 }}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detailId && <InquiryDetailLP id={detailId} onClose={() => setDetailId(null)}/>}
      {delId && (
        <Modal open onClose={() => setDelId(null)} title="문의 삭제" danger
          footer={<>
            <button className="btn btn-secondary" onClick={() => setDelId(null)}>취소</button>
            <button className="btn btn-danger" onClick={remove}>삭제</button>
          </>}>
          <div>문의를 삭제하시겠습니까?</div>
        </Modal>
      )}
    </>
  );
}

function InquiryDetailLP({ id, onClose }) {
  const state = useStore();
  const q = state.inquiries.find(x => x.id === id);
  const [reply, setReply] = useState('');
  const [done, setDone] = useState(q.status === 'done');
  const [comment, setComment] = useState('');
  const [commentPublic, setCommentPublic] = useState(!q.secret);

  useEffect(() => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      // 댓글/대댓글은 실제 API로 조회. 비밀글 열람 audit는 서버가 기록.
      if (DataStore.apiLoadComments) DataStore.apiLoadComments(id, 'inquiry');
      return;
    }
    if (q.secret) {
      DataStore.addAudit({ type: '문의', targetId: id, action: '수정', memo: '비밀글 본문 열람' });
      DataStore.notify();
    }
  }, [id]);

  if (!q) return null;

  const submit = async () => {
    if (!reply.trim()) { toastErr('답변을 입력해주세요.'); return; }
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiBoardReply(id, reply, 'inquiry', { markDone: done, public: !q.secret });
      if (ok) { setReply(''); toastOk('답변이 등록되었습니다. (FO 게시판에 노출)'); }
      return;
    }
    const before = { status: q.status };
    q.comments.push({ author: state.me?.id, body: reply, public: !q.secret, ts: new Date().toISOString().slice(0,16).replace('T',' '), kind: 'reply' });
    q.assignee = state.me?.id;
    if (done) q.status = 'done';
    DataStore.addAudit({ type: '문의', targetId: id, action: '수정', before, after: { status: q.status }, memo: `답변 등록${done ? '+답변완료 처리' : ''}` });
    DataStore.notify();
    setReply('');
    toastOk('답변이 등록되었습니다. (FO 게시판에 노출)');
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    // 비밀글의 댓글·대댓글은 자동 비밀글 (강제)
    const isPub = q.secret ? false : commentPublic;
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiAddComment(id, comment, null, 'inquiry', isPub);
      if (ok) { setComment(''); toastOk('댓글이 등록되었습니다.'); }
      return;
    }
    q.comments.push({ author: state.me?.id, body: comment, public: isPub, ts: new Date().toISOString().slice(0,16).replace('T',' '), kind: 'comment' });
    DataStore.addAudit({ type: '문의', targetId: id, action: '수정', memo: `댓글 등록(${isPub ? '공개' : '비공개'})` });
    DataStore.notify();
    setComment('');
    toastOk('댓글이 등록되었습니다.');
  };

  return (
    <LP open size="wide" title={q.title} sub={`작성자 ${q.author} · 작성일 ${q.createdAt} · ${q.secret ? '비밀글' : '일반글'}`} onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>닫기</button>
        <button className="btn btn-primary" onClick={submit} disabled={!reply.trim()}>{done ? '답변 등록 · 완료 처리' : '답변 등록'}</button>
      </>}>
      <FieldSet legend="문의 내용" cols={1}>
        <KV k="카테고리" v={<span className="pill" style={{ background: 'var(--bg-3)' }}>{q.cat}</span>}/>
        <KV k="본문" v={<pre style={{ background: 'var(--bg-2)', padding: 10, borderRadius: 6, fontSize: 13, whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: 'var(--text)' }}>{q.body}</pre>}/>
      </FieldSet>

      <FieldSet legend="답변 작성" cols={1}>
        <FormRow label="답변 내용" required>
          <textarea className="textarea" rows="5" value={reply} onChange={e => setReply(e.target.value)} placeholder="답변 내용을 입력하세요."/>
        </FormRow>
        <FormRow>
          <label style={{ fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={done} onChange={e => setDone(e.target.checked)}/>
            답변 완료 처리 (상태를 '답변완료'로 전환)
          </label>
        </FormRow>
      </FieldSet>

      <FieldSet legend={`댓글/대댓글 (${q.comments.length})`} cols={1}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {q.comments.map((c, idx) => (
            <div key={idx} style={{ padding: 10, background: 'var(--bg-2)', borderRadius: 6, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>
                <span><b>{c.author}</b> · <span className="code-id">{c.kind === 'reply' ? '답변' : '댓글'}</span> · {c.public ? '공개' : '비공개'}</span>
                <span className="code-id">{c.ts}</span>
              </div>
              <div>{c.body}</div>
            </div>
          ))}
          {!q.comments.length && <div className="empty" style={{ padding: '20px 0' }}>등록된 댓글이 없습니다</div>}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="input" placeholder={q.secret ? '댓글 추가(비밀글—자동 비공개)' : '댓글 추가'} value={comment} onChange={e => setComment(e.target.value)}/>
            {!q.secret && (
              <label style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={commentPublic} onChange={e => setCommentPublic(e.target.checked)}/> 공개
              </label>
            )}
            <button className="btn btn-secondary" onClick={addComment} disabled={!comment.trim()}>등록</button>
          </div>
        </div>
      </FieldSet>
    </LP>
  );
}

window.InquiriesPanel = InquiriesPanel;
