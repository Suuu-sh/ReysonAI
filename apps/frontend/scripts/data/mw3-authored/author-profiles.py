"""Offline Astra-authored profile expansion, for the 15 NEW three-player SRPs.

The literal spot entries are strategy judgments, not derived from the pilot, HU
policies, equities, reachPriority, or MDF. Shared percentage-point transforms are
explicit same-game priors; each seat/spot has its own board and response anchors.
This emits compact AUTHOR DATA only. It never probes, compiles or saves policy.
"""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[3]
ORDER = ['dry_high','dry_mid','dry_low','wet_high','wet_mid','wet_low','monotone_high','monotone_mid','monotone_low','paired_high','paired_mid','paired_low']
BASE = ['monster','strong','draw','medium','air']
ROLES = ['first','middle','last']
FACES = ['33','75','125','raise1','raise2','allin']
def rows(text):
    return [[int(x) for x in row.split()] for row in text.split(';')]
def seat(flop, later_turn, later_river, defence, raise_base, later_defence, notes):
    """Three-street direct anchors: no multiplication of another spot's mix."""
    return dict(flop=rows(flop), turn=rows(later_turn), river=rows(later_river),
                defend=rows(defence), raise_base=rows(raise_base),
                later_defence=rows(later_defence), notes=notes)

# Per-seat later anchors are [checked, aggressor, defender] at its ORIGINAL
# three-player position. Every role, including middle caller in no-blind pots,
# is assigned separately. Reduced-player contexts are expanded below explicitly.
SPECS = []
def add(id, priority, topology, rationale, seats):
    SPECS.append(dict(id=id,priority=priority,topology=topology,rationale=rationale,seats=seats))

add('HJ_open_BTN_call_BB_call',2,'bb',
    'HJ opens 312 combos, BTN flats 121.6 and BB overcalls 244.4. HJ high-card initiative is narrower than CO; BTN has more pocket-pair mass and less offsuit breadth than the pilot. BB still has broad suited support and a small KK trap.', [
seat('25 7 7 2 1;29 9 10 2 1;33 13 13 3 1;32 7 12 2 1;38 9 17 2 1;42 12 20 3 1;17 5 6 1 1;20 6 8 1 1;22 7 9 1 1;26 6 4 1 1;30 8 5 2 1;33 10 6 2 1',
     '34 15 15 4 2;62 34 26 5 4;17 7 7 2 1','30 13 0 3 2;65 27 0 3 3;14 5 0 1 1',
     '99 86 49 26 3;97 65 32 10 1;93 43 17 3 0;91 30 19 3 0;84 15 10 1 0;86 25 13 1 0',
     '35 3 7 1 0;41 2 5 0 0;34 1 2 0 0;30 1 2 0 0','-2 -6 -9 -6 -1;-7 -16 -49 -11 -2',
     'BB cold responses are constrained by both HJ and a tighter BTN flat; low-board draw leads remain possible, premium leads stay check-heavy.'),
seat('60 54 24 15 9;58 48 25 10 7;48 35 24 7 4;63 42 29 7 4;63 37 31 5 3;58 30 28 4 2;37 25 16 4 2;35 22 16 3 2;31 18 14 2 1;56 32 12 10 6;52 28 12 8 4;45 22 11 6 3',
     '44 24 20 7 4;70 42 30 7 6;20 9 9 2 1','42 22 0 4 3;71 36 0 4 5;17 6 0 1 1',
     '100 90 53 29 3;99 72 35 13 1;96 50 19 5 0;94 35 22 4 0;87 18 11 1 0;88 29 15 2 0',
     '39 4 8 1 0;44 3 6 0 0;39 1 3 0 0;34 1 3 0 0','-2 -6 -11 -7 -1;-7 -19 -53 -12 -2',
     'HJ is the c-bettor after BB checks. Retain high-dry strong value, but suppress low/wet air into the BTN range.'),
seat('71 61 36 21 16;73 59 39 19 15;70 52 37 17 12;72 51 38 9 7;76 50 42 9 8;72 47 40 8 6;47 34 23 7 5;49 34 24 7 5;46 30 23 6 4;65 40 21 15 10;66 38 22 14 9;62 34 20 12 7',
     '64 43 33 14 10;78 54 38 11 10;52 28 22 6 5','65 39 0 10 7;80 48 0 7 8;52 23 0 4 5',
     '100 90 54 29 3;99 72 37 13 1;96 49 21 4 0;94 34 24 4 0;87 18 13 1 0;89 29 16 2 0',
     '36 4 8 1 0;42 3 6 0 0;36 1 3 0 0;31 1 3 0 0','-2 -6 -11 -7 -1;-7 -19 -54 -12 -2',
     'BTN can stab after two checks, but its HJ-flat range is appreciably less offsuit-heavy than BTN versus CO. Preserve small-pair realization without treating position as action closure.')])

add('HJ_open_CO_call_BB_call',3,'bb',
    'CO flat is 83.1 combos versus BTN 121.6: 38.7% are 22-JJ pairs and only 3.6% suited connectors. BB overcall contracts to 225.2. HJ cannot treat CO checks as a wide BTN check; mid/low boards meet denser pair support.', [
seat('23 6 6 1 1;27 8 9 2 1;31 11 12 2 1;30 6 11 1 1;35 8 15 2 1;39 10 18 2 1;16 4 5 1 0;18 5 7 1 1;20 6 8 1 1;25 5 4 1 1;28 7 5 1 1;31 9 6 2 1',
 '32 14 13 4 2;60 32 24 5 3;16 6 6 1 1','29 12 0 2 1;63 25 0 2 3;13 4 0 1 0',
 '99 84 46 24 2;97 63 29 8 0;92 40 15 2 0;90 28 17 2 0;82 13 8 0 0;84 22 11 1 0',
 '34 3 6 0 0;39 2 4 0 0;33 1 2 0 0;29 1 2 0 0','-2 -7 -9 -6 -1;-8 -17 -46 -10 -2','BB has less small-hand freedom against HJ plus a pair-heavy CO; retain suited backstops without HU-width defence.'),
seat('59 52 22 13 8;55 44 23 9 5;45 31 21 6 3;61 40 27 6 3;60 34 28 4 2;54 27 25 3 2;35 23 14 3 2;32 19 14 2 1;29 16 12 2 1;54 30 11 9 5;49 26 11 7 3;43 20 10 5 2',
 '41 22 18 6 3;67 39 27 6 5;19 8 8 2 1','39 20 0 4 2;68 33 0 3 4;16 5 0 1 1',
 '100 89 51 27 2;99 70 33 11 1;95 47 17 4 0;93 32 20 3 0;85 16 10 1 0;87 26 13 1 0',
 '38 4 7 1 0;43 3 5 0 0;37 1 2 0 0;32 1 2 0 0','-2 -7 -11 -6 -1;-7 -19 -51 -11 -2','Opener c-bets more selectively than against BTN: CO has 38.7% 22-JJ mass, especially affecting middle and low boards.'),
seat('67 58 30 18 12;70 57 32 18 11;69 53 30 17 9;69 48 31 8 5;73 48 34 8 6;71 46 32 7 5;44 31 18 6 3;46 31 20 6 3;43 29 18 5 3;63 39 17 13 8;65 38 18 13 7;62 35 17 11 6',
 '61 41 27 12 7;75 51 32 9 8;49 26 18 5 4','62 37 0 8 5;77 44 0 6 6;49 22 0 3 4',
 '100 91 50 31 2;99 74 33 15 1;96 51 18 5 0;94 36 21 4 0;88 19 11 1 0;90 30 14 2 0',
 '37 4 7 1 0;43 3 5 0 0;37 1 2 0 0;32 1 2 0 0','-2 -6 -11 -8 -1;-7 -20 -50 -14 -2','CO last-seat probing uses its pair-heavy flat; lower pure-air probing than the wider BTN case, while preserving strong overpair continues.')])

