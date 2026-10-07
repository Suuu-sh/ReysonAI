/** The original square retains its place; release only once the opaque ending reaches the header. */
export function shouldPinCover(stageTop: number, footerTop: number, headerBottom: number): boolean {
  return stageTop <= headerBottom && footerTop > headerBottom;
}
