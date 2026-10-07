// Read-only adapter: execute the same builders and label/merge helpers as HandReasons.
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

export async function loadScreenAdapter() {
  const server = await createServer({ root: fileURLToPath(new URL('../..', import.meta.url)), configFile: false,
    server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom' });
  try {
    const compute = await server.ssrLoadModule('/src/estimated/postflop-compute.ts');
    const trial = await server.ssrLoadModule('/src/estimated/PostflopTrial.tsx');
    const { buildAdvancedExplanation } = await server.ssrLoadModule('/src/estimated/postflop-advanced.ts');
    const replay = await server.ssrLoadModule('/src/estimated/postflop-trial.ts');
    const { featuresForInput } = await server.ssrLoadModule('/src/estimated/postflop-hand-copy.ts');
    const { handTier, parseCards } = await server.ssrLoadModule('/scripts/postflop-ai/model.ts');
    return { ...compute, ...replay, close: () => server.close(), render(view, selection, explanation, decision, spot, board, locale) {
      const old = globalThis.window;
      // productLocale reads the same persisted preference used by the screen helpers.
      globalThis.window = { localStorage: { getItem: key => key === 'reysonai:locale:v1' ? locale : null } };
      try {
        const labels = trial.labelsFor(decision.node, locale === 'ja' ? decision.labelsJa : decision.labels);
        const merged = trial.mergeSameLabelActions(view, labels);
        const row = merged.rows.find(row => row.hand === selection.hand);
        const combo = selection.cards ? row.combos.find(combo => combo.cards === selection.cards) : null;
        const tiers = combo ? Object.fromEntries(Object.keys(row.tiers).map(tier => [tier, Number(tier === combo.tier)])) : row.tiers;
        const input = { locale, node: view.node, hand: combo?.cards ?? row.hand, actionMix: combo?.mix ?? row.mix,
          tiers, texture: view.texture, explain: explanation, positions: { ip: spot.ip, oop: spot.oop }, board,
          labels, raiseAllIn: Boolean(decision.options?.find(option => option.action === 'raise')?.allIn),
          ...(combo ? { cards: combo.cards } : { combos: row.combos.map(combo => ({ cards: combo.cards, weight: combo.weight ?? combo.reachWeight ?? 0 })) }) };
        const features = featuresForInput(board, input.cards, input.combos);
        const representativeCombo = features?.hole.map(card => '23456789TJQKA'[card >> 2] + 'cdhs'[card & 3]).join('');
        const parsedBoard = parseCards(board, board.length / 2);
        const tierWeights = Object.fromEntries(Object.keys(row.tiers).map(tier => [tier, 0]));
        if (!combo) for (const item of row.combos) { const tier = handTier(parseCards(item.cards, 2), parsedBoard); tierWeights[tier] += item.weight; }
        const expectedTier = combo ? handTier(parseCards(combo.cards, 2), parsedBoard)
          : Object.entries(tierWeights).reduce((best, entry) => entry[1] > best[1] ? entry : best, ['air', -1])[0];
        return { ...buildAdvancedExplanation(input), observedTier: combo?.tier ?? row.tier, expectedTier, representativeCombo, actionMix: input.actionMix, tiers };
      } finally { if (old === undefined) delete globalThis.window; else globalThis.window = old; }
    } };
  } catch (error) { await server.close(); throw error; }
}
