use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SettledFileEvent {
    pub path: PathBuf,
    pub filename: String,
    pub timestamp_millis: u64,
}

pub struct DebouncedFileWatcher {
    watcher: RecommendedWatcher,
    active_paths: Vec<PathBuf>,
    stop_signal: Arc<AtomicBool>,
}

fn is_monitored_file(path: &Path) -> bool {
    if let Some(file_name) = path.file_name().and_then(|f| f.to_str()) {
        matches!(
            file_name,
            "ui_generated.rs"
                | "controller.rs"
                | "ui_generated.go"
                | "controller.go"
                | "ui_generated.py"
                | "controller.py"
                | "ui_generated.slint"
        )
    } else {
        false
    }
}

impl DebouncedFileWatcher {
    pub fn new<F>(debounce_duration: Duration, on_settled: F) -> Result<Self, notify::Error>
    where
        F: Fn(SettledFileEvent) + Send + Sync + 'static,
    {
        let (raw_sender, raw_receiver): (Sender<notify::Result<Event>>, Receiver<notify::Result<Event>>) =
            channel();

        let watcher = RecommendedWatcher::new(
            move |res| {
                let _ = raw_sender.send(res);
            },
            Config::default(),
        )?;

        let stop_signal = Arc::new(AtomicBool::new(false));
        let thread_stop = Arc::clone(&stop_signal);

        let callback = Arc::new(on_settled);

        thread::spawn(move || {
            let mut pending_modifications: HashMap<PathBuf, Instant> = HashMap::new();

            while !thread_stop.load(Ordering::SeqCst) {
                while let Ok(event_res) = raw_receiver.try_recv() {
                    if let Ok(event) = event_res {
                        let is_modify_or_create = matches!(
                            event.kind,
                            EventKind::Modify(_) | EventKind::Create(_)
                        );

                        if is_modify_or_create {
                            for path in event.paths {
                                if is_monitored_file(&path) {
                                    pending_modifications.insert(path, Instant::now());
                                }
                            }
                        }
                    }
                }

                let now = Instant::now();
                let mut settled_paths = Vec::new();

                for (path, last_modified) in &pending_modifications {
                    if now.duration_since(*last_modified) >= debounce_duration {
                        settled_paths.push(path.clone());
                    }
                }

                for path in settled_paths {
                    pending_modifications.remove(&path);
                    let filename = path
                        .file_name()
                        .and_then(|f| f.to_str())
                        .unwrap_or("")
                        .to_string();

                    let timestamp_millis = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0);

                    let event = SettledFileEvent {
                        path,
                        filename,
                        timestamp_millis,
                    };

                    callback(event);
                }

                thread::sleep(Duration::from_millis(50));
            }
        });

        Ok(Self {
            watcher,
            active_paths: Vec::new(),
            stop_signal,
        })
    }

    pub fn watch_dir<P: AsRef<Path>>(&mut self, dir_path: P) -> Result<(), notify::Error> {
        let p = dir_path.as_ref().to_path_buf();
        if !self.active_paths.iter().any(|existing| existing == &p) {
            self.watcher.watch(&p, RecursiveMode::NonRecursive)?;
            self.active_paths.push(p);
        }
        Ok(())
    }

    pub fn unwatch_dir<P: AsRef<Path>>(&mut self, dir_path: P) -> Result<(), notify::Error> {
        let p = dir_path.as_ref();
        if let Some(pos) = self.active_paths.iter().position(|existing| existing == p) {
            let _ = self.watcher.unwatch(p);
            self.active_paths.remove(pos);
        }
        Ok(())
    }

    #[allow(dead_code)]
    pub fn active_paths(&self) -> &[PathBuf] {
        &self.active_paths
    }
}

impl Drop for DebouncedFileWatcher {
    fn drop(&mut self) {
        self.stop_signal.store(true, Ordering::SeqCst);
    }
}
