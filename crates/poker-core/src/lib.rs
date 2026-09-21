//! Poker primitives shared by the tree, solver, solution, and API layers.
//!
//! The canonical preflop representation is an unordered pair of cards.  The
//! pair index is stable, so a `Range` can use a compact 1326-element array
//! without allocating a map per combo.

use serde::{Deserialize, Serialize};
use std::fmt::{Display, Formatter};
use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Ord, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Suit {
    Clubs,
    Diamonds,
    Hearts,
    Spades,
}

impl Suit {
    pub const ALL: [Self; 4] = [Self::Clubs, Self::Diamonds, Self::Hearts, Self::Spades];

    pub const fn ordinal(self) -> u8 {
        match self {
            Self::Clubs => 0,
            Self::Diamonds => 1,
            Self::Hearts => 2,
            Self::Spades => 3,
        }
    }
}

impl Display for Suit {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let value = match self {
            Self::Clubs => 'c',
            Self::Diamonds => 'd',
            Self::Hearts => 'h',
            Self::Spades => 's',
        };
        write!(f, "{value}")
    }
}

impl FromStr for Suit {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.to_ascii_lowercase().as_str() {
            "c" => Ok(Self::Clubs),
            "d" => Ok(Self::Diamonds),
            "h" => Ok(Self::Hearts),
            "s" => Ok(Self::Spades),
            _ => Err(format!("invalid suit: {value}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Ord, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Rank {
    Two,
    Three,
    Four,
    Five,
    Six,
    Seven,
    Eight,
    Nine,
    Ten,
    Jack,
    Queen,
    King,
    Ace,
}

impl Rank {
    pub const ALL: [Self; 13] = [
        Self::Two,
        Self::Three,
        Self::Four,
        Self::Five,
        Self::Six,
        Self::Seven,
        Self::Eight,
        Self::Nine,
        Self::Ten,
        Self::Jack,
        Self::Queen,
        Self::King,
        Self::Ace,
    ];

    pub const fn value(self) -> u8 {
        match self {
            Self::Two => 2,
            Self::Three => 3,
            Self::Four => 4,
            Self::Five => 5,
            Self::Six => 6,
            Self::Seven => 7,
            Self::Eight => 8,
            Self::Nine => 9,
            Self::Ten => 10,
            Self::Jack => 11,
            Self::Queen => 12,
            Self::King => 13,
            Self::Ace => 14,
        }
    }

    pub const fn ordinal(self) -> u8 {
        self.value() - 2
    }

    pub fn from_value(value: u8) -> Option<Self> {
        Self::ALL.into_iter().find(|rank| rank.value() == value)
    }
}

impl Display for Rank {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let value = match self {
            Self::Two => '2',
            Self::Three => '3',
            Self::Four => '4',
            Self::Five => '5',
            Self::Six => '6',
            Self::Seven => '7',
            Self::Eight => '8',
            Self::Nine => '9',
            Self::Ten => 'T',
            Self::Jack => 'J',
            Self::Queen => 'Q',
            Self::King => 'K',
            Self::Ace => 'A',
        };
        write!(f, "{value}")
    }
}

impl FromStr for Rank {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.to_ascii_uppercase().as_str() {
            "2" => Ok(Self::Two),
            "3" => Ok(Self::Three),
            "4" => Ok(Self::Four),
            "5" => Ok(Self::Five),
            "6" => Ok(Self::Six),
            "7" => Ok(Self::Seven),
            "8" => Ok(Self::Eight),
            "9" => Ok(Self::Nine),
            "T" => Ok(Self::Ten),
            "J" => Ok(Self::Jack),
            "Q" => Ok(Self::Queen),
            "K" => Ok(Self::King),
            "A" => Ok(Self::Ace),
            _ => Err(format!("invalid rank: {value}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Card {
    pub rank: Rank,
    pub suit: Suit,
}

impl Card {
    pub const fn new(rank: Rank, suit: Suit) -> Self {
        Self { rank, suit }
    }

    pub const fn ordinal(self) -> u8 {
        self.rank.ordinal() * 4 + self.suit.ordinal()
    }
}

impl Display for Card {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}{}", self.rank, self.suit)
    }
}

impl FromStr for Card {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let chars: Vec<char> = value.chars().collect();
        if chars.len() != 2 {
            return Err(format!("card must have two characters: {value}"));
        }
        Ok(Self::new(
            chars[0].to_string().parse()?,
            chars[1].to_string().parse()?,
        ))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Deck {
    cards: Vec<Card>,
}

impl Deck {
    pub fn standard() -> Self {
        let cards = Rank::ALL
            .into_iter()
            .flat_map(|rank| Suit::ALL.into_iter().map(move |suit| Card::new(rank, suit)))
            .collect();
        Self { cards }
    }

