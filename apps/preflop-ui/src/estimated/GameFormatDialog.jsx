import { LockSimple, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { formatFields, formatOptions, isBuilt, optionAvailable } from "./game-formats.js";

export function GameFormatDialog({ format, onSave, onClose }) {
  const [draft, setDraft] = useState(format);
  const dialogRef = useRef(null);
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = event => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="game-format-title" tabIndex={-1} ref={dialogRef}>
      <div className="modal-heading">
        <h2 id="game-format-title">ゲーム設定</h2>
        <button type="button" className="modal-close" aria-label="閉じる" onClick={onClose}><X size={16} /></button>
      </div>
      {formatFields.map(([key, label]) => <fieldset className="format-field" key={key}>
        <legend>{label}</legend>
        <div className="format-options">
          {formatOptions[key].map(option => {
            const available = optionAvailable(key, option.value);
            const selected = draft[key] === option.value;
            return <button type="button" key={String(option.value)} className={`format-option${selected ? " selected" : ""}`} aria-pressed={selected} disabled={!available}
              title={available ? undefined : "レンジ表を準備中"} onClick={() => setDraft(current => ({ ...current, [key]: option.value }))}>
              {!available && <LockSimple size={12} weight="bold" aria-hidden="true" />}{option.label}{!available && <span className="sr-only">（準備中）</span>}
            </button>;
          })}
        </div>
      </fieldset>)}
      <p className="modal-note"><LockSimple size={12} weight="bold" aria-hidden="true" /> はレンジ表を準備中の設定です。</p>
      <div className="modal-actions">
        <button type="button" className="onboarding-cancel" onClick={onClose}>キャンセル</button>
        <button type="button" className="primary" disabled={!isBuilt(draft)} onClick={() => onSave(draft)}>適用する</button>
      </div>
    </div>
  </div>;
}
