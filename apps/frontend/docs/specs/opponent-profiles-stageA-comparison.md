# Stage A opponent-profile review data

Authored behavioral estimates, not GTO, not measured player statistics, and not EV-maximizing recommendations. Frequencies are conditional on own prior-action reach. Percentages below are combo-weighted; deeper nodes multiply every previous action of that actor. An empty incoming range has no recommended action. Standard uses its own prior-action reach.

Structural/source errors: 0; strength-order warnings: 0.

## RFI width comparison

| Profile | Spot | Open % | Standard % | Ratio | Limp % |
|---|---|---:|---:|---:|---:|
| nit | UTG_open | 9.11 | 16.03 | 0.57 | 0.00 |
| nit | HJ_open | 12.78 | 23.53 | 0.54 | 0.00 |
| nit | CO_open | 16.76 | 29.34 | 0.57 | 0.00 |
| nit | BTN_open | 25.81 | 42.84 | 0.60 | 0.00 |
| nit | SB_open | 17.87 | 31.64 | 0.56 | 3.68 |
| station | UTG_open | 16.86 | 16.03 | 1.05 | 0.00 |
| station | HJ_open | 24.99 | 23.53 | 1.06 | 0.00 |
| station | CO_open | 33.02 | 29.34 | 1.13 | 0.00 |
| station | BTN_open | 48.36 | 42.84 | 1.13 | 0.00 |
| station | SB_open | 34.25 | 31.64 | 1.08 | 42.96 |
| lag | UTG_open | 21.91 | 16.03 | 1.37 | 0.00 |
| lag | HJ_open | 32.85 | 23.53 | 1.40 | 0.00 |
| lag | CO_open | 41.55 | 29.34 | 1.42 | 0.00 |
| lag | BTN_open | 60.84 | 42.84 | 1.42 | 0.00 |
| lag | SB_open | 44.85 | 31.64 | 1.42 | 17.35 |
| maniac | UTG_open | 29.50 | 16.03 | 1.84 | 0.00 |
| maniac | HJ_open | 42.14 | 23.53 | 1.79 | 0.00 |
| maniac | CO_open | 53.67 | 29.34 | 1.83 | 0.00 |
| maniac | BTN_open | 78.61 | 42.84 | 1.84 | 0.00 |
| maniac | SB_open | 57.19 | 31.64 | 1.81 | 14.99 |

## BTN open → BB call: villain entry range

The selected villain alone uses its profile. BTN villain reaches the flop with its open mix; BB villain uses its call mix. The other seat keeps its standard/table-profile range in Stage C. Strength bins and mean use the checked-in preflop equity versus a random hand as a descriptive proxy only, not equity versus the actual opponent, board strength or EV.

| Profile | Villain | Combos | Pairs % | Suited % | Offsuit % | ≥65% proxy | 50–65% proxy | <50% proxy | Mean proxy % |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| standard | BTN | 568.00 | 13.73 | 36.62 | 49.65 | 13.38 | 72.71 | 13.91 | 57.81 |
| standard | BB | 554.30 | 6.98 | 40.30 | 52.72 | 3.28 | 73.46 | 23.25 | 54.33 |
| nit | BTN | 342.30 | 18.84 | 35.76 | 45.40 | 22.20 | 64.39 | 13.41 | 59.64 |
| nit | BB | 103.40 | 26.11 | 42.55 | 31.33 | 30.17 | 58.61 | 11.22 | 61.36 |
| station | BTN | 641.20 | 11.70 | 35.90 | 52.40 | 11.56 | 60.67 | 27.78 | 55.13 |
| station | BB | 1120.26 | 5.58 | 26.15 | 68.28 | 4.53 | 48.22 | 47.25 | 50.34 |
| lag | BTN | 806.80 | 8.92 | 31.88 | 59.20 | 8.95 | 56.02 | 35.03 | 53.32 |
| lag | BB | 654.10 | 7.02 | 28.31 | 64.67 | 5.11 | 51.86 | 43.04 | 51.20 |
| maniac | BTN | 1042.40 | 6.91 | 26.73 | 66.37 | 6.93 | 48.70 | 44.38 | 51.27 |
| maniac | BB | 893.40 | 4.16 | 21.96 | 73.88 | 2.81 | 42.02 | 55.17 | 48.60 |

## All 280 profile decisions against standard

