use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use poker_core::Position;
use preflop_tree::{ActionKind, HistoryAction, PreflopConfig};
use solveagto_job_queue::{next_job_id, FileJobQueue, JobStatus, SolveJob};
use serde::{Deserialize, Serialize};
use solution::{hash_game_config, FileSolutionStore, Solution, SolutionRepository, SolutionSummary};
use std::env;
use std::fs;
use std::path::{Path as StdPath, PathBuf};
use std::sync::{Arc, Mutex};

#[derive(Clone)]
struct AppState {
    store: Arc<FileSolutionStore>,
    queue: FileJobQueue,
    config: PreflopConfig,
    config_hash: String,
    solution_dir: PathBuf,
    solution_id: String,
    enqueue_lock: Arc<Mutex<()>>,
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn not_found(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            message: message.into(),
        }
    }

    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(serde_json::json!({ "error": self.message }))).into_response()
    }
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
}

#[derive(Debug, Deserialize)]
struct ResolveRequest {
    #[serde(rename = "solutionId")]
    solution_id: String,
    #[serde(rename = "heroPosition")]
    hero_position: String,
    actions: Vec<ResolveActionRequest>,
}

#[derive(Debug, Deserialize)]
struct ResolveActionRequest {
    position: String,
    action: String,
    #[serde(rename = "sizeBb")]
    size_bb: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateJobRequest {
    solution_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct JobResponse {
    job_id: Option<String>,
    solution_id: String,
    status: JobStatus,
    created: bool,
    deduplicated: bool,
    solution_available: bool,
    created_at: Option<u64>,
    started_at: Option<u64>,
    finished_at: Option<u64>,
    worker_id: Option<String>,
    attempts: u32,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ResolveResponse {
    #[serde(rename = "solutionId")]
    solution_id: String,
    #[serde(rename = "heroPosition")]
    hero_position: Position,
    node: solution::SolutionNode,
}

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("solveagto-api: {error}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let solution_dir = PathBuf::from(
        env::var("SOLVEAGTO_SOLUTION_DIR").unwrap_or_else(|_| "solutions".to_string()),
    );
    let queue_dir = PathBuf::from(
        env::var("SOLVEAGTO_QUEUE_DIR").unwrap_or_else(|_| "jobs".to_string()),
    );
    let config_path = env::var("SOLVEAGTO_CONFIG_PATH")
        .unwrap_or_else(|_| "configs/cash-6max-100bb.json".to_string());
    let config = load_config(StdPath::new(&config_path))?;
    let solution_hash = hash_game_config(&config);
    let solution_id = env::var("SOLVEAGTO_SOLUTION_ID")
        .unwrap_or_else(|_| solution_id_from_config_path(StdPath::new(&config_path)));
    let bind = env::var("SOLVEAGTO_API_BIND").unwrap_or_else(|_| "127.0.0.1:3000".to_string());
    let state = AppState {
        store: Arc::new(FileSolutionStore::new(&solution_dir)),
        queue: FileJobQueue::new(&queue_dir),
        config,
        config_hash: solution_hash,
        solution_dir,
        solution_id,
        enqueue_lock: Arc::new(Mutex::new(())),
    };
    let solution_dir_display = state.store.root().display().to_string();
    let queue_dir_display = state.queue.root().display().to_string();
    let app = router(state);
    let listener = tokio::net::TcpListener::bind(&bind)
        .await
        .map_err(|error| error.to_string())?;
    println!("SolveaGTO API listening on http://{bind}");
    println!("Solution directory: {solution_dir_display}");
    println!("Job queue: {queue_dir_display}");
    axum::serve(listener, app).await.map_err(|error| error.to_string())
}

fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/v1/preflop/solutions", get(list_solutions))
        .route("/v1/preflop/solutions/{solution_id}", get(get_solution))
        .route("/v1/preflop/solutions/{solution_id}/nodes", get(list_nodes))
        .route("/v1/preflop/solutions/{solution_id}/nodes/{node_id}", get(get_scoped_node))
        .route("/v1/preflop/jobs", post(create_job))
        .route("/v1/preflop/jobs/{job_id}", get(get_job))
        .route("/v1/preflop/nodes/{node_id}", get(get_node))
        .route("/v1/preflop/nodes/{node_id}/hands/{hand}", get(get_hand))
        .route("/v1/preflop/resolve", post(resolve))
        .with_state(state)
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "solveagto-api",
    })
}

