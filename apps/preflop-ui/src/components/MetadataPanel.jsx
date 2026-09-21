import { Panel, SectionHeading } from "./primitives.jsx";

export function MetadataPanel({ solution }) {
  return (
    <Panel className="metadata">
      <SectionHeading title="計算情報" />
      {Object.entries(solution ?? {}).map(([key, value]) => (
        <p key={key}><span>{key}</span><code>{String(value)}</code></p>
      ))}
      <p><span>精度・Exploitability</span><code>未検証。EVは実験モデルの推定値。</code></p>
    </Panel>
  );
}
