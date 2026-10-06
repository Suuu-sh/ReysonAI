// LOCAL review preparation only. This deliberately cannot grant approval.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { reviewedStage3Files, STAGE3_REPOSITORY } from "./lib/reviewed-stage3.mjs";
import { assertStage3Publication } from "./lib/stage3-publication.mjs";
const argv = process.argv.slice(2), index = argv.indexOf("--out");
const out = resolve(index >= 0 ? argv[index + 1] : ".local/stage3-review-candidate.json");
if (!out.startsWith(join(STAGE3_REPOSITORY, "apps/frontend/.local") + "/")) throw new Error("Review candidate must remain in ignored apps/frontend/.local; only an independent reviewer may approve a normal-Git receipt");
const complete = assertStage3Publication(join(STAGE3_REPOSITORY, "apps/frontend/src/estimated"));
const record = { schema_version: 1, ...reviewedStage3Files(), source_fingerprint: complete.fingerprint, counts: complete.counts,
  review: { status: "pending-independent-review", generator: "local-only", baseline_commit: "61e457f4e35d8e28b2476b304a118b89dbf4be1f", scope: "Stage 3 saved strategies/equities/coverage/reasons and delivery source changes require independent review." } };
mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ status: "candidate-recorded-not-approved", path: out, counts: complete.counts }));
