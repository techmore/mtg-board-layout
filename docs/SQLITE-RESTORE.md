# SQLite backup restore

The repository includes a local restore workflow for SQLite backups distributed as a magnet link or torrent file. It is intentionally a developer/operations command, not a browser upload: a browser should not be given permission to download arbitrary torrent content or overwrite a database on the host.

## Prerequisites

Install the two command-line tools used by the workflow:

```sh
# macOS with Homebrew
brew install aria2 sqlite
```

On Linux, install the equivalent `aria2` and `sqlite3` packages. The command checks both tools before it starts.

## Restore from a magnet link

```sh
npm run db:restore -- \
  --source 'magnet:?xt=urn:btih:YOUR_INFO_HASH&dn=mtg-backup' \
  --target "$PWD/.local/mtg.sqlite" \
  --yes
```

The command downloads into a temporary staging directory, finds the only valid `.db`, `.sqlite`, or `.sqlite3` file, runs `PRAGMA integrity_check`, and copies it into the target. If the target already exists, the previous database is moved to a sibling file named like:

```text
.local/mtg.sqlite.backup-20260925T154530Z-a1b2c3
```

The staging directory is removed after a successful restore. Add `--keep-download` to preserve it, or use `--download-dir <path>` when you need a stable staging location.

## Restore from a `.torrent` file

```sh
npm run db:restore -- \
  --source ./backups/mtg-backup.torrent \
  --target "$PWD/.local/mtg.sqlite" \
  --yes
```

For a multi-file torrent, identify the database inside the downloaded tree:

```sh
npm run db:restore -- \
  --source ./backups/mtg-backup.torrent \
  --file snapshot/mtg.sqlite \
  --target "$PWD/.local/mtg.sqlite" \
  --yes
```

If more than one valid SQLite database is found and `--file` was not supplied, the command stops instead of guessing.

## Test a local backup first

The command also accepts a local SQLite file, which is useful for testing the replacement and backup behavior without a torrent download:

```sh
npm run db:restore -- \
  --source ./backups/mtg.sqlite \
  --target "$PWD/.local/mtg.sqlite" \
  --dry-run
```

Remove `--dry-run` and add `--yes` when the validation output is correct. `--max-bytes 500MiB` can be used to reject unexpectedly large databases.

## Safety notes

- Only use magnets and torrent files you are authorized to download.
- The source is passed to `aria2c` as an argument; it is never interpolated into a shell command.
- The target is not touched until the incoming file passes SQLite integrity validation.
- Replacement is done through a temporary file and rename, with the prior target and SQLite `-wal`/`-shm` sidecars preserved beside the backup when present.
- The workflow does not infer an application-specific schema. It restores the SQLite file selected by the operator; the target path must be the database location used by the test or service.
