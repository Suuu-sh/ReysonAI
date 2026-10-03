// The Reyson Agent table and its agents. Codenames, units and colours are presentation only:
// every agent plays the same Reyson solver estimate (and, later, the same opponent-adjusted tables).
export type AgentCharacter = { id: string; name: { ja: string; en: string }; unit: string; color: string };
export type AgentTable = { id: string; name: { ja: string; en: string }; tagline: { ja: string; en: string }; theme: string; agents: AgentCharacter[] };

const agent = (id: string, codename: string, unit: string, color: string): AgentCharacter =>
  ({ id, name: { ja: codename, en: codename }, unit, color });

export const AGENT_TABLES: AgentTable[] = [
  { id: "reyson-01", name: { ja: "REYSON TABLE 01", en: "REYSON TABLE 01" },
    tagline: { ja: "Reyson solver で動く5体のAgent", en: "Five agents running the Reyson solver" }, theme: "#3fb8d8", agents: [
    agent("orion", "ORION", "UNIT-01", "#f0609e"),
    agent("vega", "VEGA", "UNIT-02", "#4fd1ff"),
    agent("nova", "NOVA", "UNIT-03", "#a78bfa"),
    agent("atlas", "ATLAS", "UNIT-04", "#f6c34a"),
    agent("lyra", "LYRA", "UNIT-05", "#6fdc8c"),
  ] },
];

// Fills the empty sixth seat when only agents play.
export const GUEST_AGENT = agent("zero", "ZERO", "UNIT-00", "#e5e7eb");

// One table for now; sessions and saved hands still carry its id.
export const AGENT_TABLE = AGENT_TABLES[0];

export const agentTableById = (id: string) => AGENT_TABLES.find(table => table.id === id) ?? null;
