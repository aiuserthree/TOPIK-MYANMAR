/* ============================================================
   common.jsx — Shared admin UI primitives
   Exported on window: LP, Modal, Toast/useToasts, useStore,
   Confirm, Pager, IconBtn, Pill, FormRow, FieldSet, icons
   ============================================================ */

const { useState, useEffect, useMemo, useCallback, useRef, Fragment } = React;
const h = React.createElement;

// ----- Hook: subscribe to DataStore changes -----
function useStore() {
  const [, force] = useState(0);
  useEffect(() => DataStore.subscribe(() => force(x => x + 1)), []);
  return DataStore.state;
}

// ----- Icons (line SVGs) -----
const I = {
  Dashboard: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>,
  Users:    (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Image:    (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>,
  Calendar: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  Pin:      (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 22v-7"/><circle cx="12" cy="9" r="6"/></svg>,
  Bell:     (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>,
  Help:     (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>,
  RefreshCcw: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>,
  Mail:     (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>,
  FileText: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>,
  ShieldCheck: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>,
  History:  (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-7 3.3"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>,
  ExternalLink: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/></svg>,
  LogOut:   (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>,
  LogIn:    (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5M15 12H3"/></svg>,
  UserCheck:(p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/></svg>,
  KeyRound: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M2 18v3a1 1 0 0 0 1 1h3"/><path d="M15 6a6 6 0 0 1 7 7l-8.5 8.5a2 2 0 0 1-2.8 0l-.2-.2a2 2 0 0 1 0-2.8L19 10"/><circle cx="18.5" cy="7.5" r=".5" fill="currentColor"/></svg>,
  Menu:     (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 6h18M3 12h18M3 18h18"/></svg>,
  X:        (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  Plus:     (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 5v14M5 12h14"/></svg>,
  Search:   (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
  Download: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>,
  Printer:  (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 9V2h12v7"/><rect x="6" y="14" width="12" height="8"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/></svg>,
  Check:    (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 6 9 17l-5-5"/></svg>,
  ChevronDown: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 9 6 6 6-6"/></svg>,
  ChevronRight: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m9 6 6 6-6 6"/></svg>,
  Edit:     (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>,
  Trash:    (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"/></svg>,
  Eye:      (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Lock:     (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Copy:     (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  Filter:   (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 3H2l8 9.5V20l4 2v-9.5z"/></svg>,
  Cog:      (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Bookmark: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>,
  MessageSquare: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
};

// ----- LP (Layer Popup, right slide-in panel) -----
function LP({ open, title, sub, onClose, size, children, footer, tabs }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <>
      <div className={`lp-backdrop ${open ? 'open' : ''}`} onClick={onClose}></div>
      <div className={`lp ${open ? 'open' : ''} ${size === 'wide' ? 'lp-wide' : size === 'sm' ? 'lp-sm' : ''}`} role="dialog" aria-modal="true">
        <div className="lp-head">
          <div style={{ flex: 1 }}>
            <h2>{title}</h2>
            {sub && <div className="sub" style={{ marginTop: 2 }}>{sub}</div>}
          </div>
          <button className="lp-close" onClick={onClose} aria-label="닫기"><I.X/></button>
        </div>
        {tabs}
        <div className="lp-body">{children}</div>
        {footer && <div className="lp-foot">{footer}</div>}
      </div>
    </>
  );
}

// ----- Modal (centered, smaller) -----
function Modal({ open, title, onClose, children, footer, danger }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ zIndex: 320 }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ color: danger ? 'var(--danger)' : undefined }}>{title}</h3>
          <button className="lp-close" onClick={onClose} aria-label="닫기" style={{ marginRight: -8 }}><I.X/></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ----- Confirm helper (returns promise via callback prop) -----
function ConfirmModal({ open, title, message, danger, confirmText, onConfirm, onClose, needReason, reasonOptions }) {
  const [reason, setReason] = useState('');
  const [reasonOther, setReasonOther] = useState('');
  useEffect(() => { if (open) { setReason(reasonOptions ? reasonOptions[0] : ''); setReasonOther(''); } }, [open, reasonOptions]);
  if (!open) return null;
  const finalReason = reason === '기타' ? reasonOther : reason;
  const canConfirm = !needReason || (reason && (reason !== '기타' || reasonOther.trim()));
  return (
    <Modal open={open} onClose={onClose} title={title} danger={danger}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>취소</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={!canConfirm}
          onClick={() => onConfirm(finalReason)}>{confirmText || '확인'}</button>
      </>}>
      <div>{message}</div>
      {needReason && (
        <div style={{ marginTop: 14 }}>
          {reasonOptions ? (
            <div className="form-row" style={{ marginBottom: 8 }}>
              <label className="label">사유 <span className="req">*</span></label>
              <select className="select" value={reason} onChange={e => setReason(e.target.value)}>
                {reasonOptions.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
          ) : null}
          {(!reasonOptions || reason === '기타') && (
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label className="label">{reasonOptions ? '상세 사유' : '사유'} <span className="req">*</span></label>
              <textarea className="textarea" rows="3" value={reasonOther} onChange={e => setReasonOther(e.target.value)} placeholder="상세 사유를 입력하세요"></textarea>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ----- Toast manager -----
const ToastBus = {
  listeners: new Set(),
  push(t) { this.listeners.forEach(fn => fn(t)); },
};
function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const fn = (t) => {
      const item = { id: Date.now() + Math.random(), ...t };
      setItems(prev => [...prev, item]);
      setTimeout(() => setItems(prev => prev.filter(x => x.id !== item.id)), t.duration || 3000);
    };
    ToastBus.listeners.add(fn);
    return () => ToastBus.listeners.delete(fn);
  }, []);
  return (
    <div className="toasts">
      {items.map(t => (
        <div key={t.id} className={`toast ${t.type || ''}`}>
          {t.title && <div className="ttl">{t.title}</div>}
          <div className="msg">{t.msg || t.message}</div>
        </div>
      ))}
    </div>
  );
}
function toast(msg, opts = {}) { ToastBus.push({ msg, ...opts }); }
function toastOk(msg, opts = {}) { ToastBus.push({ msg, type: 'success', ...opts }); }
function toastErr(msg, opts = {}) { ToastBus.push({ msg, type: 'error', ...opts }); }

// ----- Form helpers -----
function FormRow({ label, required, hint, error, children, span }) {
  return (
    <div className={`form-row ${error ? 'has-error' : ''}`} style={span ? { gridColumn: `span ${span}` } : null}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {error ? <div className="err">{error}</div> : (hint && <div className="hint">{hint}</div>)}
    </div>
  );
}
function FieldSet({ legend, children, cols }) {
  return (
    <fieldset className="fs">
      {legend && <legend>{legend}</legend>}
      <div className="fs-body">
        <div className={`fs-grid ${cols === 2 ? 'cols-2' : cols === 3 ? 'cols-3' : ''}`}>
          {children}
        </div>
      </div>
    </fieldset>
  );
}

// ----- Pager -----
function Pager({ page, total, onPage }) {
  if (total <= 1) return null;
  const max = total;
  const start = Math.max(1, page - 3);
  const end = Math.min(max, start + 6);
  const pages = [];
  for (let i = start; i <= end; i++) pages.push(i);
  return (
    <div className="pager">
      <a className={page === 1 ? 'disabled' : ''} onClick={() => page > 1 && onPage(page - 1)}>‹</a>
      {start > 1 && <a onClick={() => onPage(1)}>1</a>}
      {start > 2 && <span>…</span>}
      {pages.map(p => (
        <a key={p} className={p === page ? 'current' : ''} onClick={() => onPage(p)}>{p}</a>
      ))}
      {end < max - 1 && <span>…</span>}
      {end < max && <a onClick={() => onPage(max)}>{max}</a>}
      <a className={page === max ? 'disabled' : ''} onClick={() => page < max && onPage(page + 1)}>›</a>
    </div>
  );
}

// ----- Section status pill -----
function Pill({ kind, children }) {
  return <span className={`pill pill-${kind}`}>{children}</span>;
}

// ----- 정원 표기 (회차·시험장 공용) -----
// 0 = 미정(무제한) → '—'. 전체/Ⅰ/Ⅱ를 한 칸에 묶어 보여준다.
function fmtCapValue(n) {
  const v = Number(n);
  return !v || Number.isNaN(v) || v <= 0 ? '—' : DataStore.fmtNum(v);
}

function fmtCapTriple(cap, capI, capII) {
  return `${fmtCapValue(cap)} / ${fmtCapValue(capI)} / ${fmtCapValue(capII)}`;
}

// ----- Bulk action bar -----
function BulkBar({ count, children, onClear }) {
  if (!count) return null;
  return (
    <div className="bulkbar">
      <span><b className="cnt">{count}</b>건 선택됨</span>
      <span className="sep">·</span>
      <a onClick={onClear} style={{ color: 'var(--primary)', cursor: 'pointer', fontSize: 12 }}>선택 해제</a>
      <div className="actions">{children}</div>
    </div>
  );
}

function boardAttachmentName(a) {
  if (typeof a === 'string') return a;
  return (a && (a.filename || a.name)) || 'file';
}

function boardAttachmentFileId(a) {
  if (!a || typeof a === 'string') return null;
  return a.file_id != null ? a.file_id : (a.fileId != null ? a.fileId : null);
}

function boardAttachmentSizeLabel(a) {
  if (!a || typeof a === 'string' || a.size == null) return '';
  var bytes = Number(a.size) || 0;
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
  return bytes + ' B';
}

function isBoardImageName(name) {
  return /\.(jpe?g|png|gif|webp|bmp)$/i.test(name || '');
}

function isBoardPdfName(name) {
  return /\.pdf$/i.test(name || '');
}

function isBoardBrowserViewName(name) {
  return isBoardImageName(name) || isBoardPdfName(name);
}

/** 게시판(문의·환불) 첨부파일 — 관리자 열람/다운로드 */
function BoardAttachments({ attachments }) {
  const items = attachments || [];
  if (!items.length) return <span className="muted">첨부 없음</span>;

  const openAttachment = (fileId, filename) => {
    if (!fileId) {
      toastErr('데모 데이터입니다. API 연결 후 첨부파일을 열람할 수 있습니다.');
      return;
    }
    if (!window.TopikBoApi) {
      toastErr('API에 연결되지 않았습니다.');
      return;
    }
    const name = filename || 'file';
    if (isBoardBrowserViewName(name)) {
      window.open(TopikBoApi.fileUrl(fileId), '_blank', 'noopener');
      return;
    }
    TopikBoApi.downloadFile(fileId, name).then(function (ok) {
      if (!ok) toastErr('첨부파일을 열 수 없습니다.');
    });
  };

  const downloadAttachment = (fileId, filename) => {
    if (!fileId) {
      toastErr('데모 데이터입니다. API 연결 후 첨부파일을 받을 수 있습니다.');
      return;
    }
    if (!window.TopikBoApi) {
      toastErr('API에 연결되지 않았습니다.');
      return;
    }
    TopikBoApi.downloadFile(fileId, filename || 'file').then(function (ok) {
      if (!ok) toastErr('첨부파일 다운로드에 실패했습니다.');
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((a, idx) => {
        const name = boardAttachmentName(a);
        const fileId = boardAttachmentFileId(a);
        const sizeLabel = boardAttachmentSizeLabel(a);
        const key = fileId != null ? String(fileId) : ('demo-' + idx + '-' + name);
        const previewUrl = fileId != null && window.TopikBoApi && isBoardImageName(name)
          ? TopikBoApi.fileUrl(fileId)
          : null;
        const browserView = isBoardBrowserViewName(name);
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-2)' }}>
            {previewUrl
              ? <img src={previewUrl} alt="" role="presentation" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0 }} onClick={() => openAttachment(fileId, name)} />
              : browserView && fileId
                ? <button type="button" className="ibtn" style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', flexShrink: 0, fontSize: 22, padding: 0 }} onClick={() => openAttachment(fileId, name)} title="브라우저에서 열기">📄</button>
                : <span style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', flexShrink: 0, fontSize: 22 }}>📎</span>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <button type="button" className="ibtn" style={{ padding: 0, border: 'none', background: 'transparent', color: 'var(--primary)', fontWeight: 600, fontSize: 13, textAlign: 'left', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => openAttachment(fileId, name)} title={name}>
                {name}
              </button>
              {sizeLabel && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{sizeLabel}</div>}
            </div>
            <button type="button" className="ibtn" onClick={() => downloadAttachment(fileId, name)} title="다운로드" disabled={!fileId}>
              <I.Download style={{ width: 14, height: 14 }}/>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ----- 처리자/변경자 셀 (처리 이력·권한 변경 이력 공용) -----
/** 이름과 이메일을 함께 보여 준다. 필터는 이름으로 고르는데 목록에는 이메일만
    나와서, 걸러 낸 결과가 같은 사람인지 알아보기 어려웠다. */
function ActorCell({ name, email }) {
  if (!name) return <code className="code-id">{email || '—'}</code>;
  return (
    <div style={{ lineHeight: 1.35 }}>
      <b style={{ fontSize: 12.5 }}>{name}</b>
      <div className="muted" style={{ fontSize: 11.5, fontFamily: 'Inter' }}>{email}</div>
    </div>
  );
}

// ----- 처리 이력 변경 내용 — 사람이 읽는 표 + 원본 JSON 접기 -----
function AuditChangeSection({ name, rows, showTitle, mode }) {
  const R = window.BOAuditReadable;
  if (!rows.length) return null;
  const both = name === 'changed';
  return (
    <div className="chg-sec">
      {showTitle && <div className="chg-sec-ttl">{R.sectionTitle(name)}</div>}
      <div className="chg-hint">{R.sectionHint(name, mode)}</div>
      <table className="chg-table">
        <thead>
          <tr>
            <th style={{ width: '30%' }}>항목</th>
            {both && <th style={{ width: '35%' }}>변경 전</th>}
            <th>{both ? '변경 후' : '기록된 값'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key}>
              <th scope="row">{r.label}</th>
              {both && <td className="v-before">{r.before || '없음'}</td>}
              <td className={both ? 'v-after' : ''}>{(both ? r.after : (r.after || r.before)) || '없음'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditChangeView({ before, after, type, actionType, legend }) {
  const R = window.BOAuditReadable;
  const result = useMemo(
    () => (R ? R.diffRows(before, after, type) : null),
    [R, before, after, type],
  );
  const [showRaw, setShowRaw] = useState(false);
  if (!result) return null;

  const filled = ['changed', 'result', 'context'].filter(n => result[n].length);
  const hasRaw = !!before || !!after;

  return (
    <FieldSet legend={legend || '변경 내용'} cols={1}>
      <div className="chg">
        {result.total > 0 && <div className="chg-summary">{R.summaryText(result)}</div>}

        {filled.map(name => (
          <AuditChangeSection key={name} name={name} rows={result[name]} showTitle={filled.length > 1} mode={result.mode}/>
        ))}

        {/* 표가 빌 때 — 값이 같아서인지, 애초에 전·후를 안 남기는 처리인지 구분해서 설명한다 */}
        {!result.total && (
          <div className="chg-summary">
            {hasRaw
              ? '기록된 값이 처리 전과 같습니다. 실제로 바뀐 항목은 없습니다.'
              : R.actionNote(actionType)}
          </div>
        )}
        {result.total > 0 && result.unchanged > 0 && (
          <div className="chg-note">그 외 {result.unchanged}개 항목은 이전과 같습니다.</div>
        )}

        {hasRaw && (
          <button type="button" className="chg-raw-toggle" onClick={() => setShowRaw(v => !v)}>
            {showRaw ? '원본 데이터 숨기기' : '원본 데이터(JSON) 보기 — 개발·장애 확인용'}
          </button>
        )}
        {hasRaw && showRaw && (
          <div className="diff" style={{ marginTop: 8 }}>
            <div>
              <div className="h">Before</div>
              <pre className="before">{before ? JSON.stringify(before, null, 2) : '— 이전 값 없음'}</pre>
            </div>
            <div>
              <div className="h">After</div>
              <pre className="after">{after ? JSON.stringify(after, null, 2) : '— 이후 값 없음'}</pre>
            </div>
          </div>
        )}
      </div>
    </FieldSet>
  );
}

// Export to window
Object.assign(window, { useStore, useState, useEffect, useMemo, useCallback, useRef, Fragment, h,
  LP, Modal, ConfirmModal, ToastHost, toast, toastOk, toastErr,
  FormRow, FieldSet, Pager, Pill, BulkBar, BoardAttachments, AuditChangeView, ActorCell, I });
