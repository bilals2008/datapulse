use std::sync::{Arc, Mutex};

use tauri::image::Image;
use tauri::AppHandle;

use crate::analytics::human_bytes;
use crate::commands::quota_status;
use crate::state::AppState;

/// Approximations of the palette tokens in `index.css`, used to tint the tray
/// glyph so the tray shows cap pressure at a glance.
const SAGE: [u8; 3] = [125, 188, 151];
const COPPER: [u8; 3] = [223, 175, 96];
const RED: [u8; 3] = [202, 98, 81];

/// Last tint written to the tray, so an unchanged state is not re-rendered.
static LAST_TINT: Mutex<Option<[u8; 3]>> = Mutex::new(None);

/// Pushes live state into the OS chrome: the tray tooltip and the tray tint.
/// Cheap enough to run on the collector's slow tick.
pub fn refresh(app: &AppHandle, state: &Arc<AppState>) {
    let quota = quota_status(state).ok().filter(|quota| quota.enabled);
    let percent = quota
        .as_ref()
        .map(|quota| (quota.used_bytes as f64 / quota.limit_bytes.max(1) as f64) * 100.0);

    let session = {
        let latest = state.latest.lock().unwrap();
        human_bytes(latest.session_rx + latest.session_tx)
    };

    let tooltip = match percent {
        Some(percent) => format!("DataPulse · {percent:.0}% of cap · {session} this session"),
        None => format!("DataPulse · {session} this session"),
    };

    let tint = percent.and_then(tint_for);
    if let Some(tray) = state.tray.lock().unwrap().as_ref() {
        let _ = tray.set_tooltip(Some(tooltip));

        let mut last = LAST_TINT.lock().unwrap();
        if *last != tint {
            if let Some(base) = app.default_window_icon() {
                let icon = match tint {
                    Some(color) => tint_icon(base, color),
                    None => base.clone(),
                };
                if tray.set_icon(Some(icon)).is_ok() {
                    *last = tint;
                }
            }
        }
    }
}

fn tint_for(percent: f64) -> Option<[u8; 3]> {
    Some(if percent >= 100.0 {
        RED
    } else if percent >= 80.0 {
        COPPER
    } else {
        SAGE
    })
}

/// Multiplies the source pixels by `tint`, keeping the alpha channel. The logo
/// is a light glyph on transparency, so this recolours it without flattening it.
fn tint_icon(base: &Image<'_>, tint: [u8; 3]) -> Image<'static> {
    let mut rgba = base.rgba().to_vec();
    for pixel in rgba.chunks_exact_mut(4) {
        for channel in 0..3 {
            pixel[channel] = (pixel[channel] as u16 * tint[channel] as u16 / 255) as u8;
        }
    }
    Image::new_owned(rgba, base.width(), base.height())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tint_keeps_alpha_and_shape() {
        let base = Image::new_owned(vec![255, 255, 255, 255, 0, 0, 0, 0], 2, 1);
        let tinted = tint_icon(&base, SAGE);

        assert_eq!(&tinted.rgba()[0..3], &SAGE);
        assert_eq!(tinted.rgba()[3], 255);
        assert_eq!(&tinted.rgba()[4..8], &[0, 0, 0, 0]);
        assert_eq!((tinted.width(), tinted.height()), (2, 1));
    }

    #[test]
    fn thresholds_follow_cap_pressure() {
        assert_eq!(tint_for(10.0), Some(SAGE));
        assert_eq!(tint_for(85.0), Some(COPPER));
        assert_eq!(tint_for(140.0), Some(RED));
    }
}
