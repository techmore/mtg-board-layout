#!/usr/bin/env node

import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { stdin, stdout } from 'node:process'
import { pathToFileURL } from 'node:url'
import { createInterface } from 'node:readline/promises'

export const DEFAULT_MAX_BYTES = 2 * 1024 ** 3
export const SQLITE_EXTENSIONS = new Set(['.db', '.sqlite', '.sqlite3'])

function usageError(message) {
  return new Error(`${message}\n\nRun with --help for usage.`)
}

function parseByteCount(value) {
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|kib|mb|mib|gb|gib|tb|tib)?$/i.exec(value)
  if (!match) {
    throw usageError(`Invalid byte count: ${value}`)
  }

  const amount = Number(match[1])
  const unit = (match[2] ?? 'b').toLowerCase()
  const multipliers = {
    b: 1,
    kb: 1000,
    kib: 1024,
    mb: 1000 ** 2,
    mib: 1024 ** 2,
    gb: 1000 ** 3,
    gib: 1024 ** 3,
    tb: 1000 ** 4,
    tib: 1024 ** 4,
  }
  const bytes = Math.floor(amount * multipliers[unit])

  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    throw usageError(`Byte count must be a positive safe integer: ${value}`)
  }

  return bytes
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw usageError(`${flag} requires a value`)
  }
  return value
}

export function parseArgs(argv) {
  const options = {
    source: undefined,
    target: undefined,
    file: undefined,
    downloadDir: undefined,
    keepDownload: false,
    dryRun: false,
    yes: false,
    maxBytes: DEFAULT_MAX_BYTES,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    switch (argument) {
      case '--help':
      case '-h':
        options.help = true
        break
      case '--source':
        options.source = requireValue(argv, index, '--source')
        index += 1
        break
      case '--target':
        options.target = requireValue(argv, index, '--target')
        index += 1
        break
      case '--file':
        options.file = requireValue(argv, index, '--file')
        index += 1
        break
      case '--download-dir':
        options.downloadDir = requireValue(argv, index, '--download-dir')
        index += 1
        break
      case '--max-bytes':
        options.maxBytes = parseByteCount(requireValue(argv, index, '--max-bytes'))
        index += 1
        break
      case '--keep-download':
        options.keepDownload = true
        break
      case '--dry-run':
        options.dryRun = true
        break
      case '--yes':
      case '-y':
        options.yes = true
        break
      default:
        throw usageError(`Unknown argument: ${argument}`)
    }
  }

  if (options.help) {
    return options
  }

  if (!options.source) {
    throw usageError('--source is required')
  }
  if (!options.target) {
    throw usageError('--target is required')
  }

  return options
}

export function parseSource(source) {
  if (source.startsWith('magnet:?')) {
    return { kind: 'magnet', value: source }
  }

  const path = resolve(source)
  if (!existsSync(path)) {
    throw new Error(`Source file does not exist: ${path}`)
  }

  const sourceStat = lstatSync(path)
  if (!sourceStat.isFile()) {
    throw new Error(`Source is not a regular file: ${path}`)
  }

  const extension = extname(path).toLowerCase()
  if (extension === '.torrent') {
    return { kind: 'torrent', path }
  }
  if (SQLITE_EXTENSIONS.has(extension)) {
    return { kind: 'sqlite', path }
  }

  throw new Error(
    `Unsupported source type: ${path}. Provide a magnet link, a .torrent file, or a SQLite file (.db, .sqlite, .sqlite3).`,
  )
}

function commandAvailable(command) {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8', stdio: 'ignore' })
  return !result.error && result.status === 0
}

function requireCommand(command, installHint) {
  if (!commandAvailable(command)) {
    throw new Error(`Required command "${command}" was not found. ${installHint}`)
  }
}

