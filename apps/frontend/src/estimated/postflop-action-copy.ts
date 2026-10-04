// Size tokens address saved policy rows. Physical metadata owns visible all-in copy.
export function actionIsAllIn(action: string, explain?: any, metadata?: Record<string, any>): boolean {
  return action === "allin" || Boolean(metadata?.[action]?.allIn ?? explain?.betting?.actions?.find(item => item.action === action)?.allIn);
}
export function actionForCopy(action: string, explain?: any, metadata?: Record<string, any>): string {
  return action !== "call" && action !== "fold" && actionIsAllIn(action, explain, metadata) ? "allin" : action;
}
