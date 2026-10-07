/** Keep the saved square until the question's complete range has left the header. */
export function shouldPinCover(stageTop: number, questionBottom: number, headerBottom: number): boolean {
  return stageTop <= headerBottom && questionBottom > headerBottom;
}

/** Visible at the initial cover; disappear immediately once scrolling advances. */
export function questionOpacity(questionTop: number, headerBottom: number, squareHeight: number): number {
  return questionTop >= headerBottom + squareHeight ? 1 : 0;
}