add('UTG_open_BTN_call_BB_call',4,'bb',
 'UTG is 212.5 combos with 8.5% QQ+ and 14.1% 77-JJ. BTN is 93.7 with 4.2% QQ+; BB is 199.4 and retains KK10%. High-board concentration is stronger than HJ/CO, but low-board BB connectivity cannot be copied to the tight BTN.', [
seat('21 6 6 1 1;25 8 9 2 1;31 11 13 2 1;28 6 10 1 1;34 8 15 2 1;40 10 18 2 1;15 4 5 1 0;17 5 7 1 1;20 6 8 1 1;24 5 4 1 1;28 7 5 1 1;32 9 6 2 1',
 '31 13 13 3 2;59 30 23 4 3;15 6 6 1 1','27 11 0 2 1;61 23 0 2 3;12 4 0 1 0',
 '99 82 44 22 2;96 60 28 7 0;91 38 14 2 0;89 25 16 2 0;81 12 7 0 0;83 21 10 1 0',
 '33 3 6 0 0;38 2 4 0 0;32 1 2 0 0;28 1 2 0 0','-3 -8 -9 -6 -1;-9 -18 -44 -10 -2','BB protects its retained KK and suited board coverage, but calls into UTG and BTN are markedly tighter than versus CO.'),
seat('65 59 21 13 7;58 46 22 8 4;43 29 19 5 2;64 43 25 5 2;58 32 25 3 2;49 23 22 2 1;36 25 13 3 1;31 19 12 2 1;25 14 10 1 1;57 34 10 9 4;47 25 10 6 2;38 18 8 4 1',
 '41 24 16 5 3;69 43 25 5 4;20 9 7 2 1','40 22 0 3 2;71 38 0 3 4;17 6 0 1 1',
 '100 92 48 29 2;99 77 31 14 1;97 55 17 5 0;95 39 20 4 0;89 21 10 1 0;91 33 13 2 0',
 '40 5 7 1 0;45 3 5 0 0;40 2 2 0 0;35 1 2 0 0','-2 -6 -10 -7 -1;-6 -18 -48 -13 -2','UTG high-dry c-bet value is retained; low/wet air and medium bets are small because premium concentration does not confer a low-board nut advantage.'),
seat('66 57 28 17 10;69 55 31 16 9;66 48 29 14 7;68 47 30 7 4;71 45 34 7 5;67 42 31 6 4;43 30 18 5 3;45 29 19 5 3;40 26 17 4 2;62 38 16 12 7;63 35 17 11 6;58 30 15 9 4',
 '59 39 25 10 6;74 49 31 8 7;48 25 18 5 4','59 35 0 7 5;76 42 0 5 6;47 21 0 3 4',
 '100 90 48 29 2;98 71 31 13 1;95 48 17 4 0;93 32 19 3 0;86 16 9 1 0;88 27 12 1 0',
 '35 4 6 1 0;40 2 4 0 0;35 1 2 0 0;30 1 2 0 0','-3 -7 -10 -7 -1;-8 -20 -48 -13 -2','BTN retains 20% AA/KK flats but is only 93.7 combos; aggression after two checks is less air-driven and pressure defence respects UTG value.')])

add('UTG_open_CO_call_BB_call',5,'bb',
 'CO versus UTG is 68.8 combos: 31.0% 77-JJ, 11.8% 22-66, no suited-connector flats. BB remains 186.1 with 11.0% low pairs. UTG c-bets through a very pair-heavy CO; last-seat low-board value and high-card air behave differently.', [
seat('20 5 5 1 0;24 7 8 1 1;30 10 12 2 1;27 5 9 1 0;33 7 14 1 1;39 9 17 2 1;14 3 4 1 0;16 4 6 1 0;19 5 7 1 1;23 4 3 1 0;27 6 4 1 1;31 8 5 1 1',
 '29 12 12 3 1;57 28 21 4 2;14 5 5 1 0','25 10 0 2 1;59 21 0 2 2;11 3 0 1 0',
 '98 80 42 20 1;95 58 26 6 0;90 35 12 1 0;87 23 14 1 0;79 10 6 0 0;81 19 9 0 0',
 '32 2 5 0 0;37 2 3 0 0;31 1 1 0 0;27 1 1 0 0','-3 -8 -9 -5 -1;-9 -18 -42 -9 -1','BB must pass both UTG and a narrow CO caller; maintain nut-support leads on low connected boards, not a broad range lead.'),
seat('62 56 19 11 6;54 41 19 7 3;39 25 17 4 1;61 39 23 4 2;54 28 23 2 1;45 20 20 1 1;33 22 11 2 1;28 16 10 1 1;23 12 8 1 0;53 31 9 8 3;43 22 8 5 2;35 15 7 3 1',
 '38 22 14 4 2;66 40 23 4 3;19 8 6 1 1','37 20 0 3 1;68 35 0 2 3;16 5 0 1 0',
 '100 91 46 27 2;99 75 29 12 1;96 52 15 4 0;94 36 18 3 0;87 19 9 1 0;89 30 11 1 0',
 '39 4 6 1 0;44 3 4 0 0;39 1 2 0 0;34 1 2 0 0','-2 -7 -10 -6 -1;-7 -19 -46 -12 -2','UTG has premium overpairs, but CO pocket-pair density discourages automatic high-frequency barrels or thin medium bets.'),
seat('61 53 21 15 7;65 53 23 15 6;65 50 21 14 5;63 43 22 6 3;68 44 25 6 4;66 42 22 5 3;39 27 13 4 2;41 27 15 4 2;37 24 13 3 1;59 35 12 10 5;61 34 13 10 4;58 31 11 8 3',
 '56 37 20 9 4;71 46 25 7 5;45 23 14 4 3','56 33 0 6 3;73 39 0 4 4;44 19 0 2 3',
 '100 91 43 31 1;99 74 27 15 1;96 51 14 5 0;94 35 17 4 0;87 19 8 1 0;89 29 10 2 0',
 '36 4 5 1 0;41 2 3 0 0;36 1 1 0 0;31 1 1 0 0','-3 -7 -9 -8 -1;-8 -20 -43 -14 -1','CO lacks suited-connector flats but has dense mid/low pairs. Probe value on low boards rather than importing BTN semi-bluff density.')])

