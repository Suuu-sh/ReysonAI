use continuation::SimpleContinuationModel;
use preflop_tree::PreflopConfig;
use solution::{
    hash_game_config, validate_solution, FileSolutionStore, Solution, SolutionRepository,
};
use solver_core::{CfrStrategy, SolverProgress, SolverStrategy};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct SolveRequest {
    pub solution_id: String,
    pub config: PreflopConfig,
}

pub fn solve(
    request: SolveRequest,
    progress: &mut dyn FnMut(SolverProgress),
) -> Result<Solution, String> {
    let config = request.config;
    let tree = preflop_tree::GameTree::build(config.clone())?;
    let strategy = if config.solver.strategy.eq_ignore_ascii_case("cfr") {
        CfrStrategy::cfr()
    } else {
        CfrStrategy::dcfr()
    };
    let output = strategy.solve(
        &tree,
        &SimpleContinuationModel::default(),
        config.solver.iterations,
        progress,
    );
    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string());
    let solution = Solution::from_solver_output(
        request.solution_id,
        hash_game_config(&config),
        created_at,
        output,
        &tree,
    );
    let validation = validate_solution(&config, &solution)?;
    Ok(solution.with_validation(validation))
}

pub fn save(solution: &Solution, output_dir: impl AsRef<Path>) -> Result<(), String> {
    FileSolutionStore::new(output_dir.as_ref().to_path_buf()).save(solution)
}
