// Mechanical extraction of the frozen c8d2 all-board proof/persist blocks.
// Static correspondence checker rejects any edit to the copied statements.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditFileRecord } from './audit-identity.mjs';
import { contentHash } from './effective-law-identity.mjs';
import { exactKeys, gateFail } from './model11-gate-contract.mjs';
import { createModel11Execution } from './execution-model11.mjs';
import { verifyZeroLikelihoodProof } from './model11-zero-proof.mjs';
import { model11BoardRow, validateModel11BoardRow } from './model11-gate-drivers.mjs';
import { writeImmutableAllBoardOutput } from './all-board-checkpoints.mjs';
export function openPilot1755ProofAdapter(inputs, flopArtifact, laterArtifact, binding, cache) {
// BEGIN FROZEN PROOF BLOCK
  const readProof = ref => {
    if (!exactKeys(ref, ['proofHash', 'bytes', 'sha256']) || !/^[a-f0-9]{64}$/.test(ref.proofHash)) gateFail('Invalid exact-zero proof reference');
    const path = `${ref.proofHash}.proof.json`, record = auditFileRecord(cache.dir, path);
    if (record.sha256 !== ref.sha256 || record.bytes !== ref.bytes) gateFail('Exact-zero checkpoint evidence changed');
    const envelope = JSON.parse(readFileSync(join(cache.dir, path), 'utf8'));
    if (!exactKeys(envelope, ['bindingHash', 'proof']) || envelope.bindingHash !== contentHash(binding) || envelope.proof.proofHash !== ref.proofHash) gateFail('Exact-zero checkpoint evidence belongs to another gate');
    return envelope.proof;
  };
  let proofExecution = null;
  const verifiedProofs = new Map();
  const verifyProof = (proof, request) => {
    // The caller always rechecks the target ancestor. Semantic support/law proof
    // is memoized only after full replay under this exact immutable binding.
    if (!verifiedProofs.has(proof.proofHash)) {
      proofExecution ??= createModel11Execution(inputs, flopArtifact, laterArtifact);
      verifiedProofs.set(proof.proofHash, verifyZeroLikelihoodProof(proofExecution, proof, request));
    }
    return verifiedProofs.get(proof.proofHash);
  };
// END FROZEN PROOF BLOCK
  return { readProof, verifyProof, release() { proofExecution?.releaseBoardCaches(); } };
}
export function persistPilot1755Board(inputs, flopArtifact, laterArtifact, binding, board, cache, { readProof, verifyProof }, assertUnchanged, onBoard) {
// BEGIN FROZEN PERSIST BLOCK
      assertUnchanged();
      const row = model11BoardRow(inputs, flopArtifact, laterArtifact, binding, board);
      validateModel11BoardRow(inputs, binding, board, row, { verifyProof });
      assertUnchanged();
      if (!row.unreachable) row.modelUnreachableProofs = row.modelUnreachableProofs.map(proof => {
        const path = `${proof.proofHash}.proof.json`;
        writeImmutableAllBoardOutput(join(cache.dir, path), JSON.stringify({ bindingHash: contentHash(binding), proof }) + '\n');
        const { bytes, sha256 } = auditFileRecord(cache.dir, path);
        return { proofHash: proof.proofHash, bytes, sha256 };
      });
      validateModel11BoardRow(inputs, binding, board, row, { readProof, verifyProof });
      cache.write(row); onBoard(row, cache.rows.size);
// END FROZEN PERSIST BLOCK
}
