//! Solver algorithms and solver-facing result types.
//!
//! The poker solver uses external-sampling CFR over the heads-up branches in
//! the v0.1 preflop tree. Each information set is keyed by the public node
//! and the acting player's 1326-combo private hand. The engine keeps
//! counterfactual reach, regret, current strategy, and average strategy
//! separately so a future full multiway/chance abstraction can replace the
//! preflop adapter without changing the solution format.

use continuation::ContinuationEvaluator;
use poker_core::{all_starting_combos, combo_strength, Position, Range, StartingCombo};
use preflop_tree::{ActionHistory, ActionKind, GameTree, Node, PlayerDecisionNode};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct SolverProgress {
    pub iteration: u32,
    pub average_strategy_delta: f64,
    pub exploitability: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConvergenceMetrics {
    pub iterations: u32,
    pub average_strategy_delta: f64,
    #[serde(default)]
    pub exploitability: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComboActionStrategy {
    pub action: ActionKind,
    pub frequency: f64,
    pub ev_bb: f64,
    pub regret: f64,
    pub strategy_sum: f64,
    pub counterfactual_reach: f64,
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
        if self.discounted {
            "dcfr-v0.2-external-sampling"
        } else {
            "cfr-v0.2-external-sampling"
        }
    }

    fn solve(
        &self,
        tree: &GameTree,
        continuation: &dyn ContinuationEvaluator,
        iterations: u32,
        progress: &mut dyn FnMut(SolverProgress),
    ) -> SolverOutput {
        let iterations = iterations.max(1);
        let combos = all_starting_combos();
        let compatibility = build_compatibility(&combos);
        let mut subgames: Vec<_> = tree
            .decision_roots()
            .enumerate()
            .map(|(root_index, root)| SubgameState::new(tree, root, root_index, &combos))
            .collect();
        let progress_step = (iterations / 10).max(1);
        let mut last_delta = 0.0;
        const TRAVERSER_COMBO_SAMPLES: usize = 64;

        for iteration in 1..=iterations {
            let mut delta_sum = 0.0;
            let mut delta_count = 0usize;
            for subgame in &mut subgames {
                let (sum, count) = subgame.prepare(iteration, self.discounted);
                delta_sum += sum;
                delta_count += count;

                for traverser in 0..2 {
                    for sample_index in 0..TRAVERSER_COMBO_SAMPLES {
                        let traverser_combo_index = sampled_combo_index(
                            iteration,
                            subgame.root_index,
                            traverser,
                            sample_index,
                            combos.len(),
                        );
                        let traverser_combo = combos[traverser_combo_index];
                        let opponent_combo_index = sample_compatible_combo(
                            &compatibility[traverser_combo_index],
                            iteration,
                            subgame.root_index,
                            traverser,
                            traverser_combo_index,
                        );
                        let private = if traverser == 0 {
                            [traverser_combo, combos[opponent_combo_index]]
                        } else {
                            [combos[opponent_combo_index], traverser_combo]
                        };
                        let seed = traversal_seed(
                            iteration,
                            subgame.root_index,
                            traverser,
                            traverser_combo_index,
                        );
                        let mut traversal = Traversal {
                            tree,
                            subgame,
                            continuation,
                            traverser,
                            private,
                            average_strategy_weight: averaging_weight(iteration, self.discounted),
                        };
                        traversal.traverse(traversal.root_id().to_string().as_str(), [1.0, 1.0], seed);
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
                    exploitability: 0.0,
                });
            }
        }

        let exploitability = estimate_exploitability(tree, &subgames, &compatibility, continuation);
        progress(SolverProgress {
            iteration: iterations,
            average_strategy_delta: last_delta,
            exploitability,
        });

        let mut by_node = HashMap::new();
        for subgame in &subgames {
            for state in subgame.nodes.values() {
                by_node.insert(state.node_id.clone(), state.to_output());
            }
        }
        let nodes = tree
            .decision_nodes()
            .filter_map(|node| by_node.remove(&node.common.node_id))
            .collect();

        SolverOutput {
            solver_version: self.solver_version().to_string(),
            continuation_model_version: continuation.version().to_string(),
            iterations,
            convergence: ConvergenceMetrics {
                iterations,
                average_strategy_delta: last_delta,
                exploitability,
            },
            nodes,
        }
    }
}

struct SubgameState {
    root_id: String,
    opener: Position,
    stack_bb: f64,
    root_index: usize,
    nodes: HashMap<String, NodeState>,
}

impl SubgameState {
    fn new(
        tree: &GameTree,
        root: &PlayerDecisionNode,
        root_index: usize,
        combos: &[StartingCombo],
    ) -> Self {
        let opener = root.common.action_history.actions[0].position;
        let mut pending = vec![root.common.node_id.clone()];
        let mut visited = HashSet::new();
        let mut nodes = HashMap::new();
        while let Some(node_id) = pending.pop() {
            if !visited.insert(node_id.clone()) {
                continue;
            }
            let Some(Node::PlayerDecision(node)) = tree.node(&node_id) else {
                continue;
            };
            nodes.insert(node_id.clone(), NodeState::new(node, combos));
            for transition in &node.transitions {
                pending.push(transition.next_node_id.clone());
            }
        }
        Self {
            root_id: root.common.node_id.clone(),
            opener,
            stack_bb: tree.config.stack_bb,
            root_index,
            nodes,
        }
    }

    fn prepare(&mut self, iteration: u32, discounted: bool) -> (f64, usize) {
        let mut delta_sum = 0.0;
        let mut delta_count = 0;
        for node in self.nodes.values_mut() {
            for combo in &mut node.combos {
                if discounted {
                    combo.discount_regrets(iteration);
                }
                let (sum, count) = combo.prepare_strategy();
                delta_sum += sum;
                delta_count += count;
            }
        }
        (delta_sum, delta_count)
    }
}

struct NodeState {
    node_id: String,
    action_history: ActionHistory,
    acting_position: Position,
    available_actions: Vec<ActionKind>,
    combos: Vec<ComboState>,
}

impl NodeState {
    fn new(node: &PlayerDecisionNode, combos: &[StartingCombo]) -> Self {
        Self {
            node_id: node.common.node_id.clone(),
            action_history: node.common.action_history.clone(),
            acting_position: node.common.acting_player.expect("decision has actor"),
            available_actions: node.available_actions.clone(),
            combos: combos
                .iter()
                .copied()
                .map(|combo| ComboState::new(combo, node.available_actions.len()))
                .collect(),
        }
    }

    fn to_output(&self) -> NodeStrategy {
        NodeStrategy {
            node_id: self.node_id.clone(),
            action_history: self.action_history.key(),
            acting_position: self.acting_position.to_string(),
            combos: self
                .combos
                .iter()
                .map(|combo| combo.to_output(&self.available_actions))
                .collect(),
        }
    }

    fn strategy(&self, combo_index: usize) -> Vec<f64> {
        self.combos[combo_index].strategy.clone()
    }

    fn average_strategy(&self, combo_index: usize) -> Vec<f64> {
        self.combos[combo_index].average_strategy()
    }
}

struct ComboState {
    combo: StartingCombo,
    regrets: Vec<f64>,
    strategy_sums: Vec<f64>,
    strategy: Vec<f64>,
    previous_strategy: Vec<f64>,
    ev_sums: Vec<f64>,
    ev_weights: Vec<f64>,
    counterfactual_reach: f64,
}

impl ComboState {
    fn new(combo: StartingCombo, action_count: usize) -> Self {
        let initial = 1.0 / action_count.max(1) as f64;
        Self {
            combo,
            regrets: vec![0.0; action_count],
            strategy_sums: vec![0.0; action_count],
            strategy: vec![initial; action_count],
            previous_strategy: vec![initial; action_count],
            ev_sums: vec![0.0; action_count],
            ev_weights: vec![0.0; action_count],
            counterfactual_reach: 0.0,
        }
    }

    fn discount_regrets(&mut self, iteration: u32) {
        let t = f64::from(iteration);
        let positive_factor = (t / (t + 1.0)).powf(1.5);
        let negative_factor = (t / (t + 1.0)).powf(0.5);
        for regret in &mut self.regrets {
            *regret *= if *regret >= 0.0 {
                positive_factor
            } else {
                negative_factor
            };
        }
    }

    fn prepare_strategy(&mut self) -> (f64, usize) {
        let positive_sum: f64 = self.regrets.iter().map(|regret| regret.max(0.0)).sum();
        if positive_sum <= f64::EPSILON {
            let uniform = 1.0 / self.strategy.len().max(1) as f64;
            self.strategy.fill(uniform);
        } else {
            for (regret, probability) in self.regrets.iter().zip(self.strategy.iter_mut()) {
                *probability = regret.max(0.0) / positive_sum;
            }
        }
        let delta_sum = self
            .strategy
            .iter()
            .zip(self.previous_strategy.iter_mut())
            .map(|(current, previous)| {
                let delta = (current - *previous).abs();
                *previous = *current;
                delta
            })
            .sum();
        (delta_sum, self.strategy.len())
    }

    fn average_strategy(&self) -> Vec<f64> {
        let total: f64 = self.strategy_sums.iter().sum();
        if total <= f64::EPSILON {
            return self.strategy.clone();
        }
        self.strategy_sums
            .iter()
            .map(|value| value / total)
            .collect()
    }

    fn to_output(&self, actions: &[ActionKind]) -> ComboStrategy {
        let total_strategy_sum: f64 = self.strategy_sums.iter().sum();
        let fallback = 1.0 / actions.len().max(1) as f64;
        ComboStrategy {
            combo: self.combo,
            hand: self.combo.hand_class().to_string(),
            actions: actions
                .iter()
                .copied()
                .enumerate()
                .map(|(index, action)| ComboActionStrategy {
                    action,
                    frequency: if total_strategy_sum <= f64::EPSILON {
                        fallback
                    } else {
                        self.strategy_sums[index] / total_strategy_sum
                    },
                    ev_bb: if self.ev_weights[index] <= f64::EPSILON {
                        0.0
                    } else {
                        self.ev_sums[index] / self.ev_weights[index]
                    },
                    regret: self.regrets[index],
                    strategy_sum: self.strategy_sums[index],
                    counterfactual_reach: self.counterfactual_reach,
                })
                .collect(),
        }
    }
}

struct Traversal<'a> {
    tree: &'a GameTree,
    subgame: &'a mut SubgameState,
    continuation: &'a dyn ContinuationEvaluator,
    traverser: usize,
    private: [StartingCombo; 2],
    average_strategy_weight: f64,
}

