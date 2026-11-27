# Timeseq

Timeseq is an Obsidian plugin designed for lab-style note taking. I keep a single markdown document per project (for example `My Project Log`), add a dated heading for each work session, and capture new thoughts as bullet points under that heading. Timeseq removes the busywork of stamping times and jumping between sections so you can stay focused on the work itself.

The plugin uses your Daily Note settings (if enabled) to match your preferred date format; otherwise it falls back to ISO `YYYY-MM-DD`.

> Fork of [eddie/obsidian-time-log](https://github.com/eddie/obsidian-time-log). Every Enter creates a new timestamped entry, to the second, with support for task lists.

## Core workflow

- Under a dated heading (`## [[YYYY-MM-DD]]`), press **Enter**: the new line becomes `- **HH:mm:ss**: `.
- Keep pressing Enter: each new line gets its own timestamp, so several entries in the same minute stay distinct.
- Press Enter on an empty timestamped line to leave the list (like Obsidian does for empty bullets).
- Pressing Enter on a blank line does nothing special, so you can still space paragraphs.

```markdown
## [[2026-11-27]]
- **10:32:05**: Collected notes from the old Confluence page
- **10:32:41**: Spotted a missing auth header
	- **10:33:02**: Nested entries get stamped too
- [ ] **10:34:10**: Write follow-up tests
- [x] **10:35:00**: Send the summary ✅ 14:05:12
```

## Features

- **Stamp on Enter** – Each new line in a dated section gets a timestamp (default `HH:mm:ss`). Works with physical and mobile keyboards, because it watches the inserted text, not key events. Pasted text is never stamped.
- **Bullets and tasks** – The timestamp goes after `- `, `1. ` and `- [ ] `. Typing `- ` on an empty line stamps it; typing `[ ] ` right after a fresh stamp turns it into a task. Obsidian's *Toggle checkbox status* (Ctrl/Cmd+L) also works on stamped lines.
- **Completion time** – Checking a stamped task appends ` ✅ HH:mm:ss`; unchecking removes it.
- **New day heading** – If the section's date isn't today (e.g. after midnight), Enter adds a new `## [[today]]` heading first.
- **One undo step** – Ctrl/Cmd+Z removes the newline and its timestamp together.
- Lines inside code blocks and sections under non-dated headings are left alone.

## Commands

| Command | Description |
| --- | --- |
| **Start log entry** | Inserts a dated level-2 heading and a first timestamped bullet. |
| **Jump to latest log header** | Scrolls to the newest dated heading and places the cursor below it. |

## Settings

- **Log format** – Moment.js format for the timestamp (default `HH:mm:ss`).
- **Always use bullets** – Start a `- ` bullet when stamping a line that isn't a list item.
- **Completion time on tasks** – Append/remove ` ✅ <time>` when checking/unchecking stamped tasks.
- **Auto-add date heading** – Add a new dated heading when the date rolls over.

## Installation

1. Clone or download this repository.
2. Copy `main.js` and `manifest.json` into your vault at `Vault/.obsidian/plugins/timeseq/`.
3. Reload Obsidian and enable **Timeseq** from the Community Plugins panel.

## Development

```bash
npm install
npm run dev   # rebuild on save
npm test      # unit tests
```

The dev script recompiles `main.ts` to `main.js` whenever you save. Symlink the project into your vault for hot reloading if you use a development plugin that supports it.

Example (adjust paths to your vault):

```bash
ln -s ~/dev/timeseq ~/Documents/Obsidian/.obsidian/plugins/timeseq
```

## Releasing new versions

This repo uses a GitHub Actions workflow that publishes artifacts whenever you push a version tag.

1. Bump the version in `manifest.json` and `package.json` (the `npm run version` helper can update `manifest.json` and `versions.json` for you).
2. Update `versions.json` with the new version → minimum Obsidian version mapping.
3. Run `npm run build`.
4. Commit your changes and tag the release:

   ```bash
   git tag -a 1.0.1 -m "1.0.1"
   git push origin 1.0.1
   ```

   The GitHub Action uploads `manifest.json` and `main.js` as release assets automatically.

## Contributors

- [leonsbuddydave](https://github.com/leonsbuddydave) – multi-editor-pane timestamp fix, list marker support (`-`/`*`/`+`), and the auto-add date heading on rollover feature.

## License

MIT
