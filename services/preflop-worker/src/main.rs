use preflop_tree::PreflopConfig;
use reysonai_job_queue::{next_job_id, queue_from_environment, JobQueue, SolveJob};
use reysonai_worker::{save, solve, SolveRequest};
use std::env;
use std::fs;
use std::path::Path;
use std::thread;
use std::time::Duration;

fn main() {
    if let Err(error) = run() {
        eprintln!("reysonai-worker: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("solve") => run_single(&args),
        Some("enqueue") => enqueue(&args),
        Some("worker") => run_worker(&args),
        Some("status") => show_status(&args),
        Some("list") => list_jobs(&args),
        Some("retry") => retry_job(&args),
        _ => Err(usage()),
    }
}

fn run_single(args: &[String]) -> Result<(), String> {
    if args.len() < 3 {
        return Err(usage());
    }
    let config_path = Path::new(&args[2]);
    let output_dir = args
        .get(3)
        .cloned()
        .or_else(|| env::var("REYSONAI_SOLUTION_DIR").ok())
        .unwrap_or_else(|| "solutions".to_string());
    let (config, solution_id) = load_config(config_path, None)?;
    println!("ReysonAI Preflop v0.1");
    println!();
    println!("Config Load: {}", config_path.display());
    println!("Game: {} {}-max", config.game, config.players);
    println!("Stack: {}BB", config.stack_bb);
    println!();
    let solution = solve_with_progress(SolveRequest {
        solution_id,
        config,
    })?;
    println!(
        "Validation: structural checks passed; status=provisional, gto_verified={}",
        solution.validation.gto_verified
    );
    println!();
    println!("Solution Save: {output_dir}/{}.json", solution.solution_id);
    save(&solution, &output_dir)?;
    println!();
    println!("Finished");
    println!();
    println!("Solution:");
    println!("{}", solution.solution_id);
    Ok(())
}

fn enqueue(args: &[String]) -> Result<(), String> {
    if args.len() < 3 {
        return Err(usage());
    }
    let config_path = Path::new(&args[2]);
    let queue_dir = args
        .get(3)
        .cloned()
        .or_else(|| env::var("REYSONAI_QUEUE_DIR").ok())
        .unwrap_or_else(|| "jobs".to_string());
    let solution_dir = args
        .get(4)
        .cloned()
        .or_else(|| env::var("REYSONAI_SOLUTION_DIR").ok())
        .unwrap_or_else(|| "solutions".to_string());
    let job_id = next_job_id();
    let (config, solution_id) = load_config(config_path, Some(&job_id))?;
    let job = SolveJob::new(job_id.clone(), solution_id, config, solution_dir);
    queue_from_environment(&queue_dir)?.enqueue(&job)?;
    println!("Job enqueued: {}", job.job_id);
    println!("Queue: {}", queue_dir);
    println!("Status: pending");
    Ok(())
}

fn run_worker(args: &[String]) -> Result<(), String> {
    let queue_dir = args
        .get(2)
        .filter(|value| !value.starts_with("--"))
        .cloned()
        .or_else(|| env::var("REYSONAI_QUEUE_DIR").ok())
        .unwrap_or_else(|| "jobs".to_string());
    let once = args.iter().any(|value| value == "--once");
    let poll_ms = option_value(args, "--poll-ms")
        .map(|value| value.parse::<u64>().map_err(|error| error.to_string()))
        .transpose()?
        .unwrap_or(1_000);
    let worker_id = option_value(args, "--worker-id")
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| format!("worker-{}", std::process::id()));
    let queue = queue_from_environment(&queue_dir)?;
    let recovered = queue.requeue_running()?;
    if recovered > 0 {
        println!("Recovered {recovered} running job(s)");
    }
    println!("Worker started: {worker_id}");
    println!("Queue: {} ({queue_dir})", queue.backend_name());
    if once {
        if let Some(job) = queue.claim_next(&worker_id)? {
            process_job(queue.as_ref(), job)?;
        } else {
            println!("No pending jobs");
        }
        return Ok(());
    }

    loop {
        if let Some(job) = queue.claim_next(&worker_id)? {
            process_job(queue.as_ref(), job)?;
        } else {
            thread::sleep(Duration::from_millis(poll_ms));
        }
    }
}

