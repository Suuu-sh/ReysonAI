import type { ReactNode } from "react";
import { BrandIcon } from "./BrandIcon.tsx";

// Kept apart from Loading.tsx so section-level loading UI does not pull in the brand image.
/** Full-screen splash while the app bundle or account state is not ready. */
export function AppLoading({ label }: { label: ReactNode }) {
  return <div className="app-loading" role="status" aria-live="polite">
    <div className="app-loading-mark"><BrandIcon size={44} /></div>
    <span className="app-loading-bar" aria-hidden="true"><i /></span>
    <p>{label}</p>
  </div>;
}
