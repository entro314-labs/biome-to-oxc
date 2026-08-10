import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { getMappedOxlintRuleNames } from './rule-mapper.js'

/**
 * The TSV inventories under docs/ are the record of what the target tools actually ship.
 * Asserting the rule map against them turns that record into a check, so a mapping can
 * never point at a rule Oxlint does not have.
 */
async function readOxlintRuleInventory(): Promise<Set<string>> {
  const content = await readFile(join(process.cwd(), 'docs', 'oxlint-rules.tsv'), 'utf-8')
  const names = new Set<string>()

  for (const line of content.split('\n')) {
    const [rule, plugin] = line.split('\t')

    if (!rule || !plugin) {
      continue
    }

    // The inventory lists rule and plugin separately; configs use `plugin/rule`, except
    // for the built-in `eslint` plugin, whose rules are referenced bare.
    names.add(plugin.trim() === 'eslint' ? rule.trim() : `${plugin.trim()}/${rule.trim()}`)
  }

  return names
}

describe('rule inventory conformance', () => {
  it('maps only rules that the Oxlint inventory lists', async () => {
    const inventory = await readOxlintRuleInventory()
    const unknownRules = getMappedOxlintRuleNames().filter((rule) => !inventory.has(rule))

    expect(unknownRules).toEqual([])
  })

  it('reads a non-trivial inventory, so an empty file cannot make the check vacuous', async () => {
    const inventory = await readOxlintRuleInventory()

    expect(inventory.size).toBeGreaterThan(500)
    expect(getMappedOxlintRuleNames().length).toBeGreaterThan(300)
  })
})
