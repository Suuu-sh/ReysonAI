// Persisted family shapes are deliberately distinct. Runtime validators still
// enforce metadata, geometry, frequencies and cross-dataset reachability.
export type ResponseDataset = typeof import("./preflop-ranges.json");
type RawOpeningDataset = typeof import("./opening-ranges.json");
export type OpeningHand = { hand: string; open: number; fold: number; open_size_bb: number | null; limp?: number; limp_size_bb?: number | null; adjusted?: "add" | "drop"; shift_bb?: number; saved_open?: number };
export type OpeningSpot = Omit<RawOpeningDataset["spots"][number], "hands"> & { hands: OpeningHand[]; table_profile?: import("./table-profile.ts").TableProfile };
export type OpeningDataset = Omit<RawOpeningDataset, "spots"> & { spots: OpeningSpot[] };
export type ThreeBetDataset = typeof import("./three-bet-responses.json");
export type FourBetDataset = typeof import("./four-bet-responses.json");
export type FiveBetDataset = typeof import("./five-bet-responses.json");
type RawLimpDataset = typeof import("./limp-responses.json");
type RawLimpSpot = RawLimpDataset["spots"][number];
export type LimpCheckSpot = Omit<Extract<RawLimpSpot, { raise_size_bb: number }>, "id"> & { id: "BB_vs_SB_limp" };
export type LimpIsoSpot = Omit<Extract<RawLimpSpot, { raise_to_bb: number }>, "id"> & { id: "SB_vs_BB_iso" };
export type LimpReraiseSpot = Omit<Extract<RawLimpSpot, { four_bet_size_bb: number }>, "id"> & { id: "BB_vs_SB_limp_reraise" };
export type LimpSpot = LimpCheckSpot | LimpIsoSpot | LimpReraiseSpot;
export type LimpDataset = Omit<RawLimpDataset, "spots"> & { spots: LimpSpot[] };
type RawLimpDeepDataset = typeof import("./limp-deep-responses.json");
type RawLimpDeepSpot = RawLimpDeepDataset["spots"][number];
export type LimpFourBetSpot = Omit<Exclude<RawLimpDeepSpot, { source_four_bet_response_id: string }>, "id"> & { id: "SB_vs_BB_limp_four_bet" };
export type LimpFiveBetSpot = Omit<Extract<RawLimpDeepSpot, { source_four_bet_response_id: string }>, "id"> & { id: "BB_vs_SB_limp_five_bet" };
export type LimpDeepSpot = LimpFourBetSpot | LimpFiveBetSpot;
export type LimpDeepDataset = Omit<RawLimpDeepDataset, "spots"> & { spots: LimpDeepSpot[] };
export type MultiwayDataset = typeof import("./multiway-responses.json");
export type Multiway2Dataset = typeof import("./multiway2-responses.json");
export type SqueezeDataset = typeof import("./squeeze-responses.json");
export type ColdThreeBetDataset = typeof import("./cold-three-bet-responses.json");
export type ColdFourBetDataset = typeof import("./cold-four-bet-responses.json");
// Explicit saved-file schema: typechecking does not import the 27 MB restored
// delivery payload into the executable source provenance/capture graph.
type RawContinuationDataset = {
  metadata: { schema_version: string; storage?: string; strategy_type: string; game: string; effective_stack_bb: number;
    open_size_bb: number; ante_bb: number; rake: { rate: number; cap_bb: number; no_flop_no_drop: boolean; calibrated: boolean };
    families: string[]; legal_actions: string[]; aggregation_model: string; defense_audit_model: string; method: string;
    opponent_model: string; call_ev_policy: string; unreachable_hands: string; sizing_semantics: string };
  catalog_spot_count: number; omitted_unreachable_count: number; spot_count: number; hand_classes_per_spot: number;
  entry_count: number; spots: ContinuationStoredSpot[];
};
export type ContinuationHand = { hand: string; fold: number; call: number; four_bet: number; all_in: number; raise_to_size_bb: number | null };
export type ContinuationStoredSpot = import("./continuation-tree.ts").ContinuationDecision & { unreachable: boolean; hands: ContinuationHand[] };
export type ContinuationDataset = Omit<RawContinuationDataset, "spots" | "metadata"> & { metadata: RawContinuationDataset["metadata"] & { storage?: string }; spots: ContinuationStoredSpot[] };
export type ContinuationSourceDatasets = { "opening-ranges": OpeningDataset; "preflop-ranges": ResponseDataset; "multiway-responses": MultiwayDataset; "multiway2-responses": Multiway2Dataset; "squeeze-responses": SqueezeDataset; "cold-three-bet-responses": ColdThreeBetDataset; "cold-four-bet-responses": ColdFourBetDataset; "continuation-responses"?: ContinuationDataset | null };

export type SpotOf<D extends { spots: readonly unknown[] }> = D["spots"][number];
export type ResponseSpot = SpotOf<ResponseDataset>;

export type ThreeBetSpot = SpotOf<ThreeBetDataset>;
export type FourBetSpot = SpotOf<FourBetDataset>;
export type FiveBetSpot = SpotOf<FiveBetDataset>;
export type MultiwaySpot = SpotOf<MultiwayDataset>;
export type PreflopAction = "open" | "limp" | "call" | "fold" | "check" | "three_bet" | "squeeze" | "four_bet" | "raise" | "all_in";
export type FrequencyRow = { hand: string } & Partial<Record<PreflopAction, number>>;
export type FrequencySpot<Row extends FrequencyRow = FrequencyRow> = { id: string; hero: string; hands: Row[] };
export type SpotDataset<Spot> = { spots: Spot[] };

export type SqueezeSpot = SpotOf<SqueezeDataset>;
export type ColdThreeBetSpot = SpotOf<ColdThreeBetDataset>;
export type ColdFourBetSpot = SpotOf<ColdFourBetDataset>;
export type Multiway2Spot = SpotOf<Multiway2Dataset>;
