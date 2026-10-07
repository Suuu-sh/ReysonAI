import type { CSSProperties } from "react";
import symbol from "../assets/brand/reyson-abstract-ace.png";

/** The approved abstract Ace mark; playing-card suit icons stay separate. */
export function BrandIcon({ size = 28, style }: { size?: number; style?: CSSProperties }) {
  return <img src={symbol} alt="" aria-hidden="true" width={size} height={size}
    style={{ display: "block", flexShrink: 0, objectFit: "contain", ...style }} />;
}
