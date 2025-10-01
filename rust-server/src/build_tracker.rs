use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BuildStatus {
    Queued,
    Building,
    Success,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
pub struct BuildInfo {
    pub uuid: String,
    pub program_name: String,
    pub status: BuildStatus,
    pub stderr: Option<String>,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Clone)]
pub struct BuildTracker {
    builds: Arc<RwLock<HashMap<String, BuildInfo>>>,
}

impl BuildTracker {
    pub fn new() -> Self {
        Self {
            builds: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn start_build(&self, uuid: String, program_name: String) {
        let mut builds = self.builds.write().await;
        builds.insert(
            uuid.clone(),
            BuildInfo {
                uuid,
                program_name,
                status: BuildStatus::Building,
                stderr: None,
                started_at: chrono::Utc::now(),
                completed_at: None,
            },
        );
    }

    pub async fn complete_build(&self, uuid: &str, stderr: String, program_name: String, success: bool) {
        let mut builds = self.builds.write().await;
        if let Some(info) = builds.get_mut(uuid) {
            info.status = if success { BuildStatus::Success } else { BuildStatus::Failed };
            info.stderr = Some(stderr);
            info.program_name = program_name;
            info.completed_at = Some(chrono::Utc::now());
        }
    }

    pub async fn get_build(&self, uuid: &str) -> Option<BuildInfo> {
        let builds = self.builds.read().await;
        builds.get(uuid).cloned()
    }
}