impl<'a> Traversal<'a> {
    fn root_id(&self) -> &str {
        &self.subgame.root_id
    }

    fn traverse(&mut self, node_id: &str, reach: [f64; 2], seed: u64) -> f64 {
        let Some(node) = self.tree.node(node_id) else {
            return 0.0;
        };
        match node {
            Node::Continuation(_) | Node::TerminalFold(_) | Node::TerminalAllIn(_) => {
                self.terminal_utility(node)
            }
            Node::PlayerDecision(decision) => {
                let actor = decision.common.acting_player.expect("decision has actor");
                let player = if actor == self.subgame.opener { 0 } else { 1 };
                let combo_index = self.private[player].index() as usize;
                let actions = decision.available_actions.clone();
                let strategy = self
                    .subgame
                    .nodes
                    .get(node_id)
                    .map(|state| state.strategy(combo_index))
                    .unwrap_or_else(|| uniform_strategy(actions.len()));

                if player == self.traverser {
                    let mut action_values = Vec::with_capacity(actions.len());
                    for (index, action) in actions.iter().copied().enumerate() {
                        let Some(next) = self.tree.next_node(node, action) else {
                            action_values.push(0.0);
                            continue;
                        };
                        let action_seed = seed
                            .wrapping_add(index as u64 + 1)
                            .rotate_left(13);
                        action_values.push(self.traverse(
                            next.common().node_id.as_str(),
                            reach,
                            action_seed,
                        ));
                    }
                    let node_value = strategy
                        .iter()
                        .zip(action_values.iter())
                        .map(|(probability, value)| probability * value)
                        .sum::<f64>();
                    let counterfactual_reach = reach[1 - player];
                    let own_reach = reach[player];
                    if let Some(state) = self.subgame.nodes.get_mut(node_id) {
                        let combo = &mut state.combos[combo_index];
                        combo.counterfactual_reach += counterfactual_reach;
                        for index in 0..actions.len() {
                            combo.regrets[index] +=
                                counterfactual_reach * (action_values[index] - node_value);
                            combo.strategy_sums[index] += own_reach
                                * strategy[index]
                                * self.average_strategy_weight;
                            combo.ev_sums[index] += counterfactual_reach * action_values[index];
                            combo.ev_weights[index] += counterfactual_reach;
                        }
                    }
                    node_value
                } else {
                    let action_index = sample_action(&strategy, seed);
                    let Some(action) = actions.get(action_index).copied() else {
                        return 0.0;
                    };
                    let Some(next) = self.tree.next_node(node, action) else {
                        return 0.0;
                    };
                    let probability = strategy
                        .get(action_index)
                        .copied()
                        .unwrap_or(0.0)
                        .max(f64::EPSILON);
                    let mut next_reach = reach;
                    next_reach[player] *= probability;
                    self.traverse(
                        next.common().node_id.as_str(),
                        next_reach,
                        seed.rotate_left(17),
                    )
                }
            }
        }
    }

