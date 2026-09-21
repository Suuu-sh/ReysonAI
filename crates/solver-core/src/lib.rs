//! Solver algorithms and solver-facing result types.
//!
//! `SolverStrategy` is the replacement boundary.  The current implementation
//! is a compact CFR/DCFR regret-matching pass over every combo and decision
//! node.  The poker tree is intentionally supplied as data; worker orchestration
//! and persistence live outside this crate.

use continuation::ContinuationEvaluator;
use poker_core::{combo_strength, all_starting_combos, Range, StartingCombo};
use preflop_tree::{ActionKind, GameTree, PlayerDecisionNode};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct SolverProgress {
    pub iteration: u32,
    pub average_strategy_delta: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConvergenceMetrics {
    pub iterations: u32,
    pub average_strategy_delta: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComboActionStrategy {
    pub action: ActionKind,
    pub frequency: f64,
    pub ev_bb: f64,
    pub regret: f64,
    pub strategy_sum: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComboStrategy {
    pub combo: StartingCombo,
    pub hand: String,
    pub actions: Vec<ComboActionStrategy>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeStrategy {
    pub node_id: String,
    pub action_history: String,
    pub acting_position: String,
    pub combos: Vec<ComboStrategy>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolverOutput {
    pub solver_version: String,
    pub continuation_model_version: String,
    pub iterations: u32,
    pub convergence: ConvergenceMetrics,
    pub nodes: Vec<NodeStrategy>,
}

pub trait SolverStrategy {
    fn solver_version(&self) -> &str;

    fn solve(
        &self,
        tree: &GameTree,
        continuation: &dyn ContinuationEvaluator,
        iterations: u32,
        progress: &mut dyn FnMut(SolverProgress),
    ) -> SolverOutput;
}

#[derive(Debug, Clone)]
pub struct CfrStrategy {
    pub discounted: bool,
}

impl CfrStrategy {
    pub fn cfr() -> Self {
        Self { discounted: false }
    }

    pub fn dcfr() -> Self {
        Self { discounted: true }
    }
}

impl Default for CfrStrategy {
    fn default() -> Self {
        Self::dcfr()
    }
}

impl SolverStrategy for CfrStrategy {
    fn solver_version(&self) -> &str {
        if self.discounted { "dcfr-v0.1" } else { "cfr-v0.1" }
    }

    fn solve(
        &self,
        tree: &GameTree,
        continuation: &dyn ContinuationEvaluator,
        iterations: u32,
        progress: &mut dyn FnMut(SolverProgress),
    ) -> SolverOutput {
        let combos = all_starting_combos();
        let uniform_range = Range::default();
        let mut states: Vec<NodeState> = tree
            .decision_nodes()
            .map(|node| NodeState::new(node, &combos))
            .collect();
        // The v0.1 continuation model is static for a node. Computing it
        // once keeps the hot CFR loop focused on regret arithmetic.
        let continuation_evs: Vec<f64> = states
            .iter()
            .map(|state| {
                continuation.evaluate(
                    &uniform_range,
                    &uniform_range,
                    state.node.common.pot_bb,
                    state.node.common.effective_stack_bb,
                    state.node.common.acting_player.expect("decision has actor"),
                )
            })
            .collect();
        let mut last_delta = 0.0;
        let progress_step = (iterations / 10).max(1);

        for iteration in 1..=iterations {
            let mut delta_sum = 0.0;
            let mut delta_count = 0usize;
            for (state, continuation_ev) in states.iter_mut().zip(continuation_evs.iter().copied()) {
                for combo_state in &mut state.combos {
                    let discount = if self.discounted {
                        let t = iteration as f64;
                        (t / (t + 1.0)).powf(1.5) as f32
                    } else {
                        1.0
                    };
                    for regret in &mut combo_state.regrets {
                        *regret *= discount;
                    }
                    regret_matching_into(&combo_state.regrets, &mut combo_state.strategy);
                    for (index, probability) in combo_state.strategy.iter().copied().enumerate() {
                        let old = combo_state.last_strategy[index];
                        delta_sum += f64::from((probability - old).abs());
                        delta_count += 1;
                        combo_state.last_strategy[index] = probability;
                        combo_state.strategy_sums[index] += probability;
                    }

                    for (index, action) in state.node.available_actions.iter().copied().enumerate() {
                        combo_state.utilities[index] =
                            action_utility(combo_state.combo, action, state.node, continuation_ev)
                                as f32;
                    }
                    let node_utility: f32 = combo_state
                        .strategy
                        .iter()
                        .zip(combo_state.utilities.iter())
                        .map(|(probability, utility)| probability * utility)
                        .sum();
                    for index in 0..combo_state.utilities.len() {
                        combo_state.regrets[index] += combo_state.utilities[index] - node_utility;
                        combo_state.ev_sums[index] += f64::from(combo_state.utilities[index]);
                    }
                }
            }
            last_delta = if delta_count == 0 {
                0.0
            } else {
                delta_sum / delta_count as f64
            };
            if iteration == 1 || iteration == iterations || iteration % progress_step == 0 {
                progress(SolverProgress {
                    iteration,
                    average_strategy_delta: last_delta,
                });
            }
        }

        let nodes = states
            .into_iter()
            .map(|state| state.into_output(iterations))
            .collect();
        SolverOutput {
            solver_version: self.solver_version().to_string(),
            continuation_model_version: continuation.version().to_string(),
            iterations,
            convergence: ConvergenceMetrics {
                iterations,
                average_strategy_delta: last_delta,
            },
            nodes,
        }
    }
}

struct NodeState<'a> {
    node: &'a PlayerDecisionNode,
    combos: Vec<ComboState>,
}

impl<'a> NodeState<'a> {
    fn new(node: &'a PlayerDecisionNode, combos: &[StartingCombo]) -> Self {
        Self {
            node,
            combos: combos
                .iter()
                .copied()
                .map(|combo| ComboState::new(combo, node.available_actions.len()))
                .collect(),
        }
    }

    fn into_output(self, iterations: u32) -> NodeStrategy {
        let iterations = f64::from(iterations.max(1));
        NodeStrategy {
            node_id: self.node.common.node_id.clone(),
            action_history: self.node.common.action_history.key(),
            acting_position: self.node.common.acting_player.unwrap().to_string(),
            combos: self
                .combos
                .into_iter()
                .map(|combo| ComboStrategy {
                    combo: combo.combo,
                    hand: combo.combo.hand_class().to_string(),
                    actions: self
                        .node
                        .available_actions
                        .iter()
                        .copied()
                        .enumerate()
                        .map(|(index, action)| ComboActionStrategy {
                            action,
                            frequency: f64::from(combo.strategy_sums[index]) / iterations,
                            ev_bb: combo.ev_sums[index] / iterations,
                            regret: f64::from(combo.regrets[index]),
                            strategy_sum: f64::from(combo.strategy_sums[index]),
                        })
                        .collect(),
                })
                .collect(),
        }
    }
}

struct ComboState {
    combo: StartingCombo,
    regrets: Vec<f32>,
    strategy_sums: Vec<f32>,
    last_strategy: Vec<f32>,
    strategy: Vec<f32>,
    utilities: Vec<f32>,
    ev_sums: Vec<f64>,
}

impl ComboState {
    fn new(combo: StartingCombo, action_count: usize) -> Self {
        let initial = 1.0 / action_count.max(1) as f32;
        Self {
            combo,
            regrets: vec![0.0; action_count],
            strategy_sums: vec![0.0; action_count],
            last_strategy: vec![initial; action_count],
            strategy: vec![initial; action_count],
            utilities: vec![0.0; action_count],
            ev_sums: vec![0.0; action_count],
        }
    }
}

fn regret_matching_into(regrets: &[f32], strategy: &mut [f32]) {
    let positive_sum: f32 = regrets.iter().map(|regret| regret.max(0.0)).sum();
    if positive_sum <= f32::EPSILON {
        let uniform = 1.0 / regrets.len().max(1) as f32;
        strategy.fill(uniform);
    } else {
        for (regret, probability) in regrets.iter().zip(strategy.iter_mut()) {
            *probability = regret.max(0.0) / positive_sum;
        }
    }
}

fn action_utility(
    combo: StartingCombo,
    action: ActionKind,
    node: &PlayerDecisionNode,
    continuation_ev: f64,
) -> f64 {
    let strength = f64::from(combo_strength(combo));
    let centered = strength - 0.5;
    match action {
        ActionKind::Fold => 0.0,
        ActionKind::Check => continuation_ev * 0.45 + centered * node.common.pot_bb,
        ActionKind::Call => continuation_ev * 0.65 + centered * node.common.pot_bb * 0.8,
        ActionKind::Raise { size_bb } => {
            continuation_ev * 0.30 + centered * (node.common.pot_bb + size_bb) + 0.02
        }
        ActionKind::AllIn => centered * (node.common.pot_bb + node.common.effective_stack_bb),
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ToyCfrResult {
    pub player_a_action_one_frequency: f64,
    pub player_b_action_one_frequency: f64,
    pub iterations: u32,
}

/// A tiny two-action matching-pennies game used to test the algorithmic
/// boundary independently from poker tree construction.
pub fn solve_toy_matching_pennies(iterations: u32) -> ToyCfrResult {
    let mut regrets_a = [0.0_f64; 2];
    let mut regrets_b = [0.0_f64; 2];
    let mut sums_a = [0.0_f64; 2];
    let mut sums_b = [0.0_f64; 2];
    for _ in 0..iterations {
        let strategy_a = regret_matching_f64(&regrets_a);
        let strategy_b = regret_matching_f64(&regrets_b);
        let utilities_a = [strategy_b[0] - strategy_b[1], strategy_b[1] - strategy_b[0]];
        let utilities_b = [-strategy_a[0] + strategy_a[1], strategy_a[0] - strategy_a[1]];
        let value_a = strategy_a[0] * utilities_a[0] + strategy_a[1] * utilities_a[1];
        let value_b = strategy_b[0] * utilities_b[0] + strategy_b[1] * utilities_b[1];
        for index in 0..2 {
            regrets_a[index] += utilities_a[index] - value_a;
            regrets_b[index] += utilities_b[index] - value_b;
            sums_a[index] += strategy_a[index];
            sums_b[index] += strategy_b[index];
        }
    }
    let denominator = f64::from(iterations.max(1));
    ToyCfrResult {
        player_a_action_one_frequency: sums_a[0] / denominator,
        player_b_action_one_frequency: sums_b[0] / denominator,
        iterations,
    }
}

fn regret_matching_f64(regrets: &[f64; 2]) -> [f64; 2] {
    let a = regrets[0].max(0.0);
    let b = regrets[1].max(0.0);
    if a + b <= f64::EPSILON {
        [0.5, 0.5]
    } else {
        [a / (a + b), b / (a + b)]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use continuation::SimpleContinuationModel;
    use preflop_tree::PreflopConfig;

    #[test]
    fn toy_game_converges_to_mixed_equilibrium() {
        let result = solve_toy_matching_pennies(5_000);
        assert!((result.player_a_action_one_frequency - 0.5).abs() < 0.05);
        assert!((result.player_b_action_one_frequency - 0.5).abs() < 0.05);
    }

    #[test]
    fn poker_solver_emits_all_1326_combos_and_progress() {
        let tree = GameTree::build(PreflopConfig::default()).unwrap();
        let mut progress_events = 0;
        let output = CfrStrategy::cfr().solve(
            &tree,
            &SimpleContinuationModel::default(),
            2,
            &mut |_| progress_events += 1,
        );
        assert!(!output.nodes.is_empty());
        assert_eq!(output.nodes[0].combos.len(), 1326);
        assert!(progress_events >= 2);
    }
}
