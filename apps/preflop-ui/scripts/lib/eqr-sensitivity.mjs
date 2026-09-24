import { raked } from "../../src/estimated/rake.js";

// Compare the two ends of an EQR interval. A tie is a decision boundary too.
const crosses = (low, high) => low !== high &&
  ((low <= 0 && high >= 0) || (high <= 0 && low >= 0));

export function compareEqrSensitivity({ equity, eqr, pot, cost, raiseAtScale }, delta = 0.05) {
  if (![equity, eqr, pot, cost, delta].every(Number.isFinite) || delta <= 0 || delta >= 1) {
    throw new Error("Invalid EQR sensitivity inputs");
  }
  const callLow = equity * eqr * (1 - delta) * raked(pot) - cost;
  const callHigh = equity * eqr * (1 + delta) * raked(pot) - cost;
  const raiseLow = raiseAtScale?.(1 - delta);
  const raiseHigh = raiseAtScale?.(1 + delta);
  if (raiseAtScale && (!Number.isFinite(raiseLow) || !Number.isFinite(raiseHigh))) {
    throw new Error("Invalid raise EV in EQR sensitivity");
  }
  const raiseCall = raiseAtScale ? crosses(raiseLow - callLow, raiseHigh - callHigh) : false;
  return { callFold: crosses(callLow, callHigh), raiseCall,
    callLow, callHigh, ...(raiseAtScale ? { raiseLow, raiseHigh } : {}) };
}
