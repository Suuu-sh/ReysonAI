/** Keep the saved square until the question's complete range has left the header. */
export function shouldPinCover(stageTop: number, questionBottom: number, headerBottom: number): boolean {
  return stageTop <= headerBottom && questionBottom > headerBottom;
}

/** Fade the complete question block out as it covers the square. */
export function questionOpacity(questionTop: number, headerBottom: number, squareHeight: number): number {
  const progress = Math.min(1, Math.max(0, (headerBottom + squareHeight - questionTop) / Math.max(1, squareHeight)));
  return 1 - progress;
}
