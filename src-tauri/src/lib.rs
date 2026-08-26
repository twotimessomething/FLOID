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

/// Hand the window back to the system appearance once the webview has a first
/// frame. Until then it is pinned — see the note in `run`.
#[tauri::command]
fn follow_system_theme(window: tauri::WebviewWindow) {
    let _ = window.set_theme(None);
}

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
                //
                // The pin is temporary. `set_theme(Some(..))` pins
                // NSWindow.appearance, and macOS derives ThemeChanged from
                // *observing* effective appearance — so a pinned window stops
                // following the system and stops being told that the system
                // moved. Left pinned for the process lifetime, the app reads
                // the theme once at launch and can never change again; that
                // shipped as build 1, where switching macOS appearance did
                // nothing. The frontend calls `follow_system_theme` once it
                // has painted, which releases the pin. Releasing cannot
                // flicker: the pin is set to the system value, so following
                // the system again resolves to what is already on screen.
                let _ = window.set_theme(Some(theme));
            }
            Ok(())
        })
        // Once unpinned the window follows the system, so this now fires on a
        // real appearance change. The webview repaints itself; the native
        // ground behind it would otherwise keep the launch-time colour and
        // show through during a resize.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::ThemeChanged(theme) = event {
                let _ = window.set_background_color(Some(if matches!(theme, tauri::Theme::Dark) {
                    GROUND_DARK
                } else {
                    GROUND_LIGHT
                }));
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .manage(PendingFiles::default())
        .invoke_handler(tauri::generate_handler![take_pending_files, follow_system_theme])
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
