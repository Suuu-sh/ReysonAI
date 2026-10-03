import type { CSSProperties } from "react";
import symbol from "../assets/brand/reysonai-symbol.png";

/** The approved abstract brand symbol; playing-card suits stay separate. */
export function BrandIcon({ size = 28, style }: { size?: number; style?: CSSProperties }) {
  return <img src={symbol} alt="" aria-hidden="true" width={size} height={size}
    style={{ display: "block", flexShrink: 0, objectFit: "contain", ...style }} />;
}
