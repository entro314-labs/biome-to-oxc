import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { acquireMigrationLock, MigrationLockedError } from './migration-lock.js'
import { CollectingReporter } from './reporter.js'

const LOCK_FILE = '.biome-to-oxc.lock'

async function makeProjectDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'biome-to-oxc-lock-'))
}

describe('acquireMigrationLock', () => {
  it('writes and removes a lock file around a migration', async () => {
    const dir = await makeProjectDir()
    const reporter = new CollectingReporter()

    const lock = await acquireMigrationLock(dir, reporter)
    const record = JSON.parse(await readFile(join(dir, LOCK_FILE), 'utf-8')) as { pid: number }

    expect(record.pid).toBe(process.pid)

    await lock.release()

    await expect(readFile(join(dir, LOCK_FILE), 'utf-8')).rejects.toThrow(/ENOENT/u)
  })

  it('refuses to start while another live process holds the lock', async () => {
    const dir = await makeProjectDir()
    const reporter = new CollectingReporter()

    // A different pid that is definitely alive: this test process's parent runner.
    await writeFile(
      join(dir, LOCK_FILE),
      JSON.stringify({ pid: process.ppid, startedAt: Date.now() }),
      'utf-8',
    )

    await expect(acquireMigrationLock(dir, reporter)).rejects.toThrow(MigrationLockedError)
  })

  it('reclaims a lock left behind by a crashed process', async () => {
    const dir = await makeProjectDir()
    const reporter = new CollectingReporter()
    const staleTimestamp = Date.now() - 60 * 60 * 1000

    await writeFile(
      join(dir, LOCK_FILE),
      JSON.stringify({ pid: process.ppid, startedAt: staleTimestamp }),
      'utf-8',
    )

    const lock = await acquireMigrationLock(dir, reporter)

    expect(reporter.getWarnings().some((warning) => warning.includes('stale migration lock'))).toBe(
      true,
    )

    await lock.release()
  })

  it('does not delete a lock that was reclaimed by someone else', async () => {
    const dir = await makeProjectDir()
    const reporter = new CollectingReporter()

    const lock = await acquireMigrationLock(dir, reporter)
    await writeFile(
      join(dir, LOCK_FILE),
      JSON.stringify({ pid: 999_999, startedAt: Date.now() }),
      'utf-8',
    )

    await lock.release()

    const record = JSON.parse(await readFile(join(dir, LOCK_FILE), 'utf-8')) as { pid: number }
    expect(record.pid).toBe(999_999)
  })
})
