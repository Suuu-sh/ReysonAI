use crate::{unix_timestamp, EnqueueOutcome, JobQueue, JobStatus, SolveJob};
use redis::streams::{
    StreamAutoClaimOptions, StreamAutoClaimReply, StreamId, StreamReadOptions, StreamReadReply,
};
use redis::{Commands, Connection};

const ENQUEUE_SCRIPT: &str = r#"
local active = redis.call('GET', KEYS[1])
if active then
  return {0, active}
end
redis.call('HSET', KEYS[2], 'payload', ARGV[2])
redis.call('SADD', KEYS[3], ARGV[1])
local entry_id = redis.call('XADD', KEYS[4], '*', 'jobId', ARGV[1])
redis.call('HSET', KEYS[2], 'streamId', entry_id)
redis.call('SET', KEYS[1], ARGV[1])
return {1, ARGV[1]}
"#;

const RETRY_SCRIPT: &str = r#"
local active = redis.call('GET', KEYS[4])
if active and active ~= ARGV[1] then
  return redis.error_reply('another active job exists for this solution: ' .. active)
end
redis.call('HSET', KEYS[1], 'payload', ARGV[2])
redis.call('SADD', KEYS[2], ARGV[1])
local entry_id = redis.call('XADD', KEYS[3], '*', 'jobId', ARGV[1])
redis.call('HSET', KEYS[1], 'streamId', entry_id)
redis.call('SET', KEYS[4], ARGV[1])
return entry_id
"#;

const COMPARE_DELETE_SCRIPT: &str = r#"
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
"#;

#[derive(Debug, Clone)]
pub struct RedisJobQueueConfig {
    pub url: String,
    pub prefix: String,
    pub group: String,
    pub block_ms: usize,
    pub lease_ms: usize,
}

impl RedisJobQueueConfig {
    pub fn local(url: impl Into<String>) -> Self {
        Self {
            url: url.into(),
            prefix: "solveagto".to_string(),
            group: "solveagto-workers".to_string(),
            block_ms: 1_000,
            lease_ms: 60_000,
        }
    }
}

#[derive(Clone)]
pub struct RedisJobQueue {
    client: redis::Client,
    config: RedisJobQueueConfig,
}

impl std::fmt::Debug for RedisJobQueue {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("RedisJobQueue")
            .field("prefix", &self.config.prefix)
            .field("group", &self.config.group)
            .field("block_ms", &self.config.block_ms)
            .field("lease_ms", &self.config.lease_ms)
            .finish_non_exhaustive()
    }
}

impl RedisJobQueue {
    pub fn new(config: RedisJobQueueConfig) -> Result<Self, String> {
        validate_namespace(&config.prefix)?;
        validate_namespace(&config.group)?;
        let client = redis::Client::open(config.url.as_str()).map_err(redis_error)?;
        let queue = Self { client, config };
        queue.ping()?;
        queue.ensure_group()?;
        Ok(queue)
    }

    pub fn ping(&self) -> Result<(), String> {
        let mut connection = self.connection()?;
        let response: String = redis::cmd("PING")
            .query(&mut connection)
            .map_err(redis_error)?;
        if response == "PONG" {
            Ok(())
        } else {
            Err(format!("unexpected Redis PING response: {response}"))
        }
    }

    fn connection(&self) -> Result<Connection, String> {
        self.client.get_connection().map_err(redis_error)
    }

    fn ensure_group(&self) -> Result<(), String> {
        let mut connection = self.connection()?;
        let result = redis::cmd("XGROUP")
            .arg("CREATE")
            .arg(self.stream_key())
            .arg(&self.config.group)
            .arg("0")
            .arg("MKSTREAM")
            .query::<String>(&mut connection);
        match result {
            Ok(_) => Ok(()),
            Err(error) if error.to_string().contains("BUSYGROUP") => Ok(()),
            Err(error) => Err(redis_error(error)),
        }
    }

    fn stream_key(&self) -> String {
        format!("{}:jobs", self.config.prefix)
    }