fn process_job(queue: &dyn JobQueue, job: SolveJob) -> Result<(), String> {
    println!("Job started: {} ({})", job.job_id, job.solution_id);
    let result = solve_with_progress(SolveRequest {
        solution_id: job.solution_id.clone(),
        config: job.config,
    })
    .and_then(|solution| {
        save(&solution, &job.solution_dir)?;
        Ok(solution)
    });
    match result {
        Ok(solution) => {
            queue.complete(&job.job_id)?;
            println!("Job succeeded: {}", job.job_id);
            println!(
                "Validation: structural checks passed; status=provisional, gto_verified={}",
                solution.validation.gto_verified
            );
            println!(
                "Solution: {}/{}.json",
                job.solution_dir.display(),
                solution.solution_id
            );
            Ok(())
        }
        Err(error) => {
            queue.fail(&job.job_id, &error)?;
            eprintln!("Job failed: {}: {error}", job.job_id);
            Ok(())
        }
    }
}

fn show_status(args: &[String]) -> Result<(), String> {
    let job_id = args.get(2).ok_or_else(usage)?;
    let queue_dir = args
        .get(3)
        .cloned()
        .or_else(|| env::var("REYSONAI_QUEUE_DIR").ok())
        .unwrap_or_else(|| "jobs".to_string());
    match queue_from_environment(&queue_dir)?.get(job_id)? {
        Some(job) => println!(
            "{}",
            serde_json::to_string_pretty(&job).map_err(|error| error.to_string())?
        ),
        None => return Err(format!("job not found: {job_id}")),
    }
    Ok(())
}

fn list_jobs(args: &[String]) -> Result<(), String> {
    let queue_dir = args
        .get(2)
        .cloned()
        .or_else(|| env::var("REYSONAI_QUEUE_DIR").ok())
        .unwrap_or_else(|| "jobs".to_string());
    let jobs = queue_from_environment(&queue_dir)?.list()?;
    for job in jobs {
        println!("{}\t{:?}\t{}", job.job_id, job.status, job.solution_id);
    }
    Ok(())
}

fn retry_job(args: &[String]) -> Result<(), String> {
    let job_id = args.get(2).ok_or_else(usage)?;
    let queue_dir = args
        .get(3)
        .cloned()
        .or_else(|| env::var("REYSONAI_QUEUE_DIR").ok())
        .unwrap_or_else(|| "jobs".to_string());
    let job = queue_from_environment(&queue_dir)?.retry(job_id)?;
    println!("Job requeued: {} ({:?})", job.job_id, job.status);
    Ok(())
}

fn load_config(
    config_path: &Path,
    job_suffix: Option<&String>,
) -> Result<(PreflopConfig, String), String> {
    let config_json = fs::read_to_string(config_path).map_err(|error| error.to_string())?;
    let config = PreflopConfig::from_json(&config_json)?;
    let stem = config_path
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("preflop");
    let solution_id = match job_suffix {
        Some(suffix) => format!("{stem}-{suffix}"),
        None => format!("{stem}-v1"),
    };
    Ok((config, solution_id))
}

fn solve_with_progress(request: SolveRequest) -> Result<solution::Solution, String> {
    println!("Game Tree Build");
    println!("Combos: 1326");
    println!();
    println!("Solver Start ({})", request.config.solver.strategy);
    let mut last_reported = 0;
    solve(request, &mut |progress| {
        if progress.iteration != last_reported || progress.exploitability > 0.0 {
            println!(
                "Iteration: {} (average strategy delta: {:.6}, exploitability: {:.6})",
                progress.iteration, progress.average_strategy_delta, progress.exploitability
            );
            last_reported = progress.iteration;
        }
    })
}

fn option_value<'a>(args: &'a [String], option: &str) -> Option<&'a str> {
    args.windows(2)
        .find(|values| values[0] == option)
        .map(|values| values[1].as_str())
}

fn usage() -> String {
    "usage:\n  reysonai-worker solve <config.json> [output_dir]\n  reysonai-worker enqueue <config.json> [queue_dir] [output_dir]\n  reysonai-worker worker [queue_dir] [--once] [--poll-ms N] [--worker-id ID]\n  reysonai-worker status <job_id> [queue_dir]\n  reysonai-worker list [queue_dir]\n  reysonai-worker retry <job_id> [queue_dir]"
        .to_string()
}
