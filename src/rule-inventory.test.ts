import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  getMappedBiomeRuleNames,
  getMappedOxlintRuleNames,
  UNVERIFIED_BIOME_RULE_NAMES,
} from './rule-mapper.js'

/**
 * The TSV inventories under docs/ are the record of what the tools on each side of the
 * migration actually ship, regenerated from their schemas by `pnpm docs:sync`. Asserting
 * the rule map against them turns that record into a check, so a mapping can never point
 * at a rule Oxlint does not have, nor key off a Biome rule that does not exist.
 */
async function readInventory(fileName: string): Promise<string[][]> {
  const content = await readFile(join(process.cwd(), 'docs', fileName), 'utf-8')

  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split('\t').map((cell) => cell.trim()))
}

async function readOxlintRuleInventory(): Promise<Set<string>> {
  const rows = await readInventory('oxlint-rules.tsv')

  // The inventory lists rule and plugin separately; configs use `plugin/rule`, except
  // for the built-in `eslint` plugin, whose rules are referenced bare.
  return new Set(
    rows
      .filter(([rule, plugin]) => rule && plugin)
      .map(([rule, plugin]) => (plugin === 'eslint' ? (rule as string) : `${plugin}/${rule}`)),
  )
}

async function readBiomeRuleInventory(): Promise<Set<string>> {
  const [header, ...rows] = await readInventory('biome-rules.tsv')

  expect(header).toEqual(['rule', 'group'])

  return new Set(rows.map(([rule]) => rule as string))
}

describe('rule inventory conformance', () => {
  it('maps only rules that the Oxlint inventory lists', async () => {
    const inventory = await readOxlintRuleInventory()
    const unknownRules = getMappedOxlintRuleNames().filter((rule) => !inventory.has(rule))

    expect(unknownRules).toEqual([])
  })

  it('keys only off Biome rules the inventory lists, or a documented exception', async () => {
    const inventory = await readBiomeRuleInventory()
    const allowed = new Set<string>(UNVERIFIED_BIOME_RULE_NAMES)
    const unknownRules = getMappedBiomeRuleNames().filter(
      (rule) => !inventory.has(rule) && !allowed.has(rule),
    )

    expect(unknownRules).toEqual([])
  })

  it('does not carry exceptions for Biome rules that the inventory now lists', async () => {
    const inventory = await readBiomeRuleInventory()
    const staleExceptions = UNVERIFIED_BIOME_RULE_NAMES.filter((rule) => inventory.has(rule))

    expect(staleExceptions).toEqual([])
  })

  it('reads non-trivial inventories, so an empty file cannot make the checks vacuous', async () => {
    expect((await readOxlintRuleInventory()).size).toBeGreaterThan(500)
    expect((await readBiomeRuleInventory()).size).toBeGreaterThan(300)
    expect(getMappedOxlintRuleNames().length).toBeGreaterThan(300)
    expect(getMappedBiomeRuleNames().length).toBeGreaterThan(300)
  })
})
