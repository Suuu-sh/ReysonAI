"""Independent stable result schemas. No project modules or poker evaluator imports."""
import hashlib
import json
import math
from decimal import Decimal
from pathlib import Path
from model11_preservation_receipt import (BOARD, PREFIXES, PINS, checked_path, file_record, load_json,
                                         match_record, finite, require, validate_mix, validate_error)

RANKS = 'AKQJT98765432'
HANDS = {a + a for a in RANKS} | {a + b + suffix for i, a in enumerate(RANKS) for b in RANKS[i + 1:] for suffix in ['s', 'o']}
POSITIONS = {'UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'}
ACTIONS = {'check', 'fold', 'call', 'raise', 'bet33', 'bet75', 'bet125', 'allin'}
SOURCE_ACTIONS = {'open', 'fold', 'call', 'three_bet', 'four_bet', 'all_in', 'squeeze', 'limp', 'check', 'raise'}
PATH_ERRORS = {'Flop actions do not reach the requested street', 'Flop actions do not reach a pending decision',
               'turn actions do not reach the requested street', 'river actions do not reach the requested street',
               'Actions do not reach a pending decision'}


def object_fields(value, fields, label):
    require(isinstance(value, dict) and set(fields) <= value.keys(), f'Incomplete {label}')


def number(value, label, *, nonnegative=False, nullable=False):
    require(nullable and value is None or finite(value) and (not nonnegative or value >= 0), f'Invalid {label}')


def chips(value):
    number(value, 'chip amount', nonnegative=True)
    cents = Decimal(str(value)) * 100
    require(cents == cents.to_integral_value(), 'Chip amount is not exact cents')
    return int(cents)