    fn terminal_utility(&self, node: &Node) -> f64 {
        let responder_value = responder_terminal_value(
            node,
            self.subgame.opener,
            self.private,
            self.continuation,
            self.subgame.stack_bb,
        );
        if self.traverser == 1 {
            responder_value
        } else {
            -responder_value
        }
    }
}

struct Evaluation<'a> {
    tree: &'a GameTree,
    subgame: &'a SubgameState,
    continuation: &'a dyn ContinuationEvaluator,
}

impl<'a> Evaluation<'a> {
    fn profile_value(
        &self,
        node_id: &str,
        private: [StartingCombo; 2],
        traverser: usize,
    ) -> f64 {
        let Some(node) = self.tree.node(node_id) else {
            return 0.0;
        };
        match node {
            Node::Continuation(_) | Node::TerminalFold(_) | Node::TerminalAllIn(_) => {
                self.terminal_utility(node, private, traverser)
            }
            Node::PlayerDecision(decision) => {
                let actor = decision.common.acting_player.expect("decision has actor");
                let player = if actor == self.subgame.opener { 0 } else { 1 };
                let strategy = self.strategy(node_id, private[player]);
                decision
                    .available_actions
                    .iter()
                    .copied()
                    .enumerate()
                    .map(|(index, action)| {
                        let Some(next) = self.tree.next_node(node, action) else {
                            return 0.0;
                        };
                        strategy[index]
                            * self.profile_value(next.common().node_id.as_str(), private, traverser)
                    })
                    .sum()
            }
        }
    }