async fn list_solutions(
    State(state): State<AppState>,
) -> Result<Json<Vec<SolutionSummary>>, ApiError> {
    state
        .store
        .list()
        .map(Json)
        .map_err(ApiError::internal)
}

async fn get_solution(
    State(state): State<AppState>,
    Path(solution_id): Path<String>,
) -> Result<Json<Solution>, ApiError> {
    match state.store.get(&solution_id).map_err(ApiError::internal)? {
        Some(solution) => Ok(Json(solution)),
        None => Err(ApiError::not_found(format!("solution not found: {solution_id}"))),
    }
}

async fn find_node(store: &FileSolutionStore, node_id: &str) -> Result<Solution, ApiError> {
    for summary in store.list().map_err(ApiError::internal)? {
        if let Some(solution) = store.get(&summary.solution_id).map_err(ApiError::internal)? {
            if solution.node(node_id).is_some() {
                return Ok(solution);
            }
        }
    }
    Err(ApiError::not_found(format!("node not found: {node_id}")))
}

async fn get_node(
    State(state): State<AppState>,
    Path(node_id): Path<String>,
) -> Result<Json<solution::SolutionNode>, ApiError> {
    let solution = find_node(&state.store, &node_id).await?;
    solution
        .node(&node_id)
        .cloned()
        .map(Json)
        .ok_or_else(|| ApiError::not_found(format!("node not found: {node_id}")))
}

async fn get_hand(
    State(state): State<AppState>,
    Path((node_id, hand)): Path<(String, String)>,
) -> Result<Json<solution::HandAggregate>, ApiError> {
    let solution = find_node(&state.store, &node_id).await?;
    solution
        .hand(&node_id, &hand)
        .cloned()
        .map(Json)
        .ok_or_else(|| ApiError::not_found(format!("hand {hand} not found at node {node_id}")))
}

async fn resolve(
    State(state): State<AppState>,
    Json(request): Json<ResolveRequest>,
) -> Result<Json<ResolveResponse>, ApiError> {
    let hero_position = Position::parse(&request.hero_position).map_err(ApiError::bad_request)?;
    let solution = state
        .store
        .get(&request.solution_id)
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found(format!("solution not found: {}", request.solution_id)))?;
    let actions = request
        .actions
        .iter()
        .map(to_history_action)
        .collect::<Result<Vec<_>, _>>()?;
    let node = solution
        .resolve_for_position(&actions, hero_position)
        .map_err(ApiError::bad_request)?
        .clone();
    Ok(Json(ResolveResponse {
        solution_id: request.solution_id,
        hero_position,
        node,
    }))
}

async fn create_job(
    State(state): State<AppState>,
    Json(request): Json<CreateJobRequest>,
) -> Result<Json<JobResponse>, ApiError> {
    let solution_id = request
        .solution_id
        .unwrap_or_else(|| state.solution_id.clone());
    if solution_id != state.solution_id {
        return Err(ApiError::bad_request(format!(
            "unsupported solutionId: {solution_id}"
        )));
    }

    // The file queue is intentionally local in v0.1. This lock makes the
    // read-then-enqueue deduplication atomic within one API process.
    let _guard = state
        .enqueue_lock
        .lock()
        .map_err(|_| ApiError::internal("job enqueue lock poisoned"))?;

    if let Some(solution) = state
        .store
        .get(&solution_id)
        .map_err(ApiError::internal)?
    {
        if solution.game_config_hash == state.config_hash {
            return Ok(Json(JobResponse::available(solution_id)));
        }
    }

    if let Some(job) = state
        .queue
        .find_active_by_solution_id(&solution_id)
        .map_err(ApiError::internal)?
    {
        return Ok(Json(JobResponse::from_job(job, false, true, false)));
    }

    let job = SolveJob::new(
        next_job_id(),
        solution_id,
        state.config.clone(),
        state.solution_dir.clone(),
    );
    state.queue.enqueue(&job).map_err(ApiError::internal)?;
    Ok(Json(JobResponse::from_job(job, true, false, false)))
}

async fn get_job(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
) -> Result<Json<JobResponse>, ApiError> {
    let job = state
        .queue
        .get(&job_id)
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found(format!("job not found: {job_id}")))?;
    let solution_available = state
        .store
        .get(&job.solution_id)
        .map_err(ApiError::internal)?
        .map(|solution| solution.game_config_hash == hash_game_config(&job.config))
        .unwrap_or(false);
    Ok(Json(JobResponse::from_job(
        job,
        false,
        false,
        solution_available,
    )))
}

