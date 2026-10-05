import type { ReactNode } from "react";
export type ContextBoard = { key: string; street?: "flop" | "turn" | "river"; cards: string[] };
import { useEffect, useState } from "react";
import { GearSix, Cards, ArrowCounterClockwise } from "@phosphor-icons/react";
import { productLocale } from "../locale.ts";

const suits = { s: "♠", h: "♥", d: "♦", c: "♣" };
const copy = {
  en: { board: "Board", settings: "Settings", reset: "Reset actions", flop: "Change flop cards", turn: "Change turn card", river: "Change river card" },
  ja: { board: "ボード", settings: "設定", reset: "アクションをリセット", flop: "フロップカードを変更", turn: "ターンカードを変更", river: "リバーカードを変更" },
  "zh-CN": { board: "公共牌", settings: "设置", reset: "重置行动", flop: "更改翻牌", turn: "更改转牌", river: "更改河牌" },
  es: { board: "Mesa", settings: "Ajustes", reset: "Reiniciar acciones", flop: "Cambiar flop", turn: "Cambiar turn", river: "Cambiar river" },
};

/** Follow visible street blocks instead of stale downstream cards. */
export function RangeContextCard({ postflop, settingsOpen, boards, onEditBoard, onReset, children }: { postflop: boolean; settingsOpen: boolean; boards: ContextBoard[]; onEditBoard: (street: "flop" | "turn" | "river") => void; onReset: () => void; children?: ReactNode }) {
  const [view, setView] = useState("board");
  useEffect(() => { if (!postflop) setView("board"); }, [postflop]);
  const boardVisible = postflop && view === "board";
  const text = copy[productLocale()];
  return <div className={`action-seat action-seat-info${postflop ? " has-context-switch" : ""}${boardVisible ? " showing-board" : ""}${settingsOpen || (postflop && !boardVisible) ? " is-open" : ""}`}>
    {postflop && <div className="range-context-switch" role="group" aria-label={`${text.board} / ${text.settings}`}>
      <button type="button" aria-pressed={boardVisible} onClick={() => setView("board")}><Cards size={13} aria-hidden="true" />{text.board}</button>
      <button type="button" aria-pressed={!boardVisible} onClick={() => setView("settings")}><GearSix size={13} aria-hidden="true" />{text.settings}</button>
    </div>}
    {boardVisible ? <>
      <div className="range-context-board" role="group" aria-label={text.board}>
        {boards.map(block => <button type="button" key={block.key} className="range-context-street" aria-label={text[block.street ?? "flop"]} title={text[block.street ?? "flop"]} onClick={() => onEditBoard(block.street ?? "flop")}>
          {(block.street === "turn" || block.street === "river" ? [block.cards[0]] : [0, 1, 2].map(index => block.cards[index])).map((card, index) => <span key={index} className={`postflop-card${card ? ` suit-${card[1]}` : " empty"}`}>{card ? `${card[0]}${suits[card[1] as keyof typeof suits]}` : "?"}</span>)}
        </button>)}
      </div>
      <div className="range-context-board-footer"><button type="button" className="settings-icon-button" aria-label={text.reset} title={text.reset} onClick={onReset}><ArrowCounterClockwise size={14} aria-hidden="true" /></button></div>
    </> : children}
  </div>;
}