    fn index_key(&self) -> String {
        format!("{}:job_ids", self.config.prefix)
    }

    fn job_key(&self, job_id: &str) -> String {
        format!("{}:job:{job_id}", self.config.prefix)
    }

    fn active_key(&self, solution_id: &str) -> String {
        format!("{}:active:{solution_id}", self.config.prefix)
    }

    fn get_with_connection(
        &self,
        connection: &mut Connection,
        job_id: &str,
    ) -> Result<Option<SolveJob>, String> {
        let payload: Option<String> = connection
            .hget(self.job_key(job_id), "payload")
            .map_err(redis_error)?;
        payload
            .map(|value| serde_json::from_str(&value).map_err(|error| error.to_string()))
            .transpose()
    }

    fn save_with_connection(
        &self,
        connection: &mut Connection,
        job: &SolveJob,
    ) -> Result<(), String> {
        let payload = serde_json::to_string(job).map_err(|error| error.to_string())?;
        let _: usize = connection
            .hset(self.job_key(&job.job_id), "payload", payload)
            .map_err(redis_error)?;
        let _: usize = connection
            .sadd(self.index_key(), &job.job_id)
            .map_err(redis_error)?;
        Ok(())
    }

    fn entry_job_id(entry: &StreamId) -> Result<String, String> {
        entry
            .get::<String>("jobId")
            .ok_or_else(|| format!("Redis stream entry {} has no jobId", entry.id))
    }

    fn claim_entry(
        &self,
        connection: &mut Connection,
        worker_id: &str,
    ) -> Result<Option<StreamId>, String> {
        let reclaimed: StreamAutoClaimReply = connection
            .xautoclaim_options(
                self.stream_key(),
                &self.config.group,
                worker_id,
                self.config.lease_ms,
                "0-0",
                StreamAutoClaimOptions::default().count(1),
            )
            .map_err(redis_error)?;
        if let Some(entry) = reclaimed.claimed.into_iter().next() {
            return Ok(Some(entry));
        }

        let options = StreamReadOptions::default()
            .group(&self.config.group, worker_id)
            .count(1)
            .block(self.config.block_ms);
        let reply: Option<StreamReadReply> = connection
            .xread_options(&[self.stream_key()], &[">"], &options)
            .map_err(redis_error)?;
        Ok(reply
            .into_iter()
            .flat_map(|value| value.keys)
            .flat_map(|key| key.ids)
            .next())
    }

    fn acknowledge(&self, connection: &mut Connection, job_id: &str) -> Result<(), String> {
        let entry_id: Option<String> = connection
            .hget(self.job_key(job_id), "streamId")
            .map_err(redis_error)?;
        if let Some(entry_id) = entry_id {
            let _: usize = connection
                .xack(self.stream_key(), &self.config.group, &[entry_id])
                .map_err(redis_error)?;
        }
        Ok(())
    }

    fn clear_active(
        &self,
        connection: &mut Connection,
        solution_id: &str,
        job_id: &str,
    ) -> Result<(), String> {
        let _: usize = redis::cmd("EVAL")
            .arg(COMPARE_DELETE_SCRIPT)
            .arg(1)
            .arg(self.active_key(solution_id))
            .arg(job_id)
            .query(connection)
            .map_err(redis_error)?;
        Ok(())
    }

    fn finish(
        &self,
        job_id: &str,
        status: JobStatus,
        error: Option<String>,
    ) -> Result<SolveJob, String> {
        let mut connection = self.connection()?;
        let mut job = self
            .get_with_connection(&mut connection, job_id)?
            .ok_or_else(|| format!("job not found: {job_id}"))?;
        if job.status != JobStatus::Running {
            return Err(format!("running job not found: {job_id}"));
        }
        job.status = status;
        job.finished_at = Some(unix_timestamp());
        job.error = error;
        self.save_with_connection(&mut connection, &job)?;
        self.acknowledge(&mut connection, job_id)?;
        self.clear_active(&mut connection, &job.solution_id, &job.job_id)?;
        Ok(job)
    }
}

