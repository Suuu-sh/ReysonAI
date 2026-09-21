//! Config-driven six-max preflop tree.
//!
//! The builder deliberately keeps the action-history key as the identity of
//! a node.  A service can therefore resolve a spot without sharing an in-
//! memory pointer or a database sequence with another process.

use poker_core::Position;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreflopConfig {
    pub game: String,
    pub players: u8,
    pub stack_bb: f64,
    pub ante_bb: f64,
    pub positions: Vec<Position>,
    pub sizing: SizingConfig,
    pub solver: SolverConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SizingConfig {
    pub open_sizes_bb: Vec<f64>,
    pub three_bet_ip_multiplier: f64,
    pub three_bet_oop_multiplier: f64,
    pub four_bet_multiplier: f64,
    pub five_bet_all_in: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolverConfig {
    pub iterations: u32,
    pub strategy: String,
}

impl Default for PreflopConfig {
    fn default() -> Self {
        Self {
            game: "Cash".to_string(),
            players: 6,
            stack_bb: 100.0,
            ante_bb: 0.0,
            positions: Position::ALL.to_vec(),
            sizing: SizingConfig {
                open_sizes_bb: vec![2.5],
                three_bet_ip_multiplier: 3.0,
                three_bet_oop_multiplier: 4.0,
                four_bet_multiplier: 2.2,
                five_bet_all_in: true,
            },
            solver: SolverConfig {
                iterations: 1_000,
                strategy: "dcfr".to_string(),
            },
        }
    }
}

impl PreflopConfig {
    pub fn from_json(value: &str) -> Result<Self, String> {
        let config: Self = serde_json::from_str(value).map_err(|error| error.to_string())?;
        config.validate()?;
        Ok(config)
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.game.to_ascii_lowercase() != "cash" {
            return Err("v0.1 only supports the Cash game".to_string());
        }
        if self.players != 6 || self.positions != Position::ALL {
            return Err("v0.1 requires the six-max UTG/HJ/CO/BTN/SB/BB positions".to_string());
        }
        if self.stack_bb <= 0.0 || self.ante_bb < 0.0 {
            return Err("stack must be positive and ante must not be negative".to_string());
        }
        if self.sizing.open_sizes_bb.is_empty()
            || self.sizing.open_sizes_bb.iter().any(|size| *size <= 0.0)
            || self.sizing.three_bet_ip_multiplier <= 1.0
            || self.sizing.three_bet_oop_multiplier <= 1.0
            || self.sizing.four_bet_multiplier <= 1.0
        {
            return Err("all configured bet sizes must be positive multipliers".to_string());
        }
        if self.solver.iterations == 0 {
            return Err("solver.iterations must be greater than zero".to_string());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ActionKind {
    Fold,
    Call,
    Check,
    Raise { #[serde(rename = "sizeBb")] size_bb: f64 },
    AllIn,
}

impl ActionKind {
    pub fn label(self) -> String {
        match self {
            Self::Fold => "fold".to_string(),
            Self::Call => "call".to_string(),
            Self::Check => "check".to_string(),
            Self::Raise { size_bb } => format!("raise_{}", format_size(size_bb)),
            Self::AllIn => "all_in".to_string(),
        }
    }

    pub fn short_label(self) -> String {
        match self {
            Self::Fold => "F".to_string(),
            Self::Call => "C".to_string(),
            Self::Check => "X".to_string(),
            Self::Raise { size_bb } => format!("R{}", format_size(size_bb)),
            Self::AllIn => "AI".to_string(),
        }
    }

    fn same_action(self, other: Self) -> bool {
        match (self, other) {
            (Self::Fold, Self::Fold)
            | (Self::Call, Self::Call)
            | (Self::Check, Self::Check)
            | (Self::AllIn, Self::AllIn) => true,
            (Self::Raise { size_bb: a }, Self::Raise { size_bb: b }) => (a - b).abs() < 0.0001,
            _ => false,
        }
    }
}

impl Display for ActionKind {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", (*self).short_label())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct HistoryAction {
    pub position: Position,
    pub action: ActionKind,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ActionHistory {
    pub actions: Vec<HistoryAction>,
}

impl ActionHistory {
    pub fn new(actions: Vec<HistoryAction>) -> Self {
        Self { actions }
    }

    pub fn key(&self) -> String {
        self.actions
            .iter()
            .map(|action| format!("{}:{}", action.position, action.action.short_label()))
            .collect::<Vec<_>>()
            .join("|")
    }

    pub fn push(&self, action: HistoryAction) -> Self {
        let mut actions = self.actions.clone();
        actions.push(action);
        Self { actions }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeCommon {
    pub node_id: String,
    pub acting_player: Option<Position>,
    pub pot_bb: f64,
    pub effective_stack_bb: f64,
    pub action_history: ActionHistory,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeTransition {
    pub action: ActionKind,
    pub next_node_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerDecisionNode {
    pub common: NodeCommon,
    pub available_actions: Vec<ActionKind>,
    pub transitions: Vec<NodeTransition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalFoldNode {
    pub common: NodeCommon,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalAllInNode {
    pub common: NodeCommon,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContinuationNode {
    pub common: NodeCommon,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Node {
    PlayerDecision(PlayerDecisionNode),
    TerminalFold(TerminalFoldNode),
    TerminalAllIn(TerminalAllInNode),
    Continuation(ContinuationNode),
}

impl Node {
    pub fn common(&self) -> &NodeCommon {
        match self {
            Self::PlayerDecision(node) => &node.common,
            Self::TerminalFold(node) => &node.common,
            Self::TerminalAllIn(node) => &node.common,
            Self::Continuation(node) => &node.common,
        }
    }

    pub fn node_type(&self) -> &'static str {
        match self {
            Self::PlayerDecision(_) => "player_decision",
            Self::TerminalFold(_) => "terminal_fold",
            Self::TerminalAllIn(_) => "terminal_all_in",
            Self::Continuation(_) => "continuation",
        }
    }

    pub fn available_actions(&self) -> &[ActionKind] {
        match self {
            Self::PlayerDecision(node) => &node.available_actions,
            _ => &[],
        }
    }

    pub fn transitions(&self) -> &[NodeTransition] {
        match self {
            Self::PlayerDecision(node) => &node.transitions,
            _ => &[],
        }
    }
}

#[derive(Debug, Clone)]
pub struct GameTree {
    pub config: PreflopConfig,
    nodes: Vec<Node>,
    by_id: HashMap<String, usize>,
    by_history: HashMap<String, String>,
}

impl GameTree {
    pub fn build(config: PreflopConfig) -> Result<Self, String> {
        config.validate()?;
        let mut builder = TreeBuilder {
            config: config.clone(),
            nodes: Vec::new(),
            by_id: HashMap::new(),
            by_history: HashMap::new(),
        };

        let empty = ActionHistory::default();
        builder.insert_node(Node::Continuation(ContinuationNode {
            common: builder.common(empty, None, 1.5, config.stack_bb),
        }))?;

        for opener in config.positions.iter().copied() {
            for open_size in config.sizing.open_sizes_bb.iter().copied() {
                builder.ensure_open_spot(opener, open_size)?;
            }
        }

        Ok(Self {
            config,
            nodes: builder.nodes,
            by_id: builder.by_id,
            by_history: builder.by_history,
        })
    }

    pub fn nodes(&self) -> &[Node] {
        &self.nodes
    }

    pub fn decision_nodes(&self) -> impl Iterator<Item = &PlayerDecisionNode> {
        self.nodes.iter().filter_map(|node| match node {
            Node::PlayerDecision(node) => Some(node),
            _ => None,
        })
    }

    pub fn node(&self, node_id: &str) -> Option<&Node> {
        self.by_id.get(node_id).and_then(|index| self.nodes.get(*index))
    }

    pub fn node_by_history(&self, history: &ActionHistory) -> Option<&Node> {
        self.by_history
            .get(&history.key())
            .and_then(|node_id| self.node(node_id))
    }

    pub fn node_id_for_history(history: &ActionHistory) -> String {
        let mut hash: u64 = 14_695_981_039_346_656_037;
        for byte in history.key().bytes() {
            hash ^= u64::from(byte);
            hash = hash.wrapping_mul(1_099_511_628_211);
        }
        format!("node-{hash:016x}")
    }

    pub fn next_node(&self, node: &Node, action: ActionKind) -> Option<&Node> {
        node.transitions()
            .iter()
            .find(|transition| transition.action.same_action(action))
            .and_then(|transition| self.node(&transition.next_node_id))
    }

    /// Resolve compact API histories while inserting implicit folds between
    /// the opener and the explicitly requested acting position.
    pub fn resolve(&self, actions: &[HistoryAction]) -> Result<&Node, ResolveError> {
        let first = actions.first().ok_or(ResolveError::EmptyHistory)?;
        let current_history = ActionHistory::new(vec![*first]);
        let mut current = self
            .node_by_history(&current_history)
            .ok_or_else(|| ResolveError::UnknownHistory(current_history.key()))?;

        for requested in actions.iter().skip(1).copied() {
            loop {
                let acting = current.common().acting_player;
                if acting == Some(requested.position) {
                    break;
                }
                let Some(next) = self.next_node(current, ActionKind::Fold) else {
                    return Err(ResolveError::UnexpectedPosition {
                        expected: acting,
                        received: requested.position,
                    });
                };
                current = next;
            }
            current = self
                .next_node(current, requested.action)
                .ok_or_else(|| ResolveError::ActionUnavailable {
                    node_id: current.common().node_id.clone(),
                    action: requested.action,
                })?;
        }
        Ok(current)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ResolveError {
    EmptyHistory,
    UnknownHistory(String),
    UnexpectedPosition {
        expected: Option<Position>,
        received: Position,
    },
    ActionUnavailable { node_id: String, action: ActionKind },
}

impl Display for ResolveError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EmptyHistory => write!(f, "action history is empty"),
            Self::UnknownHistory(history) => write!(f, "unknown action history: {history}"),
            Self::UnexpectedPosition { expected, received } => {
                write!(f, "unexpected position: expected {expected:?}, received {received}")
            }
            Self::ActionUnavailable { node_id, action } => {
                write!(f, "action {action} is not available at node {node_id}")
            }
        }
    }
}

struct TreeBuilder {
    config: PreflopConfig,
    nodes: Vec<Node>,
    by_id: HashMap<String, usize>,
    by_history: HashMap<String, String>,
}

impl TreeBuilder {
    fn common(
        &self,
        history: ActionHistory,
        acting_player: Option<Position>,
        pot_bb: f64,
        effective_stack_bb: f64,
    ) -> NodeCommon {
        NodeCommon {
            node_id: GameTree::node_id_for_history(&history),
            acting_player,
            pot_bb,
            effective_stack_bb,
            action_history: history,
        }
    }

    fn insert_node(&mut self, node: Node) -> Result<String, String> {
        let common = node.common();
        let node_id = common.node_id.clone();
        let history_key = common.action_history.key();
        if let Some(existing) = self.by_history.get(&history_key) {
            if existing != &node_id {
                return Err(format!("node id collision for history {history_key}"));
            }
            return Ok(existing.clone());
        }
        let index = self.nodes.len();
        self.nodes.push(node);
        self.by_id.insert(node_id.clone(), index);
        self.by_history.insert(history_key, node_id.clone());
        Ok(node_id)
    }

    fn replace_transitions(&mut self, node_id: &str, transitions: Vec<NodeTransition>) {
        if let Some(index) = self.by_id.get(node_id).copied() {
            if let Node::PlayerDecision(node) = &mut self.nodes[index] {
                node.transitions = transitions;
            }
        }
    }

    fn ensure_open_spot(&mut self, opener: Position, open_size: f64) -> Result<String, String> {
        let history = ActionHistory::new(vec![HistoryAction {
            position: opener,
            action: ActionKind::Raise { size_bb: open_size },
        }]);
        let first_responder = Position::ALL
            .into_iter()
            .find(|position| position.index() > opener.index());
        let Some(first_responder) = first_responder else {
            return self.insert_continuation(history, 1.5 + open_size, self.config.stack_bb - open_size);
        };
        self.ensure_response_node(history, opener, first_responder, 1.5 + open_size)
    }

    fn ensure_response_node(
        &mut self,
        history: ActionHistory,
        opener: Position,
        actor: Position,
        pot_bb: f64,
    ) -> Result<String, String> {
        let three_bet_size = self.three_bet_size(opener, actor, history.actions[0].action);
        let actions = vec![
            ActionKind::Fold,
            ActionKind::Call,
            ActionKind::Raise {
                size_bb: three_bet_size,
            },
        ];
        let common = self.common(
            history.clone(),
            Some(actor),
            pot_bb,
            (self.config.stack_bb - history.actions[0].action.action_size()).max(0.0),
        );
        let node_id = self.insert_node(Node::PlayerDecision(PlayerDecisionNode {
            common,
            available_actions: actions.clone(),
            transitions: Vec::new(),
        }))?;

        let next_responder = Position::ALL
            .into_iter()
            .find(|position| position.index() > actor.index());
        let mut transitions = Vec::with_capacity(actions.len());
        for action in actions {
            let action_history = history.push(HistoryAction {
                position: actor,
                action,
            });
            let next_node_id = match action {
                ActionKind::Fold => match next_responder {
                    Some(next_actor) => self.ensure_response_node(
                        action_history,
                        opener,
                        next_actor,
                        pot_bb,
                    )?,
                    None => self.insert_fold(action_history, pot_bb)?,
                },
                ActionKind::Call => self.insert_continuation(
                    action_history,
                    pot_bb + self.config.stack_bb * 0.01,
                    self.config.stack_bb - 1.0,
                )?,
                ActionKind::Raise { size_bb } => {
                    self.ensure_three_bet_response(action_history, opener, actor, pot_bb, size_bb)?
                }
                _ => unreachable!(),
            };
            transitions.push(NodeTransition { action, next_node_id });
        }
        self.replace_transitions(&node_id, transitions);
        Ok(node_id)
    }

    fn ensure_three_bet_response(
        &mut self,
        history: ActionHistory,
        opener: Position,
        three_bettor: Position,
        pot_bb: f64,
        three_bet_size: f64,
    ) -> Result<String, String> {
        let mut actions = vec![
            ActionKind::Fold,
            ActionKind::Call,
            ActionKind::Raise {
                size_bb: three_bet_size * self.config.sizing.four_bet_multiplier,
            },
        ];
        if self.config.sizing.five_bet_all_in {
            actions.push(ActionKind::AllIn);
        }
        let node_id = self.insert_node(Node::PlayerDecision(PlayerDecisionNode {
            common: self.common(
                history.clone(),
                Some(opener),
                pot_bb + three_bet_size,
                (self.config.stack_bb - three_bet_size).max(0.0),
            ),
            available_actions: actions.clone(),
            transitions: Vec::new(),
        }))?;
        let mut transitions = Vec::with_capacity(actions.len());
        for action in actions {
            let action_history = history.push(HistoryAction {
                position: opener,
                action,
            });
            let next_node_id = match action {
                ActionKind::Fold => self.insert_fold(action_history, pot_bb)?,
                ActionKind::Call => self.insert_continuation(
                    action_history,
                    pot_bb + three_bet_size,
                    self.config.stack_bb - three_bet_size,
                )?,
                ActionKind::Raise { size_bb } => {
                    self.ensure_four_bet_response(action_history, three_bettor, size_bb, pot_bb)?
                }
                ActionKind::AllIn => self.insert_all_in(action_history, self.config.stack_bb)?,
                _ => unreachable!(),
            };
            transitions.push(NodeTransition { action, next_node_id });
        }
        self.replace_transitions(&node_id, transitions);
        Ok(node_id)
    }

    fn ensure_four_bet_response(
        &mut self,
        history: ActionHistory,
        actor: Position,
        four_bet_size: f64,
        pot_bb: f64,
    ) -> Result<String, String> {
        let actions = vec![ActionKind::Fold, ActionKind::Call, ActionKind::AllIn];
        let node_id = self.insert_node(Node::PlayerDecision(PlayerDecisionNode {
            common: self.common(
                history.clone(),
                Some(actor),
                pot_bb + four_bet_size,
                (self.config.stack_bb - four_bet_size).max(0.0),
            ),
            available_actions: actions.clone(),
            transitions: Vec::new(),
        }))?;
        let mut transitions = Vec::with_capacity(actions.len());
        for action in actions {
            let action_history = history.push(HistoryAction {
                position: actor,
                action,
            });
            let next_node_id = match action {
                ActionKind::Fold => self.insert_fold(action_history, pot_bb)?,
                ActionKind::Call => self.insert_continuation(
                    action_history,
                    pot_bb + four_bet_size,
                    self.config.stack_bb - four_bet_size,
                )?,
                ActionKind::AllIn => self.insert_all_in(action_history, self.config.stack_bb)?,
                _ => unreachable!(),
            };
            transitions.push(NodeTransition { action, next_node_id });
        }
        self.replace_transitions(&node_id, transitions);
        Ok(node_id)
    }

    fn insert_continuation(
        &mut self,
        history: ActionHistory,
        pot_bb: f64,
        effective_stack_bb: f64,
    ) -> Result<String, String> {
        self.insert_node(Node::Continuation(ContinuationNode {
            common: self.common(history, None, pot_bb, effective_stack_bb.max(0.0)),
        }))
    }

    fn insert_fold(&mut self, history: ActionHistory, pot_bb: f64) -> Result<String, String> {
        self.insert_node(Node::TerminalFold(TerminalFoldNode {
            common: self.common(history, None, pot_bb, 0.0),
        }))
    }

    fn insert_all_in(
        &mut self,
        history: ActionHistory,
        effective_stack_bb: f64,
    ) -> Result<String, String> {
        self.insert_node(Node::TerminalAllIn(TerminalAllInNode {
            common: self.common(history, None, effective_stack_bb, 0.0),
        }))
    }

    fn three_bet_size(&self, opener: Position, actor: Position, open_action: ActionKind) -> f64 {
        let open_size = open_action.action_size();
        let in_position = actor.index() > opener.index()
            && !matches!(actor, Position::Sb | Position::Bb);
        let multiplier = if in_position {
            self.config.sizing.three_bet_ip_multiplier
        } else {
            self.config.sizing.three_bet_oop_multiplier
        };
        open_size * multiplier
    }
}

impl ActionHistory {
    pub fn last_action_size(&self) -> f64 {
        self.actions
            .last()
            .map(|action| action.action.action_size())
            .unwrap_or(0.0)
    }
}

impl ActionKind {
    pub fn action_size(self) -> f64 {
        match self {
            Self::Raise { size_bb } => size_bb,
            Self::AllIn => f64::INFINITY,
            _ => 0.0,
        }
    }
}

fn format_size(size: f64) -> String {
    if (size - size.round()).abs() < 0.0001 {
        format!("{}", size.round() as i64)
    } else {
        format!("{size:.2}").trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_drives_open_and_three_bet_sizes() {
        let tree = GameTree::build(PreflopConfig::default()).unwrap();
        let history = ActionHistory::new(vec![HistoryAction {
            position: Position::Btn,
            action: ActionKind::Raise { size_bb: 2.5 },
        }]);
        let node = tree.node_by_history(&history).unwrap();
        assert_eq!(node.common().acting_player, Some(Position::Sb));
        assert!(node
            .available_actions()
            .contains(&ActionKind::Raise { size_bb: 10.0 }));
    }

    #[test]
    fn compact_history_resolves_btn_raise_bb_call() {
        let tree = GameTree::build(PreflopConfig::default()).unwrap();
        let node = tree
            .resolve(&[
                HistoryAction {
                    position: Position::Btn,
                    action: ActionKind::Raise { size_bb: 2.5 },
                },
                HistoryAction {
                    position: Position::Bb,
                    action: ActionKind::Call,
                },
            ])
            .unwrap();
        assert_eq!(node.node_type(), "continuation");
        assert!(node.common().action_history.key().contains("SB:F"));
    }

    #[test]
    fn changing_config_changes_generated_size() {
        let mut config = PreflopConfig::default();
        config.sizing.open_sizes_bb = vec![2.2];
        let tree = GameTree::build(config).unwrap();
        assert!(tree
            .node_by_history(&ActionHistory::new(vec![HistoryAction {
                position: Position::Btn,
                action: ActionKind::Raise { size_bb: 2.2 },
            }]))
            .is_some());
    }
}
