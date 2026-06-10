/* board-comments.jsx — BO 게시판 댓글/대댓글 스레드 (문의·환불 공용) */

function BoCommentThread({ postId, comments, boardKind, isSecret, commentPublic, setCommentPublic }) {
  const [comment, setComment] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');

  const postComment = async (text, parentId) => {
    if (!text.trim()) return;
    const isPub = isSecret ? false : commentPublic;
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiAddComment(postId, text, parentId, boardKind, isPub);
      if (ok) {
        if (parentId) { setReplyTo(null); setReplyText(''); }
        else { setComment(''); }
        toastOk(parentId ? '대댓글이 등록되었습니다.' : '댓글이 등록되었습니다.');
      }
      return;
    }
    toastOk('댓글이 등록되었습니다.');
  };

  const renderNode = (c, isReply) => (
    <div key={c.id || c.ts + c.body} style={{
      padding: 10,
      background: isReply ? '#fff' : 'var(--bg-2)',
      border: isReply ? '1px solid var(--border)' : 'none',
      borderRadius: 6,
      fontSize: 13,
      marginLeft: isReply ? 24 : 0,
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>
        <span><b>{c.author}</b> · <span className="code-id">{isReply ? '대댓글' : '댓글'}</span> · {c.public ? '공개' : '비공개'}</span>
        <span className="code-id">{c.ts}</span>
      </div>
      <div>{c.body}</div>
      {!isReply && (
        <div style={{ marginTop: 6 }}>
          <button className="btn btn-text" style={{ fontSize: 12, padding: 0 }}
            onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyText(''); }}>
            {replyTo === c.id ? '답글 취소' : '답글'}
          </button>
        </div>
      )}
      {replyTo === c.id && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <input className="input" placeholder="대댓글 입력" value={replyText}
            onChange={e => setReplyText(e.target.value)}/>
          <button className="btn btn-secondary btn-sm" disabled={!replyText.trim()}
            onClick={() => postComment(replyText, c.id)}>등록</button>
        </div>
      )}
      {(c.replies || []).map(r => renderNode(r, true))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {(comments || []).map(c => renderNode(c, false))}
      {!comments?.length && <div className="empty" style={{ padding: '20px 0' }}>등록된 댓글이 없습니다</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <input className="input" placeholder={isSecret ? '댓글 추가(비밀글—자동 비공개)' : '댓글 추가'}
          value={comment} onChange={e => setComment(e.target.value)}/>
        {!isSecret && setCommentPublic && (
          <label style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={commentPublic} onChange={e => setCommentPublic(e.target.checked)}/> 공개
          </label>
        )}
        <button className="btn btn-secondary" onClick={() => postComment(comment, null)} disabled={!comment.trim()}>등록</button>
      </div>
    </div>
  );
}

window.BoCommentThread = BoCommentThread;
