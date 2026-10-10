import { isPublishedDatasetName } from '../domain/published-dataset.ts';

export type PublishedDatasetSummary = { name: string; content_hash: string; bytes: number };
export type PublishedDatasetMetadata = { content_hash: string; parts: number };
export type PublishedDatasetPart = { part: number; body: string };

export interface PublishedDatasetReader {
  list(): Promise<PublishedDatasetSummary[]>;
  read(name: string): Promise<{ metadata?: PublishedDatasetMetadata; parts: PublishedDatasetPart[] }>;
}

export type ReadPublishedDatasetResult =
  | { kind: 'invalid_name' }
  | { kind: 'not_found'; name: string }
  | { kind: 'incomplete'; name: string }
  | { kind: 'published'; name: string; text: string; etag: string };

export async function listPublishedDatasets(reader: PublishedDatasetReader) {
  const rows = await reader.list();
  return {
    kind: 'ai_estimate_not_gto',
    datasets: Object.fromEntries(rows.map(row => [row.name, { hash: row.content_hash, bytes: row.bytes }])),
  };
}

export async function readPublishedDataset(reader: PublishedDatasetReader, name: string): Promise<ReadPublishedDatasetResult> {
  if (!isPublishedDatasetName(name)) return { kind: 'invalid_name' };

  const { metadata, parts } = await reader.read(name);
  if (!metadata) return { kind: 'not_found', name };
  if (parts.length !== metadata.parts || parts.some((part, index) => part.part !== index)) {
    return { kind: 'incomplete', name };
  }
  // Keep the delivered text byte-for-byte: do not parse or re-serialize the JSON.
  return { kind: 'published', name, text: parts.map(part => part.body).join(''), etag: `"${metadata.content_hash}"` };
}
