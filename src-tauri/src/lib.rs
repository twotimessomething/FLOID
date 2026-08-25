use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{Emitter, Manager};
use tauri_plugin_fs::FsExt;

/// The app's two ground colours, mirrored from `--color-background` in
/// src/index.css. Keep them in step with that file.
const GROUND_LIGHT: tauri::window::Color = tauri::window::Color(0xf0, 0xf0, 0xf0, 0xff);
const GROUND_DARK: tauri::window::Color = tauri::window::Color(0x14, 0x14, 0x16, 0xff);

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
        // The window paints before the webview has a first frame, and its
        // default is white — which reads as a flash of white on every launch
        // in dark mode. The theme script in index.html cannot help: it runs
        // inside the webview, which is exactly what has not painted yet. So
        // the ground colour has to be set natively, before that.
        //
        // `theme()` follows the system, which is what the app's default
        // "system" setting follows too. Someone who has forced a theme that
        // differs from the system still sees one frame of the other ground —
        // grey rather than white, and only in that case.
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let theme = window.theme().unwrap_or(tauri::Theme::Light);
                let is_dark = matches!(theme, tauri::Theme::Dark);

                let _ = window.set_background_color(Some(if is_dark {
                    GROUND_DARK
                } else {
                    GROUND_LIGHT
                }));

                // Pin the webview's appearance to the theme we just read,
                // instead of letting it settle on its own. Left implicit, the
                // webview can answer `prefers-color-scheme` as light for the
                // first moments of a launch and correct itself a beat later —
                // the boot script in index.html asks once and believes the
                // answer, so a launch that loses that race paints the light
                // ground, and the media-query listener then flips it to dark.
                // That is the flash, and it is intermittent because it is a
                // race. Setting the theme explicitly removes the race rather
                // than shortening it.
                let _ = window.set_theme(Some(theme));
            }
            Ok(())
        })
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
