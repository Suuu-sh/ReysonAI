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

fn default_stack_bb() -> f64 {
    100.0
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SolutionStatus {
    Provisional,
    GtoVerified,
}

impl Default for SolutionStatus {
    fn default() -> Self {
        Self::Provisional
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExploitabilityStatus {
    SampledEstimate,
    Exact,
}

impl Default for ExploitabilityStatus {
    fn default() -> Self {
        Self::SampledEstimate
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    #[serde(default)]
    pub status: SolutionStatus,
    #[serde(default)]
    pub format_valid: bool,
    #[serde(default)]
    pub full_combo_coverage: bool,
    #[serde(default)]
    pub frequency_integrity: bool,
    #[serde(default)]
    pub ev_integrity: bool,
    #[serde(default)]
    pub exploitability_status: ExploitabilityStatus,
    #[serde(default)]
    pub gto_verified: bool,
    #[serde(default)]
    pub notes: Vec<String>,
}

impl Default for ValidationReport {
    fn default() -> Self {
        Self {
            status: SolutionStatus::Provisional,
            format_valid: false,
            full_combo_coverage: false,
            frequency_integrity: false,
            ev_integrity: false,
            exploitability_status: ExploitabilityStatus::SampledEstimate,
            gto_verified: false,
            notes: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Solution {
    pub solution_id: String,
    /// Starting effective stack for this preflop solution.
    ///
    /// The serde default keeps v0.1 files written before stack metadata was
    /// added readable; those files were generated from the 100BB config.
    #[serde(default = "default_stack_bb")]
    pub stack_bb: f64,
    pub solver_version: String,
    pub continuation_model_version: String,
    pub game_config_hash: String,
    pub created_at: String,
    pub iterations: u32,
    pub convergence: solver_core::ConvergenceMetrics,
    #[serde(default)]
    pub validation: ValidationReport,
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
    pub stack_bb: f64,
    pub solver_version: String,
    pub continuation_model_version: String,
    pub game_config_hash: String,
    pub created_at: String,
    pub iterations: u32,
    pub convergence: solver_core::ConvergenceMetrics,
    pub validation: ValidationReport,
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
            stack_bb: tree.config.stack_bb,
            solver_version: output.solver_version,
            continuation_model_version: output.continuation_model_version,
            game_config_hash: game_config_hash.into(),
            created_at: created_at.into(),
            iterations: output.iterations,
            convergence: output.convergence,
            validation: ValidationReport::default(),
            nodes,
        }
    }

    pub fn with_validation(mut self, validation: ValidationReport) -> Self {
        self.validation = validation;
        self
    }

    pub fn summary(&self) -> SolutionSummary {
        SolutionSummary {
            solution_id: self.solution_id.clone(),
            stack_bb: self.stack_bb,
            solver_version: self.solver_version.clone(),
            continuation_model_version: self.continuation_model_version.clone(),
            game_config_hash: self.game_config_hash.clone(),
            created_at: self.created_at.clone(),
            iterations: self.iterations,
            convergence: self.convergence.clone(),
            validation: self.validation.clone(),
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

/// Validate the structural guarantees required before a solution can be
/// stored or promoted. This deliberately does not claim mathematical GTO
/// verification: the current continuation model and exploitability metric are
/// provisional and are recorded as such in the report.
pub fn validate_solution(
    config: &preflop_tree::PreflopConfig,
    solution: &Solution,
) -> Result<ValidationReport, String> {
    let expected_hash = hash_game_config(config);
    if solution.game_config_hash != expected_hash {
        return Err(format!(
            "gameConfigHash mismatch: expected {expected_hash}, found {}",
            solution.game_config_hash
        ));
    }
    if solution.stack_bb != config.stack_bb {
        return Err(format!(
            "stack mismatch: expected {}, found {}",
            config.stack_bb, solution.stack_bb
        ));
    }
    if solution.iterations != config.solver.iterations {
        return Err(format!(
            "iteration mismatch: expected {}, found {}",
            config.solver.iterations, solution.iterations
        ));
    }
    if solution.nodes.is_empty() {
        return Err("solution has no nodes".to_string());
    }
    if !solution.convergence.average_strategy_delta.is_finite()
        || !solution.convergence.exploitability.is_finite()
    {
        return Err("solution convergence contains non-finite values".to_string());
    }

    let expected_combos = poker_core::all_starting_combos()
        .into_iter()
        .map(|combo| combo.to_string())
        .collect::<std::collections::HashSet<_>>();
    let expected_hands = all_hand_classes()
        .into_iter()
        .map(|hand| hand.to_string())
        .collect::<std::collections::HashSet<_>>();
    let strategy_nodes = solution
        .nodes
        .iter()
        .filter(|node| !node.combos.is_empty())
        .collect::<Vec<_>>();
    if strategy_nodes.is_empty() {
        return Err("solution has no strategy nodes".to_string());
    }

    for node in strategy_nodes {
        if node.combos.len() != expected_combos.len() {
            return Err(format!(
                "node {} has {} combos; expected {}",
                node.node_id,
                node.combos.len(),
                expected_combos.len()
            ));
        }
        let actual_combos = node
            .combos
            .iter()
            .map(|combo| combo.combo.clone())
            .collect::<std::collections::HashSet<_>>();
        if actual_combos != expected_combos {
            return Err(format!(
                "node {} does not contain the complete 1326-combo set",
                node.node_id
            ));
        }
        if node.hand_aggregates.len() != expected_hands.len() {
            return Err(format!(
                "node {} has {} hand aggregates; expected {}",
                node.node_id,
                node.hand_aggregates.len(),
                expected_hands.len()
            ));
        }
        let actual_hands = node
            .hand_aggregates
            .iter()
            .map(|aggregate| aggregate.hand.clone())
            .collect::<std::collections::HashSet<_>>();
        if actual_hands != expected_hands {
            return Err(format!(
                "node {} does not contain the complete 169-hand aggregate set",
                node.node_id
            ));
        }
        for combo in &node.combos {
            if combo.actions.is_empty() {
                return Err(format!(
                    "node {} combo {} has no actions",
                    node.node_id, combo.combo
                ));
            }
            let mut actions = std::collections::HashSet::new();
            let frequency_sum = combo.actions.iter().try_fold(0.0, |sum, action| {
                if !actions.insert(action.action.clone()) {
                    return Err(format!(
                        "node {} combo {} contains duplicate action {}",
                        node.node_id, combo.combo, action.action
                    ));
                }
                if !action.frequency.is_finite()
                    || !(0.0..=1.0).contains(&action.frequency)
                    || !action.ev_bb.is_finite()
                {
                    return Err(format!(
                        "node {} combo {} has invalid action values",
                        node.node_id, combo.combo
                    ));
                }
                Ok(sum + action.frequency)
            })?;
            if (frequency_sum - 1.0_f64).abs() > 1e-6 {
                return Err(format!(
                    "node {} combo {} frequencies sum to {frequency_sum}",
                    node.node_id, combo.combo
                ));
            }
        }
    }

    Ok(ValidationReport {
        status: SolutionStatus::Provisional,
        format_valid: true,
        full_combo_coverage: true,
        frequency_integrity: true,
        ev_integrity: true,
        exploitability_status: ExploitabilityStatus::SampledEstimate,
        gto_verified: false,
        notes: vec![
            "Postflop continuation is provided by a provisional model.".to_string(),
            "Exploitability is a sampled estimate, not an exact best response.".to_string(),
        ],
    })
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
        assert_eq!(solution.stack_bb, 100.0);
        let decision = solution
            .nodes
            .iter()
            .find(|node| node.node_type == "player_decision")
            .unwrap();
        assert_eq!(decision.combos.len(), 1326);
        assert_eq!(decision.hand_aggregates.len(), 169);
        assert!(solution.hand(&decision.node_id, "AA").is_some());
    }

    #[test]
    fn validation_marks_structurally_valid_results_as_provisional() {
        let mut config = PreflopConfig::default();
        config.solver.iterations = 1;
        let tree = GameTree::build(config.clone()).unwrap();
        let mut progress = |_| {};
        let output =
            CfrStrategy::cfr().solve(&tree, &SimpleContinuationModel::default(), 1, &mut progress);
        let solution = Solution::from_solver_output(
            "test-v1",
            hash_game_config(&config),
            "now",
            output,
            &tree,
        );
        let report = validate_solution(&config, &solution).unwrap();
        assert!(report.format_valid);
        assert!(report.full_combo_coverage);
        assert!(report.frequency_integrity);
        assert!(report.ev_integrity);
        assert!(!report.gto_verified);
        assert_eq!(report.status, SolutionStatus::Provisional);
    }
}
