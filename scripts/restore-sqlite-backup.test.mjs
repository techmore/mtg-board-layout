import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  buildAria2Args,
  parseArgs,
  restoreSqliteFile,
  selectSqliteCandidate,
  validateSqliteFile,
} from './restore-sqlite-backup.mjs'

// The restore workflow shells out to the sqlite3 CLI. Tests that build or
// inspect real databases are skipped (not failed) on hosts without it so a
// fresh checkout stays green; CI installs sqlite3 and runs them.
const sqlite3Available = spawnSync('sqlite3', ['-version'], { stdio: 'ignore' }).status === 0
const itWithSqlite = sqlite3Available ? it : it.skip

const temporaryDirectories = []

function makeTemporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'mtg-board-restore-test-'))
  temporaryDirectories.push(directory)
  return directory
}

function makeDatabase(directory, name, value) {
  const file = join(directory, name)
  execFileSync('sqlite3', [file, `CREATE TABLE state (value TEXT); INSERT INTO state VALUES ('${value}');`])
  return file
}

function queryValue(file) {
  return execFileSync('sqlite3', [file, 'SELECT value FROM state;'], { encoding: 'utf8' }).trim()
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true })
  }
})

describe('SQLite restore CLI', () => {
  it('parses magnet restore options and byte limits', () => {
    const options = parseArgs([
      '--source',
      'magnet:?xt=urn:btih:example',
      '--target',
      './data.sqlite',
      '--max-bytes',
      '500MiB',
      '--dry-run',
      '--yes',
    ])

    expect(options.source).toBe('magnet:?xt=urn:btih:example')
    expect(options.maxBytes).toBe(500 * 1024 ** 2)
    expect(options.dryRun).toBe(true)
    expect(options.yes).toBe(true)
  })

  it('builds aria2 arguments without shell interpolation', () => {
    const magnet = 'magnet:?xt=urn:btih:abc&dn=backup%20with%20spaces'
    expect(buildAria2Args({ kind: 'magnet', value: magnet }, '/tmp/download dir')).toEqual([
      '--dir',
      '/tmp/download dir',
      '--check-integrity=true',
      '--seed-time=0',
      '--bt-enable-lpd=true',
      '--summary-interval=0',
      magnet,
    ])
  })

  itWithSqlite('validates a SQLite database with sqlite3 integrity_check', () => {
    const directory = makeTemporaryDirectory()
    const database = makeDatabase(directory, 'incoming.sqlite', 'incoming')

    expect(validateSqliteFile(database)).toMatchObject({ ok: true, integrity: 'ok' })
  })

  itWithSqlite('selects the only valid SQLite file from a torrent staging directory', () => {
    const directory = makeTemporaryDirectory()
    const database = makeDatabase(directory, 'nested-backup.sqlite', 'incoming')
    writeFileSync(join(directory, 'not-a-database.db'), 'not sqlite')

    expect(selectSqliteCandidate(directory)).toMatchObject({ path: database, ok: true })
  })

  itWithSqlite('requires --file when a download contains multiple valid databases', () => {
    const directory = makeTemporaryDirectory()
    makeDatabase(directory, 'first.sqlite', 'first')
    makeDatabase(directory, 'second.sqlite', 'second')

    expect(() => selectSqliteCandidate(directory)).toThrow(/More than one valid SQLite database/)
    expect(selectSqliteCandidate(directory, { file: 'second.sqlite' }).path).toBe(
      join(directory, 'second.sqlite'),
    )
  })

  itWithSqlite('backs up and atomically replaces an existing target', () => {
    const directory = makeTemporaryDirectory()
    const incoming = makeDatabase(directory, 'incoming.sqlite', 'incoming')
    const target = makeDatabase(directory, 'target.sqlite', 'old')

    const result = restoreSqliteFile({ source: incoming, target, confirmed: true })

    expect(queryValue(target)).toBe('incoming')
    expect(result.backupPath).toBeTruthy()
    expect(queryValue(result.backupPath)).toBe('old')
    expect(validateSqliteFile(target).ok).toBe(true)
  })

  itWithSqlite('does not modify a target during a dry run', () => {
    const directory = makeTemporaryDirectory()
    const incoming = makeDatabase(directory, 'incoming.sqlite', 'incoming')
    const target = makeDatabase(directory, 'target.sqlite', 'old')
    const before = readFileSync(target)

    const result = restoreSqliteFile({ source: incoming, target, dryRun: true })

    expect(result.dryRun).toBe(true)
    expect(readFileSync(target)).toEqual(before)
    expect(queryValue(target)).toBe('old')
  })

  itWithSqlite('does not overwrite a pre-existing safety backup path', () => {
    const directory = makeTemporaryDirectory()
    const incoming = makeDatabase(directory, 'incoming.sqlite', 'incoming')
    const target = makeDatabase(directory, 'target.sqlite', 'old')
    const backupPath = join(directory, 'chosen-backup.sqlite')
    writeFileSync(backupPath, 'keep this file')

    expect(() =>
      restoreSqliteFile({ source: incoming, target, backupPath, confirmed: true }),
    ).toThrow(/Safety backup path already exists/)
    expect(queryValue(target)).toBe('old')
    expect(readFileSync(backupPath, 'utf8')).toBe('keep this file')
  })
})
