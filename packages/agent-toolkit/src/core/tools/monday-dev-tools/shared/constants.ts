/**
 * Shared constants for Monday Dev tools
 */

// Required columns for sprint boards
export const REQUIRED_SPRINT_COLUMNS = {
  SPRINT_ACTIVATION: 'sprint_activation',
  SPRINT_TIMELINE: 'sprint_timeline', 
  SPRINT_COMPLETION: 'sprint_completion',
  SPRINT_START_DATE: 'sprint_start_date',
  SPRINT_END_DATE: 'sprint_end_date',
  SPRINT_SUMMARY: 'sprint_summary',
} as const;

// Error message prefixes (following project standards)
export const ERROR_PREFIXES = {
  BOARD_NOT_FOUND: 'BOARD_NOT_FOUND:',
  SPRINT_NOT_FOUND: 'SPRINT_NOT_FOUND:',
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND:',
  DOCUMENT_INVALID: 'DOCUMENT_INVALID:',
  DOCUMENT_EMPTY: 'DOCUMENT_EMPTY:',
  EXPORT_FAILED: 'EXPORT_FAILED:',
  INTERNAL_ERROR: 'INTERNAL_ERROR:',
  VALIDATION_ERROR: 'VALIDATION_ERROR:',
  SNAPSHOT_ERROR: 'SNAPSHOT_ERROR:',
} as const;

// Default limits
export const DOCS_LIMIT =   1

// Document ID extraction fields
export const DOCUMENT_ID_FIELDS = [
  'objectId',
  'doc_id', 
  'docId',
] as const;

// Sprint column display names
export const SPRINT_COLUMN_DISPLAY_NAMES = {
  [REQUIRED_SPRINT_COLUMNS.SPRINT_ACTIVATION]: 'Sprint Activation',
  [REQUIRED_SPRINT_COLUMNS.SPRINT_TIMELINE]: 'Sprint Timeline',
  [REQUIRED_SPRINT_COLUMNS.SPRINT_COMPLETION]: 'Sprint Completion',
  [REQUIRED_SPRINT_COLUMNS.SPRINT_START_DATE]: 'Sprint Start Date',
  [REQUIRED_SPRINT_COLUMNS.SPRINT_END_DATE]: 'Sprint End Date',
  [REQUIRED_SPRINT_COLUMNS.SPRINT_SUMMARY]: 'Sprint Summary',
} as const;

// Sprint status values
export const SPRINT_STATUS = {
  PLANNED: 'Planned',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
} as const;