import { productLocale } from '../locale.ts';

const copy = {
  rare: ['Range not recorded', 'データなし', '尚未记录范围', 'Rango no registrado'],
  rareDetail: [
    'The upper bound on reaching this complete history from a random deal is below 0.01%, so no strategy was generated.',
    '配牌時からこの履歴全体に到達する確率の上限が0.01%未満のため、レンジを作成していません。',
    '从随机发牌开始到达整个行动记录的概率上界低于0.01%，因此未生成策略范围。',
    'El límite superior de alcanzar este historial completo desde un reparto aleatorio es inferior al 0,01%, por lo que no se ha generado una estrategia.',
  ],
  extraSeat: ['Additional participant', '後ろからの追加参加', '后位追加参与者', 'Participante adicional'],
  sourceBoundary: [
    'Other outside seats fold. The saved earlier-stage continuation is shown.',
    '残りの未参加席はフォールドした前提で、保存済みの前段の続きを表示します。',
    '其他尚未参与的位置弃牌，显示已保存的先前阶段后续策略。',
    'Los demás asientos externos se retiran. Se muestra la continuación guardada de la etapa anterior.',
  ],
  missingDetail: [
    'No saved strategy is available for this exact history. Another position’s range is not used.',
    'この履歴の保存済みレンジはありません。他の局面のレンジでは代用しません。',
    '此确切行动记录没有可用的已保存策略，不会使用其他局面的范围。',
    'No hay una estrategia guardada para este historial exacto. No se utiliza el rango de otra situación.',
  ],
} as const;

export function stage3Copy(key: keyof typeof copy, locale: string = productLocale()) {
  const index = { en: 0, ja: 1, 'zh-CN': 2, es: 3 }[locale] ?? 0;
  return copy[key][index];
}