impl JobQueue for RedisJobQueue {
    fn backend_name(&self) -> &'static str {
        "redis-streams"
    }

    fn enqueue(&self, job: &SolveJob) -> Result<(), String> {
        let outcome = self.enqueue_unique(job)?;
        if outcome.created {
            Ok(())
        } else {
            Err(format!(
                "active job already exists for solution {}: {}",
                job.solution_id, outcome.job.job_id
            ))
        }
    }

    fn enqueue_unique(&self, job: &SolveJob) -> Result<EnqueueOutcome, String> {
        if let Some(existing) = self.find_active_by_solution_id(&job.solution_id)? {
            return Ok(EnqueueOutcome {
                job: existing,
                created: false,
            });
        }
        let payload = serde_json::to_string(job).map_err(|error| error.to_string())?;
        let mut connection = self.connection()?;
        let (created, job_id): (i64, String) = redis::cmd("EVAL")
            .arg(ENQUEUE_SCRIPT)
            .arg(4)
            .arg(self.active_key(&job.solution_id))
            .arg(self.job_key(&job.job_id))
            .arg(self.index_key())
            .arg(self.stream_key())
            .arg(&job.job_id)
            .arg(payload)
            .query(&mut connection)
            .map_err(redis_error)?;
        let stored = if job_id == job.job_id {
            job.clone()
        } else {
            self.get_with_connection(&mut connection, &job_id)?
                .ok_or_else(|| format!("active Redis job is missing: {job_id}"))?
        };
        Ok(EnqueueOutcome {
            job: stored,
            created: created == 1,
        })
    }

    fn claim_next(&self, worker_id: &str) -> Result<Option<SolveJob>, String> {
        let mut connection = self.connection()?;
        let Some(entry) = self.claim_entry(&mut connection, worker_id)? else {
            return Ok(None);
        };
        let job_id = Self::entry_job_id(&entry)?;
        let Some(mut job) = self.get_with_connection(&mut connection, &job_id)? else {
            let _: usize = connection
                .xack(self.stream_key(), &self.config.group, &[entry.id])
                .map_err(redis_error)?;
            return Ok(None);
        };
        if !matches!(job.status, JobStatus::Pending | JobStatus::Running) {
            self.acknowledge(&mut connection, &job_id)?;
            return Ok(None);
        }
        job.status = JobStatus::Running;
        job.started_at = Some(unix_timestamp());
        job.finished_at = None;
        job.worker_id = Some(worker_id.to_string());
        job.attempts += 1;
        job.error = None;
        self.save_with_connection(&mut connection, &job)?;
        Ok(Some(job))
    }

    fn complete(&self, job_id: &str) -> Result<SolveJob, String> {
        self.finish(job_id, JobStatus::Succeeded, None)
    }

    fn fail(&self, job_id: &str, error: &str) -> Result<SolveJob, String> {
        self.finish(job_id, JobStatus::Failed, Some(error.to_string()))
    }

    fn retry(&self, job_id: &str) -> Result<SolveJob, String> {
        let mut connection = self.connection()?;
        let mut job = self
            .get_with_connection(&mut connection, job_id)?
            .ok_or_else(|| format!("job not found: {job_id}"))?;
        if !matches!(job.status, JobStatus::Failed | JobStatus::Running) {
            return Err(format!("job is not retryable: {job_id}"));
        }
        self.acknowledge(&mut connection, job_id)?;
        job.status = JobStatus::Pending;
        job.started_at = None;
        job.finished_at = None;
        job.worker_id = None;
        job.error = None;
        let payload = serde_json::to_string(&job).map_err(|error| error.to_string())?;
        let _: String = redis::cmd("EVAL")
            .arg(RETRY_SCRIPT)
            .arg(4)
            .arg(self.job_key(job_id))
            .arg(self.index_key())
            .arg(self.stream_key())
            .arg(self.active_key(&job.solution_id))
            .arg(job_id)
            .arg(payload)
            .query(&mut connection)
            .map_err(redis_error)?;
        Ok(job)
    }

    fn get(&self, job_id: &str) -> Result<Option<SolveJob>, String> {
        let mut connection = self.connection()?;
        self.get_with_connection(&mut connection, job_id)
    }

    fn find_active_by_solution_id(&self, solution_id: &str) -> Result<Option<SolveJob>, String> {
        let mut connection = self.connection()?;
        let job_id: Option<String> = connection
            .get(self.active_key(solution_id))
            .map_err(redis_error)?;
        let Some(job_id) = job_id else {
            return Ok(None);
        };
        let job = self.get_with_connection(&mut connection, &job_id)?;
        if job
            .as_ref()
            .is_some_and(|value| matches!(value.status, JobStatus::Pending | JobStatus::Running))
        {
            return Ok(job);
        }
        self.clear_active(&mut connection, solution_id, &job_id)?;
        Ok(None)
    }

    fn list(&self) -> Result<Vec<SolveJob>, String> {
        let mut connection = self.connection()?;
        let job_ids: Vec<String> = connection.smembers(self.index_key()).map_err(redis_error)?;
        let mut jobs = job_ids
            .iter()
            .filter_map(|job_id| {
                self.get_with_connection(&mut connection, job_id)
                    .transpose()
            })
            .collect::<Result<Vec<_>, _>>()?;
        jobs.sort_by(|left, right| {
            left.created_at
                .cmp(&right.created_at)
                .then_with(|| left.job_id.cmp(&right.job_id))
        });
        Ok(jobs)
    }

    fn requeue_running(&self) -> Result<usize, String> {
        // Redis consumer-group entries remain pending after a worker crash and
        // are reclaimed by claim_next once the configured lease expires.
        Ok(0)
    }
}

