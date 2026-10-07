// Read-only catalog and full one-street geometry probe. No strategy generation/publication.
import { writeFileSync } from 'node:fs';
import { loadMw3Catalog, loadMw3Inputs, mw3Sha } from './mw3-inputs.mjs';
import { probeMw3Flop } from './mw3-tree.mjs';
const args = process.argv.slice(2);
const option = key => { const i = args.indexOf(key); return i < 0 ? null : args[i + 1]; };
const catalog = loadMw3Catalog(), id = option('--spot') ?? catalog.find(spot => spot.reachable).id;
const inputs = loadMw3Inputs(id), probe = probeMw3Flop(inputs.spot);
const report = { schemaVersion: 1, kind: 'mw3_geometry_only_not_strategy_approval', sourceHash: inputs.fingerprint,
  spot: id, uniqueFlopStates: probe.uniqueStates, flopDecisions: probe.decisions.length,
  flopTerminalStates: probe.terminals.length, nodes: probe.nodes,
  catalog: catalog.map(({ seatRows, ...rest }) => rest),
  limitations: ['No policies generated or approved', 'No board or policy audit yet', 'No UI/Agent integration yet',
    'Reach priority is a marginal product, not a joint terminal probability', 'Forced-fold holecards are unmodeled'] };
report.contentHash = mw3Sha(report);
if (option('--output')) writeFileSync(option('--output'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ spot: id, catalog: catalog.length, reachable: catalog.filter(spot => spot.reachable).length,
  sourceHash: report.sourceHash, flopStates: report.uniqueFlopStates, flopDecisions: report.flopDecisions,
  flopTerminals: report.flopTerminalStates, nodes: Object.keys(probe.nodes).length, contentHash: report.contentHash }, null, 2));