fn to_history_action(request: &ResolveActionRequest) -> Result<HistoryAction, ApiError> {
    let position = Position::parse(&request.position).map_err(ApiError::bad_request)?;
    let action_name = request.action.to_ascii_lowercase();
    let action = match action_name.as_str() {
        "fold" => ActionKind::Fold,
        "call" => ActionKind::Call,
        "check" => ActionKind::Check,
        "all_in" | "allin" => ActionKind::AllIn,
        "raise" => ActionKind::Raise {
            size_bb: request
                .size_bb
                .ok_or_else(|| ApiError::bad_request("raise requires sizeBb"))?,
        },
        _ => return Err(ApiError::bad_request(format!("invalid action: {}", request.action))),
    };
    Ok(HistoryAction { position, action })
}

fn load_config(path: &StdPath) -> Result<PreflopConfig, String> {
    let content = fs::read_to_string(path).map_err(|error| {
        format!("failed to read SolveaGTO config {}: {error}", path.display())
    })?;
    PreflopConfig::from_json(&content)
}

fn solution_id_from_config_path(path: &StdPath) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .map(|stem| format!("{stem}-v1"))
        .unwrap_or_else(|| "cash-6max-100bb-v1".to_string())
}

impl JobResponse {
    fn available(solution_id: String) -> Self {
        Self {
            job_id: None,
            solution_id,
            status: JobStatus::Succeeded,
            created: false,
            deduplicated: false,
            solution_available: true,
            created_at: None,
            started_at: None,
            finished_at: None,
            worker_id: None,
            attempts: 0,
            error: None,
        }
    }

    fn from_job(
        job: SolveJob,
        created: bool,
        deduplicated: bool,
        solution_available: bool,
    ) -> Self {
        Self {
            job_id: Some(job.job_id),
            solution_id: job.solution_id,
            status: job.status,
            created,
            deduplicated,
            solution_available,
            created_at: Some(job.created_at),
            started_at: job.started_at,
            finished_at: job.finished_at,
            worker_id: job.worker_id,
            attempts: job.attempts,
            error: job.error,
        }
    }
}

// Solution-scoped routes prevent collisions between history-derived node IDs.
async fn list_nodes(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<serde_json::Value>, ApiError> {
    let solution = state.store.get(&id).map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("solution not found"))?;
    Ok(Json(serde_json::Value::Array(solution.nodes.iter().map(|n| serde_json::json!({
        "nodeId": n.node_id, "nodeType": n.node_type,
        "actionHistory": n.action_history, "actingPosition": n.acting_position,
        "potBb": n.pot_bb, "effectiveStackBb": n.effective_stack_bb,
        "hasStrategy": !n.combos.is_empty()
    })).collect())))
}

async fn get_scoped_node(State(state): State<AppState>, Path((id, node_id)): Path<(String, String)>) -> Result<Json<solution::SolutionNode>, ApiError> {
    let solution = state.store.get(&id).map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("solution not found"))?;
    solution.node(&node_id).cloned().map(Json).ok_or_else(|| ApiError::not_found("node not found in solution"))
}

#[cfg(test)]
mod scoped_tests {
    use super::*;
    #[tokio::test]
    async fn scoped_nodes_do_not_leak_between_solutions() {
        let root = std::env::temp_dir().join(format!("solveagto-scoped-{}", std::process::id()));
        let queue_root = std::env::temp_dir().join(format!("solveagto-api-queue-{}", std::process::id()));
        let store = FileSolutionStore::new(&root);
        for (id, pot) in [("a", 4.0), ("b", 9.0)] {
            let saved: Solution = serde_json::from_value(serde_json::json!({
                "solutionId": id, "solverVersion":"experimental",
                "continuationModelVersion":"simple", "gameConfigHash":"test",
                "createdAt":"0", "iterations":1,
                "convergence":{"iterations":1,"average_strategy_delta":0.0},
                "nodes":[{"nodeId":"shared","nodeType":"continuation","actionHistory":{"actions":[]},
                "actingPosition":null,"potBb":pot,"effectiveStackBb":100.0,
                "combos":[],"handAggregates":[]}]
            })).unwrap();
            store.save(&saved).unwrap();
        }
        let state = AppState {
            store: Arc::new(store),
            queue: FileJobQueue::new(&queue_root),
            config: PreflopConfig::default(),
            config_hash: hash_game_config(&PreflopConfig::default()),
            solution_dir: root.clone(),
            solution_id: "cash-6max-100bb-v1".to_string(),
            enqueue_lock: Arc::new(Mutex::new(())),
        };
        let a = get_scoped_node(State(state.clone()), Path(("a".into(),"shared".into()))).await.unwrap().0;
        let b = get_scoped_node(State(state.clone()), Path(("b".into(),"shared".into()))).await.unwrap().0;
        assert_eq!(a.pot_bb, 4.0);
        assert_eq!(b.pot_bb, 9.0);
        assert!(get_scoped_node(State(state.clone()), Path(("missing".into(),"shared".into()))).await.is_err());
        assert!(get_scoped_node(State(state.clone()), Path(("a".into(),"missing".into()))).await.is_err());
        let index = list_nodes(State(state), Path("a".into())).await.unwrap().0;
        assert_eq!(index[0]["hasStrategy"], false);
        assert!(index[0].get("combos").is_none());
        std::fs::remove_file(root.join("a.json")).unwrap();
        std::fs::remove_file(root.join("b.json")).unwrap();
        std::fs::remove_dir(root).unwrap();
        let _ = std::fs::remove_dir_all(queue_root);
    }