    fn best_response_value(
        &self,
        node_id: &str,
        private: [StartingCombo; 2],
        traverser: usize,
    ) -> f64 {
        let Some(node) = self.tree.node(node_id) else {
            return 0.0;
        };
        match node {
            Node::Continuation(_) | Node::TerminalFold(_) | Node::TerminalAllIn(_) => {
                self.terminal_utility(node, private, traverser)
            }
            Node::PlayerDecision(decision) => {
                let actor = decision.common.acting_player.expect("decision has actor");
                let player = if actor == self.subgame.opener { 0 } else { 1 };
                let values: Vec<_> = decision
                    .available_actions
                    .iter()
                    .copied()
                    .map(|action| {
                        let Some(next) = self.tree.next_node(node, action) else {
                            return 0.0;
                        };
                        self.best_response_value(next.common().node_id.as_str(), private, traverser)
                    })
                    .collect();
                if player == traverser {
                    values.into_iter().fold(f64::NEG_INFINITY, f64::max)
                } else {
                    let strategy = self.strategy(node_id, private[player]);
                    strategy
                        .iter()
                        .zip(values)
                        .map(|(probability, value)| probability * value)
                        .sum()
                }
            }
        }
    }

    fn strategy(&self, node_id: &str, combo: StartingCombo) -> Vec<f64> {
        self.subgame
            .nodes
            .get(node_id)
            .map(|node| node.average_strategy(combo.index() as usize))
            .unwrap_or_default()
    }

    fn terminal_utility(
        &self,
        node: &Node,
        private: [StartingCombo; 2],
        traverser: usize,
    ) -> f64 {
        let responder_value = responder_terminal_value(
            node,
            self.subgame.opener,
            private,
            self.continuation,
            self.subgame.stack_bb,
        );
        if traverser == 1 {
            responder_value
        } else {
            -responder_value
        }
    }
}

