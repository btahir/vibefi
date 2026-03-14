# Library Architecture

`vibefi` treats the music library as a separately publishable content source.

Authored source of truth:

- `tracks/`
  Real audio files grouped by broad category
- `tracks/catalog.json`
  Generated catalog for the full local library
- `library/packs/starter.selection.json`
  Curated starter-pack track slugs

Generated library metadata:

- `library/manifests/full.json`
  Install manifest for the full pack
- `library/manifests/starter.json`
  Install manifest for the starter pack
- `library/repository.local.json`
  Local install source used by `vibefi library install ...`

Publishing flow:

1. Curate or rename tracks under `tracks/`
2. Run `npm run tracks:build`
3. Run `npm run library:stage`
4. Publish `dist/library-source/` as the standalone library repo or release asset set

The staged publish tree contains:

- `repository.json`
  Entry point for installers
- `catalog.json`
  Full catalog metadata
- `packs/*.json`
  Installable pack manifests
- `tracks/<category>/*.mp3`
  Audio files

CLI install flow:

- `vibefi library packs --source <repository.json>`
  Show available packs from a published source
- `vibefi library install starter --source <repository.json>`
  Install the curated starter pack into `~/.vibefi/library`
- `vibefi library install full --source <repository.json>`
  Install from a remote or local published source

The runtime prefers `~/.vibefi/library/catalog.json` when present. Some builds may also ship a bundled fallback catalog, but that is optional rather than assumed.
