//! A replaceable preflop-to-flop valuation boundary.
//!
//! v0.1 intentionally uses a deterministic strength proxy instead of a
//! postflop solver.  The solver only sees the trait, so a future 49/85/184
//! flop subset or neural/postflop implementation can replace this crate.

use poker_core::{Position, Range};

pub trait ContinuationEvaluator: Send + Sync {
    fn version(&self) -> &str;

    fn evaluate(
        &self,
        range_a: &Range,
        range_b: &Range,
        pot_bb: f64,
        effective_stack_bb: f64,
        position: Position,
    ) -> f64;
}

#[derive(Debug, Clone)]
pub struct SimpleContinuationModel {
    version: String,
}

impl SimpleContinuationModel {
    pub fn new(version: impl Into<String>) -> Self {
        Self {
            version: version.into(),
        }
    }
}

impl Default for SimpleContinuationModel {
    fn default() -> Self {
        Self::new("simple-strength-v0.1")
    }
}

impl ContinuationEvaluator for SimpleContinuationModel {
    fn version(&self) -> &str {
        &self.version
    }

    fn evaluate(
        &self,
        range_a: &Range,
        range_b: &Range,
        pot_bb: f64,
        effective_stack_bb: f64,
        position: Position,
    ) -> f64 {
        let position_bonus = match position {
            Position::Btn | Position::Co | Position::Hj => 0.015,
            Position::Sb => -0.02,
            Position::Utg | Position::Bb => 0.0,
        };
        let equity = (0.5_f64
            + f64::from(
                (range_a.weighted_average_strength() - range_b.weighted_average_strength()) * 0.7,
            )
            + position_bonus)
            .clamp(0.0, 1.0);
        equity * (pot_bb + effective_stack_bb) - (1.0 - equity) * effective_stack_bb
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use poker_core::Range;

    #[test]
    fn evaluator_is_deterministic_and_replaceable() {
        let model = SimpleContinuationModel::default();
        let strong = Range::uniform(1.0).unwrap();
        let weak = Range::uniform(0.0).unwrap();
        let first = model.evaluate(&strong, &weak, 3.0, 100.0, Position::Btn);
        let second = model.evaluate(&strong, &weak, 3.0, 100.0, Position::Btn);
        assert_eq!(first, second);
        assert_eq!(model.version(), "simple-strength-v0.1");
    }
}