fn estimate_exploitability(
    tree: &GameTree,
    subgames: &[SubgameState],
    compatibility: &[Vec<usize>],
    continuation: &dyn ContinuationEvaluator,
) -> f64 {
    // Exploitability is a diagnostic estimate in v0.2. Exact best-response
    // evaluation over all 1326 x 1326 private-card pairs is reserved for a
    // later evaluator; these deterministic samples keep worker runtimes
    // predictable while still exposing strategy drift.
    const COMBO_SAMPLES: usize = 8;
    const OPPONENT_SAMPLES: usize = 1;
    let combos = all_starting_combos();
    let mut total_gap = 0.0;
    let mut sample_count = 0usize;
    for subgame in subgames {
        let evaluation = Evaluation {
            tree,
            subgame,
            continuation,
        };
        for traverser in 0..2 {
            for sample_index in 0..COMBO_SAMPLES.min(combos.len()) {
                let traverser_combo_index = sample_index * combos.len() / COMBO_SAMPLES;
                let traverser_combo = combos[traverser_combo_index];
                let compatible = &compatibility[traverser_combo_index];
                for sample in 0..OPPONENT_SAMPLES {
                    let opponent_combo_index = compatible[(sample
                        + subgame.root_index
                        + traverser_combo_index * 17)
                        % compatible.len()];
                    let private = if traverser == 0 {
                        [traverser_combo, combos[opponent_combo_index]]
                    } else {
                        [combos[opponent_combo_index], traverser_combo]
                    };
                    let profile = evaluation.profile_value(&subgame.root_id, private, traverser);
                    let best_response =
                        evaluation.best_response_value(&subgame.root_id, private, traverser);
                    total_gap += (best_response - profile).max(0.0);
                    sample_count += 1;
                }
            }
        }
    }
    if sample_count == 0 {
        0.0
    } else {
        total_gap / sample_count as f64
    }
}

fn responder_terminal_value(
    node: &Node,
    opener: Position,
    private: [StartingCombo; 2],
    continuation: &dyn ContinuationEvaluator,
    stack_bb: f64,
) -> f64 {
    let common = node.common();
    let pot_state = replay_pot(&common.action_history, stack_bb);
    let responder_position = common
        .action_history
        .actions
        .iter()
        .rev()
        .map(|action| action.position)
        .find(|position| *position != opener)
        .unwrap_or(Position::Bb);
    let responder_range = Range::singleton(private[1]);
    let opener_range = Range::singleton(private[0]);
    let opener_contribution = pot_state.contributions[opener.index()];
    let responder_contribution = pot_state.contributions[responder_position.index()];
    let active_contributions = opener_contribution + responder_contribution;
    let dead_money = (pot_state.total() - active_contributions).max(0.0);
    match node {
        Node::TerminalFold(_) => {
            let folded = common
                .action_history
                .actions
                .last()
                .map(|action| action.position)
                .unwrap_or(opener);
            let winner_is_responder = folded == opener;
            let actual_value = if winner_is_responder {
                pot_state.total() - responder_contribution
            } else {
                -responder_contribution
            };
            actual_value - dead_money * 0.5
        }
        Node::TerminalAllIn(_) => {
            let equity = pairwise_equity(private[1], private[0]);
            let stack = stack_bb;
            let final_pot = dead_money + stack * 2.0;
            equity * final_pot - stack - dead_money * 0.5
        }
        Node::Continuation(_) => continuation.evaluate(
            &responder_range,
            &opener_range,
            pot_state.total(),
            (stack_bb - opener_contribution)
                .min(stack_bb - responder_contribution)
                .max(0.0),
            responder_position,
        ),
        Node::PlayerDecision(_) => 0.0,
    }
}

struct PotState {
    contributions: [f64; 6],
    current_bet: f64,
}

impl PotState {
    fn total(&self) -> f64 {
        self.contributions.iter().sum()
    }
}

fn replay_pot(history: &ActionHistory, stack_bb: f64) -> PotState {
    let mut state = PotState {
        contributions: [0.0; 6],
        current_bet: 1.0,
    };
    state.contributions[Position::Sb.index()] = 0.5;
    state.contributions[Position::Bb.index()] = 1.0;
    for action in &history.actions {
        let position = action.position.index();
        match action.action {
            ActionKind::Fold => {}
            ActionKind::Call => {
                state.contributions[position] = state.current_bet;
            }
            ActionKind::Raise { size_bb } => {
                state.current_bet = size_bb.min(stack_bb);
                state.contributions[position] = state.current_bet;
            }
            ActionKind::AllIn => {
                state.current_bet = stack_bb;
                state.contributions[position] = stack_bb;
            }
            ActionKind::Check => {}
        }
    }
    state
}