| Profile | Dataset | Spot | Incoming combos | Profile action % | Standard action % |
|---|---|---|---:|---|---|
| nit | opening-ranges | UTG_open | 1326.00 | open 9.11 / fold 90.89 | open 16.03 / fold 83.97 |
| nit | opening-ranges | HJ_open | 1326.00 | open 12.78 / fold 87.22 | open 23.53 / fold 76.47 |
| nit | opening-ranges | CO_open | 1326.00 | open 16.76 / fold 83.24 | open 29.34 / fold 70.66 |
| nit | opening-ranges | BTN_open | 1326.00 | open 25.81 / fold 74.19 | open 42.84 / fold 57.16 |
| nit | opening-ranges | SB_open | 1326.00 | open 17.87 / limp 3.68 / fold 78.45 | open 31.64 / limp 14.71 / fold 53.64 |
| nit | preflop-ranges | HJ_vs_UTG | 1326.00 | three_bet 1.53 / call 1.95 / fold 96.52 | three_bet 5.63 / call 4.28 / fold 90.09 |
| nit | preflop-ranges | CO_vs_UTG | 1326.00 | three_bet 1.53 / call 2.18 / fold 96.30 | three_bet 5.45 / call 5.19 / fold 89.36 |
| nit | preflop-ranges | BTN_vs_UTG | 1326.00 | three_bet 1.53 / call 2.56 / fold 95.91 | three_bet 5.31 / call 7.07 / fold 87.62 |
| nit | preflop-ranges | SB_vs_UTG | 1326.00 | three_bet 1.62 / call 2.13 / fold 96.25 | three_bet 5.05 / call 0.00 / fold 94.95 |
| nit | preflop-ranges | BB_vs_UTG | 1326.00 | three_bet 1.46 / call 5.20 / fold 93.33 | three_bet 4.28 / call 24.19 / fold 71.52 |
| nit | preflop-ranges | CO_vs_HJ | 1326.00 | three_bet 1.76 / call 2.32 / fold 95.92 | three_bet 6.88 / call 6.27 / fold 86.86 |
| nit | preflop-ranges | BTN_vs_HJ | 1326.00 | three_bet 1.80 / call 2.68 / fold 95.52 | three_bet 6.75 / call 9.17 / fold 84.08 |
| nit | preflop-ranges | SB_vs_HJ | 1326.00 | three_bet 1.85 / call 2.35 / fold 95.80 | three_bet 7.06 / call 0.00 / fold 92.94 |
| nit | preflop-ranges | BB_vs_HJ | 1326.00 | three_bet 1.69 / call 6.09 / fold 92.22 | three_bet 5.66 / call 30.54 / fold 63.80 |
| nit | preflop-ranges | BTN_vs_CO | 1326.00 | three_bet 2.01 / call 3.01 / fold 94.98 | three_bet 8.73 / call 11.00 / fold 80.27 |
| nit | preflop-ranges | SB_vs_CO | 1326.00 | three_bet 2.29 / call 2.35 / fold 95.36 | three_bet 11.52 / call 0.00 / fold 88.48 |
| nit | preflop-ranges | BB_vs_CO | 1326.00 | three_bet 1.98 / call 6.88 / fold 91.14 | three_bet 7.84 / call 33.37 / fold 58.79 |
| nit | preflop-ranges | SB_vs_BTN | 1326.00 | three_bet 2.82 / call 2.83 / fold 94.34 | three_bet 16.76 / call 0.00 / fold 83.24 |
| nit | preflop-ranges | BB_vs_BTN | 1326.00 | three_bet 2.29 / call 7.80 / fold 89.91 | three_bet 11.03 / call 41.80 / fold 47.16 |
| nit | preflop-ranges | BB_vs_SB | 1326.00 | three_bet 2.13 / call 6.47 / fold 91.40 | three_bet 8.95 / call 33.14 / fold 57.90 |
| nit | three-bet-responses | UTG_vs_HJ_three_bet | 120.80 | four_bet 14.32 / call 24.70 / fold 60.98 | four_bet 14.92 / call 25.06 / fold 60.02 |
| nit | three-bet-responses | UTG_vs_CO_three_bet | 120.80 | four_bet 14.32 / call 24.70 / fold 60.98 | four_bet 14.92 / call 26.99 / fold 58.09 |
| nit | three-bet-responses | UTG_vs_BTN_three_bet | 120.80 | four_bet 14.32 / call 24.70 / fold 60.98 | four_bet 15.01 / call 27.61 / fold 57.38 |
| nit | three-bet-responses | UTG_vs_SB_three_bet | 120.80 | four_bet 14.32 / call 24.70 / fold 60.98 | four_bet 13.51 / call 21.08 / fold 65.41 |
| nit | three-bet-responses | UTG_vs_BB_three_bet | 120.80 | four_bet 14.32 / call 24.70 / fold 60.98 | four_bet 13.60 / call 19.95 / fold 66.45 |
| nit | three-bet-responses | HJ_vs_CO_three_bet | 169.50 | four_bet 10.21 / call 19.35 / fold 70.44 | four_bet 14.36 / call 24.58 / fold 61.07 |
| nit | three-bet-responses | HJ_vs_BTN_three_bet | 169.50 | four_bet 10.21 / call 19.35 / fold 70.44 | four_bet 14.42 / call 26.10 / fold 59.48 |
| nit | three-bet-responses | HJ_vs_SB_three_bet | 169.50 | four_bet 10.21 / call 19.35 / fold 70.44 | four_bet 14.12 / call 30.67 / fold 55.21 |
| nit | three-bet-responses | HJ_vs_BB_three_bet | 169.50 | four_bet 10.21 / call 19.35 / fold 70.44 | four_bet 14.18 / call 26.38 / fold 59.44 |
| nit | three-bet-responses | CO_vs_BTN_three_bet | 222.20 | four_bet 7.79 / call 14.91 / fold 77.31 | four_bet 18.05 / call 27.35 / fold 54.60 |
| nit | three-bet-responses | CO_vs_SB_three_bet | 222.20 | four_bet 7.79 / call 14.91 / fold 77.31 | four_bet 12.39 / call 42.01 / fold 45.60 |
| nit | three-bet-responses | CO_vs_BB_three_bet | 222.20 | four_bet 7.79 / call 14.91 / fold 77.31 | four_bet 12.90 / call 36.58 / fold 50.51 |
| nit | three-bet-responses | BTN_vs_SB_three_bet | 342.30 | four_bet 5.05 / call 9.86 / fold 85.08 | four_bet 12.43 / call 35.70 / fold 51.87 |
| nit | three-bet-responses | BTN_vs_BB_three_bet | 342.30 | four_bet 5.05 / call 9.86 / fold 85.08 | four_bet 13.01 / call 32.11 / fold 54.88 |
| nit | three-bet-responses | SB_vs_BB_three_bet | 236.90 | four_bet 6.57 / call 12.63 / fold 80.80 | four_bet 13.88 / call 20.60 / fold 65.53 |
| nit | four-bet-responses | HJ_vs_UTG_four_bet | 20.26 | all_in 46.53 / call 21.65 / fold 31.82 | all_in 28.90 / call 18.95 / fold 52.15 |
| nit | four-bet-responses | CO_vs_UTG_four_bet | 20.26 | all_in 46.53 / call 21.65 / fold 31.82 | all_in 27.67 / call 17.90 / fold 54.43 |
| nit | four-bet-responses | BTN_vs_UTG_four_bet | 20.26 | all_in 46.53 / call 21.65 / fold 31.82 | all_in 26.69 / call 17.20 / fold 56.11 |
| nit | four-bet-responses | SB_vs_UTG_four_bet | 21.52 | all_in 44.34 / call 21.61 / fold 34.05 | all_in 40.12 / call 16.26 / fold 43.62 |
| nit | four-bet-responses | BB_vs_UTG_four_bet | 19.38 | all_in 48.09 / call 21.46 / fold 30.45 | all_in 41.88 / call 15.59 / fold 42.53 |
| nit | four-bet-responses | CO_vs_HJ_four_bet | 23.36 | all_in 42.04 / call 22.24 / fold 35.72 | all_in 23.74 / call 16.57 / fold 59.69 |
| nit | four-bet-responses | BTN_vs_HJ_four_bet | 23.92 | all_in 41.38 / call 22.44 / fold 36.19 | all_in 26.93 / call 16.74 / fold 56.32 |
| nit | four-bet-responses | SB_vs_HJ_four_bet | 24.56 | all_in 40.43 / call 22.13 / fold 37.44 | all_in 32.63 / call 18.93 / fold 48.45 |
| nit | four-bet-responses | BB_vs_HJ_four_bet | 22.44 | all_in 43.14 / call 21.94 / fold 34.92 | all_in 35.41 / call 15.17 / fold 49.43 |
| nit | four-bet-responses | BTN_vs_CO_four_bet | 26.64 | all_in 38.37 / call 22.67 / fold 38.96 | all_in 21.39 / call 14.65 / fold 63.96 |
| nit | four-bet-responses | SB_vs_CO_four_bet | 30.40 | all_in 35.15 / call 23.01 / fold 41.84 | all_in 24.77 / call 17.92 / fold 57.31 |
| nit | four-bet-responses | BB_vs_CO_four_bet | 26.20 | all_in 38.72 / call 22.44 / fold 38.84 | all_in 27.17 / call 12.51 / fold 60.33 |
| nit | four-bet-responses | SB_vs_BTN_four_bet | 37.44 | all_in 30.85 / call 23.49 / fold 45.66 | all_in 21.33 / call 19.37 / fold 59.31 |
| nit | four-bet-responses | BB_vs_BTN_four_bet | 30.40 | all_in 35.15 / call 23.01 / fold 41.84 | all_in 23.25 / call 13.00 / fold 63.75 |
| nit | four-bet-responses | BB_vs_SB_four_bet | 28.22 | all_in 36.96 / call 22.89 / fold 40.15 | all_in 27.12 / call 16.92 / fold 55.96 |
| nit | five-bet-responses | UTG_vs_HJ_five_bet | 17.30 | call 64.86 / fold 35.14 | call 42.71 / fold 57.29 |
| nit | five-bet-responses | UTG_vs_CO_five_bet | 17.30 | call 64.86 / fold 35.14 | call 41.83 / fold 58.17 |
| nit | five-bet-responses | UTG_vs_BTN_five_bet | 17.30 | call 64.86 / fold 35.14 | call 41.13 / fold 58.87 |
| nit | five-bet-responses | UTG_vs_SB_five_bet | 17.30 | call 64.86 / fold 35.14 | call 65.96 / fold 34.04 |
| nit | five-bet-responses | UTG_vs_BB_five_bet | 17.30 | call 64.86 / fold 35.14 | call 51.96 / fold 48.04 |
| nit | five-bet-responses | HJ_vs_CO_five_bet | 17.30 | call 64.86 / fold 35.14 | call 29.64 / fold 70.36 |
| nit | five-bet-responses | HJ_vs_BTN_five_bet | 17.30 | call 64.86 / fold 35.14 | call 39.38 / fold 60.62 |
| nit | five-bet-responses | HJ_vs_SB_five_bet | 17.30 | call 64.86 / fold 35.14 | call 58.73 / fold 41.27 |
| nit | five-bet-responses | HJ_vs_BB_five_bet | 17.30 | call 64.86 / fold 35.14 | call 49.65 / fold 50.35 |
| nit | five-bet-responses | CO_vs_BTN_five_bet | 17.30 | call 64.86 / fold 35.14 | call 28.16 / fold 71.84 |
| nit | five-bet-responses | CO_vs_SB_five_bet | 17.30 | call 64.86 / fold 35.14 | call 58.37 / fold 41.63 |
| nit | five-bet-responses | CO_vs_BB_five_bet | 17.30 | call 64.86 / fold 35.14 | call 50.94 / fold 49.06 |
| nit | five-bet-responses | BTN_vs_SB_five_bet | 17.30 | call 64.86 / fold 35.14 | call 50.66 / fold 49.34 |
| nit | five-bet-responses | BTN_vs_BB_five_bet | 17.30 | call 64.86 / fold 35.14 | call 41.62 / fold 58.38 |
| nit | five-bet-responses | SB_vs_BB_five_bet | 15.57 | call 64.86 / fold 35.14 | call 48.33 / fold 51.67 |
| nit | limp-responses | BB_vs_SB_limp | 1326.00 | raise 4.32 / check 95.68 | raise 21.70 / check 78.30 |
| nit | limp-responses | SB_vs_BB_iso | 48.80 | raise 4.30 / call 31.52 / fold 64.18 | raise 4.63 / call 19.56 / fold 75.81 |
| nit | limp-responses | BB_vs_SB_limp_reraise | 57.30 | four_bet 25.25 / call 29.76 / fold 44.99 | four_bet 3.64 / call 42.78 / fold 53.58 |
| nit | limp-deep-responses | SB_vs_BB_limp_four_bet | 2.10 | all_in 38.67 / call 21.52 / fold 39.81 | all_in 24.14 / call 19.62 / fold 56.24 |
| nit | limp-deep-responses | BB_vs_SB_limp_five_bet | 14.47 | call 66.88 / fold 33.12 | call 45.98 / fold 54.02 |
| station | opening-ranges | UTG_open | 1326.00 | open 16.86 / fold 83.14 | open 16.03 / fold 83.97 |
| station | opening-ranges | HJ_open | 1326.00 | open 24.99 / fold 75.01 | open 23.53 / fold 76.47 |
| station | opening-ranges | CO_open | 1326.00 | open 33.02 / fold 66.98 | open 29.34 / fold 70.66 |
| station | opening-ranges | BTN_open | 1326.00 | open 48.36 / fold 51.64 | open 42.84 / fold 57.16 |
| station | opening-ranges | SB_open | 1326.00 | open 34.25 / limp 42.96 / fold 22.79 | open 31.64 / limp 14.71 / fold 53.64 |
| station | preflop-ranges | HJ_vs_UTG | 1326.00 | three_bet 1.58 / call 12.27 / fold 86.15 | three_bet 5.63 / call 4.28 / fold 90.09 |
| station | preflop-ranges | CO_vs_UTG | 1326.00 | three_bet 1.58 / call 14.93 / fold 83.49 | three_bet 5.45 / call 5.19 / fold 89.36 |
| station | preflop-ranges | BTN_vs_UTG | 1326.00 | three_bet 1.58 / call 18.84 / fold 79.58 | three_bet 5.31 / call 7.07 / fold 87.62 |
| station | preflop-ranges | SB_vs_UTG | 1326.00 | three_bet 1.68 / call 14.85 / fold 83.46 | three_bet 5.05 / call 0.00 / fold 94.95 |
| station | preflop-ranges | BB_vs_UTG | 1326.00 | three_bet 1.49 / call 48.63 / fold 49.89 | three_bet 4.28 / call 24.19 / fold 71.52 |
| station | preflop-ranges | CO_vs_HJ | 1326.00 | three_bet 1.83 / call 17.92 / fold 80.26 | three_bet 6.88 / call 6.27 / fold 86.86 |
| station | preflop-ranges | BTN_vs_HJ | 1326.00 | three_bet 1.90 / call 23.38 / fold 74.72 | three_bet 6.75 / call 9.17 / fold 84.08 |
| station | preflop-ranges | SB_vs_HJ | 1326.00 | three_bet 1.95 / call 18.57 / fold 79.48 | three_bet 7.06 / call 0.00 / fold 92.94 |
| station | preflop-ranges | BB_vs_HJ | 1326.00 | three_bet 1.76 / call 60.42 / fold 37.82 | three_bet 5.66 / call 30.54 / fold 63.80 |
| station | preflop-ranges | BTN_vs_CO | 1326.00 | three_bet 2.24 / call 27.67 / fold 70.08 | three_bet 8.73 / call 11.00 / fold 80.27 |
| station | preflop-ranges | SB_vs_CO | 1326.00 | three_bet 2.56 / call 22.97 / fold 74.47 | three_bet 11.52 / call 0.00 / fold 88.48 |
| station | preflop-ranges | BB_vs_CO | 1326.00 | three_bet 2.18 / call 72.29 / fold 25.53 | three_bet 7.84 / call 33.37 / fold 58.79 |
| station | preflop-ranges | SB_vs_BTN | 1326.00 | three_bet 3.29 / call 30.87 / fold 65.83 | three_bet 16.76 / call 0.00 / fold 83.24 |
| station | preflop-ranges | BB_vs_BTN | 1326.00 | three_bet 2.56 / call 84.48 / fold 12.96 | three_bet 11.03 / call 41.80 / fold 47.16 |
| station | preflop-ranges | BB_vs_SB | 1326.00 | three_bet 2.38 / call 68.24 / fold 29.38 | three_bet 8.95 / call 33.14 / fold 57.90 |
| station | three-bet-responses | UTG_vs_HJ_three_bet | 223.60 | four_bet 3.31 / call 86.69 / fold 10.00 | four_bet 14.92 / call 25.06 / fold 60.02 |
| station | three-bet-responses | UTG_vs_CO_three_bet | 223.60 | four_bet 3.31 / call 86.69 / fold 10.00 | four_bet 14.92 / call 26.99 / fold 58.09 |
| station | three-bet-responses | UTG_vs_BTN_three_bet | 223.60 | four_bet 3.31 / call 86.69 / fold 10.00 | four_bet 15.01 / call 27.61 / fold 57.38 |
| station | three-bet-responses | UTG_vs_SB_three_bet | 223.60 | four_bet 3.31 / call 86.69 / fold 10.00 | four_bet 13.51 / call 21.08 / fold 65.41 |
| station | three-bet-responses | UTG_vs_BB_three_bet | 223.60 | four_bet 3.31 / call 86.69 / fold 10.00 | four_bet 13.60 / call 19.95 / fold 66.45 |
| station | three-bet-responses | HJ_vs_CO_three_bet | 331.40 | four_bet 2.23 / call 84.21 / fold 13.56 | four_bet 14.36 / call 24.58 / fold 61.07 |
| station | three-bet-responses | HJ_vs_BTN_three_bet | 331.40 | four_bet 2.23 / call 84.21 / fold 13.56 | four_bet 14.42 / call 26.10 / fold 59.48 |
| station | three-bet-responses | HJ_vs_SB_three_bet | 331.40 | four_bet 2.23 / call 84.21 / fold 13.56 | four_bet 14.12 / call 30.67 / fold 55.21 |
| station | three-bet-responses | HJ_vs_BB_three_bet | 331.40 | four_bet 2.23 / call 84.21 / fold 13.56 | four_bet 14.18 / call 26.38 / fold 59.44 |
| station | three-bet-responses | CO_vs_BTN_three_bet | 437.80 | four_bet 1.69 / call 80.29 / fold 18.02 | four_bet 18.05 / call 27.35 / fold 54.60 |
| station | three-bet-responses | CO_vs_SB_three_bet | 437.80 | four_bet 1.69 / call 80.29 / fold 18.02 | four_bet 12.39 / call 42.01 / fold 45.60 |
| station | three-bet-responses | CO_vs_BB_three_bet | 437.80 | four_bet 1.69 / call 80.29 / fold 18.02 | four_bet 12.90 / call 36.58 / fold 50.51 |
| station | three-bet-responses | BTN_vs_SB_three_bet | 641.20 | four_bet 1.15 / call 72.66 / fold 26.18 | four_bet 12.43 / call 35.70 / fold 51.87 |
| station | three-bet-responses | BTN_vs_BB_three_bet | 641.20 | four_bet 1.15 / call 72.66 / fold 26.18 | four_bet 13.01 / call 32.11 / fold 54.88 |
| station | three-bet-responses | SB_vs_BB_three_bet | 454.10 | four_bet 1.04 / call 68.99 / fold 29.97 | four_bet 13.88 / call 20.60 / fold 65.53 |
| station | four-bet-responses | HJ_vs_UTG_four_bet | 20.96 | all_in 16.20 / call 77.26 / fold 6.55 | all_in 28.90 / call 18.95 / fold 52.15 |
| station | four-bet-responses | CO_vs_UTG_four_bet | 20.96 | all_in 16.20 / call 77.26 / fold 6.55 | all_in 27.67 / call 17.90 / fold 54.43 |
| station | four-bet-responses | BTN_vs_UTG_four_bet | 20.96 | all_in 16.20 / call 77.26 / fold 6.55 | all_in 26.69 / call 17.20 / fold 56.11 |
| station | four-bet-responses | SB_vs_UTG_four_bet | 22.34 | all_in 15.71 / call 77.76 / fold 6.54 | all_in 40.12 / call 16.26 / fold 43.62 |
| station | four-bet-responses | BB_vs_UTG_four_bet | 19.70 | all_in 16.65 / call 76.80 / fold 6.55 | all_in 41.88 / call 15.59 / fold 42.53 |
| station | four-bet-responses | CO_vs_HJ_four_bet | 24.20 | all_in 15.13 / call 78.18 / fold 6.69 | all_in 23.74 / call 16.57 / fold 59.69 |
| station | four-bet-responses | BTN_vs_HJ_four_bet | 25.16 | all_in 14.85 / call 78.45 / fold 6.70 | all_in 26.93 / call 16.74 / fold 56.32 |
| station | four-bet-responses | SB_vs_HJ_four_bet | 25.84 | all_in 14.61 / call 78.53 / fold 6.87 | all_in 32.63 / call 18.93 / fold 48.45 |
| station | four-bet-responses | BB_vs_HJ_four_bet | 23.40 | all_in 15.32 / call 77.96 / fold 6.72 | all_in 35.41 / call 15.17 / fold 49.43 |
| station | four-bet-responses | BTN_vs_CO_four_bet | 29.74 | all_in 13.46 / call 78.35 / fold 8.19 | all_in 21.39 / call 14.65 / fold 63.96 |
| station | four-bet-responses | SB_vs_CO_four_bet | 33.94 | all_in 12.80 / call 79.10 / fold 8.10 | all_in 24.77 / call 17.92 / fold 57.31 |
| station | four-bet-responses | BB_vs_CO_four_bet | 28.88 | all_in 13.60 / call 78.31 / fold 8.10 | all_in 27.17 / call 12.51 / fold 60.33 |
| station | four-bet-responses | SB_vs_BTN_four_bet | 43.68 | all_in 11.51 / call 79.60 / fold 8.89 | all_in 21.33 / call 19.37 / fold 59.31 |
| station | four-bet-responses | BB_vs_BTN_four_bet | 33.94 | all_in 12.80 / call 79.10 / fold 8.10 | all_in 23.25 / call 13.00 / fold 63.75 |
| station | four-bet-responses | BB_vs_SB_four_bet | 31.50 | all_in 13.19 / call 78.72 / fold 8.09 | all_in 27.12 / call 16.92 / fold 55.96 |
| station | five-bet-responses | UTG_vs_HJ_five_bet | 7.40 | call 100.00 / fold 0.00 | call 42.71 / fold 57.29 |
| station | five-bet-responses | UTG_vs_CO_five_bet | 7.40 | call 100.00 / fold 0.00 | call 41.83 / fold 58.17 |
| station | five-bet-responses | UTG_vs_BTN_five_bet | 7.40 | call 100.00 / fold 0.00 | call 41.13 / fold 58.87 |
| station | five-bet-responses | UTG_vs_SB_five_bet | 7.40 | call 100.00 / fold 0.00 | call 65.96 / fold 34.04 |
| station | five-bet-responses | UTG_vs_BB_five_bet | 7.40 | call 100.00 / fold 0.00 | call 51.96 / fold 48.04 |
| station | five-bet-responses | HJ_vs_CO_five_bet | 7.40 | call 100.00 / fold 0.00 | call 29.64 / fold 70.36 |
| station | five-bet-responses | HJ_vs_BTN_five_bet | 7.40 | call 100.00 / fold 0.00 | call 39.38 / fold 60.62 |
| station | five-bet-responses | HJ_vs_SB_five_bet | 7.40 | call 100.00 / fold 0.00 | call 58.73 / fold 41.27 |
| station | five-bet-responses | HJ_vs_BB_five_bet | 7.40 | call 100.00 / fold 0.00 | call 49.65 / fold 50.35 |
| station | five-bet-responses | CO_vs_BTN_five_bet | 7.40 | call 100.00 / fold 0.00 | call 28.16 / fold 71.84 |
| station | five-bet-responses | CO_vs_SB_five_bet | 7.40 | call 100.00 / fold 0.00 | call 58.37 / fold 41.63 |
| station | five-bet-responses | CO_vs_BB_five_bet | 7.40 | call 100.00 / fold 0.00 | call 50.94 / fold 49.06 |
| station | five-bet-responses | BTN_vs_SB_five_bet | 7.40 | call 100.00 / fold 0.00 | call 50.66 / fold 49.34 |
| station | five-bet-responses | BTN_vs_BB_five_bet | 7.40 | call 100.00 / fold 0.00 | call 41.62 / fold 58.38 |
| station | five-bet-responses | SB_vs_BB_five_bet | 4.71 | call 100.00 / fold 0.00 | call 48.33 / fold 51.67 |
| station | limp-responses | BB_vs_SB_limp | 1326.00 | raise 1.09 / check 98.91 | raise 21.70 / check 78.30 |
| station | limp-responses | SB_vs_BB_iso | 569.70 | raise 0.46 / call 92.72 / fold 6.81 | raise 4.63 / call 19.56 / fold 75.81 |
| station | limp-responses | BB_vs_SB_limp_reraise | 14.40 | four_bet 14.62 / call 83.54 / fold 1.84 | four_bet 3.64 / call 42.78 / fold 53.58 |
| station | limp-deep-responses | SB_vs_BB_limp_four_bet | 2.65 | all_in 18.74 / call 78.99 / fold 2.27 | all_in 24.14 / call 19.62 / fold 56.24 |
| station | limp-deep-responses | BB_vs_SB_limp_five_bet | 2.10 | call 100.00 / fold 0.00 | call 45.98 / fold 54.02 |
| lag | opening-ranges | UTG_open | 1326.00 | open 21.91 / fold 78.09 | open 16.03 / fold 83.97 |
| lag | opening-ranges | HJ_open | 1326.00 | open 32.85 / fold 67.15 | open 23.53 / fold 76.47 |
| lag | opening-ranges | CO_open | 1326.00 | open 41.55 / fold 58.45 | open 29.34 / fold 70.66 |
| lag | opening-ranges | BTN_open | 1326.00 | open 60.84 / fold 39.16 | open 42.84 / fold 57.16 |
| lag | opening-ranges | SB_open | 1326.00 | open 44.85 / limp 17.35 / fold 37.81 | open 31.64 / limp 14.71 / fold 53.64 |
| lag | preflop-ranges | HJ_vs_UTG | 1326.00 | three_bet 9.13 / call 8.15 / fold 82.72 | three_bet 5.63 / call 4.28 / fold 90.09 |
| lag | preflop-ranges | CO_vs_UTG | 1326.00 | three_bet 9.13 / call 9.56 / fold 81.32 | three_bet 5.45 / call 5.19 / fold 89.36 |
| lag | preflop-ranges | BTN_vs_UTG | 1326.00 | three_bet 9.13 / call 11.86 / fold 79.01 | three_bet 5.31 / call 7.07 / fold 87.62 |
| lag | preflop-ranges | SB_vs_UTG | 1326.00 | three_bet 10.29 / call 9.43 / fold 80.29 | three_bet 5.05 / call 0.00 / fold 94.95 |
| lag | preflop-ranges | BB_vs_UTG | 1326.00 | three_bet 8.20 / call 29.27 / fold 62.53 | three_bet 4.28 / call 24.19 / fold 71.52 |
| lag | preflop-ranges | CO_vs_HJ | 1326.00 | three_bet 11.60 / call 11.04 / fold 77.36 | three_bet 6.88 / call 6.27 / fold 86.86 |
| lag | preflop-ranges | BTN_vs_HJ | 1326.00 | three_bet 12.29 / call 14.17 / fold 73.54 | three_bet 6.75 / call 9.17 / fold 84.08 |
| lag | preflop-ranges | SB_vs_HJ | 1326.00 | three_bet 12.73 / call 11.41 / fold 75.87 | three_bet 7.06 / call 0.00 / fold 92.94 |
| lag | preflop-ranges | BB_vs_HJ | 1326.00 | three_bet 10.94 / call 35.97 / fold 53.09 | three_bet 5.66 / call 30.54 / fold 63.80 |
| lag | preflop-ranges | BTN_vs_CO | 1326.00 | three_bet 14.49 / call 16.54 / fold 68.97 | three_bet 8.73 / call 11.00 / fold 80.27 |
| lag | preflop-ranges | SB_vs_CO | 1326.00 | three_bet 17.74 / call 13.44 / fold 68.82 | three_bet 11.52 / call 0.00 / fold 88.48 |
| lag | preflop-ranges | BB_vs_CO | 1326.00 | three_bet 14.19 / call 42.55 / fold 43.27 | three_bet 7.84 / call 33.37 / fold 58.79 |
| lag | preflop-ranges | SB_vs_BTN | 1326.00 | three_bet 23.78 / call 17.77 / fold 58.45 | three_bet 16.76 / call 0.00 / fold 83.24 |
| lag | preflop-ranges | BB_vs_BTN | 1326.00 | three_bet 17.74 / call 49.33 / fold 32.93 | three_bet 11.03 / call 41.80 / fold 47.16 |
| lag | preflop-ranges | BB_vs_SB | 1326.00 | three_bet 15.92 / call 40.03 / fold 44.05 | three_bet 8.95 / call 33.14 / fold 57.90 |
| lag | three-bet-responses | UTG_vs_HJ_three_bet | 290.50 | four_bet 18.61 / call 58.43 / fold 22.97 | four_bet 14.92 / call 25.06 / fold 60.02 |
| lag | three-bet-responses | UTG_vs_CO_three_bet | 290.50 | four_bet 18.61 / call 58.43 / fold 22.97 | four_bet 14.92 / call 26.99 / fold 58.09 |
| lag | three-bet-responses | UTG_vs_BTN_three_bet | 290.50 | four_bet 18.61 / call 58.43 / fold 22.97 | four_bet 15.01 / call 27.61 / fold 57.38 |
| lag | three-bet-responses | UTG_vs_SB_three_bet | 290.50 | four_bet 18.61 / call 58.43 / fold 22.97 | four_bet 13.51 / call 21.08 / fold 65.41 |
| lag | three-bet-responses | UTG_vs_BB_three_bet | 290.50 | four_bet 18.61 / call 58.43 / fold 22.97 | four_bet 13.60 / call 19.95 / fold 66.45 |
| lag | three-bet-responses | HJ_vs_CO_three_bet | 435.60 | four_bet 15.35 / call 52.96 / fold 31.69 | four_bet 14.36 / call 24.58 / fold 61.07 |
| lag | three-bet-responses | HJ_vs_BTN_three_bet | 435.60 | four_bet 15.35 / call 52.96 / fold 31.69 | four_bet 14.42 / call 26.10 / fold 59.48 |
| lag | three-bet-responses | HJ_vs_SB_three_bet | 435.60 | four_bet 15.35 / call 52.96 / fold 31.69 | four_bet 14.12 / call 30.67 / fold 55.21 |
| lag | three-bet-responses | HJ_vs_BB_three_bet | 435.60 | four_bet 15.35 / call 52.96 / fold 31.69 | four_bet 14.18 / call 26.38 / fold 59.44 |
| lag | three-bet-responses | CO_vs_BTN_three_bet | 551.00 | four_bet 13.49 / call 46.37 / fold 40.14 | four_bet 18.05 / call 27.35 / fold 54.60 |
| lag | three-bet-responses | CO_vs_SB_three_bet | 551.00 | four_bet 13.49 / call 46.37 / fold 40.14 | four_bet 12.39 / call 42.01 / fold 45.60 |
| lag | three-bet-responses | CO_vs_BB_three_bet | 551.00 | four_bet 13.49 / call 46.37 / fold 40.14 | four_bet 12.90 / call 36.58 / fold 50.51 |
| lag | three-bet-responses | BTN_vs_SB_three_bet | 806.80 | four_bet 10.94 / call 37.76 / fold 51.30 | four_bet 12.43 / call 35.70 / fold 51.87 |
| lag | three-bet-responses | BTN_vs_BB_three_bet | 806.80 | four_bet 10.94 / call 37.76 / fold 51.30 | four_bet 13.01 / call 32.11 / fold 54.88 |
| lag | three-bet-responses | SB_vs_BB_three_bet | 594.70 | four_bet 12.35 / call 41.36 / fold 46.29 | four_bet 13.88 / call 20.60 / fold 65.53 |
| lag | four-bet-responses | HJ_vs_UTG_four_bet | 121.02 | all_in 13.42 / call 23.80 / fold 62.78 | all_in 28.90 / call 18.95 / fold 52.15 |
| lag | four-bet-responses | CO_vs_UTG_four_bet | 121.02 | all_in 13.42 / call 23.80 / fold 62.78 | all_in 27.67 / call 17.90 / fold 54.43 |
| lag | four-bet-responses | BTN_vs_UTG_four_bet | 121.02 | all_in 13.42 / call 23.80 / fold 62.78 | all_in 26.69 / call 17.20 / fold 56.11 |
| lag | four-bet-responses | SB_vs_UTG_four_bet | 136.38 | all_in 12.66 / call 23.21 / fold 64.12 | all_in 40.12 / call 16.26 / fold 43.62 |
| lag | four-bet-responses | BB_vs_UTG_four_bet | 108.72 | all_in 14.12 / call 24.23 / fold 61.65 | all_in 41.88 / call 15.59 / fold 42.53 |
| lag | four-bet-responses | CO_vs_HJ_four_bet | 153.78 | all_in 12.42 / call 23.90 / fold 63.68 | all_in 23.74 / call 16.57 / fold 59.69 |
| lag | four-bet-responses | BTN_vs_HJ_four_bet | 163.00 | all_in 12.06 / call 23.56 / fold 64.38 | all_in 26.93 / call 16.74 / fold 56.32 |
| lag | four-bet-responses | SB_vs_HJ_four_bet | 168.78 | all_in 11.90 / call 23.35 / fold 64.74 | all_in 32.63 / call 18.93 / fold 48.45 |
| lag | four-bet-responses | BB_vs_HJ_four_bet | 145.08 | all_in 12.54 / call 23.58 / fold 63.89 | all_in 35.41 / call 15.17 / fold 49.43 |
| lag | four-bet-responses | BTN_vs_CO_four_bet | 192.16 | all_in 11.60 / call 23.66 / fold 64.74 | all_in 21.39 / call 14.65 / fold 63.96 |
| lag | four-bet-responses | SB_vs_CO_four_bet | 235.20 | all_in 10.92 / call 23.40 / fold 65.68 | all_in 24.77 / call 17.92 / fold 57.31 |
| lag | four-bet-responses | BB_vs_CO_four_bet | 188.12 | all_in 11.46 / call 23.27 / fold 65.26 | all_in 27.17 / call 12.51 / fold 60.33 |
| lag | four-bet-responses | SB_vs_BTN_four_bet | 315.34 | all_in 10.01 / call 23.07 / fold 66.92 | all_in 21.33 / call 19.37 / fold 59.31 |
| lag | four-bet-responses | BB_vs_BTN_four_bet | 235.20 | all_in 10.92 / call 23.40 / fold 65.68 | all_in 23.25 / call 13.00 / fold 63.75 |
| lag | four-bet-responses | BB_vs_SB_four_bet | 211.14 | all_in 11.24 / call 23.51 / fold 65.25 | all_in 27.12 / call 16.92 / fold 55.96 |
| lag | five-bet-responses | UTG_vs_HJ_five_bet | 54.05 | call 53.62 / fold 46.38 | call 42.71 / fold 57.29 |
| lag | five-bet-responses | UTG_vs_CO_five_bet | 54.05 | call 53.62 / fold 46.38 | call 41.83 / fold 58.17 |
| lag | five-bet-responses | UTG_vs_BTN_five_bet | 54.05 | call 53.62 / fold 46.38 | call 41.13 / fold 58.87 |
| lag | five-bet-responses | UTG_vs_SB_five_bet | 54.05 | call 53.62 / fold 46.38 | call 65.96 / fold 34.04 |
| lag | five-bet-responses | UTG_vs_BB_five_bet | 54.05 | call 53.62 / fold 46.38 | call 51.96 / fold 48.04 |
| lag | five-bet-responses | HJ_vs_CO_five_bet | 66.86 | call 44.30 / fold 55.70 | call 29.64 / fold 70.36 |
| lag | five-bet-responses | HJ_vs_BTN_five_bet | 66.86 | call 44.30 / fold 55.70 | call 39.38 / fold 60.62 |
| lag | five-bet-responses | HJ_vs_SB_five_bet | 66.86 | call 44.30 / fold 55.70 | call 58.73 / fold 41.27 |
| lag | five-bet-responses | HJ_vs_BB_five_bet | 66.86 | call 44.30 / fold 55.70 | call 49.65 / fold 50.35 |
| lag | five-bet-responses | CO_vs_BTN_five_bet | 74.31 | call 39.24 / fold 60.76 | call 28.16 / fold 71.84 |
| lag | five-bet-responses | CO_vs_SB_five_bet | 74.31 | call 39.24 / fold 60.76 | call 58.37 / fold 41.63 |
| lag | five-bet-responses | CO_vs_BB_five_bet | 74.31 | call 39.24 / fold 60.76 | call 50.94 / fold 49.06 |
| lag | five-bet-responses | BTN_vs_SB_five_bet | 88.25 | call 33.10 / fold 66.90 | call 50.66 / fold 49.34 |
| lag | five-bet-responses | BTN_vs_BB_five_bet | 88.25 | call 33.10 / fold 66.90 | call 41.62 / fold 58.38 |
| lag | five-bet-responses | SB_vs_BB_five_bet | 73.44 | call 37.41 / fold 62.59 | call 48.33 / fold 51.67 |
| lag | limp-responses | BB_vs_SB_limp | 1326.00 | raise 26.29 / check 73.71 | raise 21.70 / check 78.30 |
| lag | limp-responses | SB_vs_BB_iso | 230.00 | raise 10.75 / call 52.00 / fold 37.25 | raise 4.63 / call 19.56 / fold 75.81 |
| lag | limp-responses | BB_vs_SB_limp_reraise | 348.60 | four_bet 14.64 / call 44.48 / fold 40.87 | four_bet 3.64 / call 42.78 / fold 53.58 |
| lag | limp-deep-responses | SB_vs_BB_limp_four_bet | 24.73 | all_in 6.40 / call 16.50 / fold 77.10 | all_in 24.14 / call 19.62 / fold 56.24 |
| lag | limp-deep-responses | BB_vs_SB_limp_five_bet | 51.05 | call 44.88 / fold 55.12 | call 45.98 / fold 54.02 |
| maniac | opening-ranges | UTG_open | 1326.00 | open 29.50 / fold 70.50 | open 16.03 / fold 83.97 |
| maniac | opening-ranges | HJ_open | 1326.00 | open 42.14 / fold 57.86 | open 23.53 / fold 76.47 |
| maniac | opening-ranges | CO_open | 1326.00 | open 53.67 / fold 46.33 | open 29.34 / fold 70.66 |
| maniac | opening-ranges | BTN_open | 1326.00 | open 78.61 / fold 21.39 | open 42.84 / fold 57.16 |
| maniac | opening-ranges | SB_open | 1326.00 | open 57.19 / limp 14.99 / fold 27.81 | open 31.64 / limp 14.71 / fold 53.64 |
| maniac | preflop-ranges | HJ_vs_UTG | 1326.00 | three_bet 16.03 / call 9.72 / fold 74.25 | three_bet 5.63 / call 4.28 / fold 90.09 |
| maniac | preflop-ranges | CO_vs_UTG | 1326.00 | three_bet 16.03 / call 12.10 / fold 71.87 | three_bet 5.45 / call 5.19 / fold 89.36 |
| maniac | preflop-ranges | BTN_vs_UTG | 1326.00 | three_bet 16.03 / call 14.87 / fold 69.11 | three_bet 5.31 / call 7.07 / fold 87.62 |
| maniac | preflop-ranges | SB_vs_UTG | 1326.00 | three_bet 17.84 / call 11.95 / fold 70.21 | three_bet 5.05 / call 0.00 / fold 94.95 |
| maniac | preflop-ranges | BB_vs_UTG | 1326.00 | three_bet 14.63 / call 38.89 / fold 46.48 | three_bet 4.28 / call 24.19 / fold 71.52 |
| maniac | preflop-ranges | CO_vs_HJ | 1326.00 | three_bet 20.81 / call 14.42 / fold 64.77 | three_bet 6.88 / call 6.27 / fold 86.86 |
| maniac | preflop-ranges | BTN_vs_HJ | 1326.00 | three_bet 21.86 / call 18.79 / fold 59.35 | three_bet 6.75 / call 9.17 / fold 84.08 |
| maniac | preflop-ranges | SB_vs_HJ | 1326.00 | three_bet 22.52 / call 14.32 / fold 63.15 | three_bet 7.06 / call 0.00 / fold 92.94 |
| maniac | preflop-ranges | BB_vs_HJ | 1326.00 | three_bet 19.32 / call 48.28 / fold 32.40 | three_bet 5.66 / call 30.54 / fold 63.80 |
| maniac | preflop-ranges | BTN_vs_CO | 1326.00 | three_bet 25.90 / call 21.24 / fold 52.86 | three_bet 8.73 / call 11.00 / fold 80.27 |
| maniac | preflop-ranges | SB_vs_CO | 1326.00 | three_bet 31.67 / call 17.93 / fold 50.40 | three_bet 11.52 / call 0.00 / fold 88.48 |
| maniac | preflop-ranges | BB_vs_CO | 1326.00 | three_bet 25.09 / call 58.23 / fold 16.68 | three_bet 7.84 / call 33.37 / fold 58.79 |
| maniac | preflop-ranges | SB_vs_BTN | 1326.00 | three_bet 42.36 / call 23.36 / fold 34.29 | three_bet 16.76 / call 0.00 / fold 83.24 |
| maniac | preflop-ranges | BB_vs_BTN | 1326.00 | three_bet 31.67 / call 67.38 / fold 0.95 | three_bet 11.03 / call 41.80 / fold 47.16 |
| maniac | preflop-ranges | BB_vs_SB | 1326.00 | three_bet 28.38 / call 54.42 / fold 17.20 | three_bet 8.95 / call 33.14 / fold 57.90 |
| maniac | three-bet-responses | UTG_vs_HJ_three_bet | 391.20 | four_bet 46.54 / call 46.38 / fold 7.08 | four_bet 14.92 / call 25.06 / fold 60.02 |
| maniac | three-bet-responses | UTG_vs_CO_three_bet | 391.20 | four_bet 46.54 / call 46.38 / fold 7.08 | four_bet 14.92 / call 26.99 / fold 58.09 |
| maniac | three-bet-responses | UTG_vs_BTN_three_bet | 391.20 | four_bet 46.54 / call 46.38 / fold 7.08 | four_bet 15.01 / call 27.61 / fold 57.38 |
| maniac | three-bet-responses | UTG_vs_SB_three_bet | 391.20 | four_bet 46.54 / call 46.38 / fold 7.08 | four_bet 13.51 / call 21.08 / fold 65.41 |
| maniac | three-bet-responses | UTG_vs_BB_three_bet | 391.20 | four_bet 46.54 / call 46.38 / fold 7.08 | four_bet 13.60 / call 19.95 / fold 66.45 |
| maniac | three-bet-responses | HJ_vs_CO_three_bet | 558.80 | four_bet 41.51 / call 47.64 / fold 10.85 | four_bet 14.36 / call 24.58 / fold 61.07 |
| maniac | three-bet-responses | HJ_vs_BTN_three_bet | 558.80 | four_bet 41.51 / call 47.64 / fold 10.85 | four_bet 14.42 / call 26.10 / fold 59.48 |
| maniac | three-bet-responses | HJ_vs_SB_three_bet | 558.80 | four_bet 41.51 / call 47.64 / fold 10.85 | four_bet 14.12 / call 30.67 / fold 55.21 |
| maniac | three-bet-responses | HJ_vs_BB_three_bet | 558.80 | four_bet 41.51 / call 47.64 / fold 10.85 | four_bet 14.18 / call 26.38 / fold 59.44 |
| maniac | three-bet-responses | CO_vs_BTN_three_bet | 711.60 | four_bet 38.41 / call 48.27 / fold 13.32 | four_bet 18.05 / call 27.35 / fold 54.60 |
| maniac | three-bet-responses | CO_vs_SB_three_bet | 711.60 | four_bet 38.41 / call 48.27 / fold 13.32 | four_bet 12.39 / call 42.01 / fold 45.60 |
| maniac | three-bet-responses | CO_vs_BB_three_bet | 711.60 | four_bet 38.41 / call 48.27 / fold 13.32 | four_bet 12.90 / call 36.58 / fold 50.51 |
| maniac | three-bet-responses | BTN_vs_SB_three_bet | 1042.40 | four_bet 35.28 / call 48.73 / fold 15.98 | four_bet 12.43 / call 35.70 / fold 51.87 |
| maniac | three-bet-responses | BTN_vs_BB_three_bet | 1042.40 | four_bet 35.28 / call 48.73 / fold 15.98 | four_bet 13.01 / call 32.11 / fold 54.88 |
| maniac | three-bet-responses | SB_vs_BB_three_bet | 758.40 | four_bet 38.07 / call 48.36 / fold 13.57 | four_bet 13.88 / call 20.60 / fold 65.53 |
| maniac | four-bet-responses | HJ_vs_UTG_four_bet | 212.50 | all_in 43.66 / call 40.27 / fold 16.07 | all_in 28.90 / call 18.95 / fold 52.15 |
| maniac | four-bet-responses | CO_vs_UTG_four_bet | 212.50 | all_in 43.66 / call 40.27 / fold 16.07 | all_in 27.67 / call 17.90 / fold 54.43 |
| maniac | four-bet-responses | BTN_vs_UTG_four_bet | 212.50 | all_in 43.66 / call 40.27 / fold 16.07 | all_in 26.69 / call 17.20 / fold 56.11 |
| maniac | four-bet-responses | SB_vs_UTG_four_bet | 236.52 | all_in 43.30 / call 40.42 / fold 16.28 | all_in 40.12 / call 16.26 / fold 43.62 |
| maniac | four-bet-responses | BB_vs_UTG_four_bet | 193.98 | all_in 43.85 / call 40.14 / fold 16.02 | all_in 41.88 / call 15.59 / fold 42.53 |
| maniac | four-bet-responses | CO_vs_HJ_four_bet | 275.88 | all_in 43.09 / call 40.61 / fold 16.31 | all_in 23.74 / call 16.57 / fold 59.69 |
| maniac | four-bet-responses | BTN_vs_HJ_four_bet | 289.90 | all_in 42.94 / call 40.64 / fold 16.42 | all_in 26.93 / call 16.74 / fold 56.32 |
| maniac | four-bet-responses | SB_vs_HJ_four_bet | 298.68 | all_in 42.79 / call 40.72 / fold 16.49 | all_in 32.63 / call 18.93 / fold 48.45 |
| maniac | four-bet-responses | BB_vs_HJ_four_bet | 256.20 | all_in 43.19 / call 40.52 / fold 16.29 | all_in 35.41 / call 15.17 / fold 49.43 |
| maniac | four-bet-responses | BTN_vs_CO_four_bet | 343.44 | all_in 42.82 / call 40.82 / fold 16.35 | all_in 21.39 / call 14.65 / fold 63.96 |
| maniac | four-bet-responses | SB_vs_CO_four_bet | 420.00 | all_in 42.45 / call 40.99 / fold 16.56 | all_in 24.77 / call 17.92 / fold 57.31 |
| maniac | four-bet-responses | BB_vs_CO_four_bet | 332.70 | all_in 42.62 / call 40.80 / fold 16.57 | all_in 27.17 / call 12.51 / fold 60.33 |
| maniac | four-bet-responses | SB_vs_BTN_four_bet | 561.66 | all_in 41.97 / call 41.27 / fold 16.76 | all_in 21.33 / call 19.37 / fold 59.31 |
| maniac | four-bet-responses | BB_vs_BTN_four_bet | 420.00 | all_in 42.45 / call 40.99 / fold 16.56 | all_in 23.25 / call 13.00 / fold 63.75 |
| maniac | four-bet-responses | BB_vs_SB_four_bet | 376.30 | all_in 42.63 / call 40.90 / fold 16.47 | all_in 27.12 / call 16.92 / fold 55.96 |
| maniac | five-bet-responses | UTG_vs_HJ_five_bet | 182.06 | call 84.96 / fold 15.04 | call 42.71 / fold 57.29 |
| maniac | five-bet-responses | UTG_vs_CO_five_bet | 182.06 | call 84.96 / fold 15.04 | call 41.83 / fold 58.17 |
| maniac | five-bet-responses | UTG_vs_BTN_five_bet | 182.06 | call 84.96 / fold 15.04 | call 41.13 / fold 58.87 |
| maniac | five-bet-responses | UTG_vs_SB_five_bet | 182.06 | call 84.96 / fold 15.04 | call 65.96 / fold 34.04 |
| maniac | five-bet-responses | UTG_vs_BB_five_bet | 182.06 | call 84.96 / fold 15.04 | call 51.96 / fold 48.04 |
| maniac | five-bet-responses | HJ_vs_CO_five_bet | 231.98 | call 79.51 / fold 20.49 | call 29.64 / fold 70.36 |
| maniac | five-bet-responses | HJ_vs_BTN_five_bet | 231.98 | call 79.51 / fold 20.49 | call 39.38 / fold 60.62 |
| maniac | five-bet-responses | HJ_vs_SB_five_bet | 231.98 | call 79.51 / fold 20.49 | call 58.73 / fold 41.27 |
| maniac | five-bet-responses | HJ_vs_BB_five_bet | 231.98 | call 79.51 / fold 20.49 | call 49.65 / fold 50.35 |
| maniac | five-bet-responses | CO_vs_BTN_five_bet | 273.35 | call 75.72 / fold 24.28 | call 28.16 / fold 71.84 |
| maniac | five-bet-responses | CO_vs_SB_five_bet | 273.35 | call 75.72 / fold 24.28 | call 58.37 / fold 41.63 |
| maniac | five-bet-responses | CO_vs_BB_five_bet | 273.35 | call 75.72 / fold 24.28 | call 50.94 / fold 49.06 |
| maniac | five-bet-responses | BTN_vs_SB_five_bet | 367.78 | call 71.90 / fold 28.10 | call 50.66 / fold 49.34 |
| maniac | five-bet-responses | BTN_vs_BB_five_bet | 367.78 | call 71.90 / fold 28.10 | call 41.62 / fold 58.38 |
| maniac | five-bet-responses | SB_vs_BB_five_bet | 288.68 | call 75.54 / fold 24.46 | call 48.33 / fold 51.67 |
| maniac | limp-responses | BB_vs_SB_limp | 1326.00 | raise 53.46 / check 46.54 | raise 21.70 / check 78.30 |
| maniac | limp-responses | SB_vs_BB_iso | 198.80 | raise 34.56 / call 61.64 / fold 3.80 | raise 4.63 / call 19.56 / fold 75.81 |
| maniac | limp-responses | BB_vs_SB_limp_reraise | 708.90 | four_bet 37.89 / call 48.03 / fold 14.08 | four_bet 3.64 / call 42.78 / fold 53.58 |
| maniac | limp-deep-responses | SB_vs_BB_limp_four_bet | 68.70 | all_in 34.99 / call 42.44 / fold 22.57 | all_in 24.14 / call 19.62 / fold 56.24 |
| maniac | limp-deep-responses | BB_vs_SB_limp_five_bet | 268.62 | call 75.51 / fold 24.49 | call 45.98 / fold 54.02 |
