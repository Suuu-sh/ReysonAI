#!/usr/bin/env python3
"""Reproduce only canonical-flop enumeration/classification/selection. No poker evaluation.

Read the exact historical Git blobs, not mutable working files. --write creates a
new manifest exclusively; the default verifies its complete bytes. Only stdlib.
"""
import argparse
import hashlib
import itertools
import json
from pathlib import Path
import subprocess

BASE = "4b6b39a613afe72a2362f85aa93a305cd61b3586"
CONTRACT = "hu-validation-stratified-later-v1"
SEED = "hu-model11-later-stratified-v1-20261006"
TARGET = 100
RANKS, SUITS = "23456789TJQKA", "cdhs"
SHAPES, HEIGHTS = ["dry", "wet", "monotone", "paired"], ["high", "mid", "low"]
PREFIX = "apps/frontend/scripts/postflop-ai/"
SOURCE_PATHS = [PREFIX + "flop-isomorphism.mjs", PREFIX + "model.mjs",
                "apps/frontend/scripts/data/postflop-ai-pilot.json"]
EXPECTED_COUNTS = {
    "dry_high": 148, "dry_mid": 67, "dry_low": 13,
    "wet_high": 516, "wet_mid": 273, "wet_low": 127,
    "monotone_high": 166, "monotone_mid": 85, "monotone_low": 35,
    "paired_high": 135, "paired_mid": 99, "paired_low": 91,
}


def digest(value):
    return hashlib.sha256(value).hexdigest()


def blob(root, path):
    return subprocess.run(["git", "-C", str(root), "show", BASE + ":" + path],
                          check=True, capture_output=True).stdout


def source_records(root):
    data = {path: blob(root, path) for path in SOURCE_PATHS}
    model = data[PREFIX + "model.mjs"].decode()
    for literal in [
        'export const SHAPES = ["dry", "wet", "monotone", "paired"];',
        'export const HEIGHTS = ["high", "mid", "low"];',
        'if (new Set(rs).size < 3) return "paired";',
        'if (new Set(ss).size === 1) return "monotone";',
        'if (new Set(ss).size === 2 || sorted[2] - sorted[0] <= 4) return "wet";',
        'return top >= 10 ? "high" : top >= 7 ? "mid" : "low";',
    ]:
        assert literal in model, "Frozen classification differs"
    config = json.loads(data[SOURCE_PATHS[-1]])
    assert config["samples_per_board_profile_seat"] == 10000
    assert config["seed"] == "solveaai-postflop-ai-v1"
    assert len(config["boards"]) == 12
    return [{"path": path, "bytes": len(data[path]), "sha256": digest(data[path])}
            for path in SOURCE_PATHS]


def card_text(card):
    return RANKS[card >> 2] + SUITS[card & 3]


def canonical(cards):
    """Port of canonicalFlop's S4 minimum numeric tuple (not string minimum)."""
    return min(tuple(sorted(((card & ~3) + permutation[card & 3] for card in cards),
                            key=lambda card: (-(card >> 2), card & 3)))
               for permutation in itertools.permutations(range(4)))


def classify(cards):
    rs, ss = [card >> 2 for card in cards], {card & 3 for card in cards}
    shape = ("paired" if len(set(rs)) < 3 else "monotone" if len(ss) == 1
             else "wet" if len(ss) == 2 or max(rs) - min(rs) <= 4 else "dry")
    height = "high" if max(rs) >= 10 else "mid" if max(rs) >= 7 else "low"
    return shape + "_" + height


def rank_key(domain, *parts):
    # UTF-8, NUL separators, lowercase SHA-256; full input breaks a hash tie.
    text = "\0".join([SEED, domain, *parts])
    return digest(text.encode()), text


def allocate(capacities, target):
    """Even rounds over seeded strata; skip exhausted strata and redistribute."""
    assert target <= sum(capacities.values()) and target >= 0
    order = sorted((key for key, size in capacities.items() if size),
                   key=lambda key: rank_key("allocation", key))
    counts = {key: 0 for key in order}
    while sum(counts.values()) < target:
        for key in order:
            if counts[key] < capacities[key]:
                counts[key] += 1
                if sum(counts.values()) == target:
                    break
    return order, counts


