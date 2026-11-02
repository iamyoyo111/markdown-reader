# Changelog

## 0.2.2 - 2026-11-02

### Fixed

- Align the Markdown editor to the paragraph currently visible in reading mode instead of the start of its section.
- Calculate editor scroll position from the corresponding source line rather than document character ratio.

## 0.2.1 - 2026-10-31

### Fixed

- Restore the corresponding rendered paragraph when returning from Markdown editing to reading mode.
- Preserve the previous heading and scroll ratio as fallback anchors.

## 0.2.0 - 2026-10-31

### Added

- Markdown source editor with reading and editing modes.
- Quick formatting controls for bold, italic, headings, links, inline code and lists.
- Save changes back to the original local Markdown file when write permission is available.
- Download a Markdown copy when the browser only has upload-style file access.
- `Ctrl+S` and `Cmd+S` save shortcuts.
- Unsaved-change warnings before switching documents or leaving the page.
- Live heading navigation updates after editing and saving.

### Changed

- Project version updated to `0.2.0`.

## 0.1.0 - 2026-10-30

### Added

- Local root-folder Markdown browsing.
- Markdown heading outline and smooth navigation.
- Edge Neural US English text-to-speech with browser fallback.
- Bilingual dictionary lookup with Chinese definitions, English meanings and examples.
- Responsive desktop and mobile reader interface.

