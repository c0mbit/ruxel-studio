use std::env;
use std::sync::Arc;
use rux_autopatch::error::AutopatchError;
use rux_autopatch::http::UreqHttpTransport;
use rux_autopatch::llm::LlmPatchEngine;
use rux_autopatch::sandbox::DefaultCommandRunner;
use rux_autopatch::sync::SyncEngine;
use rux_autopatch::version_config::FrameworkVersionsConfig;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    let command = args.get(1).map(|s| s.as_str()).unwrap_or("check");

    let workspace_root = env::current_dir()?;
    let config_path = workspace_root.join("framework_versions.json");

    match command {
        "check" => {
            let config = FrameworkVersionsConfig::load_from_path(&config_path)?;
            println!("Framework Versions Configuration (Ruxel Studio):");
            for (id, meta) in &config.frameworks {
                println!("- {}: current={} (repo: {})", id, meta.current_version, meta.repo);
            }

            let transport = Arc::new(UreqHttpTransport::new());
            let github_token = env::var("GITHUB_TOKEN").ok();
            let monitor = rux_autopatch::monitor::ReleaseMonitor::new(transport, github_token);

            let candidates = monitor.check_all(&config)?;
            if candidates.is_empty() {
                println!("All frameworks are up to date.");
            } else {
                println!("Updates available for {} frameworks:", candidates.len());
                for cand in candidates {
                    println!(
                        "  * {}: {} -> {} (tag: {})",
                        cand.framework_id,
                        cand.meta.current_version,
                        cand.latest_release.version,
                        cand.latest_release.tag_name
                    );
                }
            }
        }
        "sync" => {
            let apply = args.iter().any(|arg| arg == "--apply");
            let target_framework = args.windows(2).find_map(|w| {
                if w[0] == "--framework" {
                    Some(w[1].as_str())
                } else {
                    None
                }
            });

            let transport = Arc::new(UreqHttpTransport::new());
            let runner = Arc::new(DefaultCommandRunner::new());
            let github_token = env::var("GITHUB_TOKEN").ok();
            let llm_engine = Arc::new(LlmPatchEngine::from_env(transport.clone())?);

            let engine = SyncEngine::new(
                workspace_root,
                transport,
                runner,
                github_token,
                llm_engine,
            );

            if let Some(fw) = target_framework {
                let res = engine.sync_framework(fw, apply)?;
                println!(
                    "Framework '{}': status={}, from={}, to={}, attempts={}, applied={}",
                    res.framework_id, res.status, res.from_version, res.to_version, res.attempts, res.applied
                );
            } else {
                let summary = engine.sync_all(apply)?;
                println!(
                    "Sync Summary: checked={}, updated={}",
                    summary.checked_count, summary.updated_count
                );
                for item in summary.items {
                    println!(
                        "  - {}: status={}, from={}, to={}, attempts={}, applied={}",
                        item.framework_id, item.status, item.from_version, item.to_version, item.attempts, item.applied
                    );
                }
            }
        }
        "analyze" => {
            let framework_id = args.get(2).ok_or_else(|| {
                AutopatchError::Config("Framework ID required for analyze command".to_string())
            })?;

            let config = FrameworkVersionsConfig::load_from_path(&config_path)?;
            let meta = config.frameworks.get(framework_id).ok_or_else(|| {
                AutopatchError::FrameworkNotFound(framework_id.to_string())
            })?;

            let transport = Arc::new(UreqHttpTransport::new());
            let github_token = env::var("GITHUB_TOKEN").ok();
            let analyzer = rux_autopatch::analyzer::DiffAnalyzer::new(transport, github_token);

            let report = analyzer.fetch_and_analyze(
                framework_id,
                &meta.repo,
                &meta.current_version,
                "latest",
                None,
            )?;

            println!("Analysis report for {}:", framework_id);
            println!("Breaking changes count: {}", report.breaking_changes.len());
            for change in report.breaking_changes {
                println!("  [{:?}] {}: {}", change.category, change.symbol, change.summary);
            }
        }
        _ => {
            eprintln!("Unknown command: {}", command);
            eprintln!("Usage: rux-autopatch [check | sync [--apply] [--framework <id>] | analyze <framework>]");
            std::process::exit(1);
        }
    }

    Ok(())
}
