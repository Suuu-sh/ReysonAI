/** The original square retains its place; release only once the opaque ending reaches the header. */
export function shouldPinCover(stageTop: number, footerTop: number, headerBottom: number): boolean {
  return stageTop <= headerBottom && footerTop > headerBottom;
}

/** Read oversized content naturally, then hold its visible bottom, then exit continuously. */
export function mobileHoldGeometry(trackTop: number, trackBottom: number, contentHeight: number, viewportHeight: number) {
  const top = Math.min(64, viewportHeight - contentHeight - 16);
  return { top, phase: trackTop > top ? "before" : trackBottom >= top + contentHeight ? "pinned" : "after" };
}
