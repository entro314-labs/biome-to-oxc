import { writeTextFileAtomically } from './fs-utils.js'
import type { MigrationReport, Reporter } from './types.js'

export async function writeReportToFile(
  report: MigrationReport,
  outputPath: string,
  reporter: Reporter,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const reportContent = `${JSON.stringify(report, null, 2)}\n`
    await writeTextFileAtomically(outputPath, reportContent, {
      ensureDirectory: true,
      signal,
    })
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
