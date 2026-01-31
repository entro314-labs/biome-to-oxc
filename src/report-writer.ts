import { writeFileSync } from 'node:fs';
import type { MigrationReport, Reporter } from './types.js';

export function writeReportToFile(
  report: MigrationReport,
  outputPath: string,
  reporter: Reporter,
): void {
  try {
    const reportContent = JSON.stringify(report, null, 2);
    writeFileSync(outputPath, reportContent, 'utf-8');
    reporter.info(`Migration report written to: ${outputPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reporter.error(`Failed to write migration report: ${message}`);
  }
}

export function enhanceReportWithSuggestions(
  report: MigrationReport,
  suggestions: string[],
): MigrationReport {
  return {
    ...report,
    suggestions: [...report.suggestions, ...suggestions],
  };
}
