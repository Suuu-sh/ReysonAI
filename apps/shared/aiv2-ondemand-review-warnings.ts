// Review annotations only. Never alters the saved response, frequencies or hashes.
// artifactHash is postflopHash(envelope.artifact), NOT the raw envelope file hash.
export type OnDemandReviewWarning = {
 id:string; decision_id:string; artifact_hash:string; resolved:false;
 affected_combos:string[]; warning:{en:string;ja:string};
};
export const ONDEMAND_REVIEW_STATUS_WARNING = {
 en:"Numerical and provenance checks are not independent approval of strategy or explanation quality. This AI estimate is not production-approved or a GTO solution.",
 ja:"数値・来歴の確認は、戦略や説明の意味的正しさの独立承認ではありません。このAI推定は本番承認済み・GTO解ではありません。",
};
const childId="7504f6574de683065bbc208f0cd783282617a7068f1ee55db7bca702684769c1";
const childHash="5eae45c34dd8ebff6452852fede2b8514d85389e4d5304c52ac1f50c2c9ab068";
export function onDemandReviewWarnings(decisionId:string,artifactHash:string):OnDemandReviewWarning[]{
 if(decisionId!==childId||artifactHash!==childHash)return [];
 return [{id:"child-summary-nut-advantage-inference",decision_id:childId,artifact_hash:childHash,resolved:false,affected_combos:[],warning:{
  en:"Unresolved review finding: the saved EN/JA summary infers non-exclusive nut advantage from BB holding lower sets/two pair. On As7d2c, AA has positive BTN reach and zero BB reach; BB's strong-hand coverage alone does not establish that conclusion. The original summary and frequencies are preserved, not independently approved.",
  ja:"未解決のレビュー指摘：保存された英日要約は、BBの下位セット・ツーペアを根拠にナッツ優位が独占的ではないと推論しています。As7d2cではAAの到達ウェイトはBTNで正、BBで0であり、BBの強いハンドの存在だけではこの結論は裏付けられません。元の要約・頻度は保持されており、独立承認済みではありません。",
 }}];
}
