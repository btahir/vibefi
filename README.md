# vibefi

### *your focus room in the terminal*

![vibefi hero](docs/images/hero.png)

> Open your terminal. Set the mood. Stay in flow.
>
> `vibefi` is a keyboard-first lofi player for local folders and stream URLs, with scene visuals, long-form ambience loops, and in-terminal search.

[Why Vibefi](#why-vibefi) · [Quick Start](#quick-start) · [Use It](#use-it) · [Controls](#controls) · [Presets](#presets) · [Library](#library) · [Development](#development)

---

## Why Vibefi

- Full-screen terminal playback built for long focus sessions, not playlist management overhead.
- Live ambience mixing with six long-session layers: `rain`, `cafe`, `fire`, `thunder`, `forest`, and `city`.
- `Track` volume starts at `0.25` on first run and remembers the last level you used.
- Search that stays in the terminal and does not interrupt playback.
- Scene-driven visuals with a portable renderer by default and a sharper `chafa` path when available.
- One source manager for local folders, saved streams, and recent one-offs.
- Local-folder-first onboarding with a native folder picker on supported systems.
- A catalog-first music library with installable packs, ready for a standalone library repo or release assets.

`vibefi` is not trying to be a generic music app in a terminal. The point is atmosphere with very little friction.

---

## Quick Start

### Requirements

- `Node.js 22+`
- `ffmpeg` required for playback
- `chafa` optional, recommended for better scene detail
- `yt-dlp` optional, only needed for YouTube URLs passed to `--url`
- Native folder picker support:
  - macOS: built-in through `osascript`
  - Linux: `zenity` or `kdialog` recommended

Example dependency install:

```bash
brew install ffmpeg chafa yt-dlp
# or
sudo apt install ffmpeg chafa zenity
```

### Run From Source

```bash
git clone https://github.com/vibefi-app/vibefi.git
cd vibefi
npm install
npm run dev
```

### Run the Built CLI

```bash
npm run build
node dist/index.js
```

### Install As a Package

```bash
npm install -g vibefi
vibefi
```

### First Session

```bash
vibefi
vibefi --folder ~/Music/Lofi
vibefi --url https://www.youtube.com/watch?v=jfKfPfyJRdk
```

If you just run `vibefi`, it opens an idle welcome screen. Nothing starts playing until you choose a source.

---

## Use It

### Start Listening

```bash
vibefi
vibefi --preset chill
vibefi --preset jazz
vibefi --preset snow
vibefi --home
```

Running `vibefi` with no source starts idle and opens a welcome screen. It does not auto-play anything.

- `Local Folder` is the default path.
- On macOS, Vibefi opens the system folder picker so you can choose music without typing the path.
- On Linux, it uses `zenity` or `kdialog` when available.
- If no native picker is available, Vibefi falls back to the in-terminal path editor.
- If you already know the source, `--folder` and `--url` skip onboarding and go straight in.

### Shape the Room

```bash
vibefi --rain 0.40 --city 0.20
vibefi --forest 0.50
vibefi --fire 0.25 --cafe 0.20
vibefi --scene alley
vibefi --scene-renderer chafa
```

The `Track` row starts at `0.25` on first run. After that, Vibefi remembers the last `Track` level you used in `~/.vibefi/settings.json`.

### Bring Your Own Stream

```bash
vibefi --url http://myserver:8000/lofi-stream
vibefi --url https://example.com/stream.m3u8
vibefi --url https://www.youtube.com/watch?v=jfKfPfyJRdk
```

Inside the app, press `o` to open `Sources`.

- `a` adds a local folder and opens the native folder picker when available
- `u` opens the stream URL editor
- `e` edits the selected saved source
- `d` deletes it

The source editor still supports manual paths and URLs, but the local-folder flow now starts with browse-first behavior instead of making you remember the path.

It gives you:

- one place to manage both local folders and stream URLs
- real cursor editing for the URL or path when you need it
- saved reusable stream sources alongside recent one-offs

Use `o` anytime to reopen your sources.

### Use a Local Folder

```bash
vibefi --folder ~/Music/Lofi
vibefi --folder "/Volumes/Archive/Focus Mixes"
```

Inside the app, press `o`, then `a`. On supported systems that opens a native folder picker; otherwise Vibefi falls back to a manual path editor.

Local folders can be:

- a single folder full of tracks
- a nested folder tree with subfolders

Vibefi scans recursively and picks up:

- `aac`
- `flac`
- `m4a`
- `mp3`
- `ogg`
- `opus`
- `wav`

For nested folders, Vibefi uses the first subfolder level as the category label inside search and queue metadata.

### Manage the Library

```bash
vibefi library status
vibefi library packs --source https://example.com/repository.json
vibefi library install starter --source https://example.com/repository.json
vibefi library install full --source https://example.com/repository.json
```

---

## Controls

The footer keeps the primary actions visible. Press `?` for the full help card, and `/` to search without stopping playback.

### Playback

| Key | Action |
|---|---|
| `Space` | Pause or resume |
| `n` / `b` | Next or previous track |
| `m` | Mute or unmute all audio |
| `s` | Reshuffle the queue |
| `o` | Open the sources manager |
| `q` | Quit |

### Welcome

| Key | Action |
|---|---|
| `Up` / `Down` | Choose `Local Folder`, `Stream URL`, or `Saved Sources` |
| `1` / `2` / `3` | Jump straight to the matching welcome option |
| `Enter` | Continue with the selected option |
| `q` | Quit from the idle start screen |

### Sources

| Key | Action |
|---|---|
| `o` | Open or close the sources manager |
| `a` | Add a local folder, opening the native picker when available |
| `u` | Add a stream URL |
| `e` | Edit the selected source |
| `d` | Delete the selected saved or recent source |
| `Type` | Filter sources live as you type |
| `Enter` | Open or use the selected source |
| `Esc` | Clear the filter, then close |

### Source Editor

| Key | Action |
|---|---|
| `Up` / `Down` or `Tab` / `Shift+Tab` | Move between type, name, and target |
| `Left` / `Right` | Switch source type or move the text cursor |
| `Home` / `End` | Jump to the start or end of the field |
| `Ctrl+a` / `Ctrl+e` | Jump to the start or end of the field |
| `Ctrl+u` / `Ctrl+k` | Clear before or after the cursor |
| `g` | Browse for a local folder while editing a local source |
| `Backspace` / `Delete` | Edit the field under the cursor |
| `Enter` | Save and use the source |
| `Esc` | Cancel back to Sources |

### Mixer and Scenes

| Key | Action |
|---|---|
| `Up` / `Down` | Move between the `Track` row and `Ambience` rows |
| `Left` / `Right` | Decrease or increase the selected level |
| `+` / `-` | Fine-tune the selected level |
| `1`-`7` | Jump to the `Track` row or ambience rows `01`-`07` |
| `Tab` / `Shift+Tab` | Cycle scenes forward or back |
| `v` | Scene-cycle alias |

### Search and Help

| Key | Action |
|---|---|
| `/` | Open song search |
| `?` | Open or close the help overlay |
| `Type` | Filter songs live as you type |
| `Up` / `Down` or `j` / `k` | Move through search results |
| `Tab` / `Shift+Tab` | Change search category scope |
| `Enter` | Play the selected result |
| `Esc` | Clear the query, then close |

---

## Presets

These are starting points, not locked modes. Adjust the ambience live and keep going.

| Preset | Mood | Ambience | Scene |
|---|---|---|---|
| `study` | deep focus | none | city |
| `chill` | coffee shop | cafe `0.30` | balcony |
| `jazz` | smoky evening | cafe `0.20` | rooftop |
| `sleep` | ambient drift | rain `0.20`, forest `0.15` | treehouse |
| `night` | neon reflections | city `0.30`, rain `0.20` | alley |
| `nature` | bamboo forest | forest `0.40`, rain `0.10` | park |
| `soul` | warm soul | fire `0.30` | bookshop |
| `snow` | winter quiet | fire `0.20` | porch |

### Ambient Lanes

The current ambience set is tuned for longer sessions rather than short one-shot effects:

- `rain`
- `cafe`
- `fire`
- `thunder`
- `forest`
- `city`

### Scenes

- `alley`
- `balcony`
- `bookshop`
- `city`
- `park`
- `porch`
- `rooftop`
- `treehouse`

---

## Library

The current app flow is local folders and stream URLs first. The `library` commands are there to support installable Vibefi-curated packs and a future standalone library repo.

That gives `vibefi` two useful modes:

- it can work with installable Vibefi packs
- it can grow into a larger standalone library without changing the player architecture

Pack installs are manifest-driven. The CLI reads a local or remote `repository.json`, installs the selected pack into `~/.vibefi/library`, and skips unchanged files on reinstall.

The main `vibefi` package does not ship a music pack by default in this repo state, so `library packs` / `library install` should be used with `--source` unless you set `VIBEFI_LIBRARY_SOURCE`.

Useful library commands:

```bash
vibefi library path
vibefi library status
vibefi library packs --source https://example.com/repository.json
vibefi library install starter --source https://example.com/repository.json
vibefi library install full --source https://example.com/repository.json
```

---

## Development

### Common Commands

```bash
npm run dev
npm run build
npm test
```

### Library and Catalog Tooling

```bash
npm run tracks:build
npm run library:stage
```

`npm run tracks:build` rebuilds the track catalog plus pack manifests.

`npm run library:stage` stages a standalone library source tree in `dist/library-source/` so it can be published separately later.

### How It Works

- **Library**: track metadata lives in a generated catalog and installable packs are defined by manifests.
- **Audio**: `ffmpeg` decodes and mixes the selected track plus active ambience loops, then streams PCM audio into `speaker`.
- **Renderer**: a double-buffered ANSI renderer updates only changed terminal cells.
- **Scenes**: PNG scene art is rendered through a portable cell renderer, with an optional `chafa` path for higher-detail terminal output.

---

## Disclaimer

`vibefi` is designed for use with local folders, installable library packs, and user-provided stream URLs. If you use external sources, including YouTube via `yt-dlp`, you are responsible for complying with the source platform's terms and any applicable laws.

---

## License

MIT
