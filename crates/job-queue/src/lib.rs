//! A small durable file-backed queue for local SolveaGTO jobs.
//!
//! The queue deliberately exposes a repository-like boundary so the local
//! implementation can later be replaced with Redis, a hosted queue, or a
//! cloud workflow without changing the solver itself.

use preflop_tree::PreflopConfig;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static JOB_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Pending,
    Running,
    Succeeded,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolveJob {
    pub job_id: String,
    pub solution_id: String,
    pub config: PreflopConfig,
    pub solution_dir: PathBuf,
    pub status: JobStatus,
    pub created_at: u64,
    pub started_at: Option<u64>,
    pub finished_at: Option<u64>,
    pub worker_id: Option<String>,
    pub attempts: u32,
    pub error: Option<String>,
}

impl SolveJob {
    pub fn new(
        job_id: impl Into<String>,
        solution_id: impl Into<String>,
        config: PreflopConfig,
        solution_dir: impl Into<PathBuf>,
    ) -> Self {
        Self {
            job_id: job_id.into(),
            solution_id: solution_id.into(),
            config,
            solution_dir: solution_dir.into(),
            status: JobStatus::Pending,
            created_at: unix_timestamp(),
            started_at: None,
            finished_at: None,
            worker_id: None,
            attempts: 0,
            error: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct FileJobQueue {
    root: PathBuf,
}

impl FileJobQueue {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn enqueue(&self, job: &SolveJob) -> Result<(), String> {
        validate_job_id(&job.job_id)?;
        self.ensure_layout()?;
        if self.find_job_path(&job.job_id)?.is_some() {
            return Err(format!("job already exists: {}", job.job_id));
        }
        self.write_atomic(&self.state_path(JobStatus::Pending, &job.job_id), job)
    }

    /// Atomically claims the oldest pending job for a worker.
    pub fn claim_next(&self, worker_id: &str) -> Result<Option<SolveJob>, String> {
        self.ensure_layout()?;
        let mut paths = self.json_paths(JobStatus::Pending)?;
        paths.sort();

        for pending_path in paths {
            let Some(job_id) = pending_path.file_stem().and_then(|value| value.to_str()) else {
                continue;
            };
            let running_path = self.state_path(JobStatus::Running, job_id);
            match fs::rename(&pending_path, &running_path) {
                Ok(()) => {
                    let mut job = self.read_job(&running_path)?;
                    job.status = JobStatus::Running;
                    job.started_at = Some(unix_timestamp());
                    job.worker_id = Some(worker_id.to_string());
                    job.attempts += 1;
                    job.error = None;
                    self.write_atomic(&running_path, &job)?;
                    return Ok(Some(job));
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                Err(error) => return Err(error.to_string()),
            }
        }
        Ok(None)
    }

    pub fn complete(&self, job_id: &str) -> Result<SolveJob, String> {
        self.finish(job_id, JobStatus::Succeeded, None)
    }

    pub fn fail(&self, job_id: &str, error: impl Into<String>) -> Result<SolveJob, String> {
        self.finish(job_id, JobStatus::Failed, Some(error.into()))
    }

    /// Requeues a failed or running job. This is intentionally explicit so a
    /// future multi-worker implementation can add lease expiration safely.
    pub fn retry(&self, job_id: &str) -> Result<SolveJob, String> {
        validate_job_id(job_id)?;
        self.ensure_layout()?;
        let source = self
            .find_job_path(job_id)?
            .ok_or_else(|| format!("job not found: {job_id}"))?;
        let mut job = self.read_job(&source)?;
        if !matches!(job.status, JobStatus::Failed | JobStatus::Running) {
            return Err(format!("job is not retryable: {job_id}"));
        }
        job.status = JobStatus::Pending;
        job.started_at = None;
        job.finished_at = None;
        job.worker_id = None;
        job.error = None;
        let destination = self.state_path(JobStatus::Pending, job_id);
        self.write_atomic(&destination, &job)?;
        fs::remove_file(source).map_err(|error| error.to_string())?;
        Ok(job)
    }

    pub fn get(&self, job_id: &str) -> Result<Option<SolveJob>, String> {
        validate_job_id(job_id)?;
        let Some(path) = self.find_job_path(job_id)? else {
            return Ok(None);
        };
        self.read_job(&path).map(Some)
    }

    pub fn list(&self) -> Result<Vec<SolveJob>, String> {
        self.ensure_layout()?;
        let mut jobs = Vec::new();
        for status in [
            JobStatus::Pending,
            JobStatus::Running,
            JobStatus::Succeeded,
            JobStatus::Failed,
        ] {
            for path in self.json_paths(status)? {
                jobs.push(self.read_job(&path)?);
            }
        }
        jobs.sort_by(|left, right| {
            left.created_at
                .cmp(&right.created_at)
                .then_with(|| left.job_id.cmp(&right.job_id))
        });
        Ok(jobs)
    }

    /// Local development recovery for jobs left in running after a process
    /// interruption. Use only with one active local worker.
    pub fn requeue_running(&self) -> Result<usize, String> {
        self.ensure_layout()?;
        let paths = self.json_paths(JobStatus::Running)?;
        let mut recovered = 0;
        for path in paths {
            let job_id = path
                .file_stem()
                .and_then(|value| value.to_str())
                .ok_or_else(|| "invalid running job filename".to_string())?
                .to_string();
            self.retry(&job_id)?;
            recovered += 1;
        }
        Ok(recovered)
    }

    fn finish(
        &self,
        job_id: &str,
        status: JobStatus,
        error: Option<String>,
    ) -> Result<SolveJob, String> {
        validate_job_id(job_id)?;
        self.ensure_layout()?;
        let source = self.state_path(JobStatus::Running, job_id);
        if !source.exists() {
            return Err(format!("running job not found: {job_id}"));
        }
        let mut job = self.read_job(&source)?;
        job.status = status;
        job.finished_at = Some(unix_timestamp());
        job.error = error;
        let destination = self.state_path(status, job_id);
        self.write_atomic(&destination, &job)?;
        fs::remove_file(source).map_err(|error| error.to_string())?;
        Ok(job)
    }

    fn ensure_layout(&self) -> Result<(), String> {
        for status in [
            JobStatus::Pending,
            JobStatus::Running,
            JobStatus::Succeeded,
            JobStatus::Failed,
        ] {
            fs::create_dir_all(self.state_dir(status)).map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    fn state_dir(&self, status: JobStatus) -> PathBuf {
        self.root.join(match status {
            JobStatus::Pending => "pending",
            JobStatus::Running => "running",
            JobStatus::Succeeded => "succeeded",
            JobStatus::Failed => "failed",
        })
    }

    fn state_path(&self, status: JobStatus, job_id: &str) -> PathBuf {
        self.state_dir(status).join(format!("{job_id}.json"))
    }

    fn json_paths(&self, status: JobStatus) -> Result<Vec<PathBuf>, String> {
        let dir = self.state_dir(status);
        let mut paths = Vec::new();
        for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
            let path = entry.map_err(|error| error.to_string())?.path();
            if path.extension().and_then(|value| value.to_str()) == Some("json") {
                paths.push(path);
            }
        }
        Ok(paths)
    }

    fn find_job_path(&self, job_id: &str) -> Result<Option<PathBuf>, String> {
        for status in [
            JobStatus::Pending,
            JobStatus::Running,
            JobStatus::Succeeded,
            JobStatus::Failed,
        ] {
            let path = self.state_path(status, job_id);
            if path.exists() {
                return Ok(Some(path));
            }
        }
        Ok(None)
    }

    fn read_job(&self, path: &Path) -> Result<SolveJob, String> {
        let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
        serde_json::from_str(&content).map_err(|error| error.to_string())
    }

    fn write_atomic(&self, path: &Path, job: &SolveJob) -> Result<(), String> {
        let parent = path
            .parent()
            .ok_or_else(|| "job path has no parent".to_string())?;
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        let temp = parent.join(format!(
            ".{}.{}.tmp",
            path.file_name().and_then(|value| value.to_str()).unwrap_or("job"),
            std::process::id()
        ));
        let content = serde_json::to_vec_pretty(job).map_err(|error| error.to_string())?;
        fs::write(&temp, content).map_err(|error| error.to_string())?;
        fs::rename(temp, path).map_err(|error| error.to_string())
    }
}

pub fn next_job_id() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let sequence = JOB_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!("job-{now}-{}-{sequence}", std::process::id())
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn validate_job_id(job_id: &str) -> Result<(), String> {
    if job_id.is_empty()
        || !job_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-_".contains(character))
    {
        return Err("invalid job id".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("solveagto-job-queue-{name}-{}", std::process::id()))
    }

    #[test]
    fn file_queue_claims_completes_and_lists_jobs() {
        let root = test_root("lifecycle");
        let queue = FileJobQueue::new(&root);
        let job = SolveJob::new(
            "job-test",
            "solution-test",
            PreflopConfig::default(),
            "solutions",
        );
        queue.enqueue(&job).unwrap();
        assert_eq!(queue.get("job-test").unwrap().unwrap().status, JobStatus::Pending);

        let claimed = queue.claim_next("worker-test").unwrap().unwrap();
        assert_eq!(claimed.status, JobStatus::Running);
        assert_eq!(claimed.attempts, 1);
        assert_eq!(queue.complete("job-test").unwrap().status, JobStatus::Succeeded);
        assert_eq!(queue.list().unwrap().len(), 1);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn running_jobs_can_be_requeued_for_local_recovery() {
        let root = test_root("recovery");
        let queue = FileJobQueue::new(&root);
        let job = SolveJob::new(
            "job-recover",
            "solution-recover",
            PreflopConfig::default(),
            "solutions",
        );
        queue.enqueue(&job).unwrap();
        queue.claim_next("worker-test").unwrap();
        assert_eq!(queue.requeue_running().unwrap(), 1);
        assert_eq!(queue.get("job-recover").unwrap().unwrap().status, JobStatus::Pending);

        fs::remove_dir_all(root).unwrap();
    }
}
