use continuation::SimpleContinuationModel;
use preflop_tree::{GameTree, PreflopConfig};
use solution::{hash_game_config, FileSolutionStore, Solution, SolutionRepository};
use solver_core::{CfrStrategy, SolverStrategy};
use std::env;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

fn main() {
    if let Err(error) = run() {
        eprintln!("solveagto-worker: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().collect();
    if args.len() < 3 || args[1] != "solve" {
        return Err("usage: solveagto-worker solve <config.json> [output_dir]".to_string());
    }
    let config_path = Path::new(&args[2]);
    let output_dir = args
        .get(3)
        .cloned()
        .or_else(|| env::var("SOLVEAGTO_SOLUTION_DIR").ok())
        .unwrap_or_else(|| "solutions".to_string());

    println!("SolveaGTO Preflop v0.1");
    println!();
    println!("Config Load: {}", config_path.display());
    let config_json = fs::read_to_string(config_path).map_err(|error| error.to_string())?;
    let config = PreflopConfig::from_json(&config_json)?;
    println!("Game: {} {}-max", config.game, config.players);
    println!("Stack: {}BB", config.stack_bb);
    println!();

    println!("Game Tree Build");
    let tree = GameTree::build(config.clone())?;
    println!("Tree nodes: {}", tree.nodes().len());
    println!("Combos: 1326");
    println!();

    println!("Solver Start ({})", config.solver.strategy);
    let strategy = if config.solver.strategy.eq_ignore_ascii_case("cfr") {
        CfrStrategy::cfr()
    } else {
        CfrStrategy::dcfr()
    };
    let continuation = SimpleContinuationModel::default();
    let mut last_reported = 0;
    let output = strategy.solve(
        &tree,
        &continuation,
        config.solver.iterations,
        &mut |progress| {
            if progress.iteration != last_reported {
                println!(
                    "Iteration: {} (average strategy delta: {:.6})",
                    progress.iteration, progress.average_strategy_delta
                );
                last_reported = progress.iteration;
            }
        },
    );

    println!();
    println!("Solution Build");
    let solution_id = format!("{}-v1", config_path.file_stem().and_then(|name| name.to_str()).unwrap_or("preflop"));
    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string());
    let solution = Solution::from_solver_output(
        solution_id.clone(),
        hash_game_config(&config),
        created_at,
        output,
        &tree,
    );

    println!("Solution Save: {output_dir}/{solution_id}.json");
    FileSolutionStore::new(output_dir).save(&solution)?;
    println!();
    println!("Finished");
    println!();
    println!("Solution:");
    println!("{solution_id}");
    Ok(())
}
