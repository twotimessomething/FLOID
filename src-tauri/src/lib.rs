use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{Emitter, Manager};
use tauri_plugin_fs::FsExt;

/// Files handed over by Finder (double-click, Open With, drag onto the Dock
/// icon). Always buffered here; the frontend drains via `take_pending_files`
/// both on boot and on the `floid://pending-files` nudge, so a cold start and
/// a warm open follow the same path and nothing imports twice.
#[derive(Default)]
struct PendingFiles(Mutex<Vec<PathBuf>>);

#[tauri::command]
fn take_pending_files(state: tauri::State<PendingFiles>) -> Vec<String> {
    let mut pending = state.0.lock().unwrap();
    pending
        .drain(..)
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .manage(PendingFiles::default())
        .invoke_handler(tauri::generate_handler![take_pending_files])
        .build(tauri::generate_context!())
        .expect("error while building FLOID")
        .run(|app, event| {
            if let tauri::RunEvent::Opened { urls } = event {
                let paths: Vec<PathBuf> = urls
                    .into_iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .collect();
                if paths.is_empty() {
                    return;
                }

                // Finder-opened files were never granted through a dialog, so
                // the sandbox-facing fs scope must admit them before the
                // webview tries to read.
                let scope = app.fs_scope();
                for path in &paths {
                    let _ = scope.allow_file(path);
                }

                app.state::<PendingFiles>().0.lock().unwrap().extend(paths);
                let _ = app.emit("floid://pending-files", ());
            }
        });
}
