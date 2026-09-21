use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use poker_core::Position;
use preflop_tree::{ActionKind, HistoryAction};
use serde::{Deserialize, Serialize};
use solution::{FileSolutionStore, Solution, SolutionRepository, SolutionSummary};
use std::env;
use std::sync::Arc;

#[derive(Clone)]
struct AppState {
    store: Arc<FileSolutionStore>,
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
    let solution_dir = env::var("SOLVEAGTO_SOLUTION_DIR").unwrap_or_else(|_| "solutions".to_string());
    let bind = env::var("SOLVEAGTO_API_BIND").unwrap_or_else(|_| "127.0.0.1:3000".to_string());
    let state = AppState {
        store: Arc::new(FileSolutionStore::new(solution_dir.clone())),
    };
    let app = router(state);
    let listener = tokio::net::TcpListener::bind(&bind)
        .await
        .map_err(|error| error.to_string())?;
    println!("SolveaGTO API listening on http://{bind}");
    println!("Solution directory: {solution_dir}");
    axum::serve(listener, app).await.map_err(|error| error.to_string())
}

fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/v1/preflop/solutions", get(list_solutions))
        .route("/v1/preflop/solutions/{solution_id}", get(get_solution))
        .route("/v1/preflop/solutions/{solution_id}/nodes", get(list_nodes))
        .route("/v1/preflop/solutions/{solution_id}/nodes/{node_id}", get(get_scoped_node))
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
        let state = AppState { store: Arc::new(store) };
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
    }
}
