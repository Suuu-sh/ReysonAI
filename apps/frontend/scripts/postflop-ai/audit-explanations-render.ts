// Read-only adapter: execute the same builders and label/merge helpers as HandReasons.
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

export async function loadScreenAdapter() : Promise<any> {
  const server = await createServer({ root: fileURLToPath(new URL('../..', import.meta.url)), configFile: false,
    server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom' });
  try {
    const compute = await server.ssrLoadModule('/src/estimated/postflop-compute.ts');
    const trial = await server.ssrLoadModule('/src/estimated/PostflopTrial.tsx');
    const { buildAdvancedExplanation } = await server.ssrLoadModule('/src/estimated/postflop-advanced.ts');
    const replay = await server.ssrLoadModule('/src/estimated/postflop-trial.ts');
    const { featuresForInput } = await server.ssrLoadModule('/src/estimated/postflop-hand-copy.ts');
    const { handTier, parseCards } = await server.ssrLoadModule('/scripts/postflop-ai/model.ts');
    return { ...compute, ...replay, close: () : any => server.close(), render(view?: any, selection?: any, explanation?: any, decision?: any, spot?: any, board?: any, locale?: any) : any {
      const globals = globalThis as typeof globalThis & { window?: any };
      const old = globals.window;
      // productLocale reads the same persisted preference used by the screen helpers.
      globals.window = { localStorage: { getItem: (key: any) : any => key === 'reysonai:locale:v1' ? locale : null } };
      try {
        const labels = trial.labelsFor(decision.node, locale === 'ja' ? decision.labelsJa : decision.labels);
        const merged = trial.mergeSameLabelActions(view, labels);
        const row = merged.rows.find((row: any) : any => row.hand === selection.hand);
        const combo = selection.cards ? row.combos.find((combo: any) : any => combo.cards === selection.cards) : null;
        const tiers = combo ? Object.fromEntries(Object.keys(row.tiers).map((tier: any) : any => [tier, Number(tier === combo.tier)])) : row.tiers;
        const input: any = { locale, node: view.node, hand: combo?.cards ?? row.hand, actionMix: combo?.mix ?? row.mix,
          tiers, texture: view.texture, explain: explanation, positions: { ip: spot.ip, oop: spot.oop }, board,
          labels, raiseAllIn: Boolean(decision.options?.find((option: any) : any => option.action === 'raise')?.allIn),
          ...(combo ? { cards: combo.cards } : { combos: row.combos.map((combo: any) : any => ({ cards: combo.cards, weight: combo.weight ?? combo.reachWeight ?? 0 })) }) };
        const features = featuresForInput(board, input.cards, input.combos);
        const representativeCombo = features?.hole.map((card: any) : any => '23456789TJQKA'[card >> 2] + 'cdhs'[card & 3]).join('');
        const parsedBoard = parseCards(board, board.length / 2);
        const tierWeights = Object.fromEntries(Object.keys(row.tiers).map((tier: any) : any => [tier, 0]));
        if (!combo) for (const item of row.combos) { const tier = handTier(parseCards(item.cards, 2), parsedBoard); tierWeights[tier] += item.weight; }
        const expectedTier = combo ? handTier(parseCards(combo.cards, 2), parsedBoard)
          : Object.entries<any>(tierWeights).reduce((best?: any, entry?: any) : any => entry[1] > best[1] ? entry : best, ['air', -1])[0];
        return { ...buildAdvancedExplanation(input), observedTier: combo?.tier ?? row.tier, expectedTier, representativeCombo, actionMix: input.actionMix, tiers };
      } finally { if (old === undefined) delete globals.window; else globals.window = old; }
    } };
  } catch (error: any) { await server.close(); throw error; }
}