    #[tokio::test]
    async fn solve_job_requests_are_deduplicated_while_active() {
        let root = std::env::temp_dir().join(format!("solveagto-api-jobs-{}", std::process::id()));
        let queue_root = std::env::temp_dir().join(format!("solveagto-api-job-queue-{}", std::process::id()));
        let state = AppState {
            store: Arc::new(FileSolutionStore::new(&root)),
            queue: FileJobQueue::new(&queue_root),
            config: PreflopConfig::default(),
            config_hash: hash_game_config(&PreflopConfig::default()),
            solution_dir: root.clone(),
            solution_id: "cash-6max-100bb-v1".to_string(),
            enqueue_lock: Arc::new(Mutex::new(())),
        };

        let first = create_job(
            State(state.clone()),
            Json(CreateJobRequest { solution_id: None }),
        )
        .await
        .unwrap()
        .0;
        let second = create_job(
            State(state.clone()),
            Json(CreateJobRequest { solution_id: None }),
        )
        .await
        .unwrap()
        .0;

        assert!(first.created);
        assert!(!first.deduplicated);
        assert_eq!(first.status, JobStatus::Pending);
        assert!(!second.created);
        assert!(second.deduplicated);
        assert_eq!(second.job_id, first.job_id);
        assert_eq!(state.queue.list().unwrap().len(), 1);

        let _ = std::fs::remove_dir_all(root);
        let _ = std::fs::remove_dir_all(queue_root);
    }

    #[tokio::test]
    async fn solve_job_request_uses_matching_saved_solution_without_queueing() {
        let root = std::env::temp_dir().join(format!(
            "solveagto-api-saved-solution-{}",
            std::process::id()
        ));
        let queue_root = std::env::temp_dir().join(format!(
            "solveagto-api-saved-solution-queue-{}",
            std::process::id()
        ));
        let config = PreflopConfig::default();
        let config_hash = hash_game_config(&config);
        let store = FileSolutionStore::new(&root);
        let saved: Solution = serde_json::from_value(serde_json::json!({
            "solutionId": "cash-6max-100bb-v1",
            "solverVersion": "test",
            "continuationModelVersion": "test",
            "gameConfigHash": config_hash.clone(),
            "createdAt": "0",
            "iterations": 1,
            "convergence": {"iterations": 1, "average_strategy_delta": 0.0},
            "nodes": []
        }))
        .unwrap();
        store.save(&saved).unwrap();
        let state = AppState {
            store: Arc::new(store),
            queue: FileJobQueue::new(&queue_root),
            config,
            config_hash,
            solution_dir: root.clone(),
            solution_id: "cash-6max-100bb-v1".to_string(),
            enqueue_lock: Arc::new(Mutex::new(())),
        };

        let response = create_job(
            State(state.clone()),
            Json(CreateJobRequest { solution_id: None }),
        )
        .await
        .unwrap()
        .0;

        assert_eq!(response.status, JobStatus::Succeeded);
        assert!(response.solution_available);
        assert!(response.job_id.is_none());
        assert_eq!(state.queue.list().unwrap().len(), 0);

        let _ = std::fs::remove_dir_all(root);
        let _ = std::fs::remove_dir_all(queue_root);
    }
}
