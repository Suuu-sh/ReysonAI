use preflop_tree::PreflopConfig;
use serde_json::json;
use solution::{hash_game_config, Solution};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

fn main() {
    if let Err(error) = run() {
        eprintln!("solveagto-promote: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args = env::args().collect::<Vec<_>>();
    if args.len() != 4 {
        return Err(
            "usage: solveagto-promote <config.json> <solution.json> <release_dir>".to_string(),
        );
    }
    let config_path = Path::new(&args[1]);
    let solution_path = Path::new(&args[2]);
    let release_dir = Path::new(&args[3]);

    let config_json = fs::read_to_string(config_path)
        .map_err(|error| format!("failed to read config {}: {error}", config_path.display()))?;
    let config = PreflopConfig::from_json(&config_json)?;
    let solution_json = fs::read_to_string(solution_path).map_err(|error| {
        format!(
            "failed to read solution {}: {error}",
            solution_path.display()
        )
    })?;
    let solution: Solution = serde_json::from_str(&solution_json)
        .map_err(|error| format!("invalid solution JSON: {error}"))?;

    validate(&config, &solution)?;

    let solutions_dir = release_dir.join("solutions");
    fs::create_dir_all(&solutions_dir).map_err(|error| error.to_string())?;
    let artifact_path = solutions_dir.join(format!("{}.json", solution.solution_id));
    write_atomic(&artifact_path, solution_json.as_bytes())?;
    let edge_paths = write_edge_artifacts(&solutions_dir, &solution)?;

    let promoted_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    let manifest = json!({
        "solutionId": solution.solution_id,
        "stackBb": solution.stack_bb,
        "gameConfigHash": solution.game_config_hash,
        "solverVersion": solution.solver_version,
        "continuationModelVersion": solution.continuation_model_version,
        "iterations": solution.iterations,
        "createdAt": solution.created_at,
        "promotedAt": promoted_at,
        "artifactHash": fnv1a(solution_json.as_bytes()),
        "artifact": format!("solutions/{}.json", solution.solution_id),
        "edge": edge_paths,
    });
    let manifest_json = serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?;
    write_atomic(&release_dir.join("manifest.json"), &manifest_json)?;

    println!("Validated solution: {}", solution.solution_id);
    println!("Release artifact: {}", artifact_path.display());
    println!("Manifest: {}", release_dir.join("manifest.json").display());
    Ok(())
}

fn write_edge_artifacts(
    solutions_dir: &Path,
    solution: &Solution,
) -> Result<serde_json::Value, String> {
    let solution_dir = solutions_dir.join(&solution.solution_id);
    let nodes_dir = solution_dir.join("nodes");
    fs::create_dir_all(&nodes_dir).map_err(|error| error.to_string())?;

    let summary_path = solution_dir.join("summary.json");
    let summary_json =
        serde_json::to_vec_pretty(&solution.summary()).map_err(|error| error.to_string())?;
    write_atomic(&summary_path, &summary_json)?;

    let node_index = solution
        .nodes
        .iter()
        .map(|node| {
            json!({
                "nodeId": node.node_id,
                "nodeType": node.node_type,
                "actionHistory": node.action_history,
                "actingPosition": node.acting_position,
                "potBb": node.pot_bb,
                "effectiveStackBb": node.effective_stack_bb,
                "hasStrategy": !node.combos.is_empty(),
            })
        })
        .collect::<Vec<_>>();
    let nodes_index_path = nodes_dir.join("index.json");
    let nodes_index_json =
        serde_json::to_vec_pretty(&node_index).map_err(|error| error.to_string())?;
    write_atomic(&nodes_index_path, &nodes_index_json)?;

    for node in &solution.nodes {
        if node.node_id.contains('/') || node.node_id.contains('\\') || node.node_id.contains("..")
        {
            return Err(format!(
                "invalid node id for edge artifact: {}",
                node.node_id
            ));
        }
        let node_path = nodes_dir.join(format!("{}.json", node.node_id));
        let node_json = serde_json::to_vec_pretty(node).map_err(|error| error.to_string())?;
        write_atomic(&node_path, &node_json)?;
    }

    Ok(json!({
        "summary": format!("solutions/{}/summary.json", solution.solution_id),
        "nodesIndex": format!("solutions/{}/nodes/index.json", solution.solution_id),
        "nodesPrefix": format!("solutions/{}/nodes/", solution.solution_id),
    }))
}

fn validate(config: &PreflopConfig, solution: &Solution) -> Result<(), String> {
    let expected_hash = hash_game_config(config);
    if solution.game_config_hash != expected_hash {
        return Err(format!(
            "gameConfigHash mismatch: expected {expected_hash}, found {}",
            solution.game_config_hash
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

    let strategy_nodes = solution
        .nodes
        .iter()
        .filter(|node| !node.combos.is_empty())
        .collect::<Vec<_>>();
    if strategy_nodes.is_empty() {
        return Err("solution has no strategy nodes".to_string());
    }
    for node in strategy_nodes {
        if node.combos.len() != 1326 {
            return Err(format!(
                "node {} has {} combos; expected 1326",
                node.node_id,
                node.combos.len()
            ));
        }
        for combo in &node.combos {
            if combo.actions.is_empty() {
                return Err(format!(
                    "node {} combo {} has no actions",
                    node.node_id, combo.combo
                ));
            }
            let frequency_sum = combo.actions.iter().try_fold(0.0, |sum, action| {
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
    Ok(())
}

fn write_atomic(path: &Path, content: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("path has no parent: {}", path.display()))?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temp_path = temporary_path(path);
    fs::write(&temp_path, content).map_err(|error| error.to_string())?;
    fs::rename(&temp_path, path).map_err(|error| error.to_string())
}

fn temporary_path(path: &Path) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("artifact");
    path.with_file_name(format!(".{file_name}.{}.tmp", std::process::id()))
}

fn fnv1a(bytes: &[u8]) -> String {
    let mut hash: u64 = 14_695_981_039_346_656_037;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(1_099_511_628_211);
    }
    format!("fnv1a-{hash:016x}")
}
