use serde::Serialize;
use std::{
    io::{BufRead, BufReader},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
struct SerialBridgeState {
    worker: Mutex<Option<SerialWorker>>,
}

struct SerialWorker {
    stop: Arc<AtomicBool>,
    handle: JoinHandle<()>,
}

#[derive(Serialize)]
struct SerialPortInfoDto {
    name: String,
    display_name: String,
}

#[derive(Clone, Serialize)]
struct SerialLinePayload {
    line: String,
}

#[tauri::command]
fn list_serial_ports() -> Result<Vec<SerialPortInfoDto>, String> {
    serialport::available_ports()
        .map_err(|error| error.to_string())
        .map(|ports| {
            ports
                .into_iter()
                .map(|port| SerialPortInfoDto {
                    display_name: format!("{} ({:?})", port.port_name, port.port_type),
                    name: port.port_name,
                })
                .collect()
        })
}

#[tauri::command]
fn open_serial_port(
    app: AppHandle,
    state: State<'_, SerialBridgeState>,
    port_name: String,
) -> Result<(), String> {
    close_serial_port(state.clone())?;

    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    let handle = thread::spawn(move || {
        let port = serialport::new(port_name, 9600)
            .timeout(Duration::from_millis(250))
            .open();

        let Ok(port) = port else {
            let _ = app.emit(
                "serial-error",
                "Could not open the selected serial port. Check OS permissions.",
            );
            return;
        };

        let mut reader = BufReader::new(port);
        let mut line = String::new();

        while !thread_stop.load(Ordering::Relaxed) {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => thread::sleep(Duration::from_millis(25)),
                Ok(_) => {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        let _ = app.emit(
                            "serial-line",
                            SerialLinePayload {
                                line: trimmed.to_owned(),
                            },
                        );
                    }
                }
                Err(_) => thread::sleep(Duration::from_millis(25)),
            }
        }
    });

    let mut worker = state
        .worker
        .lock()
        .map_err(|_| "Serial bridge state lock is poisoned.".to_owned())?;
    *worker = Some(SerialWorker { stop, handle });
    Ok(())
}

#[tauri::command]
fn close_serial_port(state: State<'_, SerialBridgeState>) -> Result<(), String> {
    let worker = state
        .worker
        .lock()
        .map_err(|_| "Serial bridge state lock is poisoned.".to_owned())?
        .take();

    if let Some(worker) = worker {
        worker.stop.store(true, Ordering::Relaxed);
        worker
            .handle
            .join()
            .map_err(|_| "Serial reader thread failed to stop cleanly.".to_owned())?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SerialBridgeState::default())
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            open_serial_port,
            close_serial_port
        ])
        .run(tauri::generate_context!())
        .expect("MuonHub Agent Tauri runtime failed");
}
