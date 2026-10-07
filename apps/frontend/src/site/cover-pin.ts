/** Keep the saved square until the question's complete range has left the header. */
export function shouldPinCover(stageTop: number, questionBottom: number, headerBottom: number): boolean {
  return stageTop <= headerBottom && questionBottom > headerBottom;
}

/** The top of the question disappears only where it overlaps the pinned square. */
export function questionMaskEdge(questionTop: number, squareBottom: number, questionHeight: number): number {
  return Math.min(questionHeight + 28, Math.max(0, squareBottom - questionTop));
}
