export type Position = "UTG" | "HJ" | "CO" | "BTN" | "SB" | "BB";

export type ResolveAction = {
  position: Position;
  action: "fold" | "call" | "check" | "raise" | "all_in";
  sizeBb?: number;
};

export type ResolveInput = {
  solutionId: string;
  heroPosition: Position;
  actions: ResolveAction[];
};

export type ComboActionSolution = {
  action: string;
  frequency: number;
  evBb: number;
};

export type ComboSolution = {
  combo: string;
  hand: string;
  actions: ComboActionSolution[];
};

export type HandAggregate = {
  hand: string;
  comboCount: number;
  actions: Record<string, number>;
};

export type SolutionNode = {
  nodeId: string;
  nodeType: string;
  actionHistory: { actions: unknown[] };
  actingPosition: Position | null;
  potBb: number;
  effectiveStackBb: number;
  combos: ComboSolution[];
  handAggregates: HandAggregate[];
};

export type SolutionSummary = {
  solutionId: string;
  solverVersion: string;
  continuationModelVersion: string;
  gameConfigHash: string;
  createdAt: string;
  iterations: number;
};

export type Solution = SolutionSummary & {
  convergence: {
    iterations: number;
    average_strategy_delta: number;
  };
  nodes: SolutionNode[];
};

export type ResolveResponse = {
  solutionId: string;
  heroPosition: Position;
  node: SolutionNode;
};

export type SolveaGTOClientOptions = {
  baseUrl: string;
  fetch?: typeof fetch;
};

export class SolveaGTOClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  public readonly preflop: {
    listSolutions: () => Promise<SolutionSummary[]>;
    getSolution: (solutionId: string) => Promise<Solution>;
    listNodes: (solutionId: string) => Promise<NodeSummary[]>;
    getSolutionNode: (solutionId: string, nodeId: string) => Promise<SolutionNode>;
    getNode: (nodeId: string) => Promise<SolutionNode>;
    getHand: (nodeId: string, hand: string) => Promise<HandAggregate>;
    resolve: (input: ResolveInput) => Promise<ResolveResponse>;
  };

  constructor(options: SolveaGTOClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.preflop = {
      listNodes: (id) => this.request<NodeSummary[]>(`/v1/preflop/solutions/${encodeURIComponent(id)}/nodes`),
      getSolutionNode: (id, node) => this.request<SolutionNode>(`/v1/preflop/solutions/${encodeURIComponent(id)}/nodes/${encodeURIComponent(node)}`),
      listSolutions: () => this.request<SolutionSummary[]>("/v1/preflop/solutions"),
      getSolution: (solutionId) =>
        this.request<Solution>(`/v1/preflop/solutions/${encodeURIComponent(solutionId)}`),
      getNode: (nodeId) => this.request<SolutionNode>(`/v1/preflop/nodes/${encodeURIComponent(nodeId)}`),
      getHand: (nodeId, hand) =>
        this.request<HandAggregate>(
          `/v1/preflop/nodes/${encodeURIComponent(nodeId)}/hands/${encodeURIComponent(hand)}`,
        ),
      resolve: (input) =>
        this.request<ResolveResponse>("/v1/preflop/resolve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            solutionId: input.solutionId,
            heroPosition: input.heroPosition,
            actions: input.actions.map((action) => ({
              position: action.position,
              action: action.action,
              ...(action.sizeBb === undefined ? {} : { sizeBb: action.sizeBb }),
            })),
          }),
        }),
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, init);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SolveaGTO API ${response.status}: ${body}`);
    }
    return (await response.json()) as T;
  }
}

export type NodeSummary = Omit<SolutionNode, "combos" | "handAggregates"> & { hasStrategy: boolean };
