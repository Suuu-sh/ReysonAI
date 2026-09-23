import { ArrowLeft, CaretRight, LockSimple, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { detailedFormatFields, formatOptions, gameFormatFields, isBuilt, optionAvailable } from "./game-formats.js";

function FormatFields({ fields, draft, onChange }) {
  return fields.map(([key, label]) => <fieldset className="format-field" key={key}>
    <legend>{label}</legend>
    <div className="format-options">
      {formatOptions[key].map(option => {
        const available = optionAvailable(key, option.value);
        const selected = draft[key] === option.value;
        return <button type="button" key={String(option.value)} className={`format-option${selected ? " selected" : ""}`} aria-pressed={selected} disabled={!available}
          title={available ? undefined : "レンジ表を準備中"} onClick={() => onChange(current => ({ ...current, [key]: option.value }))}>
          {!available && <LockSimple size={12} weight="bold" aria-hidden="true" />}{option.label}{!available && <span className="sr-only">（準備中）</span>}
        </button>;
      })}
    </div>
  </fieldset>);
}

export function AdvancedSettingsPage({ format, onChange }) {
  return <div className="advanced-settings-page" aria-label="より詳細な設定">
    <p className="modal-description">対戦環境の詳細を設定します。現在選べるレンジはアンティなしのみです。</p>
    <FormatFields fields={detailedFormatFields} draft={format} onChange={onChange} />
    <p className="modal-note"><LockSimple size={12} weight="bold" aria-hidden="true" /> は対応するレンジを準備中の設定です。</p>
  </div>;
}

export function GameFormatDialog({ format, onSave, onClose }) {
  const [draft, setDraft] = useState(format);
  const [page, setPage] = useState("game");
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
        <div className="modal-title-group">
          {page === "advanced" && <button type="button" className="modal-back" aria-label="ゲーム設定に戻る" title="ゲーム設定に戻る" onClick={() => setPage("game")}><ArrowLeft size={16} aria-hidden="true" /></button>}
          <h2 id="game-format-title">{page === "game" ? "ゲーム設定" : "より詳細な設定"}</h2>
        </div>
        <button type="button" className="modal-close" aria-label="閉じる" onClick={onClose}><X size={16} /></button>
      </div>
      {page === "game" ? <>
        <FormatFields fields={gameFormatFields} draft={draft} onChange={setDraft} />
        <button type="button" className="modal-settings-link" onClick={() => setPage("advanced")}>
          <span>より詳細な設定</span><CaretRight size={15} aria-hidden="true" />
        </button>
        <p className="modal-note"><LockSimple size={12} weight="bold" aria-hidden="true" /> はレンジ表を準備中の設定です。</p>
      </> : <AdvancedSettingsPage format={draft} onChange={setDraft} />}
      <div className="modal-actions">
        <button type="button" className="onboarding-cancel" onClick={onClose}>キャンセル</button>
        <button type="button" className="primary" disabled={!isBuilt(draft)} onClick={() => onSave(draft)}>適用する</button>
      </div>
    </div>
  </div>;
}