function runSqlite(file, sql) {
  const result = spawnSync('sqlite3', ['-readonly', '-batch', file, sql], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })

  if (result.error) {
    throw new Error(`Could not run sqlite3: ${result.error.message}`)
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function quoteSqliteCliFilename(file) {
  return `'${file.replaceAll("'", "''")}'`
}

function createSqliteSnapshot(source, destination) {
  const result = spawnSync(
    'sqlite3',
    ['-readonly', '-batch', source, `.backup main ${quoteSqliteCliFilename(destination)}`],
    {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    },
  )

  if (result.error) {
    throw new Error(`Could not create a SQLite snapshot: ${result.error.message}`)
  }
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || `exit code ${result.status}`
    throw new Error(`Could not create a SQLite snapshot: ${detail}`)
  }
}

export function validateSqliteFile(file, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  let fileStat
  try {
    fileStat = statSync(file)
  } catch {
    return { ok: false, reason: 'file does not exist' }
  }

  if (!fileStat.isFile()) {
    return { ok: false, reason: 'not a regular file' }
  }
  if (fileStat.size === 0) {
    return { ok: false, reason: 'file is empty' }
  }
  if (fileStat.size > maxBytes) {
    return {
      ok: false,
      reason: `file is ${fileStat.size} bytes, above the ${maxBytes}-byte limit`,
      size: fileStat.size,
    }
  }

  const result = runSqlite(file, 'PRAGMA integrity_check;')
  const integrity = result.stdout.trim().toLowerCase()
  if (result.status !== 0 || integrity !== 'ok') {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.status}`
    return { ok: false, reason: `SQLite integrity check failed: ${detail}`, size: fileStat.size }
  }

  return { ok: true, integrity: 'ok', size: fileStat.size }
}

function isInsideDirectory(directory, candidate) {
  const directoryPath = resolve(directory)
  const candidatePath = resolve(candidate)
  const relativePath = relative(directoryPath, candidatePath)
  return relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath)
}

function walkFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath))
    } else if (entry.isFile()) {
      files.push(entryPath)
    }
  }
  return files
}

function isSqliteFilename(file) {
  return SQLITE_EXTENSIONS.has(extname(file).toLowerCase())
}

export function selectSqliteCandidate(directory, { file, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  let candidates

  if (file) {
    const requested = resolve(directory, file)
    if (!isInsideDirectory(directory, requested)) {
      throw new Error(`--file must point inside the downloaded directory: ${file}`)
    }
    if (!isSqliteFilename(requested)) {
      throw new Error(`--file must name a SQLite file (.db, .sqlite, or .sqlite3): ${file}`)
    }
    candidates = [requested]
  } else {
    candidates = walkFiles(directory).filter(isSqliteFilename)
  }

  const valid = []
  const invalid = []
  for (const candidate of candidates) {
    const validation = validateSqliteFile(candidate, { maxBytes })
    if (validation.ok) {
      valid.push({ path: candidate, ...validation })
    } else {
      invalid.push({ path: candidate, reason: validation.reason })
    }
  }

  if (valid.length === 0) {
    const details = invalid.map(({ path, reason }) => `  - ${path}: ${reason}`).join('\n')
    throw new Error(
      `No valid SQLite database was found in ${directory}.${details ? `\n${details}` : ''}`,
    )
  }

  if (valid.length > 1) {
    const paths = valid.map(({ path }) => `  - ${path}`).join('\n')
    throw new Error(`More than one valid SQLite database was found. Use --file with one of:\n${paths}`)
  }

  return valid[0]
}

export function buildAria2Args(source, directory) {
  const sourceArgument = source.kind === 'magnet' ? source.value : source.path
  return [
    '--dir',
    directory,
    '--check-integrity=true',
    '--seed-time=0',
    '--bt-enable-lpd=true',
    '--summary-interval=0',
    sourceArgument,
  ]
}

function downloadWithAria2(source, directory) {
  const result = spawnSync('aria2c', buildAria2Args(source, directory), { stdio: 'inherit' })
  if (result.error) {
    throw new Error(`Could not run aria2c: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`aria2c could not download the backup (exit code ${result.status ?? 'unknown'})`)
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function defaultBackupPath(target) {
  return `${target}.backup-${timestamp()}-${randomBytes(3).toString('hex')}`
}