add('UTG_open_HJ_call_BB_call',6,'bb',
 'HJ first-flat is the tightest at 56.7 combos, with 36.5% 77-JJ and no suited connectors. BB177 has only 4.7% 22-66, substantially below the other BB cases. Both caller compositions limit easy low-board assumptions.', [
seat('19 5 5 1 0;22 7 7 1 1;25 9 10 1 1;26 5 9 1 0;30 7 12 1 1;34 8 15 1 1;13 3 4 1 0;15 4 5 1 0;17 5 6 1 0;22 4 3 1 0;25 6 4 1 1;28 7 4 1 1',
 '27 11 10 2 1;55 26 19 3 2;13 5 5 1 0','24 9 0 1 1;57 20 0 1 2;10 3 0 1 0',
 '98 79 40 18 1;94 56 24 5 0;89 33 11 1 0;86 21 13 1 0;78 9 5 0 0;80 17 8 0 0',
 '31 2 5 0 0;36 1 3 0 0;30 1 1 0 0;26 0 1 0 0','-3 -8 -8 -5 -1;-9 -18 -40 -8 -1','BB has less small-pair coverage here and faces the densest HJ pair flat. Suppress low/wet leads relative to UTG-BTN-BB.'),
seat('61 54 18 10 5;51 38 17 6 2;36 22 15 3 1;59 36 21 3 1;51 25 21 2 1;42 18 18 1 0;31 20 10 2 1;26 14 9 1 0;21 10 7 1 0;51 29 8 7 3;40 20 7 4 1;32 13 6 2 1',
 '36 20 12 3 2;64 37 21 3 3;18 7 5 1 0','35 18 0 2 1;66 32 0 2 2;15 4 0 1 0',
 '100 90 44 25 1;99 73 27 10 0;95 49 13 3 0;93 34 16 2 0;86 17 8 0 0;88 28 10 1 0',
 '38 4 6 0 0;43 2 4 0 0;38 1 2 0 0;33 1 1 0 0','-3 -7 -9 -6 -1;-8 -19 -44 -11 -1','UTG first raiser is middle postflop. Small high-dry value bets remain, but HJ low-board overpair/set density caps automatic aggression.'),
seat('58 50 17 13 5;62 51 20 13 5;63 50 18 13 4;60 41 19 5 2;65 43 21 5 3;64 42 19 4 2;36 25 11 3 1;39 25 12 3 1;35 22 10 2 1;56 33 10 9 4;59 33 11 9 3;57 30 9 7 2',
 '53 35 17 8 3;68 43 22 6 4;42 21 12 3 2','53 31 0 5 2;70 36 0 3 3;41 17 0 2 2',
 '100 92 40 32 1;99 76 25 16 0;97 54 13 5 0;95 38 16 4 0;89 21 8 1 0;91 32 10 2 0',
 '37 4 5 0 0;42 2 3 0 0;37 1 1 0 0;32 1 1 0 0','-3 -7 -8 -9 -1;-8 -20 -40 -15 -1','HJ may be last but is not a wide button range: no suited connectors, many 77-JJ. Use small probes with pair value and few pure-air stabs.')])

add('CO_open_BTN_call_SB_call',7,'sb',
 'SB overcall is only 37.2 combos/16 hands, with 43.5% 77-JJ and zero 22-66/connectors. It retains AA/KK15% each. CO and BTN are unchanged sources versus the pilot, but their third opponent is a premium-protected pocket-pair/broadway caller, not the broad BB.', [
seat('28 10 8 3 1;31 13 10 3 1;35 17 11 4 1;34 10 13 2 1;38 12 15 3 1;41 15 15 3 1;22 7 7 1 0;24 9 9 2 1;26 11 9 2 1;29 8 5 2 1;32 11 6 2 1;35 14 6 3 1',
 '36 22 13 6 2;64 43 23 8 3;19 11 7 2 1','33 19 0 5 2;66 36 0 6 3;16 8 0 1 1',
 '100 94 58 33 2;99 79 39 17 1;97 59 22 6 0;96 43 25 5 0;91 25 13 2 0;93 36 16 3 0',
 '41 5 8 1 0;47 4 6 0 0;43 2 3 0 0;38 2 3 0 0','-2 -5 -12 -8 -1;-6 -17 -58 -15 -2','SB has protected premiums and no small-pair/SC tail. Check most hands OOP but do not inherit BB low-board weakness or BB draw assumptions.'),
seat('58 50 23 13 8;52 41 22 8 5;42 28 18 5 2;59 36 25 5 2;54 28 24 3 2;45 20 21 2 1;34 20 13 3 1;29 15 12 2 1;24 11 10 1 0;51 27 10 8 4;43 20 9 5 2;35 14 7 3 1',
 '37 20 17 5 3;64 35 25 5 4;18 7 7 1 1','35 17 0 3 2;65 29 0 2 3;15 5 0 1 0',
 '100 87 48 24 2;98 65 29 9 0;94 42 14 3 0;91 28 17 2 0;83 13 8 0 0;85 23 11 1 0',
 '35 3 6 0 0;40 2 4 0 0;34 1 2 0 0;29 1 2 0 0','-3 -8 -10 -6 -1;-9 -20 -48 -10 -2','CO c-bets less air/medium than against BB. A checked SB retains trapped premiums; low-board overpairs belong heavily to SB as well.'),
seat('65 54 29 18 12;64 48 30 15 10;58 38 25 11 6;64 40 29 7 4;63 34 31 6 4;57 27 26 4 2;40 26 17 5 2;38 21 17 4 2;32 16 14 2 1;57 32 15 11 6;53 26 15 9 4;45 19 12 6 2',
 '54 32 23 9 5;68 42 29 7 6;44 19 15 3 3','53 28 0 5 3;68 35 0 4 4;41 15 0 2 2',
 '99 86 46 25 2;97 64 29 10 0;93 40 14 3 0;90 27 16 2 0;82 12 7 0 0;84 21 10 1 0',
 '33 3 6 0 0;38 2 4 0 0;32 1 2 0 0;27 1 1 0 0','-3 -8 -10 -6 -1;-9 -20 -46 -11 -2','BTN two-check stabs are restricted because SB checks a dense overpair range. Position does not erase that range or turn a pending BB/SB response into closure.')])

add('HJ_open_BTN_call_SB_call',8,'sb',
 'SB34.6/14 hands is 42.5% 77-JJ with 22.5% offsuit Ax and AA/KK15%. HJ312 and BTN121.6 are tighter than CO/BTN. No SB 22-66 or connectors means low-board overpair structure, not hidden low two-pair coverage.', [
seat('27 9 8 2 1;30 12 10 3 1;34 16 11 3 1;33 9 12 2 1;37 11 14 2 1;40 14 14 3 1;21 6 7 1 0;23 8 8 1 1;25 10 8 2 1;28 7 5 1 1;31 10 6 2 1;34 13 6 2 1',
 '34 20 12 5 2;62 40 22 7 3;18 10 6 2 1','31 17 0 4 1;64 33 0 5 3;15 7 0 1 0',
 '100 92 55 31 2;99 76 36 15 1;96 55 20 5 0;94 40 22 4 0;88 22 11 1 0;90 33 14 2 0',
 '40 4 7 1 0;45 3 5 0 0;41 2 2 0 0;36 1 2 0 0','-2 -6 -11 -8 -1;-7 -18 -55 -14 -2','Retain strong SB overpair continues against HJ, but high-board medium pocket pairs cannot defend merely because the preflop range was tight.'),
seat('56 48 21 11 6;49 38 20 7 4;38 25 17 4 2;56 33 23 4 2;51 25 22 3 1;42 18 19 2 1;32 18 12 2 1;27 14 10 1 1;22 10 8 1 0;49 25 9 7 3;40 18 8 4 2;32 12 6 2 1',
 '35 18 15 4 2;62 32 23 4 3;17 6 6 1 1','33 15 0 2 1;63 26 0 2 3;14 4 0 1 0',
 '100 86 45 22 1;98 63 27 8 0;93 40 13 2 0;90 26 15 2 0;81 12 7 0 0;83 21 9 1 0',
 '34 3 5 0 0;39 2 3 0 0;33 1 1 0 0;28 1 1 0 0','-3 -8 -9 -5 -1;-9 -20 -45 -9 -1','HJ high-card initiative survives, but both calls are relatively protected. Avoid interpreting SB check as a broad, capped BB check.'),
seat('62 51 26 15 9;62 46 28 13 8;55 36 23 9 5;61 37 26 6 3;61 31 29 5 3;54 25 24 3 2;38 24 15 4 2;36 19 15 3 1;30 14 12 2 1;54 30 13 9 5;50 24 13 7 3;42 17 11 5 2',
 '51 29 20 7 4;65 39 26 6 5;41 17 13 3 2','50 25 0 4 2;65 32 0 3 4;38 13 0 2 2',
 '99 84 43 23 1;96 61 26 8 0;92 37 12 2 0;89 24 14 1 0;80 10 6 0 0;82 19 8 0 0',
 '32 3 5 0 0;37 2 3 0 0;31 1 1 0 0;26 1 1 0 0','-3 -8 -9 -5 -1;-9 -20 -43 -10 -1','BTN flats less broadly than versus CO and encounters SB overpairs. Small probes dominate; wet-board air stabs are rare.')])