def stable_digest(value):
    # Equality digest, not a JS input fingerprint. Preserve all fields/array order.
    def normal(item):
        if isinstance(item, dict): return {key: normal(val) for key, val in item.items()}
        if isinstance(item, list): return [normal(val) for val in item]
        if type(item) is float and item.is_integer(): return int(item)
        return item
    return hashlib.sha256(json.dumps(normal(value), sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def hand_rows(rows, field=None):
    require(isinstance(rows, list) and len(rows) == 169 and all(isinstance(row, dict) for row in rows), 'Full 169 canonical hand rows required')
    require({row.get('hand') for row in rows} == HANDS, 'Canonical hand universe missing/duplicated')
    for row in rows:
        actions = [field] if field else list(SOURCE_ACTIONS & row.keys())
        require(actions, 'Source row contains no action frequencies')
        for action in actions:
            require(action in row and finite(row[action]) and 0 <= row[action] <= 100, 'Missing/invalid selected action frequency')


class FixtureContracts:
    """Index pinned fixtures once. Store source-row digests, not whole large datasets."""
    def __init__(self, frontend):
        self.frontend = Path(frontend); self.repository = self.frontend.parents[1]
        manifest_path = checked_path(self.frontend, '.local/hu-model11/source-copy.json')
        require(file_record(manifest_path)['sha256'] == PINS['.local/hu-model11/source-copy.json'], 'Fixture index manifest drift')
        manifest = load_json(manifest_path); self.sources = {}; self.any_sources = {}; self.artifacts = {}
        for entry in manifest['copied_files']:
            relative = entry.get('path') or 'apps/frontend/.local/postflop-ai/' + entry['file']
            path = checked_path(self.repository, relative); match_record(path, entry)
            if entry['kind'] == 'frozen-input':
                dataset = path.stem
                for source in load_json(path)['spots']:
                    hand_rows(source['hands']); key = (dataset, source['id'])
                    require(key not in self.sources, 'Duplicate pinned source identity')
                    digest = stable_digest(source); self.sources[key] = digest
                    self.any_sources.setdefault(source['id'], set()).add(digest)
            elif entry['kind'].startswith('legacy-'):
                self.artifacts[path.name] = {'record': {k: entry[k] for k in ['bytes', 'sha256']},
                                            'value': load_json(path)}
        self.game = load_json(self.repository / 'configs/cash-6max-100bb.json')
        self.config = load_json(self.frontend / 'scripts/data/postflop-ai-pilot.json')
        self.catalog = {spot['id']: spot for spot in load_json(self.frontend / 'scripts/data/hu-after-multiway-spots.json')['spots']}
        self.cases = {case['spot']: case for case in load_json(self.frontend / '.local/hu-model11/preservation-design/legacy45-explicit-case-design.json')['cases']}

    def source(self, value, dataset=None):
        digest = stable_digest(value)
        if dataset is None:
            require(digest in self.any_sources.get(value['id'], set()), 'Emitted source differs from pinned raw fixture')
        else:
            require(self.sources.get((dataset, value['id'])) == digest, 'Emitted source differs from selected pinned dataset')

    def legacy(self, row):
        expected = self.cases[row['id']]
        require(row['originalArtifacts'] == expected['originalArtifacts'], 'Original artifact identities differ from pinned design')
        for kind, field in [('candidate', 'candidateMetadata'), ('later_candidate', 'laterMetadata'), ('report', 'savedReport')]:
            entry = self.artifacts[expected['originalArtifacts'][kind]['file']]
            require(row[field] == (entry['value'] if kind == 'report' else entry['value']['metadata']), 'Original saved artifact metadata/report changed')
        require(row['inputs']['fingerprint'] == expected['savedInputFingerprint'], 'Legacy saved input fingerprint differs')


def validate_spot(spot):
    object_fields(spot, ['id', 'kind', 'opener', 'caller', 'aggressor', 'ip', 'oop', 'tree', 'openBb', 'potBb', 'stackBb', 'slug', 'reachable'], 'spot geometry')
    require(isinstance(spot['id'], str) and spot['id'] and isinstance(spot['slug'], str), 'Spot identity missing')
    require(spot['ip'] in POSITIONS and spot['oop'] in POSITIONS and spot['ip'] != spot['oop'], 'Distinct live roles required')
    require(spot['tree'] in ['oop_checks', 'oop_leads'] and spot['reachable'] is True, 'Invalid tree/reachability')
    for key in ['openBb', 'potBb', 'stackBb']: chips(spot[key])


def validate_inputs(inputs, contracts):
    object_fields(inputs, ['spot', 'config', 'fingerprint', 'seatRows'], 'input structure'); spot = inputs['spot']; validate_spot(spot)
    require(isinstance(inputs['config'], dict) and inputs['config'], 'Complete input config required')
    require(isinstance(inputs['fingerprint'], str) and len(inputs['fingerprint']) == 64 and all(c in '0123456789abcdef' for c in inputs['fingerprint']), 'Input fingerprint required')
    require(set(inputs['seatRows']) == {spot['ip'], spot['oop']}, 'Exactly two live conditional ranges required')
    for rows in inputs['seatRows'].values(): hand_rows(rows, 'freq')
    if contracts: require(inputs['config'] == contracts.config, 'Input config differs from pinned source')
    if spot.get('history'):
        require(isinstance(inputs.get('sources'), list) and inputs['sources'], 'Catalog complete source records required')
        for source in inputs['sources']:
            object_fields(source, ['dataset', 'spot'], 'dataset source'); validate_source(source['spot'], contracts, source['dataset'])
    else:
        names = ['opening', 'response']
        if spot['kind'] in ['3bp', '4bp']: names += ['threeBet']
        if spot['kind'] == '4bp': names += ['threeBetResponse']
        for name in names:
            require(name in inputs, f'Missing legacy input source {name}'); validate_source(inputs[name], contracts)


def validate_source(source, contracts, dataset=None):
    object_fields(source, ['id', 'hero', 'effective_stack_bb', 'hands'], 'complete raw source')
    require(source['hero'] in POSITIONS and source['effective_stack_bb'] == 100, 'Source seat/stack geometry invalid')
    hand_rows(source['hands'])
    if contracts: contracts.source(source, dataset)



def validate_public_nodes(table):
    # Independent public action-tree walk only; no equity/policy evaluation.
    spot = table['spot']; street = 'flop'; node = 'oop_first' if spot['tree'] == 'oop_leads' else 'btn_first'
    bettor, raises, ended, folded = None, 0, False, None
    for entry in table['log']:
        if ended:
            require(folded is None and street != 'river', 'Actions continue after terminal fold/river')
            street = 'turn' if street == 'flop' else 'river'; node = street + '_oop_first'
            bettor, raises, ended = None, 0, False
        require(entry['street'] == street and entry['node'] == node, 'Log node differs from declared public action tree')
        action = entry['action']
        if action is None: continue
        role = 'ip' if entry['seat'] == spot['ip'] else 'oop'
        if node.endswith('_first'):
            require(action == 'check' or action.startswith('bet') or action == 'allin' and street == 'river', 'Invalid first-to-act public action')
            if action == 'check':
                if role == 'oop': node = 'btn_first' if street == 'flop' else street + '_ip_first'
                else: ended = True
            else:
                bettor = role; raises = 0; other = 'oop' if role == 'ip' else 'ip'; size = action[3:] if action.startswith('bet') else 'allin'
                require(size in ['33', '75', '125', 'allin'], 'Unknown declared bet label')
                node = (('bb' if role == 'ip' else 'ip') + '_vs_' + size) if street == 'flop' else street + '_' + other + '_vs_' + size
        else:
            require(action in ['fold', 'call', 'raise'], 'Invalid facing public action')
            if action in ['fold', 'call']:
                ended = True
                if action == 'fold': folded = spot['oop'] if role == 'ip' else spot['ip']
            else:
                raises += 1; require(raises <= 4 and not node.endswith('_vs_allin'), 'Raise beyond immutable public tree')
                target = bettor if raises % 2 else ('oop' if bettor == 'ip' else 'ip'); suffix = '' if raises == 1 else str(raises)
                if street == 'flop':
                    who = ('btn' if target == 'ip' else 'bb') if bettor == 'ip' else ('oop' if target == 'oop' else 'ip')
                    node = who + '_vs_raise' + suffix
                else: node = street + '_' + target + '_vs_raise' + suffix
    if folded is not None: require(table['winner'] == folded, 'Fold winner differs from public path')

def validate_table(table, spot, board=None, request=None, pending=None, initial=False, settled=False):
    fields = ['spot', 'stacks', 'invested', 'pot', 'winner', 'lastAggressor', 'log', 'path']
    object_fields(table, fields, 'table snapshot')
    require(set(table) == set(fields) and table['spot'] == spot, 'Table identity/field coverage differs')
    seats = {spot['ip'], spot['oop']}
    require(set(table['stacks']) == seats and set(table['invested']) == seats, 'Both chip ledgers required')
    invested = {seat: chips(table['invested'][seat]) for seat in seats}; stacks = {seat: chips(table['stacks'][seat]) for seat in seats}
    require(all(invested[seat] + stacks[seat] == chips(spot['stackBb']) for seat in seats), 'Stack/invested chip conservation failed')
    require(chips(table['pot']) == chips(spot['potBb']) + sum(invested.values()), 'Pot/invested chip conservation failed')
    require(table['winner'] in [None, 'tie', *seats] and table['lastAggressor'] in [None, *seats], 'Winner/aggressor status invalid')
    require(isinstance(table['path'], dict) and set(table['path']) == {'flop', 'turn', 'river'}, 'All street paths required')
    for path in table['path'].values(): require(isinstance(path, list) and all(action in ACTIONS for action in path), 'Invalid table path')
    require(isinstance(table['log'], list), 'Decision log required')
    histories = {'flop': [], 'turn': [], 'river': []}
    for index, entry in enumerate(table['log']):
        object_fields(entry, ['seat', 'node', 'street', 'boardLen', 'line', 'pot', 'index', 'action', 'canRaise'], 'decision log entry')
        street = entry['street']; require(street in histories and entry['seat'] in seats and isinstance(entry['node'], str), 'Invalid log seat/street/node')
        require(entry['boardLen'] == {'flop': 3, 'turn': 4, 'river': 5}[street], 'Log board length invalid')
        if board is not None: require(entry['boardLen'] <= len(board), 'Log reaches beyond supplied board')
        require(entry['line'] is None if street == 'flop' else entry['line'] in ['checked', 'aggressor', 'defender'], 'Previous-street line missing')
        require(type(entry['canRaise']) is bool and chips(entry['pot']) <= (chips(spot['potBb']) + 2 * chips(spot['stackBb']) if settled else chips(table['pot'])), 'Log pot/raise state invalid')
        require(entry['index'] == len(histories[street]), 'Log street index differs from path')
        node = entry['node']; role = ('ip' if node.startswith(('btn_', 'ip_')) else 'oop') if street == 'flop' else node.split('_')[1]
        require(role in ['ip', 'oop'] and spot[role] == entry['seat'], 'Node role differs from acting seat')
        if entry['action'] is None: require(index == len(table['log']) - 1, 'Only final log decision may be pending')
        else:
            require(entry['action'] in ACTIONS, 'Invalid logged action'); histories[street].append(entry['action'])
    require(histories == table['path'], 'Table paths differ from played log actions')
    validate_public_nodes(table)
    if request is not None:
        require(table['path'] == {street: request.get(street, []) for street in histories}, 'Requested prefix differs from resulting table')
    if pending is not None:
        require(board and len(board) in [3, 4, 5] and table['log'] and table['log'][-1]['action'] is None and table['winner'] is None,
                'Real pending decision required')
        last = table['log'][-1]; require(last['boardLen'] == len(board), 'Pending street differs from board')
        if pending:
            require(last['seat'] == pending['seat'] and last['node'] == pending['node'], 'Pending decision mismatch')
    if initial:
        require(all(value == 0 for value in invested.values()) and not table['log'] and table['winner'] is None and table['lastAggressor'] is None,
                'Initial table is not pristine')



def actions_for(node, config):
    street = 'flop' if not node.startswith(('turn_', 'river_')) else node.split('_')[0]
    if node.endswith('_first'):
        settings = config['later_streets'][street] if street != 'flop' else None
        fractions = settings['bets'] if settings else config['flop_bet_fractions']
        return ['check'] + ['bet' + str(round(fraction * 100)) for fraction in fractions] + (['allin'] if settings and settings['all_in'] else [])
    if node.endswith('_vs_allin'): return ['fold', 'call']
    import re
    match = re.search(r'_vs_raise(\d*)$', node)
    return ['fold', 'call'] if match and int(match.group(1) or 1) >= config.get('max_raises_per_street', 4) else ['fold', 'call', 'raise']

def validate_law(row, value):
    actions = value['actionOrder']; node = value['table']['log'][-1]['node']
    for field in ['base', 'mix', 'observableMix']: validate_mix(row[field], actions)
    context = value['contextStatus']; facts = row['facts']; requirement = value['requirement']
    if context == 'null':
        require(facts is None and requirement is None and row['equity'] is None, 'Null-context outputs must be explicit null')
    else:
        object_fields(requirement, ['potBefore', 'wager', 'call', 'finalPot', 'rake', 'required', 'mdf'], 'requirement')
        for field in requirement: number(requirement[field], f'requirement.{field}', nonnegative=True)
        fields = ['node', 'street', 'role', 'fallback', 'pot_before_bb', 'bet_bb', 'call_bb', 'final_pot_bb', 'rake_bb', 'required_equity', 'equity',
                  'realization', 'realized_equity', 'margin', 'call_share', 'percentile', 'defence_frequency', 'mdf', 'bettor_range', 'faced_action', 'blockers']
        object_fields(facts, fields, 'complete facing facts')
        require(facts['node'] == node and facts['street'] == value['table']['log'][-1]['street'] and facts['role'] in ['ip', 'oop'] and type(facts['fallback']) is bool, 'Facing facts identity/status mismatch')
        nullable = {'equity', 'realized_equity', 'margin', 'call_share', 'percentile', 'defence_frequency'}
        for field in fields[4:18]: number(facts[field], f'facts.{field}', nullable=field in nullable)
        require(facts['fallback'] == (row['equity'] is None), 'Fallback flag differs from ordinary equity status')
        expected_role = 'ip' if value['table']['log'][-1]['seat'] == value['table']['spot']['ip'] else 'oop'
        require(facts['role'] == expected_role, 'Facing facts role differs from pending seat')
        object_fields(facts['bettor_range'], ['value_weight', 'bluff_weight', 'value_pct', 'bluff_pct'], 'bettor facts')
        object_fields(facts['blockers'], ['value_removed_pct', 'bluff_removed_pct'], 'blocker facts')
        for field, val in facts['bettor_range'].items(): number(val, field, nullable=field.endswith('_pct'), nonnegative=True)
        for field, val in facts['blockers'].items(): number(val, field, nonnegative=True)
        object_fields(facts['faced_action'], ['action', 'capped'], 'faced action'); require(type(facts['faced_action']['capped']) is bool, 'Capped flag invalid')
        if facts['fallback'] is False:
            require('mix' in facts, 'Computed facing fact mix missing'); validate_mix(facts['mix'], actions)
        number(row['equity'], 'ordinary equity', nullable=True)
    betting = row['bettingFacts']; is_betting = node.endswith('_first') or 'raise' in actions
    if not is_betting: require(betting is None, 'Nonbetting facts must be null')
    else:
        object_fields(betting, ['node', 'combo_class', 'equity_vs_defender', 'passive', 'actions'], 'betting facts')
        require(betting['node'] == node and betting['combo_class'] in ['value', 'bluff', 'unranked'] and betting['passive'] in ['check', 'call'], 'Betting facts identity invalid')
        number(betting['equity_vs_defender'], 'equity_vs_defender', nullable=True)
        require(isinstance(betting['actions'], list), 'Betting action facts required')
        expected_aggressive = [action for action in actions if action.startswith('bet') or action == 'allin' or action == 'raise' and value['table']['log'][-1]['canRaise']]
        require([entry.get('action') for entry in betting['actions']] == expected_aggressive, 'Aggressive facts coverage differs from legal pending actions')
        seen = set()
        for action in betting['actions']:
            fields = ['action', 'alpha', 'bluffs_per_100_value', 'capped', 'factor', 'value_before', 'bluff_before', 'bluff_share_before',
                      'bluff_share_before_pct', 'value_after', 'bluff_after', 'bluff_share_after', 'bluff_share_after_pct']
            object_fields(action, fields, 'aggressive action facts')
            require(action['action'] in actions and action['action'] not in seen and type(action['capped']) is bool, 'Aggressive fact action invalid')
            seen.add(action['action'])
            for field in fields[1:]:
                if field != 'capped': number(action[field], field, nullable=field not in ['alpha', 'bluffs_per_100_value', 'factor'], nonnegative=True)


def combos(hand):
    ranks = '23456789TJQKA'; a, b = ranks.index(hand[0]), ranks.index(hand[1])
    return [[a * 4 + s, b * 4 + t] for s in range(4) for t in range(4)
            if (s < t if len(hand) == 2 else s == t if hand[2] == 's' else s != t)]


def sampled(rows, draw):
    weighted = [(combo, row['freq'] / 100) for row in rows for combo in combos(row['hand'])
                if row['freq'] > 0 and not any(card in BOARD for card in combo)]
    total = 0.0; cumulative = []
    for combo, weight in weighted: total += weight; cumulative.append(total)
    require(total > 0, 'Sampled preflop range empty'); target = draw * total
    return next((combo for (combo, weight), limit in zip(weighted, cumulative) if limit >= target), weighted[-1][0])


def validate_settlement(row, case):
    spot = case['inputs']['spot']; result = row['result']['value']; before, after = result['beforeSettlement'], result['afterSettlement']
    validate_table(before, spot, BOARD); validate_table(after, spot, BOARD, settled=True)
    require(before['log'] and all(entry['action'] is not None for entry in before['log']), 'Terminal settlement cannot retain pending action')
    require(result['winner'] in ['tie', spot['ip'], spot['oop']] and after['winner'] == result['winner'], 'Settlement winner invalid')
    require(before['winner'] is None or before['winner'] == result['winner'], 'Existing fold winner changed')
    require(before['path'] == after['path'] and before['log'] == after['log'] and before['lastAggressor'] == after['lastAggressor'], 'Settlement changed action history')
    high = max([spot['ip'], spot['oop']], key=lambda seat: before['invested'][seat]); other = spot['oop'] if high == spot['ip'] else spot['ip']
    excess = chips(before['invested'][high]) - chips(before['invested'][other])
    require(chips(after['pot']) == chips(before['pot']) - excess, 'Uncalled excess refund differs')
    for seat in [spot['ip'], spot['oop']]:
        refund = excess if seat == high else 0
        require(chips(after['invested'][seat]) == chips(before['invested'][seat]) - refund and chips(after['stacks'][seat]) == chips(before['stacks'][seat]) + refund, 'Settlement chip refund invalid')
    number(result['rake'], 'rake', nonnegative=True)
    require(result['rake'] == min(after['pot'] * 0.05, 3), 'Settlement rake differs from pinned cash rule')


def validate_schema_stream(rows, mode, contracts):
    case, prefixes, unavailable = None, {}, []
    for row in rows:
        kind = row.get('kind')
        if kind == 'case':
            case = row; prefixes = {}; validate_inputs(row['inputs'], contracts)
            object_fields(row, ['originalArtifacts', 'candidateMetadata', 'laterMetadata', 'savedReport', 'caseNumber'], 'legacy case')
            require(type(row['caseNumber']) is int and 1 <= row['caseNumber'] <= 45, 'Case number invalid')
            require(set(row['originalArtifacts']) == {'candidate', 'later_candidate', 'report'}, 'Three original artifact identities required')
            for artifact in row['originalArtifacts'].values():
                object_fields(artifact, ['file', 'bytes', 'sha256'], 'artifact pin'); require(type(artifact['bytes']) is int and artifact['bytes'] > 0 and len(artifact['sha256']) == 64, 'Artifact pin invalid')
            for field in ['candidateMetadata', 'laterMetadata']:
                object_fields(row[field], ['kind', 'scope', 'spot', 'source_hash', 'policy_hash', 'config_version'], 'original policy metadata')
                require(row[field]['spot'] == row['id'] and row[field]['source_hash'] == row['inputs']['fingerprint'], 'Policy metadata identity invalid')
            object_fields(row['savedReport'], ['kind', 'version', 'simulation_version', 'spot', 'source_hash', 'later_sizing_hash', 'later_policy_hash', 'defence_version', 'policy_hash', 'samples_per_board_profile_seat', 'seed', 'results'], 'full saved report')
            if contracts: contracts.legacy(row)
        elif kind == 'prefix':
            prefixes[row['name']] = row
            if row['result']['status'] == 'error':
                error = row['result']['error']; validate_error(row['result'])
                require(row['result'].get('classification') == 'geometry-path-unavailable-requires-review' and error.get('subtype') == 'DefencePathError' and error['message'] in PATH_ERRORS,
                        'Unexpected replay exception cannot replace coverage')
                unavailable.append({'id': row['id'], 'prefix': row['name'], 'error': error}); continue
            value = row['result']['value']; require('requirement' in value, 'Requirement presence must be explicit')
            validate_table(value['table'], case['inputs']['spot'], row['board'], row['path'], pending={})
            expected_actions = actions_for(value['table']['log'][-1]['node'], case['inputs']['config'])
            require(value['actionOrder'] == expected_actions and value['isFacing'] == ('call' in expected_actions), 'Prefix action/facing contract differs')
            if value['isFacing'] and value['contextStatus'] == 'null':
                log = value['table']['log']; require(len(log) >= 2, 'Facing null context requires prior decision')
                prior = log[-2]; require(prior['street'] == log[-1]['street'] and prior['seat'] != log[-1]['seat'] and not any(value['ranges'][prior['seat']]), 'Unexplained facing null context')
        elif kind == 'law':
            validate_law(row, prefixes[row['prefix']]['result']['value'])
        elif kind == 'error-probe':
            error = row['result']['error']; validate_error(row['result'])
            expected = {
                'duplicate-board': ('Error', 'Duplicate cards'),
                'malformed-board': ('Error', 'Invalid card: Jx'),
                'wrong-board-length': ('Error', 'Invalid card string'),
                'malformed-action': ('Error', 'Illegal flop action at ' + ('oop_first' if case['inputs']['spot']['tree'] == 'oop_leads' else 'btn_first')),
                'terminal-suffix': ('DefencePathError', 'Flop actions do not reach a pending decision'),
            }
            require(row['name'] in expected and (error.get('subtype'), error['message']) == expected[row['name']], 'Error probe changed exception contract')
        elif kind == 'trajectory':
            spot = case['inputs']['spot']; deals = [call for call in row['randomCalls'] if call['purpose'] == 'deal']
            require(len(deals) >= 2 and len(deals) % 2 == 0, 'Deal call pairs required')
            for offset in range(0, len(deals), 2):
                ip = sampled(case['inputs']['seatRows'][spot['ip']], deals[offset]['value']); oop = sampled(case['inputs']['seatRows'][spot['oop']], deals[offset + 1]['value'])
                compatible = not (set(ip) & set(oop)); final = offset == len(deals) - 2
                require(compatible == final, 'Sampling rejection history invalid')
                if final: require(row['hands'] == {spot['ip']: ip, spot['oop']: oop}, 'Private hands differ from actual sampling draws')
            for decision in row['decisions']:
                require(len(decision['board']) in [3, 4, 5] and decision['board'] == BOARD[:len(decision['board'])], 'Actual decision board required')
                validate_table(decision['table'], spot, decision['board'], pending=decision)
                require(decision['actionOrder'] == actions_for(decision['node'], case['inputs']['config']), 'Decision action order differs from configured node')
                validate_mix(decision['base'], decision['actionOrder'])
            validate_settlement(row, case)
            final_log = row['result']['value']['beforeSettlement']['log']
            require(len(final_log) == len(row['decisions']), 'Terminal log differs from complete decision stream')
            for index, decision in enumerate(row['decisions']):
                snapshot = decision['table']['log']
                require(len(snapshot) == index + 1 and snapshot[:-1] == final_log[:index], 'Decision history differs from terminal log')
                recorded = 'call' if decision['sampledLabel'] == 'raise' and snapshot[-1]['canRaise'] is False else decision['sampledLabel']
                require({**snapshot[-1], 'action': recorded} == final_log[index], 'Sampled label differs from engine recorded action')
        elif kind == 'catalog':
            value = row['result']['value']; inputs = value['inputs']; spot = inputs['spot']; validate_inputs(inputs, contracts)
            validate_table(value['initialTable'], spot, initial=True)
            require(set(spot['contributionsBb']) == POSITIONS and sum(chips(amount) for amount in spot['contributionsBb'].values()) == chips(spot['potBb']), 'Contributor sum differs from pot')
            require(all(chips(spot['contributionsBb'][seat]) + chips(spot['stackBb']) == 10000 for seat in [spot['ip'], spot['oop']]), 'Live source stacks differ from contributions')
            sources = {(source['dataset'], source['spot']['id']): source['spot'] for source in inputs['sources']}
            for seat, factors in spot['ranges'].items():
                for dataset, identity, action in factors: hand_rows(sources[(dataset, identity)]['hands'], action)
                if seat not in inputs['seatRows']: continue
                maps = [{row['hand']: row[action] for row in sources[(dataset, identity)]['hands']} for dataset, identity, action in factors]
                expected = []
                for hand in maps[0]:
                    value0 = 100.0
                    for factor in maps: value0 = value0 * factor[hand] / 100
                    expected.append({'hand': hand, 'freq': value0})
                require(inputs['seatRows'][seat] == expected, 'Conditional frequencies differ from source products')
            if contracts:
                require(spot == contracts.catalog[row['id']] and value['gameConfig'] == contracts.game, 'Catalog/config differs from pinned source')
        elif kind == 'case-complete':
            gaps = row['coverage']['gaps']; require(all(isinstance(gap, str) and gap for gap in gaps), 'Explicit meaningful gap strings required')
    return {'unexpected_coverage_errors': False, 'unavailable_controls_requiring_review': unavailable,
            'fixture_contract_bound': contracts is not None,
            'fingerprint_validation': 'legacy-design-exact; catalog syntax-and-full-pair-equality, not independently rehashed'}