fn pairwise_equity(first: StartingCombo, second: StartingCombo) -> f64 {
    (0.5 + f64::from(combo_strength(first) - combo_strength(second)) * 0.7).clamp(0.0, 1.0)
}

fn build_compatibility(combos: &[StartingCombo]) -> Vec<Vec<usize>> {
    combos
        .iter()
        .copied()
        .map(|combo| {
            combos
                .iter()
                .copied()
                .enumerate()
                .filter_map(|(index, other)| compatible(combo, other).then_some(index))
                .collect()
        })
        .collect()
}

fn compatible(first: StartingCombo, second: StartingCombo) -> bool {
    first.first != second.first
        && first.first != second.second
        && first.second != second.first
        && first.second != second.second
}

fn sample_compatible_combo(
    compatible_indices: &[usize],
    iteration: u32,
    root_index: usize,
    traverser: usize,
    combo_index: usize,
) -> usize {
    let seed = traversal_seed(iteration, root_index, traverser, combo_index);
    compatible_indices[(seed as usize) % compatible_indices.len()]
}

fn sampled_combo_index(
    iteration: u32,
    root_index: usize,
    traverser: usize,
    sample_index: usize,
    combo_count: usize,
) -> usize {
    let seed = traversal_seed(iteration, root_index, traverser, sample_index);
    // 997 is coprime with 1326, so the deterministic stride does not repeat
    // the same subset when the iteration seed changes.
    (seed as usize + sample_index * 997) % combo_count
}

fn traversal_seed(iteration: u32, root_index: usize, traverser: usize, combo_index: usize) -> u64 {
    let mut seed = u64::from(iteration).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    seed ^= (root_index as u64).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    seed ^= (traverser as u64).wrapping_mul(0x94D0_49BB_1331_11EB);
    seed ^= (combo_index as u64).wrapping_mul(0xD2B7_4407_B1CE_6E93);
    seed ^= seed >> 30;
    seed = seed.wrapping_mul(0xBF58_476D_1CE4_E5B9);
    seed ^= seed >> 27;
    seed
}

fn uniform_strategy(action_count: usize) -> Vec<f64> {
    vec![1.0 / action_count.max(1) as f64; action_count]
}

fn sample_action(strategy: &[f64], seed: u64) -> usize {
    if strategy.is_empty() {
        return 0;
    }
    let value = (seed as f64) / (u64::MAX as f64);
    let mut cumulative = 0.0;
    for (index, probability) in strategy.iter().copied().enumerate() {
        cumulative += probability;
        if value <= cumulative || index + 1 == strategy.len() {
            return index;
        }
    }
    strategy.len() - 1
}

fn averaging_weight(iteration: u32, discounted: bool) -> f64 {
    if discounted {
        f64::from(iteration).powf(2.0)
    } else {
        1.0
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ToyCfrResult {
    pub player_a_action_one_frequency: f64,
    pub player_b_action_one_frequency: f64,
    pub iterations: u32,
    pub exploitability: f64,
}

/// A tiny two-action zero-sum game used to verify CFR and exploitability
/// independently from poker tree construction.
pub fn solve_toy_matching_pennies(iterations: u32) -> ToyCfrResult {
    let iterations = iterations.max(1);
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
    let denominator = f64::from(iterations);
    let a = sums_a[0] / denominator;
    let b = sums_b[0] / denominator;
    ToyCfrResult {
        player_a_action_one_frequency: a,
        player_b_action_one_frequency: b,
        iterations,
        exploitability: (2.0 * b - 1.0).abs() + (2.0 * a - 1.0).abs(),
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
    fn toy_game_converges_to_mixed_equilibrium_and_has_low_exploitability() {
        let result = solve_toy_matching_pennies(5_000);
        assert!((result.player_a_action_one_frequency - 0.5).abs() < 0.05);
        assert!((result.player_b_action_one_frequency - 0.5).abs() < 0.05);
        assert!(result.exploitability < 0.2);
    }

    #[test]
    fn poker_solver_emits_all_1326_combos_and_reach_metrics() {
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
        assert!(output
            .nodes
            .iter()
            .flat_map(|node| node.combos.iter())
            .flat_map(|combo| combo.actions.iter())
            .any(|action| action.counterfactual_reach > 0.0));
        assert!(output.convergence.exploitability.is_finite());
    }
}