add('HJ_open_CO_call_SB_call',10,'sb',
 'SB26.5/12 hands is 52.1% 77-JJ and 12.5% QQ+, with no connectors/small pairs. CO83.1 is itself pair-heavy. All three ranges have dense medium/high pairs; a low board is not automatically a two-check steal opportunity.', [
seat('25 8 7 2 0;29 12 9 2 1;34 17 10 3 1;31 8 11 1 0;36 11 13 2 1;40 15 13 2 1;20 6 6 1 0;23 8 7 1 0;25 11 7 1 1;27 7 4 1 0;31 10 5 1 1;35 14 5 2 1',
 '32 20 10 4 1;60 41 19 6 2;17 10 5 1 0','29 17 0 3 1;62 34 0 4 2;14 7 0 1 0',
 '100 93 51 31 1;99 77 33 15 0;96 56 18 5 0;94 41 20 4 0;89 23 10 1 0;91 34 12 2 0',
 '40 4 6 0 0;46 3 4 0 0;42 2 2 0 0;37 1 2 0 0','-2 -6 -10 -8 -1;-7 -18 -51 -14 -1','SB protection is mostly pocket-pair value. Do not invent suited-connector semibluffs or map KK to the BB pilot zero support.'),
seat('52 44 18 9 5;44 33 17 5 3;32 20 14 3 1;52 29 20 3 1;45 21 19 2 1;35 14 16 1 0;29 16 10 2 0;23 11 8 1 0;18 8 7 1 0;45 22 8 5 2;35 15 7 3 1;27 10 5 2 0',
 '31 16 12 3 1;58 29 20 3 2;16 5 5 1 0','29 13 0 2 1;59 23 0 1 2;13 3 0 1 0',
 '99 83 42 19 1;96 59 24 6 0;91 35 11 1 0;87 22 13 1 0;78 9 5 0 0;80 18 7 0 0',
 '32 2 5 0 0;37 1 3 0 0;31 1 1 0 0;26 0 1 0 0','-3 -8 -9 -5 -1;-10 -20 -42 -8 -1','HJ must get through protected SB and pair-heavy CO. More checking than the BTN variant, especially low/wet and paired shapes.'),
seat('56 46 20 12 6;57 44 22 11 5;54 38 19 9 3;55 32 20 4 2;56 29 23 4 2;51 24 19 2 1;33 21 12 3 1;32 17 12 2 1;27 13 10 1 0;50 27 10 7 3;47 22 11 6 2;40 17 9 4 1',
 '47 27 16 5 3;61 36 22 4 4;38 15 11 2 1','46 23 0 3 1;61 29 0 2 3;35 11 0 1 1',
 '99 85 39 25 1;97 63 23 10 0;93 39 11 2 0;89 25 13 2 0;81 12 6 0 0;83 21 8 1 0',
 '33 3 4 0 0;38 2 3 0 0;32 1 1 0 0;27 1 1 0 0','-3 -8 -8 -6 -1;-9 -20 -39 -11 -1','CO last can value-probe pairs, but checking SB holds concentrated overpairs. Air attempts and weak draw calls stay small.')])

add('UTG_open_BTN_call_SB_call',11,'sb',
 'UTG212.5 and BTN93.7 face SB24.1/10 hands: 48.5% 77-JJ, 17.4% QQ+, AA/KK20%. SB has no 22-66/connectors. This is much more protected than UTG-BTN-BB, while BTN still has the broadest first-flat among UTG cases.', [
seat('24 8 6 2 0;28 11 8 2 1;33 16 9 3 1;30 8 10 1 0;35 10 12 2 1;39 14 12 2 1;19 5 5 1 0;22 7 6 1 0;24 10 6 1 1;26 6 4 1 0;30 9 5 1 1;34 13 5 2 1',
 '30 18 9 4 1;58 38 18 5 2;16 9 5 1 0','27 15 0 3 1;60 31 0 4 2;13 6 0 1 0',
 '100 91 48 29 1;98 74 30 13 0;95 52 16 4 0;92 37 18 3 0;86 20 9 1 0;88 30 11 1 0',
 '39 4 6 0 0;44 3 4 0 0;40 2 2 0 0;35 1 2 0 0','-3 -6 -10 -7 -1;-8 -18 -48 -13 -1','SB preserves premium traps, with dry-low overpair value. It is not a source of speculative low-board raises.'),
seat('56 48 17 9 4;45 33 16 5 2;31 19 13 2 1;54 31 19 3 1;45 21 18 2 1;34 13 15 1 0;28 17 9 2 0;22 11 8 1 0;17 7 6 1 0;46 25 7 5 2;35 16 6 3 1;25 10 5 1 0',
 '32 18 11 3 1;61 33 19 3 2;17 6 5 1 0','30 15 0 2 1;63 28 0 1 2;14 4 0 1 0',
 '100 87 40 22 1;98 66 23 8 0;94 43 11 2 0;91 28 13 2 0;83 13 6 0 0;85 23 8 1 0',
 '35 3 5 0 0;40 2 3 0 0;35 1 1 0 0;30 1 1 0 0','-3 -7 -8 -6 -1;-9 -19 -40 -10 -1','UTG does have high-card premium advantage, but SB and BTN premium support makes generic high-board range betting inappropriate.'),
seat('57 47 21 12 6;56 41 23 10 5;49 31 19 7 3;55 33 22 4 2;53 27 24 3 2;46 20 20 2 1;33 20 12 3 1;30 15 12 2 1;24 11 10 1 0;49 26 10 7 3;44 20 10 5 2;36 13 8 3 1',
 '46 25 17 5 3;60 34 22 4 4;37 14 11 2 1','45 21 0 3 1;60 27 0 2 3;34 10 0 1 1',
 '98 81 38 20 1;95 57 22 6 0;90 33 10 1 0;86 20 12 1 0;77 8 5 0 0;79 16 7 0 0',
 '30 2 4 0 0;35 1 3 0 0;29 1 1 0 0;24 0 1 0 0','-3 -8 -8 -5 -1;-10 -20 -38 -9 -1','BTN should not turn two checks from UTG and premium SB into a wide steal. Strong private value and selected draws dominate bets.')])

