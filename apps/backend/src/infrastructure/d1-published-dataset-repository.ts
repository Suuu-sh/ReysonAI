import type { PublishedDatasetMetadata, PublishedDatasetPart, PublishedDatasetReader, PublishedDatasetSummary } from '../application/published-datasets.ts';

type D1Statement = { bind(...values: unknown[]): D1Statement; all<T>(): Promise<{ results: T[] }> };
export type PublishedDatasetD1Database = { prepare(sql: string): D1Statement };

export class D1PublishedDatasetReader implements PublishedDatasetReader {
  private readonly db: PublishedDatasetD1Database;

  constructor(db: PublishedDatasetD1Database) {
    this.db = db;
  }

  async list(): Promise<PublishedDatasetSummary[]> {
    const { results } = await this.db.prepare('SELECT name, content_hash, bytes FROM preflop_datasets ORDER BY name')
      .all<PublishedDatasetSummary>();
    return results;
  }

  async read(name: string): Promise<{ metadata?: PublishedDatasetMetadata; parts: PublishedDatasetPart[] }> {
    // Keep metadata as the first read and issue both reads before awaiting them,
    // matching the existing D1 lookup order and allowing the reads to run together.
    const metadataRequest = this.db.prepare('SELECT content_hash, parts FROM preflop_datasets WHERE name = ?')
      .bind(name).all<PublishedDatasetMetadata>();
    const partsRequest = this.db.prepare('SELECT part, body FROM preflop_dataset_parts WHERE name = ? ORDER BY part')
      .bind(name).all<PublishedDatasetPart>();
    const [metadata, parts] = await Promise.all([metadataRequest, partsRequest]);
    return { metadata: metadata.results[0], parts: parts.results };
  }
}
