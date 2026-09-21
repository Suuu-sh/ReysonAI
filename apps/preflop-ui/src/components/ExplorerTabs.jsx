import { CaretRight } from "@phosphor-icons/react";

export function ExplorerTabs({ activeTab, spotLabel, actingPosition, onTabChange }) {
  return (
    <div className="tabs" role="tablist" aria-label="結果表示">
      {["結果", "Combo別EV"].map(tab => (
        <button
          key={tab}
          role="tab"
          aria-selected={activeTab === tab}
          className={activeTab === tab ? "selected" : ""}
          onClick={() => onTabChange(tab)}
        >
          {tab}
        </button>
      ))}
      <span><span>{spotLabel}</span><CaretRight aria-hidden="true" /><span>{actingPosition} の戦略</span></span>
    </div>
  );
}
