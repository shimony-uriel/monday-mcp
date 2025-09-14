/**
 * Monday.com standard column IDs
 * These are the standard column IDs used across Monday.com boards
 */
export const MONDAY_DEV_COLUMN_IDS = {
  TASK_STATUS: 'task_status',
  TASK_OWNER: 'task_owner',
  TASK_PRIORITY: 'task_priority',
  TASK_TYPE: 'task_type',
  TASK_ESTIMATION: 'task_estimation',
  TASK_ACTUAL_EFFORT: 'task_actual_effort',
  TASK_SPRINT: 'task_sprint',
  TASK_BUGS: 'task_bugs',
} as const;

/**
 * Type for Monday column IDs
 */
export type MondayColumnId = typeof MONDAY_DEV_COLUMN_IDS[keyof typeof MONDAY_DEV_COLUMN_IDS];