add('UTG_open_CO_call_SB_call',15,'sb',
 'UTG212.5 / CO68.8 / SB17.9. SB has only eight supported hands and 82.2% QQ+ or 77-JJ; CO is 42.8% 22-JJ. Air/probe and low-board draw assumptions are especially constrained.', [
seat('23 8 5 1 0;27 11 7 2 0;33 17 8 2 1;29 8 9 1 0;34 10 11 1 1;39 15 11 2 1;18 5 4 1 0;21 7 5 1 0;24 10 5 1 0;25 6 3 1 0;29 9 4 1 0;34 14 4 2 1',
 '29 18 8 3 1;57 39 16 5 1;15 9 4 1 0','26 15 0 2 0;59 32 0 3 1;12 6 0 1 0',
 '100 92 44 28 1;98 75 27 12 0;95 53 14 3 0;93 38 16 3 0;87 21 8 1 0;89 31 10 1 0',
 '39 4 5 0 0;45 3 3 0 0;41 2 1 0 0;36 1 1 0 0','-3 -6 -9 -7 -1;-8 -18 -44 -12 -1','Only eight SB hands are supported. Keep range-level premium protection, but no fictitious low-connector or weak suited-draw tail.'),
seat('52 43 14 7 3;39 27 13 3 1;25 15 10 1 0;49 27 16 2 1;39 17 15 1 0;28 10 12 1 0;25 14 7 1 0;18 8 6 1 0;13 5 5 0 0;41 21 6 4 1;29 12 5 2 0;20 7 4 1 0',
 '28 15 9 2 1;56 28 16 2 1;15 5 4 1 0','26 12 0 1 0;58 23 0 1 1;12 3 0 0 0',
 '99 84 36 18 0;96 61 20 5 0;91 37 9 1 0;88 23 10 1 0;79 10 4 0 0;81 19 6 0 0',
 '32 2 4 0 0;37 1 2 0 0;32 1 1 0 0;27 0 1 0 0','-3 -8 -8 -5 0;-10 -20 -36 -8 0','UTG encounters two dense pair ranges; high-dry selective value remains but low/paired c-bet air approaches zero.'),
seat('51 41 16 9 4;52 39 18 9 3;47 32 15 7 2;49 28 17 3 1;49 23 19 2 1;44 18 16 1 0;28 16 9 2 0;26 12 9 1 0;21 8 7 1 0;44 22 8 5 2;40 17 8 4 1;33 12 6 2 0',
 '42 22 13 4 2;56 30 18 3 3;33 11 8 1 1','41 18 0 2 1;56 23 0 1 2;30 8 0 1 0',
 '98 82 34 22 0;95 59 19 7 0;91 35 8 1 0;87 22 10 1 0;79 10 4 0 0;81 18 6 0 0',
 '30 2 3 0 0;35 1 2 0 0;30 1 1 0 0;25 0 1 0 0','-3 -8 -7 -6 0;-10 -20 -34 -10 0','CO last has pair value but very little low suited reach. Both opponents check protected overpairs, so pure-air pressure is minimal.')])

add('UTG_open_HJ_call_SB_call',16,'sb',
 'UTG212.5 / HJ56.7 / SB17.9. SB source is identical to UTG-CO-SB, but HJ caller is narrower and 47.1% 22-JJ; its suited connectors are absent. Identical SB source does not make the opponents or strategy identical.', [
seat('22 7 5 1 0;26 10 6 1 0;32 16 7 2 0;28 7 8 1 0;33 9 10 1 0;38 14 10 2 0;17 4 4 1 0;20 6 5 1 0;23 9 5 1 0;24 5 3 1 0;28 8 3 1 0;33 13 4 1 0',
 '27 17 7 2 1;55 37 15 4 1;14 8 4 1 0','24 14 0 2 0;57 30 0 3 1;11 5 0 1 0',
 '100 91 42 26 0;98 73 25 10 0;94 50 12 2 0;91 35 14 2 0;85 18 7 0 0;87 28 8 1 0',
 '38 3 4 0 0;43 2 3 0 0;39 1 1 0 0;34 1 1 0 0','-3 -6 -9 -6 0;-8 -18 -42 -11 0','Same eight SB hands as the CO-caller path, but the narrower HJ response makes marginal continues and early leads slightly less attractive.'),
seat('50 40 13 6 2;36 24 12 2 1;22 13 9 1 0;47 24 15 2 0;36 15 14 1 0;25 8 11 0 0;23 12 6 1 0;16 7 5 0 0;11 4 4 0 0;38 19 5 3 1;26 10 4 1 0;17 6 3 1 0',
 '26 13 8 2 0;54 25 14 2 1;14 4 3 0 0','24 10 0 1 0;56 20 0 1 1;11 2 0 0 0',
 '99 82 34 16 0;95 58 18 4 0;90 34 8 0 0;86 20 9 0 0;77 8 3 0 0;79 16 5 0 0',
 '31 2 4 0 0;36 1 2 0 0;31 1 1 0 0;26 0 1 0 0','-3 -8 -7 -4 0;-10 -20 -34 -7 0','UTG is squeezed between two highly selected ranges. Preserve checks with good hands; a tight opener is not licensed to bet every high-card board.'),
seat('47 38 13 7 3;49 37 15 7 2;45 32 12 6 1;46 25 14 2 1;47 22 16 2 1;42 18 13 1 0;25 14 7 1 0;24 11 8 1 0;19 7 6 0 0;41 20 6 4 1;38 16 7 3 1;31 11 5 2 0',
 '39 20 10 3 1;53 27 16 2 2;30 10 7 1 0','38 16 0 1 0;53 20 0 1 1;27 7 0 0 0',
 '99 84 31 24 0;96 62 17 8 0;92 38 7 2 0;88 24 9 1 0;81 12 3 0 0;83 21 5 1 0',
 '31 2 3 0 0;36 1 2 0 0;31 1 1 0 0;26 0 1 0 0','-3 -8 -7 -6 0;-10 -20 -31 -11 0','HJ last has concentrated pocket pairs but no wide button air/connector supply. Its low-board pair value can probe selectively, not indiscriminately.')])