    pub fn cards(&self) -> &[Card] {
        &self.cards
    }

    pub fn len(&self) -> usize {
        self.cards.len()
    }

    pub fn is_empty(&self) -> bool {
        self.cards.is_empty()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct StartingCombo {
    pub first: Card,
    pub second: Card,
}

impl StartingCombo {
    pub fn new(first: Card, second: Card) -> Result<Self, String> {
        if first == second {
            return Err("a starting combo cannot contain the same card twice".to_string());
        }
        if first.ordinal() < second.ordinal() {
            Ok(Self { first, second })
        } else {
            Ok(Self {
                first: second,
                second: first,
            })
        }
    }

    pub fn index(self) -> u16 {
        let a = self.first.ordinal() as u16;
        let b = self.second.ordinal() as u16;
        // Number of pairs in rows before `a`, plus the offset inside row `a`.
        a * 51 - (a * (a.saturating_sub(1))) / 2 + b - a - 1
    }

    pub fn hand_class(self) -> HandClass {
        HandClass::from_combo(self)
    }
}

impl Display for StartingCombo {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}{}", self.first, self.second)
    }
}

pub fn all_starting_combos() -> Vec<StartingCombo> {
    let deck = Deck::standard();
    let mut combos = Vec::with_capacity(1326);
    for (first_index, first) in deck.cards().iter().copied().enumerate() {
        for second in deck.cards().iter().copied().skip(first_index + 1) {
            combos.push(StartingCombo::new(first, second).expect("deck contains unique cards"));
        }
    }
    combos
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum HandClassKind {
    PocketPair,
    Suited,
    Offsuit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct HandClass {
    pub high: Rank,
    pub low: Rank,
    pub kind: HandClassKind,
}

impl HandClass {
    pub fn new(first: Rank, second: Rank, kind: HandClassKind) -> Self {
        let (high, low) = if first >= second {
            (first, second)
        } else {
            (second, first)
        };
        let kind = if high == low {
            HandClassKind::PocketPair
        } else {
            kind
        };
        Self { high, low, kind }
    }

    pub fn from_combo(combo: StartingCombo) -> Self {
        let kind = if combo.first.rank == combo.second.rank {
            HandClassKind::PocketPair
        } else if combo.first.suit == combo.second.suit {
            HandClassKind::Suited
        } else {
            HandClassKind::Offsuit
        };
        Self::new(combo.first.rank, combo.second.rank, kind)
    }
}

impl Display for HandClass {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}{}", self.high, self.low)?;
        match self.kind {
            HandClassKind::PocketPair => Ok(()),
            HandClassKind::Suited => write!(f, "s"),
            HandClassKind::Offsuit => write!(f, "o"),
        }
    }
}

impl FromStr for HandClass {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let chars: Vec<char> = value.chars().collect();
        if chars.len() < 2 || chars.len() > 3 {
            return Err(format!("invalid hand class: {value}"));
        }
        let high: Rank = chars[0].to_string().parse()?;
        let low: Rank = chars[1].to_string().parse()?;
        let kind = if high == low {
            if chars.len() != 2 {
                return Err(format!("pocket pair must not have a suffix: {value}"));
            }
            HandClassKind::PocketPair
        } else {
            match chars.get(2).copied() {
                Some('s') | Some('S') => HandClassKind::Suited,
                Some('o') | Some('O') => HandClassKind::Offsuit,
                _ => return Err(format!("non-pair hand needs s/o suffix: {value}")),
            }
        };
        Ok(Self::new(high, low, kind))
    }
}

pub fn all_hand_classes() -> Vec<HandClass> {
    let mut classes = Vec::with_capacity(169);
    for high in Rank::ALL.into_iter().rev() {
        for low in Rank::ALL.into_iter().rev() {
            if low > high {
                continue;
            }
            if high == low {
                classes.push(HandClass::new(high, low, HandClassKind::PocketPair));
            } else {
                classes.push(HandClass::new(high, low, HandClassKind::Suited));
                classes.push(HandClass::new(high, low, HandClassKind::Offsuit));
            }
        }
    }
    classes
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct RangeWeight(pub f32);

impl RangeWeight {
    pub fn new(value: f32) -> Result<Self, String> {
        if (0.0..=1.0).contains(&value) {
            Ok(Self(value))
        } else {
            Err(format!("range weight must be between 0 and 1: {value}"))
        }
    }

    pub const fn value(self) -> f32 {
        self.0
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Range {
    weights: Vec<RangeWeight>,
}

impl Range {
    pub const COMBO_COUNT: usize = 1326;

    pub fn empty() -> Self {
        Self {
            weights: vec![RangeWeight(0.0); Self::COMBO_COUNT],
        }
    }

    pub fn uniform(weight: f32) -> Result<Self, String> {
        let weight = RangeWeight::new(weight)?;
        Ok(Self {
            weights: vec![weight; Self::COMBO_COUNT],
        })
    }

    pub fn weight(&self, combo: StartingCombo) -> RangeWeight {
        self.weights[combo.index() as usize]
    }

    pub fn set_weight(&mut self, combo: StartingCombo, weight: f32) -> Result<(), String> {
        self.weights[combo.index() as usize] = RangeWeight::new(weight)?;
        Ok(())
    }

    pub fn iter(&self) -> impl Iterator<Item = (u16, RangeWeight)> + '_ {
        self.weights
            .iter()
            .copied()
            .enumerate()
            .map(|(index, weight)| (index as u16, weight))
    }

    pub fn weighted_average_strength(&self) -> f32 {
        let combos = all_starting_combos();
        let mut total_weight = 0.0;
        let mut total_strength = 0.0;
        for combo in combos {
            let weight = self.weight(combo).value();
            total_weight += weight;
            total_strength += weight * combo_strength(combo);
        }
        if total_weight == 0.0 {
            0.5
        } else {
            total_strength / total_weight
        }
    }
}

impl Default for Range {
    fn default() -> Self {
        Self::uniform(1.0).expect("1.0 is a valid range weight")
    }
}

pub fn combo_strength(combo: StartingCombo) -> f32 {
    let high = combo.first.rank.value().max(combo.second.rank.value()) as f32;
    let low = combo.first.rank.value().min(combo.second.rank.value()) as f32;
    let pair_bonus = if combo.first.rank == combo.second.rank { 0.30 } else { 0.0 };
    let suited_bonus = if combo.first.suit == combo.second.suit { 0.025 } else { 0.0 };
    ((high - 2.0) / 12.0 * 0.65 + (low - 2.0) / 12.0 * 0.25 + pair_bonus + suited_bonus)
        .clamp(0.01, 0.99)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Ord, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Position {
    Utg,
    Hj,
    Co,
    Btn,
    Sb,
    Bb,
}

impl Position {
    pub const ALL: [Self; 6] = [Self::Utg, Self::Hj, Self::Co, Self::Btn, Self::Sb, Self::Bb];

    pub const fn index(self) -> usize {
        match self {
            Self::Utg => 0,
            Self::Hj => 1,
            Self::Co => 2,
            Self::Btn => 3,
            Self::Sb => 4,
            Self::Bb => 5,
        }
    }

    pub fn parse(value: &str) -> Result<Self, String> {
        match value.to_ascii_uppercase().as_str() {
            "UTG" => Ok(Self::Utg),
            "HJ" => Ok(Self::Hj),
            "CO" => Ok(Self::Co),
            "BTN" => Ok(Self::Btn),
            "SB" => Ok(Self::Sb),
            "BB" => Ok(Self::Bb),
            _ => Err(format!("invalid position: {value}")),
        }
    }
}

impl Display for Position {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let value = match self {
            Self::Utg => "UTG",
            Self::Hj => "HJ",
            Self::Co => "CO",
            Self::Btn => "BTN",
            Self::Sb => "SB",
            Self::Bb => "BB",
        };
        write!(f, "{value}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn class_count(class: HandClass) -> usize {
        all_starting_combos()
            .into_iter()
            .filter(|combo| combo.hand_class() == class)
            .count()
    }

    #[test]
    fn standard_deck_has_52_cards() {
        assert_eq!(Deck::standard().len(), 52);
    }

    #[test]
    fn starting_combos_have_1326_unique_indices() {
        let combos = all_starting_combos();
        assert_eq!(combos.len(), 1326);
        let mut indices: Vec<_> = combos.iter().map(|combo| combo.index()).collect();
        indices.sort_unstable();
        indices.dedup();
        assert_eq!(indices.len(), 1326);
        assert_eq!(indices.first(), Some(&0));
        assert_eq!(indices.last(), Some(&1325));
    }

    #[test]
    fn hand_classes_have_169_entries() {
        assert_eq!(all_hand_classes().len(), 169);
    }

    #[test]
    fn canonical_combo_counts_are_correct() {
        assert_eq!(class_count("AA".parse().unwrap()), 6);
        assert_eq!(class_count("AKs".parse().unwrap()), 4);
        assert_eq!(class_count("AKo".parse().unwrap()), 12);
    }

    #[test]
    fn card_and_hand_class_round_trip() {
        let card: Card = "As".parse().unwrap();
        assert_eq!(card.to_string(), "As");
        assert_eq!("A5s".parse::<HandClass>().unwrap().to_string(), "A5s");
    }
}
