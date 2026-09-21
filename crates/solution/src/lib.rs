//! Durable solution format and file-backed repository.
//!
//! JSON is an interchange format only.  The domain structs are independent of
//! JSON and can later be encoded as MessagePack, a binary blob, or object
//! storage records without changing the solver or API contracts.

use poker_core::{all_hand_classes, HandClass, Position};
use preflop_tree::{ActionHistory, ActionKind, GameTree};
use serde::{Deserialize, Serialize};
use solver_core::{ComboActionStrategy, SolverOutput};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Solution {
    pub solution_id: String,
    pub solver_version: String,
    pub continuation_model_version: String,
    pub game_config_hash: String,
    pub created_at: String,
    pub iterations: u32,
    pub convergence: solver_core::ConvergenceMetrics,
    pub nodes: Vec<SolutionNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolutionNode {
    pub node_id: String,
    pub node_type: String,
    pub action_history: ActionHistory,
    pub acting_position: Option<Position>,
    pub pot_bb: f64,
    pub effective_stack_bb: f64,
    pub combos: Vec<ComboSolution>,
    pub hand_aggregates: Vec<HandAggregate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComboSolution {
    pub combo: String,
    pub hand: String,
    pub actions: Vec<ComboActionSolution>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComboActionSolution {
    pub action: String,
    pub frequency: f64,
    pub ev_bb: f64,
    #[serde(default)]
    pub regret: f64,
    #[serde(default)]
    pub strategy_sum: f64,
    #[serde(default)]
    pub counterfactual_reach: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandAggregate {
    pub hand: String,
    pub combo_count: usize,
    pub actions: BTreeMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolutionSummary {
    pub solution_id: String,
    pub solver_version: String,
    pub continuation_model_version: String,
    pub game_config_hash: String,
    pub created_at: String,
    pub iterations: u32,
}

impl Solution {
    pub fn from_solver_output(
        solution_id: impl Into<String>,
        game_config_hash: impl Into<String>,
        created_at: impl Into<String>,
        output: SolverOutput,
        tree: &GameTree,
    ) -> Self {
        let output_by_node: std::collections::HashMap<_, _> = output
            .nodes
            .iter()
            .map(|node| (node.node_id.as_str(), node))
            .collect();
        let nodes = tree
            .nodes()
            .iter()
            .map(|node| {
                let common = node.common();
                let combos = output_by_node
                    .get(common.node_id.as_str())
                    .map(|node| {
                        node.combos
                            .iter()
                            .map(|combo| ComboSolution {
                                combo: combo.combo.to_string(),
                                hand: combo.hand.clone(),
                                actions: combo
                                    .actions
                                    .iter()
                                    .map(combo_action_solution)
                                    .collect(),
                            })
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                let hand_aggregates = aggregate_hands(&combos);
                SolutionNode {
                    node_id: common.node_id.clone(),
                    node_type: node.node_type().to_string(),
                    action_history: common.action_history.clone(),
                    acting_position: common.acting_player,
                    pot_bb: common.pot_bb,
                    effective_stack_bb: common.effective_stack_bb,
                    combos,
                    hand_aggregates,
                }
            })
            .collect();
        Self {
            solution_id: solution_id.into(),
            solver_version: output.solver_version,
            continuation_model_version: output.continuation_model_version,
            game_config_hash: game_config_hash.into(),
            created_at: created_at.into(),
            iterations: output.iterations,
            convergence: output.convergence,
            nodes,
        }
    }

    pub fn summary(&self) -> SolutionSummary {
        SolutionSummary {
            solution_id: self.solution_id.clone(),
            solver_version: self.solver_version.clone(),
            continuation_model_version: self.continuation_model_version.clone(),
            game_config_hash: self.game_config_hash.clone(),
            created_at: self.created_at.clone(),
            iterations: self.iterations,
        }
    }

    pub fn node(&self, node_id: &str) -> Option<&SolutionNode> {
        self.nodes.iter().find(|node| node.node_id == node_id)
    }

    pub fn hand(&self, node_id: &str, hand: &str) -> Option<&HandAggregate> {
        let requested: HandClass = hand.parse().ok()?;
        let canonical = requested.to_string();
        self.node(node_id)?
            .hand_aggregates
            .iter()
            .find(|aggregate| aggregate.hand == canonical)
    }

    pub fn resolve(&self, actions: &[preflop_tree::HistoryAction]) -> Result<&SolutionNode, String> {
        let first = actions.first().ok_or_else(|| "action history is empty".to_string())?;
        let mut current_history = ActionHistory::new(vec![*first]);
        let mut current = self
            .find_history(&current_history)
            .ok_or_else(|| format!("unknown opener history: {}", current_history.key()))?;

        for requested in actions.iter().skip(1).copied() {
            loop {
                if current.acting_position == Some(requested.position) {
                    break;
                }
                let implicit_fold = current_history.push(preflop_tree::HistoryAction {
                    position: current.acting_position.ok_or_else(|| "node is terminal".to_string())?,
                    action: ActionKind::Fold,
                });
                let Some(next) = self.find_history(&implicit_fold) else {
                    return Err(format!("cannot reach position {}", requested.position));
                };
                current_history = implicit_fold;
                current = next;
            }
            current_history = current_history.push(requested);
            current = self
                .find_history(&current_history)
                .ok_or_else(|| format!("action unavailable at {}", current.node_id))?;
        }
        Ok(current)
    }

    /// Resolve a compact request and advance implicit folds until the hero is
    /// the actor. This is what lets `{ BTN: raise }` return the BB decision
    /// node without requiring the client to send SB's fold explicitly.
    pub fn resolve_for_position(
        &self,
        actions: &[preflop_tree::HistoryAction],
        hero_position: Position,
    ) -> Result<&SolutionNode, String> {
        let mut current = self.resolve(actions)?;
        let mut history = current.action_history.clone();
        while let Some(actor) = current.acting_position {
            if actor == hero_position {
                return Ok(current);
            }
            history = history.push(preflop_tree::HistoryAction {
                position: actor,
                action: ActionKind::Fold,
            });
            current = self
                .find_history(&history)
                .ok_or_else(|| format!("cannot advance to hero position {hero_position}"))?;
        }
        Err(format!("hero position {hero_position} is not acting at this history"))
    }

    fn find_history(&self, history: &ActionHistory) -> Option<&SolutionNode> {
        self.nodes
            .iter()
            .find(|node| node.action_history == *history)
    }
}

fn combo_action_solution(action: &ComboActionStrategy) -> ComboActionSolution {
    ComboActionSolution {
        action: action.action.label(),
        frequency: action.frequency,
        ev_bb: action.ev_bb,
        regret: action.regret,
        strategy_sum: action.strategy_sum,
        counterfactual_reach: action.counterfactual_reach,
    }
}

fn aggregate_hands(combos: &[ComboSolution]) -> Vec<HandAggregate> {
    let mut by_hand: BTreeMap<String, (usize, BTreeMap<String, f64>)> = BTreeMap::new();
    for combo in combos {
        let entry = by_hand
            .entry(combo.hand.clone())
            .or_insert_with(|| (0, BTreeMap::new()));
        entry.0 += 1;
        for action in &combo.actions {
            *entry.1.entry(action.action.clone()).or_default() += action.frequency;
        }
    }
    let mut aggregates: Vec<_> = by_hand
        .into_iter()
        .map(|(hand, (combo_count, mut actions))| {
            if combo_count > 0 {
                for value in actions.values_mut() {
                    *value /= combo_count as f64;
                }
            }
            HandAggregate {
                hand,
                combo_count,
                actions,
            }
        })
        .collect();
    let known: std::collections::HashSet<_> = aggregates.iter().map(|aggregate| aggregate.hand.clone()).collect();
    for hand in all_hand_classes() {
        if !known.contains(&hand.to_string()) {
            aggregates.push(HandAggregate {
                hand: hand.to_string(),
                combo_count: 0,
                actions: BTreeMap::new(),
            });
        }
    }
    aggregates.sort_by(|a, b| a.hand.cmp(&b.hand));
    aggregates
}

pub fn hash_game_config(config: &preflop_tree::PreflopConfig) -> String {
    // FNV-1a is intentionally dependency-free here.  It is a cache key, not
    // a security primitive; a cryptographic hash can be introduced at the
    // storage boundary without changing the domain model.
    let bytes = serde_json::to_vec(config).expect("config is serializable");
    let mut hash: u64 = 14_695_981_039_346_656_037;
    for byte in bytes {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(1_099_511_628_211);
    }
    format!("fnv1a-{hash:016x}")
}

pub trait SolutionRepository: Send + Sync {
    fn list(&self) -> Result<Vec<SolutionSummary>, String>;
    fn get(&self, solution_id: &str) -> Result<Option<Solution>, String>;
    fn save(&self, solution: &Solution) -> Result<(), String>;
}

#[derive(Debug, Clone)]
pub struct FileSolutionStore {
    root: PathBuf,
}

impl FileSolutionStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn path_for(&self, solution_id: &str) -> Result<PathBuf, String> {
        if solution_id.is_empty()
            || !solution_id
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || "-_.".contains(character))
        {
            return Err("invalid solution id".to_string());
        }
        Ok(self.root.join(format!("{solution_id}.json")))
    }
}

impl SolutionRepository for FileSolutionStore {
    fn list(&self) -> Result<Vec<SolutionSummary>, String> {
        if !self.root.exists() {
            return Ok(Vec::new());
        }
        let mut summaries = Vec::new();
        for entry in fs::read_dir(&self.root).map_err(|error| error.to_string())? {
            let path = entry.map_err(|error| error.to_string())?.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
                continue;
            }
            let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
            let solution: Solution = serde_json::from_str(&content).map_err(|error| error.to_string())?;
            summaries.push(solution.summary());
        }
        summaries.sort_by(|a, b| a.solution_id.cmp(&b.solution_id));
        Ok(summaries)
    }

    fn get(&self, solution_id: &str) -> Result<Option<Solution>, String> {
        let path = self.path_for(solution_id)?;
        if !path.exists() {
            return Ok(None);
        }
        let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
        serde_json::from_str(&content)
            .map(Some)
            .map_err(|error| error.to_string())
    }

    fn save(&self, solution: &Solution) -> Result<(), String> {
        fs::create_dir_all(&self.root).map_err(|error| error.to_string())?;
        let path = self.path_for(&solution.solution_id)?;
        let content = serde_json::to_string_pretty(solution).map_err(|error| error.to_string())?;
        fs::write(path, content).map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use continuation::SimpleContinuationModel;
    use preflop_tree::PreflopConfig;
    use solver_core::{CfrStrategy, SolverStrategy};

    #[test]
    fn solution_contains_combo_and_169_hand_aggregate_layers() {
        let tree = GameTree::build(PreflopConfig::default()).unwrap();
        let mut progress = |_| {};
        let output = CfrStrategy::cfr().solve(&tree, &SimpleContinuationModel::default(), 1, &mut progress);
        let solution = Solution::from_solver_output("test-v1", "hash", "now", output, &tree);
        let decision = solution
            .nodes
            .iter()
            .find(|node| node.node_type == "player_decision")
            .unwrap();
        assert_eq!(decision.combos.len(), 1326);
        assert_eq!(decision.hand_aggregates.len(), 169);
        assert!(solution.hand(&decision.node_id, "AA").is_some());
    }
}
