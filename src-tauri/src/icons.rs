//! Extracts an application's icon out of its own executable so the UI can show
//! real brand icons without asking a logo service.
//!
//! Windows executables store icons as `RT_ICON` images plus an `RT_GROUP_ICON`
//! directory; both are read straight out of the PE resource tree and repacked as
//! a single-image `.ico`, which the webview renders from a data URI.



const RT_ICON: u32 = 3;
const RT_GROUP_ICON: u32 = 14;

const BASE64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Reads the largest icon from `path` as a `data:` URI, or an empty string when
/// the file has none.
pub fn data_uri(path: &str) -> String {
    let Ok(bytes) = std::fs::read(path) else {
        return String::new();
    };
    let Some(ico) = icon(&bytes) else {
        return String::new();
    };
    format!("data:image/x-icon;base64,{}", base64(&ico))
}

fn base64(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let packed = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(BASE64[(packed >> 18) as usize & 63] as char);
        out.push(BASE64[(packed >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            BASE64[(packed >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            BASE64[packed as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

/// A parsed PE file: the bytes plus the section table needed to turn resource
/// RVAs into file offsets.
struct Pe<'a> {
    bytes: &'a [u8],
    sections: Vec<Section>,
    resource_rva: u32,
}

struct Section {
    virtual_address: u32,
    virtual_size: u32,
    raw_pointer: u32,
    raw_size: u32,
}

fn u16_at(bytes: &[u8], off: usize) -> Option<u16> {
    Some(u16::from_le_bytes([
        *bytes.get(off)?,
        *bytes.get(off + 1)?,
    ]))
}

fn u32_at(bytes: &[u8], off: usize) -> Option<u32> {
    Some(u32::from_le_bytes([
        *bytes.get(off)?,
        *bytes.get(off + 1)?,
        *bytes.get(off + 2)?,
        *bytes.get(off + 3)?,
    ]))
}

impl<'a> Pe<'a> {
    fn parse(bytes: &'a [u8]) -> Option<Pe<'a>> {
        if bytes.get(0..2)? != b"MZ" {
            return None;
        }
        let pe = u32_at(bytes, 0x3c)? as usize;
        if bytes.get(pe..pe + 4)? != b"PE\0\0" {
            return None;
        }

        let coff = pe + 4;
        let section_count = u16_at(bytes, coff + 2)? as usize;
        let optional_size = u16_at(bytes, coff + 16)? as usize;
        let optional = coff + 20;

        // The resource directory is data directory entry 2; its slot sits at a
        // different offset in PE32 and PE32+.
        let magic = u16_at(bytes, optional)?;
        let directories = match magic {
            0x10b => optional + 96,
            0x20b => optional + 112,
            _ => return None,
        };
        let resource_rva = u32_at(bytes, directories + 16)?;

        let mut sections = Vec::with_capacity(section_count);
        let table = optional + optional_size;
        for index in 0..section_count {
            let off = table + index * 40;
            sections.push(Section {
                virtual_size: u32_at(bytes, off + 8)?,
                virtual_address: u32_at(bytes, off + 12)?,
                raw_size: u32_at(bytes, off + 16)?,
                raw_pointer: u32_at(bytes, off + 20)?,
            });
        }

        Some(Pe {
            bytes,
            sections,
            resource_rva,
        })
    }

    /// Maps a resource-relative address to a file offset.
    fn file_offset(&self, rva: u32) -> Option<usize> {
        self.sections
            .iter()
            .find(|section| {
                let start = section.virtual_address;
                let size = if section.virtual_size == 0 {
                    section.raw_size
                } else {
                    section.virtual_size
                };
                rva >= start && rva < start + size
            })
            .map(|section| {
                (rva - section.virtual_address + section.raw_pointer) as usize
            })
    }

    /// Resource directory entry ids at one level. Offsets inside the resource
    /// section are used throughout; the high bit of a target marks a nested
    /// directory instead of data.
    fn entries(&self, offset: u32) -> Vec<(u32, u32)> {
        let Some(base) = self.file_offset(self.resource_rva + offset) else {
            return Vec::new();
        };
        let named = u16_at(self.bytes, base + 12).unwrap_or(0) as usize;
        let ids = u16_at(self.bytes, base + 14).unwrap_or(0) as usize;
        let mut out = Vec::with_capacity(named + ids);
        for index in 0..named + ids {
            let off = base + 16 + index * 8;
            let (Some(id), Some(target)) = (u32_at(self.bytes, off), u32_at(self.bytes, off + 4))
            else {
                break;
            };
            out.push((id, target));
        }
        out
    }

    /// The bytes a leaf directory entry points at.
    fn data(&self, entry: u32) -> Option<&'a [u8]> {
        if entry & 0x8000_0000 != 0 {
            return None;
        }
        let off = self.file_offset(self.resource_rva + (entry & 0x7fff_ffff))?;
        let rva = u32_at(self.bytes, off)?;
        let size = u32_at(self.bytes, off + 4)? as usize;
        let start = self.file_offset(rva)?;
        self.bytes.get(start..start + size)
    }
}

/// Picks the biggest icon from an `RT_GROUP_ICON` directory and repacks it as a
/// standalone `.ico`.
fn icon(bytes: &[u8]) -> Option<Vec<u8>> {
    let pe = Pe::parse(bytes)?;

    let type_dir = |id: u32| {
        pe.entries(0)
            .into_iter()
            .find(|(entry_id, _)| *entry_id == id)
            .map(|(_, target)| target & 0x7fff_ffff)
    };
    let group_root = type_dir(RT_GROUP_ICON)?;
    let icon_root = type_dir(RT_ICON)?;

    // The group's icon index refers to the resource *name* of an RT_ICON entry,
    // so index them all rather than counting directories.
    let mut images: Vec<(u32, &[u8])> = Vec::new();
    for (name_id, target) in pe.entries(icon_root) {
        if target & 0x8000_0000 == 0 {
            continue;
        }
        for (_, language) in pe.entries(target & 0x7fff_ffff) {
            if let Some(image) = pe.data(language & 0x7fff_ffff) {
                images.push((name_id, image));
            }
        }
    }
    if images.is_empty() {
        return None;
    }

    // GRPICONDIR is reserved, type, count, then 14-byte entries.
    let mut best: Option<(u32, u8, u8, &[u8])> = None;
    let mut best_area = 0u32;
    for (_, group_id) in pe.entries(group_root) {
        for (_, language) in pe.entries(group_id & 0x7fff_ffff) {
            let Some(group) = pe.data(language & 0x7fff_ffff) else {
                continue;
            };
            let count = u16_at(group, 4).unwrap_or(0) as usize;
            for index in 0..count {
                let Some(entry) = group.get(6 + index * 14..6 + (index + 1) * 14) else {
                    break;
                };
                let Some(name_id) = u16_at(entry, 12) else {
                    continue;
                };
                let Some((_, image)) = images.iter().find(|(id, _)| *id == u32::from(name_id))
                else {
                    continue;
                };
                // Only DIB images: the header size is what every renderer and the
                // test below agree on. 0 means 256 px.
                if image.len() < 40 || u32_at(image, 0) != Some(40) {
                    continue;
                }
                let area = u32::from(entry[0].max(entry[1]));
                if area > best_area {
                    best = Some((area, entry[0], entry[1], image));
                    best_area = area;
                }
            }
        }
    }

    let (_, width, height, image) = best?;
    let mut ico = Vec::with_capacity(image.len() + 22);
    ico.extend_from_slice(&0u16.to_le_bytes()); // reserved
    ico.extend_from_slice(&1u16.to_le_bytes()); // type: icon
    ico.extend_from_slice(&1u16.to_le_bytes()); // one image
    ico.push(width);
    ico.push(height);
    ico.push(0); // palette size
    ico.push(0); // reserved
    ico.extend_from_slice(&1u16.to_le_bytes()); // planes
    ico.extend_from_slice(&32u16.to_le_bytes()); // bits per pixel
    ico.extend_from_slice(&(image.len() as u32).to_le_bytes());
    ico.extend_from_slice(&22u32.to_le_bytes());
    ico.extend_from_slice(image);
    Some(ico)
}

/// Only used by tests: a classic Win32 executable that always carries an icon.
/// `notepad.exe` is a stub on Windows 11, so `cmd.exe` is the safer subject.
#[cfg(test)]
fn sample_exe() -> Option<String> {
    let root = std::env::var("SystemRoot").ok()?;
    for name in ["cmd.exe", "explorer.exe", "notepad.exe"] {
        let path = std::path::Path::new(&root).join("System32").join(name);
        if path.exists() {
            return Some(path.to_string_lossy().into_owned());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_known_vectors() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn extracts_an_icon_from_a_real_executable() {
        let Some(path) = sample_exe() else {
            return;
        };
        let uri = data_uri(&path);
        assert!(uri.starts_with("data:image/x-icon;base64,"), "no icon");

        let bytes = std::fs::read(&path).unwrap();
        let ico = icon(&bytes).expect("icon");
        assert_eq!(u16::from_le_bytes([ico[0], ico[1]]), 0);
        assert_eq!(u16::from_le_bytes([ico[2], ico[3]]), 1);
        assert_eq!(u16::from_le_bytes([ico[4], ico[5]]), 1);
        // The payload must be a DIB, whose first dword is its header size.
        assert_eq!(u32::from_le_bytes(ico[22..26].try_into().unwrap()), 40);
        assert!(ico.len() > 32);
    }

    #[test]
    fn refuses_files_that_are_not_executables() {
        assert!(Pe::parse(b"not a pe file").is_none());
        assert!(icon(b"not a pe file").is_none());
        assert_eq!(data_uri("C:\\definitely\\missing.exe"), "");
    }
}