add('HJ_open_CO_call_BTN_call',9,'no_blind',
 'No blind remains: HJ FIRST is opener/c-bettor, CO MIDDLE is first caller, BTN LAST is tight second caller (45 combos, 36.0% 77-JJ, 9.3% QQ+). This is not BB lead / HJ c-bet / wide BTN stab. The 9BB pot includes both dead blinds.', [
seat('57 40 19 10 6;50 32 17 7 4;39 23 14 4 2;56 30 22 4 2;49 24 21 3 1;39 17 18 2 1;32 19 12 3 1;27 14 10 2 1;21 10 8 1 0;47 25 10 6 3;39 18 8 4 2;31 12 6 2 1',
 '41 23 18 5 3;65 37 27 5 4;18 8 7 1 1','39 20 0 3 2;67 31 0 3 3;15 5 0 1 0',
 '100 87 47 25 2;98 67 29 10 0;94 44 15 3 0;92 29 17 2 0;84 14 8 0 0;86 24 11 1 0',
 '36 3 6 0 0;41 2 4 0 0;35 1 2 0 0;30 1 2 0 0','-3 -7 -10 -6 -1;-8 -19 -47 -11 -2','HJ acts first as the raiser. Its selective c-bet frequency is materially above a blind donk, while both callers remain behind.'),
seat('48 27 16 7 3;50 30 18 7 3;52 32 15 7 2;49 22 18 3 1;52 25 20 3 2;51 27 17 2 1;28 16 10 2 1;30 17 11 2 1;29 18 9 1 0;43 21 8 4 2;46 23 9 4 1;45 23 7 3 1',
 '39 24 15 4 2;62 38 23 4 3;17 7 6 1 0','36 20 0 2 1;63 31 0 2 2;14 4 0 1 0',
 '99 87 43 27 1;97 67 25 11 0;94 43 12 3 0;90 28 14 2 0;82 13 6 0 0;84 23 9 1 0',
 '34 3 5 0 0;39 2 3 0 0;33 1 1 0 0;28 1 1 0 0','-3 -7 -9 -7 -1;-9 -20 -43 -12 -1','CO probe follows an opener check with a tight BTN still behind. It is NOT a c-bet; low-board pair value is selective and cold draw calls remain cautious.'),
seat('66 49 22 11 6;68 52 24 12 6;68 54 22 12 5;67 38 24 4 2;69 41 26 4 3;68 43 23 3 2;39 26 14 3 1;41 28 15 3 1;39 29 13 2 1;56 32 11 7 3;59 35 12 7 3;58 36 10 6 2',
 '55 35 20 7 4;72 46 28 6 5;44 21 13 3 2','53 30 0 4 2;73 38 0 3 4;41 16 0 2 1',
 '100 92 46 31 1;99 76 28 15 0;96 53 14 5 0;94 38 17 4 0;88 21 8 1 0;90 32 11 2 0',
 '38 4 5 0 0;44 3 3 0 0;39 1 2 0 0;34 1 2 0 0','-2 -6 -10 -8 -1;-7 -18 -46 -14 -1','BTN second caller has no small pairs/connectors and retains premiums. Its two-check bet is value-oriented; do not copy a 145.8-combo BTN first-flat stab.')])

add('UTG_open_CO_call_BTN_call',12,'no_blind',
 'UTG FIRST212.5 / CO MIDDLE68.8 / BTN LAST30.8. BTN overcall is 41.9% 77-JJ and 14.6% QQ+, with zero 22-66/connectors. CO and BTN have different call sources; neither is a blind defender.', [
seat('53 36 14 7 4;43 26 12 4 2;29 17 10 2 1;51 25 16 3 1;41 18 15 2 1;30 11 12 1 0;28 16 9 2 1;21 10 7 1 0;15 6 6 0 0;43 22 7 4 2;31 14 6 2 1;22 9 4 1 0',
 '36 19 13 3 2;61 32 21 3 3;16 6 5 1 0','34 16 0 2 1;63 27 0 2 2;13 4 0 1 0',
 '100 86 40 22 1;98 65 23 8 0;93 41 11 2 0;90 26 13 1 0;81 12 6 0 0;83 21 8 1 0',
 '34 3 5 0 0;39 2 3 0 0;34 1 1 0 0;29 1 1 0 0','-3 -7 -9 -6 -1;-9 -19 -40 -10 -1','UTG is OOP to BOTH callers from the start, so first-node c-bet is selective. Strong high cards support value, not BB-style near-zero leading.'),
seat('42 23 12 5 2;45 26 14 5 2;47 29 12 5 1;43 18 14 2 1;46 21 16 2 1;46 24 13 1 0;24 13 8 1 0;26 14 9 1 0;25 16 7 1 0;37 18 6 3 1;40 20 7 3 1;39 21 5 2 0',
 '34 21 11 3 1;57 34 18 3 2;15 6 4 1 0','31 17 0 2 0;58 27 0 1 1;12 3 0 0 0',
 '99 84 35 24 0;96 63 20 9 0;92 38 9 2 0;88 24 11 1 0;79 11 5 0 0;81 20 7 0 0',
 '31 2 4 0 0;36 1 2 0 0;31 1 1 0 0;26 0 1 0 0','-3 -7 -8 -6 0;-9 -20 -35 -11 0','CO first caller can probe after UTG check but BTN is a dense premium/mid-pair overcaller, so medium/air probes and cold raises are restrained.'),
seat('60 44 17 9 4;63 48 19 10 4;65 52 17 11 3;60 33 19 3 1;63 37 21 3 2;65 41 18 2 1;34 23 11 2 0;36 25 12 2 1;35 28 10 1 0;51 29 8 5 2;54 32 9 5 2;55 35 7 5 1',
 '49 32 15 5 2;67 43 23 4 4;39 19 10 2 1','47 27 0 3 1;68 35 0 2 3;36 14 0 1 0',
 '100 93 40 32 0;99 78 24 16 0;97 55 12 5 0;95 40 14 4 0;89 23 7 1 0;91 34 9 2 0',
 '39 4 4 0 0;45 3 3 0 0;40 2 1 0 0;35 1 1 0 0','-2 -6 -9 -9 0;-7 -18 -40 -15 0','BTN second call is only30.8 combos and has41.9% 77-JJ. Low-board value probes can be frequent within strong tier, with little accompanying air.')])

add('UTG_open_HJ_call_BTN_call',13,'no_blind',
 'UTG FIRST212.5 / HJ MIDDLE56.7 / BTN LAST33.8. HJ flat is 47.1%22-JJ and BTN second call has23.1% offsuit Ax plus36.4%77-JJ. This differs from UTG-CO-BTN both in caller role and Ax-versus-pair support.', [
seat('51 34 13 6 3;40 23 11 3 1;26 15 9 1 0;49 23 15 2 1;38 16 14 1 0;27 9 11 1 0;26 14 8 1 0;19 9 6 1 0;13 5 5 0 0;40 20 6 3 1;28 12 5 2 0;19 7 4 1 0',
 '34 17 12 3 1;59 30 20 3 2;15 5 4 1 0','32 14 0 2 0;61 25 0 1 2;12 3 0 0 0',
 '100 85 38 20 1;97 63 22 7 0;92 39 10 1 0;89 24 12 1 0;80 10 5 0 0;82 19 7 0 0',
 '33 3 5 0 0;38 2 3 0 0;33 1 1 0 0;28 1 1 0 0','-3 -7 -8 -5 -1;-9 -19 -38 -9 -1','UTG starts as raiser OOP. HJ pair concentration demands even more low-board checks; first is not a blind donk profile.'),
seat('38 20 10 4 1;42 24 12 4 1;45 28 10 5 1;39 16 12 1 0;43 20 14 2 1;44 23 11 1 0;21 11 6 1 0;24 13 7 1 0;23 15 6 0 0;33 16 5 2 0;37 19 6 2 1;37 20 4 2 0',
 '31 19 9 2 1;54 31 16 2 1;14 5 3 1 0','28 15 0 1 0;55 24 0 1 1;11 2 0 0 0',
 '99 86 31 26 0;97 66 18 10 0;93 42 8 2 0;89 27 10 2 0;81 13 4 0 0;83 23 6 1 0',
 '32 2 3 0 0;37 1 2 0 0;32 1 1 0 0;27 0 1 0 0','-3 -7 -7 -7 0;-9 -20 -31 -12 0','HJ middle is a tight first caller with BTN still behind, not an opener. It has real low-board pair value but little semibluff breadth.'),
seat('61 46 18 10 5;62 47 20 10 4;62 49 17 10 3;60 34 19 3 1;62 36 21 3 2;61 38 18 2 1;35 24 11 2 1;35 24 12 2 1;33 25 10 1 0;52 31 8 6 2;53 32 9 5 2;52 33 7 4 1',
 '49 31 16 5 3;67 42 24 4 4;39 18 11 2 1','47 26 0 3 1;68 34 0 2 3;36 13 0 1 1',
 '100 91 41 30 1;99 75 25 14 0;96 52 12 4 0;94 37 15 3 0;87 20 7 1 0;89 31 10 1 0',
 '37 4 5 0 0;43 3 3 0 0;38 1 1 0 0;33 1 1 0 0','-2 -6 -9 -8 -1;-7 -18 -41 -14 -1','BTN second caller has more offsuit Ax than in UTG-CO-BTN. Retain slightly more high-board value and air availability, not a wide BTN first-flat strategy.')])

