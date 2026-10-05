type ActionCopyFacts = { betting?: { actions?: { action: string | null; allIn?: boolean | null }[] } | null };
type ActionCopyMetadata = Record<string, { allIn?: boolean | null }>;
// Size tokens address saved policy rows. Physical metadata owns visible all-in copy.
export function actionIsAllIn(action: string, explain?: ActionCopyFacts | null, metadata?: ActionCopyMetadata): boolean {
  return action === "allin" || Boolean(metadata?.[action]?.allIn ?? explain?.betting?.actions?.find(item => item.action === action)?.allIn);
}
export function actionForCopy(action: string, explain?: ActionCopyFacts | null, metadata?: ActionCopyMetadata): string {
  return action !== "call" && action !== "fold" && actionIsAllIn(action, explain, metadata) ? "allin" : action;
}
