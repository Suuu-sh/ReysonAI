import { productLocale } from '../locale.ts';
const copy = {
  retry: ['Retry saved ranges', '保存済みレンジを再読み込み', '重新加载已保存的范围', 'Reintentar rangos guardados'],
  saved: ['Saved decision', '保存済みの判断', '已保存的决策', 'Decisión guardada'],
  history: [' (history)', '（履歴）', '（历史）', ' (historial)'],
  error: ['Could not load ranges', 'レンジを読み込めません', '无法加载范围', 'No se pudieron cargar los rangos'],
  loading: ['Loading', '読み込み中', '加载中', 'Cargando'],
  loadingDetail: ['Loading saved ranges.', '保存済みレンジを読み込んでいます。', '正在加载已保存的范围。', 'Cargando los rangos guardados.'],
  unreachable: ['Unreachable history', '到達しない履歴', '无法到达的行动记录', 'Historial inalcanzable'],
  unreachableDetail: ['The exact saved source actions have no compatible hand support for this history.', 'この履歴の保存済みアクションとカードの組み合わせでは到達できません。', '已保存的行动范围中，没有可兼容此记录的手牌组合。', 'Las acciones guardadas no permiten ninguna combinación de manos compatible con este historial.'],
  missing: ['Range not recorded', 'レンジ未収録', '尚未记录范围', 'Rango no registrado'],
  missingDetail: ['A saved strategy or source for this exact history is missing.', 'この履歴の保存済みレンジ、または前段のデータがありません。', '缺少此完整行动记录的策略或前置数据。', 'Falta una estrategia guardada o una fuente para este historial exacto.'],
  unreachableHand: ['Unreachable in this saved history', 'この保存済み履歴では到達不能', '在此已保存记录中无法到达', 'Inalcanzable en este historial guardado'],
  unreachableHandDetail: ['This hand is unreachable from the saved action frequencies and compatible card assignments. A stored 100% fold is only a placeholder.', 'この履歴の保存済みアクション頻度とカードの組み合わせでは到達できません。保存上のfold=100は形式上の値です。', '根据已保存的行动频率和兼容的牌张分配，此手牌无法到达。保存的100%弃牌仅为占位值。', 'Esta mano es inalcanzable según las frecuencias guardadas y las cartas compatibles. El 100% de abandono guardado es solo un marcador.'],
  facing: ['Facing wager (total)', '受けるベット（合計）', '面对下注（总额）', 'Apuesta enfrentada (total)'],
  boardUnreachable: ['This board cannot occur with the saved preflop ranges. Choose a different board.', '保存済みプリフロップレンジでは、このボードに到達できません。別のボードを選んでください。', '此公共牌与已保存的翻牌前范围不兼容。请选择其他公共牌。', 'Este board no es posible con los rangos preflop guardados. Elige otro board.'],
  noPolicyDetail: ['This exact history has no saved postflop policy for the selected settings. Return through the preflop action blocks or choose another history.', 'この履歴と選択した設定のポストフロップ方針は未収録です。プリフロップの行動ブロックから戻り、別の履歴を選べます。', '此完整行动记录和所选设置尚无保存的翻牌后策略。可通过翻牌前行动块返回并选择其他记录。', 'Este historial exacto no tiene una estrategia postflop guardada para los ajustes elegidos. Vuelve a los bloques preflop o elige otro historial.'],
};
export const continuationCopy = (key: keyof typeof copy) => copy[key][{ en: 0, ja: 1, 'zh-CN': 2, es: 3 }[productLocale()]];
export function postflopAvailabilityError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === 'POSTFLOP_BOARD_UNREACHABLE' || (error?.message ?? error) === 'This board is unreachable from the saved preflop ranges.'
    ? continuationCopy('boardUnreachable') : error?.message ?? String(error);
}