add('UTG_open_HJ_call_CO_call',14,'no_blind',
 'UTG FIRST212.5 / HJ MIDDLE56.7 / CO LAST24.6. CO second call is only11 hands,18.3%QQ+ and37.8%77-JJ, with no 22-66/connectors. Both callers are tightly selected; CO last is not a broad button analogue.', [
seat('48 31 11 5 2;36 20 9 2 1;22 12 7 1 0;46 20 13 2 0;34 13 12 1 0;23 7 9 0 0;23 12 7 1 0;16 7 5 0 0;10 4 4 0 0;36 17 5 2 1;24 10 4 1 0;15 5 3 0 0',
 '30 15 10 2 1;55 27 17 2 2;13 4 3 0 0','28 12 0 1 0;57 22 0 1 1;10 2 0 0 0',
 '99 82 34 17 0;95 59 19 5 0;90 34 8 1 0;86 20 10 0 0;77 8 4 0 0;79 16 6 0 0',
 '31 2 4 0 0;36 1 2 0 0;31 1 1 0 0;26 0 1 0 0','-3 -8 -8 -4 0;-10 -20 -34 -8 0','The earliest three seats produce the most protected no-blind caller pair. UTG still c-bets first, but ranges justify abundant checks on low/wet boards.'),
seat('34 17 8 3 1;38 21 10 3 1;41 25 8 4 0;35 13 10 1 0;39 17 12 1 0;40 20 9 1 0;18 9 5 1 0;21 11 6 1 0;20 13 5 0 0;29 14 4 2 0;33 17 5 2 0;33 18 3 1 0',
 '27 16 7 2 0;50 28 13 2 1;12 4 3 0 0','24 12 0 1 0;51 21 0 1 0;9 2 0 0 0',
 '98 83 27 22 0;95 62 15 8 0;91 38 6 1 0;87 23 8 1 0;78 10 3 0 0;80 19 5 0 0',
 '30 2 3 0 0;35 1 2 0 0;30 1 1 0 0;25 0 1 0 0','-3 -8 -6 -6 0;-10 -20 -27 -10 0','HJ middle must pass CO premium traps. Very small air probes; continue strongest pair/draw classes with cold response risk explicit.'),
seat('56 42 14 8 3;59 45 16 9 3;61 49 14 10 2;56 30 16 2 1;59 34 18 3 1;61 38 15 2 0;31 21 9 2 0;33 23 10 2 0;33 26 8 1 0;47 27 6 4 1;50 30 7 4 1;51 33 5 4 0',
 '45 29 12 4 2;63 40 20 3 3;35 17 9 1 1','43 24 0 2 1;64 32 0 1 2;32 12 0 1 0',
 '100 94 35 33 0;99 80 21 17 0;97 57 10 6 0;95 42 12 4 0;90 25 6 1 0;92 36 8 2 0',
 '40 4 4 0 0;46 3 2 0 0;41 2 1 0 0;36 1 1 0 0','-2 -6 -8 -9 0;-7 -18 -35 -15 0','CO last overcaller retains20%AA/KK and has no speculative tail. High strong-tier continues come from its overpair-heavy source, not last-seat license to float.')])

# Additional individually authored spots follow in the same explicit format.


# Independent high-value anchors: each role row holds nuts flop [dry,wet,mono,paired],
# nuts turn [checked,aggressor,defender], nuts river [checked,aggressor,defender],
# absolute flop, absolute turn [checked,aggressor,defender], absolute river
# [checked,aggressor,defender], then current/absolute raise bias.
SPECIALS = {
'HJ_open_BTN_call_BB_call': rows('34 48 33 31 48 81 24 61 87 23 26 43 75 21 79 94 40 -3 -2;76 80 68 62 63 88 29 73 92 28 59 58 83 24 87 97 44 1 0;86 90 80 76 83 92 75 90 96 81 77 81 90 70 96 99 93 0 1'),
'HJ_open_CO_call_BB_call': rows('32 45 31 29 46 78 22 58 84 21 24 41 72 19 76 92 37 -4 -3;73 76 65 59 59 84 27 69 89 25 56 54 80 22 83 95 40 0 -1;82 85 75 72 79 88 71 86 92 76 72 76 86 65 92 97 88 -1 0'),
'UTG_open_BTN_call_BB_call': rows('30 44 29 27 44 76 21 56 82 20 22 39 70 18 74 90 35 -5 -3;77 77 64 59 60 86 28 71 91 27 57 55 82 23 85 97 43 2 1;81 85 74 70 78 87 70 85 92 75 71 75 85 64 91 97 87 -1 0'),
'UTG_open_CO_call_BB_call': rows('28 42 27 25 42 73 19 53 79 18 20 37 67 16 71 88 32 -6 -4;74 73 60 55 56 82 25 67 87 24 53 51 78 21 81 94 39 1 0;77 81 70 67 74 83 66 81 88 71 67 71 81 60 87 94 83 -2 -1'),
'UTG_open_HJ_call_BB_call': rows('26 38 25 23 39 70 18 50 76 17 18 34 64 15 68 85 30 -7 -5;71 69 57 52 53 79 23 64 84 22 50 48 75 19 78 91 36 0 -1;74 78 67 64 71 80 63 78 85 68 64 68 78 57 84 91 80 -3 -2'),
'CO_open_BTN_call_SB_call': rows('39 46 36 34 53 84 28 65 89 27 30 47 77 24 83 96 45 2 1;70 73 61 55 54 80 23 65 85 22 51 49 75 19 79 92 35 -2 -1;76 80 68 62 72 82 64 78 86 68 64 68 78 57 86 92 80 -3 -2'),
'HJ_open_BTN_call_SB_call': rows('37 43 34 32 51 81 26 62 86 25 28 45 74 22 80 93 42 1 0;67 69 58 52 51 77 21 62 82 20 48 46 72 17 76 89 32 -3 -2;72 76 64 59 68 78 60 74 82 64 60 64 74 53 82 89 76 -4 -3'),
'HJ_open_CO_call_BTN_call': rows('67 73 60 55 56 82 23 70 88 27 52 50 76 19 84 94 43 0 0;55 63 46 44 48 73 21 59 79 20 40 42 67 17 73 87 33 -3 -2;78 82 68 65 74 84 64 82 90 70 66 69 80 57 90 96 83 2 1'),
'HJ_open_CO_call_SB_call': rows('35 41 32 30 49 80 25 60 85 24 27 43 73 21 78 92 41 1 0;63 64 54 47 47 73 19 58 78 18 44 42 68 15 72 85 29 -4 -3;68 71 59 54 63 73 55 69 77 59 55 59 69 48 77 84 71 -5 -4'),
'UTG_open_BTN_call_SB_call': rows('34 40 31 29 47 78 24 58 83 23 26 41 71 20 76 90 40 0 -1;65 65 53 47 48 75 20 60 80 19 45 43 70 16 74 87 31 -3 -2;67 70 58 52 62 72 54 68 76 58 54 58 68 47 76 83 70 -5 -4'),
'UTG_open_CO_call_BTN_call': rows('63 67 54 49 52 78 21 66 84 24 48 46 72 17 80 91 39 -1 -1;50 58 41 39 43 68 18 54 74 17 36 37 62 14 68 82 29 -4 -3;74 78 63 60 69 80 59 77 86 65 62 64 76 52 86 93 78 2 1'),
'UTG_open_HJ_call_BTN_call': rows('61 64 51 46 49 75 20 63 81 23 46 43 69 16 77 88 37 -2 -2;47 54 38 36 40 65 17 51 71 16 33 34 59 13 65 79 27 -5 -4;73 76 61 58 68 78 58 76 84 63 61 63 74 51 85 91 76 1 0'),
'UTG_open_HJ_call_CO_call': rows('58 60 47 42 45 71 17 59 77 20 42 39 65 13 73 84 33 -3 -3;43 50 34 32 36 61 14 47 67 13 29 30 55 10 61 75 23 -6 -5;69 73 57 55 64 75 55 72 81 60 58 59 71 48 81 88 73 1 0'),
'UTG_open_CO_call_SB_call': rows('33 39 30 28 46 77 23 57 82 22 25 40 70 19 75 89 39 0 -1;60 59 48 42 43 70 17 55 75 16 40 38 65 13 69 82 27 -5 -4;62 65 53 47 57 67 49 63 71 53 49 53 63 42 71 78 65 -6 -5'),
'UTG_open_HJ_call_SB_call': rows('32 38 29 27 44 75 22 55 80 21 24 38 68 18 73 87 37 -1 -2;57 55 44 38 39 66 15 51 71 14 36 34 61 11 65 78 24 -6 -5;58 61 49 43 53 63 45 59 67 49 45 49 59 38 67 74 61 -7 -6'),
}
# Shared-board call caution is explicit per seat; it is not applied to other tiers.
SHARED_CAUTION = {
'HJ_open_BTN_call_BB_call':[-1,-1,-2], 'HJ_open_CO_call_BB_call':[-2,-2,-2],
'UTG_open_BTN_call_BB_call':[-3,-2,-3], 'UTG_open_CO_call_BB_call':[-4,-3,-4], 'UTG_open_HJ_call_BB_call':[-5,-4,-4],
'CO_open_BTN_call_SB_call':[0,-3,-4], 'HJ_open_BTN_call_SB_call':[-1,-4,-5], 'HJ_open_CO_call_SB_call':[-2,-5,-5],
'UTG_open_BTN_call_SB_call':[-2,-5,-6], 'UTG_open_CO_call_SB_call':[-3,-6,-6], 'UTG_open_HJ_call_SB_call':[-4,-7,-7],
'HJ_open_CO_call_BTN_call':[-3,-3,-2], 'UTG_open_CO_call_BTN_call':[-5,-4,-3],
'UTG_open_HJ_call_BTN_call':[-5,-4,-4], 'UTG_open_HJ_call_CO_call':[-6,-5,-4],
}