fn validate_namespace(value: &str) -> Result<(), String> {
    if value.is_empty()
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-_:".contains(character))
    {
        return Err(format!("invalid Redis queue namespace: {value}"));
    }
    Ok(())
}

fn redis_error(error: redis::RedisError) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use preflop_tree::PreflopConfig;
    use std::thread;
    use std::time::Duration;

    #[test]
    #[ignore = "requires SOLVEAGTO_REDIS_TEST_URL"]
    fn redis_queue_deduplicates_reclaims_retries_and_completes() {
        let url = std::env::var("SOLVEAGTO_REDIS_TEST_URL").unwrap();
        let prefix = format!("solveagto-test-{}-{}", std::process::id(), unix_timestamp());
        let mut config = RedisJobQueueConfig::local(url);
        config.prefix = prefix;
        config.group = "test-workers".to_string();
        config.block_ms = 10;
        config.lease_ms = 10;
        let queue = RedisJobQueue::new(config).unwrap();
        let job = SolveJob::new(
            "job-redis-lifecycle",
            "solution-redis-lifecycle",
            PreflopConfig::default(),
            "solutions",
        );

        let first = queue.enqueue_unique(&job).unwrap();
        let duplicate = queue.enqueue_unique(&job).unwrap();
        assert!(first.created);
        assert!(!duplicate.created);
        assert_eq!(duplicate.job.job_id, job.job_id);

        let claimed = queue.claim_next("worker-a").unwrap().unwrap();
        assert_eq!(claimed.attempts, 1);
        thread::sleep(Duration::from_millis(20));
        let reclaimed = queue.claim_next("worker-b").unwrap().unwrap();
        assert_eq!(reclaimed.job_id, job.job_id);
        assert_eq!(reclaimed.attempts, 2);

        let failed = queue.fail(&job.job_id, "synthetic failure").unwrap();
        assert_eq!(failed.status, JobStatus::Failed);
        let retried = queue.retry(&job.job_id).unwrap();
        assert_eq!(retried.status, JobStatus::Pending);
        let claimed_again = queue.claim_next("worker-c").unwrap().unwrap();
        assert_eq!(claimed_again.attempts, 3);
        let completed = queue.complete(&job.job_id).unwrap();
        assert_eq!(completed.status, JobStatus::Succeeded);
        assert!(queue
            .find_active_by_solution_id(&job.solution_id)
            .unwrap()
            .is_none());
    }
}