def make_manifest(root):
    sources = source_records(root)
    # All C(52,3)=22,100 raw flops, with exactly the existing canonical definition.
    catalog = {}
    for raw in itertools.combinations(range(52), 3):
        cards = canonical(raw)
        catalog["".join(map(card_text, cards))] = cards
    assert len(catalog) == 1755
    pools = {shape + "_" + height: [] for shape in SHAPES for height in HEIGHTS}
    for board_id, cards in catalog.items():
        pools[classify(cards)].append(board_id)
    capacities = {key: len(pool) for key, pool in pools.items()}
    assert capacities == EXPECTED_COUNTS, capacities
    allocation_order, quotas = allocate(capacities, TARGET)
    # Verify redistribution without creating any poker/policy calculation.
    _, tiny = allocate({"small": 1, "large": 7, "empty": 0}, 6)
    assert tiny == {"small": 1, "large": 5} or tiny == {"large": 5, "small": 1}
    assert sorted(quotas.values()) == [8] * 8 + [9] * 4
    strata, selected = [], []
    for key, pool in pools.items():
        chosen = sorted(pool, key=lambda board: rank_key("board", key, board))[:quotas[key]]
        ids = sorted(chosen)  # ASCII list order only; not the sampling criterion.
        strata.append({"stratum": key, "population": len(pool), "selected": len(ids),
                       "boardIds": ids})
        selected.extend(ids)
    selected.sort()
    assert len(selected) == len(set(selected)) == TARGET
    assert all(board in catalog for board in selected)
    universe = ("\n".join(sorted(catalog)) + "\n").encode()
    selected_lines = ("\n".join(selected) + "\n").encode()
    return {
        "kind": "hu-stratified-later-board-selection", "version": 1,
        "validationContract": CONTRACT,
        "status": "selection-only-not-numerical-validation",
        "sourceSnapshot": {"commit": BASE, "files": sources},
        "universe": {"kind": "canonical-suit-isomorphic-flops", "count": 1755,
                     "sha256": digest(universe), "hashEncoding": "ASCII-sorted IDs, LF after each ID"},
        "selection": {"seed": SEED, "target": TARGET, "count": TARGET,
                      "algorithm": "sha256-domain-separated-ranked-without-replacement-v1",
                      "allocation": "seeded-even-rounds-skip-exhausted-strata-v1",
                      "allocationOrder": allocation_order,
                      "ordering": "ASCII for serialized IDs; SHA-256 rank for selection",
                      "allCanonicalFlopsSelected": False, "omittedCanonicalFlops": 1655,
                      "selectedIdsSha256": digest(selected_lines)},
        "classification": {
            "shape": "paired first (includes trips); otherwise monotone; otherwise wet if two-tone or rank span <=4; otherwise dry",
            "height": "highest rank: Q/K/A=high, 9/T/J=mid, 2..8=low",
            "aceLowInFlopShape": False,
            "sourceFunctions": ["model.mjs:boardTexture", "model.mjs:boardHeight"]},
        "strata": strata,
        "boards": [{"id": board, "cards": list(catalog[board]), "stratum": classify(catalog[board])}
                   for board in selected],
        "laterWithinSelectedFlop": {
            "turns": 4, "riversPerTurn": 3, "nominalTurnBoards": 400,
            "nominalRiverRunouts": 1200, "seed": "solveaai-postflop-ai-v1",
            "seedTemplate": "${config.seed}|balance|${board.id}",
            "sampler": "unchanged balance.mjs:representativeRunouts; all four sampled turns removed before each river pool",
            "reachableOnlyCounts": "determined later from each spot's exact saved live ranges; never substitute or silently replace boards"},
        "notEvidenceFor": ["policy acceptance", "all-later-board coverage", "720000 trial completion", "GTO or strength guarantee"],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    manifest = make_manifest(args.repository)
    encoded = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
    if args.write:
        args.manifest.parent.mkdir(parents=True, exist_ok=True)
        with args.manifest.open("xb") as target:
            target.write(encoded)
    else:
        assert args.manifest.read_bytes() == encoded, "Selection manifest differs from frozen deterministic reproduction"
    print(json.dumps({"status": "PASS-selection-only", "canonicalFlops": 1755,
                      "laterSelectedFlops": TARGET, "nonemptyStrata": 12,
                      "manifestSha256": digest(encoded),
                      "strata": [{key: row[key] for key in ["stratum", "population", "selected"]}
                                 for row in manifest["strata"]]}, indent=2))


if __name__ == "__main__":
    if not __debug__:
        raise SystemExit("Run without -O/PYTHONOPTIMIZE; selection assertions are mandatory")
    main()