function syncFile(file) {
  const descriptor = openSync(file, 'r')
  try {
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

function sidecarPath(target, suffix) {
  return `${target}${suffix}`
}

export function restoreSqliteFile({
  source,
  target,
  maxBytes = DEFAULT_MAX_BYTES,
  confirmed = false,
  dryRun = false,
  backupPath,
}) {
  const sourcePath = resolve(source)
  const targetPath = resolve(target)
  const sourceValidation = validateSqliteFile(sourcePath, { maxBytes })
  if (!sourceValidation.ok) {
    throw new Error(`Refusing to restore invalid SQLite source: ${sourceValidation.reason}`)
  }

  const targetExists = existsSync(targetPath)
  if (targetExists && !lstatSync(targetPath).isFile()) {
    throw new Error(`Target is not a regular file: ${targetPath}`)
  }

  const sidecars = ['-wal', '-shm'].map((suffix) => sidecarPath(targetPath, suffix))
  const existingSidecars = sidecars.filter(existsSync)
  const hasExistingDatabaseState = targetExists || existingSidecars.length > 0
  const chosenBackupPath = backupPath ? resolve(backupPath) : defaultBackupPath(targetPath)
  const backupFiles = [chosenBackupPath, ...existingSidecars.map((sidecar) => `${chosenBackupPath}${sidecar.slice(targetPath.length)}`)]

  if (hasExistingDatabaseState && backupFiles.some(existsSync)) {
    throw new Error(`Safety backup path already exists; choose another target or remove the stale path: ${chosenBackupPath}`)
  }

  if (hasExistingDatabaseState && !confirmed && !dryRun) {
    throw new Error(`Target already exists. Re-run with --yes to replace it safely: ${targetPath}`)
  }

  if (dryRun) {
    return {
      source: sourcePath,
      target: targetPath,
      sourceBytes: sourceValidation.size,
      targetExists,
      backupPath: hasExistingDatabaseState ? chosenBackupPath : null,
      dryRun: true,
    }
  }

  mkdirSync(dirname(targetPath), { recursive: true })
  const temporaryPath = join(
    dirname(targetPath),
    `.${basename(targetPath)}.restore-${process.pid}-${randomBytes(6).toString('hex')}.tmp`,
  )
  const targetMode = targetExists ? statSync(targetPath).mode & 0o777 : 0o600
  const movedEntries = []
  let backupCreated = false

  try {
    createSqliteSnapshot(sourcePath, temporaryPath)
    chmodSync(temporaryPath, targetMode)
    syncFile(temporaryPath)

    const copiedValidation = validateSqliteFile(temporaryPath, { maxBytes })
    if (!copiedValidation.ok) {
      throw new Error(`Copied restore file failed validation: ${copiedValidation.reason}`)
    }

    if (targetExists) {
      mkdirSync(dirname(chosenBackupPath), { recursive: true })
      renameSync(targetPath, chosenBackupPath)
      movedEntries.push({ from: chosenBackupPath, to: targetPath })
      backupCreated = true
    }

    for (const sidecar of existingSidecars) {
      const sidecarBackup = `${chosenBackupPath}${sidecar.slice(targetPath.length)}`
      renameSync(sidecar, sidecarBackup)
      movedEntries.push({ from: sidecarBackup, to: sidecar })
      backupCreated = true
    }

    renameSync(temporaryPath, targetPath)
  } catch (error) {
    if (existsSync(temporaryPath)) {
      unlinkSync(temporaryPath)
    }

    for (const entry of [...movedEntries].reverse()) {
      if (existsSync(entry.from) && !existsSync(entry.to)) {
        renameSync(entry.from, entry.to)
      }
    }

    throw error
  }

  return {
    source: sourcePath,
    target: targetPath,
    sourceBytes: sourceValidation.size,
    targetExists,
    backupPath: backupCreated ? chosenBackupPath : null,
    dryRun: false,
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`
}

function printHelp() {
  console.log(`Usage:
  npm run db:restore -- --source <magnet-link|file.torrent|backup.sqlite> --target <database.sqlite> [options]

Sources:
  magnet:?…                 Download a torrent through aria2c.
  path/to/backup.torrent    Download a local torrent through aria2c.
  path/to/backup.sqlite     Restore a local SQLite file directly (useful for testing).

Options:
  --file <path>              Select a SQLite file inside a multi-file download.
  --download-dir <path>      Keep staging files in this directory instead of a temp directory.
  --keep-download            Do not remove the staging download after a successful restore.
  --max-bytes <count>        Reject SQLite files larger than this (default: 2GiB; e.g. 500MiB).
  --dry-run                  Download and validate, but do not modify the target.
  --yes, -y                  Replace an existing target without an interactive prompt.
  --help, -h                 Show this help.

Safety:
  Existing targets are moved to <target>.backup-<timestamp>-<random> before replacement.
  The incoming file is integrity-checked before and after it is copied into place.
`)
}

async function confirmReplacement(target) {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error(`Target already exists; pass --yes for a non-interactive restore: ${target}`)
  }

  const reader = createInterface({ input: stdin, output: stdout })
  try {
    const answer = await reader.question(`Replace ${target}? The current file will be backed up. [y/N] `)
    return /^y(?:es)?$/i.test(answer.trim())
  } finally {
    reader.close()
  }
}

export async function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    printHelp()
    return
  }

  requireCommand('sqlite3', 'Install SQLite command-line tools (for example: brew install sqlite).')
  const source = parseSource(options.source)
  let stagingDirectory

  try {
    let candidate
    if (source.kind === 'sqlite') {
      if (options.file) {
        throw new Error('--file is only valid for a magnet link or .torrent source')
      }
      candidate = source.path
    } else {
      requireCommand('aria2c', 'Install aria2 (for example: brew install aria2).')
      stagingDirectory = options.downloadDir
        ? resolve(options.downloadDir)
        : mkdtempSync(join(tmpdir(), 'mtg-board-sqlite-'))
      mkdirSync(stagingDirectory, { recursive: true })
      console.log(`Downloading backup into ${stagingDirectory}`)
      downloadWithAria2(source, stagingDirectory)
      candidate = selectSqliteCandidate(stagingDirectory, {
        file: options.file,
        maxBytes: options.maxBytes,
      }).path
    }

    const targetPath = resolve(options.target)
    const targetExists = existsSync(targetPath)
    if (options.dryRun) {
      const result = restoreSqliteFile({
        source: candidate,
        target: targetPath,
        maxBytes: options.maxBytes,
        dryRun: true,
      })
      console.log(`Dry run passed: ${result.source} (${formatBytes(result.sourceBytes)})`)
      console.log(`Target: ${result.target}${result.targetExists ? ' (would be replaced)' : ' (new file)'}`)
      if (result.backupPath) console.log(`Safety backup would be: ${result.backupPath}`)
      return result
    }

    let confirmed = options.yes
    if (targetExists && !confirmed) {
      confirmed = await confirmReplacement(targetPath)
      if (!confirmed) {
        throw new Error('Restore cancelled; the target was not changed.')
      }
    }

    const result = restoreSqliteFile({
      source: candidate,
      target: targetPath,
      maxBytes: options.maxBytes,
      confirmed,
    })
    console.log(`Restored ${result.target} from ${result.source} (${formatBytes(result.sourceBytes)}).`)
    if (result.backupPath) {
      console.log(`Previous database state backed up to ${result.backupPath}`)
    }
    return result
  } finally {
    if (stagingDirectory && !options.keepDownload && !options.downloadDir) {
      rmSync(stagingDirectory, { recursive: true, force: true })
    }
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMainModule) {
  run().catch((error) => {
    console.error(`SQLite restore failed: ${error.message}`)
    process.exitCode = 1
  })
}
