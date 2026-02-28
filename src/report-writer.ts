import { writeFileSync } from 'node:fs'

import  { type MigrationReport, type Reporter } from './types.js'

export function writeReportToFile(
  report: MigrationReport,
  outputPath: string,
  reporter: Reporter,
): void {
  try {
    const reportContent = JSON.stringify(report, null, 2)
    writeFileSync(outputPath, reportContent, 'utf-8')
    reporter.info(`Migration report written to: ${outputPath}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    reporter.error(`Failed to write migration report: ${message}`)
  }
}

export function enhanceReportWithSuggestions(
  report: MigrationReport,
  suggestions: string[],
): MigrationReport {
  return {
    ...report,
    suggestions: [...report.suggestions, ...suggestions],
  }
}
