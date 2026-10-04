// Strict staged schema/source checks plus the complete audit; no publication.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auditEstimates, isBlockingAuditFinding } from "../src/estimated/audit.ts";
import { validateDataset } from "../src/estimated/ranges.ts";
import { validateOpeningDataset } from "../src/estimated/opening-ranges.ts";
import { validateThreeBetDataset } from "../src/estimated/three-bet-responses.ts";
import { validateFourBetDataset } from "../src/estimated/four-bet-responses.ts";
import { validateFiveBetDataset } from "../src/estimated/five-bet-dataset.ts";
import { validateMultiwayDataset } from "../src/estimated/multiway-responses.ts";
import { validateLimpResponses } from "../src/estimated/limp-responses.ts";
import { validateLimpDeepResponses } from "../src/estimated/limp-deep-responses.ts";
import { validateSqueezeDataset } from "../src/estimated/squeeze-responses.ts";
import { validateColdThreeBetDataset } from "../src/estimated/cold-three-bet-responses.ts";
import { validateMultiway2Dataset } from "../src/estimated/multiway2-responses.ts";
import { validateColdFourBetDataset } from "../src/estimated/cold-four-bet-responses.ts";
import { validateContinuationDataset } from "../src/estimated/continuation-responses.ts";
const staging = process.argv[2];
if (!staging) throw new Error("A staging directory is required");
  const load = name => JSON.parse(readFileSync(join(staging, `${name}.json`), "utf8"));
  const opening = load("opening-ranges");
  const responses = load("preflop-ranges");
  const threeBets = load("three-bet-responses");
  const fourBets = load("four-bet-responses");
  const fiveBets = load("five-bet-responses");
  const multiway = load("multiway-responses");
  const squeezes = load("squeeze-responses");
  const limp = load("limp-responses");
  const limpDeep = load("limp-deep-responses");
  const coldThreeBets = load("cold-three-bet-responses");
  const multiway2 = load("multiway2-responses"), coldFourBets = load("cold-four-bet-responses");
  validateOpeningDataset(opening);
  validateDataset(responses);
  validateThreeBetDataset(threeBets, responses, opening);
  validateFourBetDataset(fourBets, responses, threeBets, opening);
  validateFiveBetDataset(fiveBets);
  validateMultiwayDataset(multiway, responses);
  validateSqueezeDataset(squeezes, multiway, responses, opening);
  validateLimpResponses(limp, opening);
  validateLimpDeepResponses(limpDeep, opening, limp);
  validateColdThreeBetDataset(coldThreeBets, responses);
  validateMultiway2Dataset(multiway2, multiway, responses, opening);
  validateColdFourBetDataset(coldFourBets, coldThreeBets, responses, opening);
  let continuationInputs = {};
  if (!process.argv.includes("--without-continuations")) {
  const continuations = load("continuation-responses"), continuationEquities = load("continuation-call-equities");
  validateContinuationDataset(continuations, {
    "opening-ranges": opening, "preflop-ranges": responses, "multiway-responses": multiway,
    "multiway2-responses": multiway2, "squeeze-responses": squeezes,
    "cold-three-bet-responses": coldThreeBets, "cold-four-bet-responses": coldFourBets,
  });
  continuationInputs = { continuations, continuationEquities };
  }
  const { findings } = auditEstimates({ ...continuationInputs, opening, responses, threeBets, fourBets, fiveBets, multiway, squeezes, limp, limpDeep, coldThreeBets, multiway2, coldFourBets, callEquities: load("call-equities") });
console.log(JSON.stringify({ findings }));
