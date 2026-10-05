import type { Mw3Inputs, Mw3Policy } from './mw3-types.ts';
export type Mw3CandidateMetadata = { schema_version: 3; spot: string; source_hash: string; implementation_hash: string;
  policy_hash: string; strategy_type: 'ai_estimate_not_gto'; model: 'gpt-6-astra'; author_task?: string; generated_at?: string;
  approval_status?: string; recipe_sha256?: string };
export function buildMw3BrowserInputs(id: string, datasets: Record<string, unknown>): Promise<Mw3Inputs>;
export function verifyMw3BrowserCandidate(inputs: Mw3Inputs, candidate: { metadata: unknown; manifest: unknown; parts: unknown }, expected: {
  stage: 'flop' | 'later'; expectedImplementationHash: string; expectedPolicyHash: string;
}): Promise<{ metadata: Mw3CandidateMetadata; policy: Mw3Policy }>;
