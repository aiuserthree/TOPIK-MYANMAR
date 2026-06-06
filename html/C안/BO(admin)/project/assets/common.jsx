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
function LP({ open, title, sub, onClose, size, children, footer }) {
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

// Export to window
Object.assign(window, { useStore, useState, useEffect, useMemo, useCallback, useRef, Fragment, h,
  LP, Modal, ConfirmModal, ToastHost, toast, toastOk, toastErr,
  FormRow, FieldSet, Pager, Pill, BulkBar, I });