def build_profile(spec, sources, pins):
    opening, responses, multiway = sources
    o, rest = spec['id'].split('_open_'); c, z = rest.replace('_call','').split('_')
    relevant = [next(s for s in opening['spots'] if s['id']==o+'_open'),
                next(s for s in responses['spots'] if s['id']==c+'_vs_'+o),
                next(s for s in multiway['spots'] if s['opener']==o and s['callers']==[c] and s['hero']==z)]
    post = [s for s in ['SB','BB','UTG','HJ','CO','BTN'] if s in [o,c,z]]
    actions = ['open','call','call']; metrics = {}
    for s, src, act in zip([o,c,z],relevant,actions):
        supported = [row for row in src['hands'] if row[act]>0]
        metrics[s] = dict(sourceId=src['id'],weightedCombos=round(sum(row[act]/100*(6 if len(row['hand'])==2 else 4 if row['hand'][-1]=='s' else 12) for row in supported),4),
                          supportHands=len(supported),support=[{'hand':r['hand'],'freq':r[act]} for r in supported])
    pin=pins[spec['id']]
    assert pin['seats']==post and pin['opener']==o and pin['firstCaller']==c and pin['secondCaller']==z
    assert pin['potBb']==7.5+(0 if 'SB' in post else .5)+(0 if 'BB' in post else 1)
    assert all(len(row)==19 for row in SPECIALS[spec['id']])
    special={}
    for role,row in zip(ROLES,SPECIALS[spec['id']]):
        special[role]=dict(nutsFlop=row[:4],nutsTurn=row[4:7],nutsRiver=row[7:10],absoluteFlop=row[10],absoluteTurn=row[11:14],absoluteRiver=row[14:17],nutsRaiseBias=row[17],absoluteRaiseBias=row[18])
    return dict(version=1,status='authored_pending_compile_and_independent_review',model='gpt-6-astra',
                id=spec['id'],priority=spec['priority'],sourceFingerprint=pin['sourceFingerprint'],seats=post,
                roleMap=dict(zip(post,ROLES)),semantics={r:('opener' if s==o else 'first_caller' if s==c else 'second_caller') for s,r in zip(post,ROLES)},
                potBb=7.5+(0 if 'SB' in post else .5)+(0 if 'BB' in post else 1),stackBb=97.5,
                topology=spec['topology'],rationale=spec['rationale'],sourceRanges=metrics,specialValues=special,
                sharedCallCaution=dict(zip(ROLES,SHARED_CAUTION[spec['id']])),
                authorAnchors={r:entry for r,entry in zip(ROLES,spec['seats'])})

def main():
    sources=[json.loads((ROOT/'src/estimated'/f'{n}.json').read_text()) for n in ['opening-ranges','preflop-ranges','multiway-responses']]
    pins={s['spotId']:s for s in json.loads((ROOT/'.local/postflop-ai/mw3/stable-source-fingerprints.json').read_text())['spots']}
    profiles=[build_profile(spec,sources,pins) for spec in sorted(SPECS,key=lambda s:s['priority'])]
    for p in profiles:
        for r,v in p['authorAnchors'].items():
            assert len(v['flop'])==12 and len(v['turn'])==3 and len(v['river'])==3 and len(v['defend'])==6 and len(v['raise_base'])==4 and len(v['later_defence'])==2,(p['id'],r)
            assert all(len(row)==5 for key in ['flop','turn','river','defend','raise_base','later_defence'] for row in v[key])
    directory=Path(__file__).with_name('profiles');directory.mkdir(exist_ok=True)
    for profile in profiles:
        (directory/(profile['id'].lower().replace('_','-')+'.json')).write_text(json.dumps(profile,indent=2)+'\n')
    target=ROOT/'.local/postflop-ai/mw3/new-author-profiles-summary.json'
    target.write_text(json.dumps({'schema':1,'tierOrder':BASE,'flopTextures':ORDER,'roles':ROLES,'faces':FACES,'profiles':profiles},indent=2)+'\n')
    print(f'Wrote {len(profiles)} author profiles only; no saved policies, Node, probe or gate.')
if __name__=='__main__':main()
