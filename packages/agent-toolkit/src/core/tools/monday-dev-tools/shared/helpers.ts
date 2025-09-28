/**
 * Shared helper functions for Monday Dev tools
 */

import { Item as BoardItem, ColumnValue } from '../../../../monday-graphql/generated/graphql';
import { DOCUMENT_ID_FIELDS, REQUIRED_SPRINT_COLUMNS, SPRINT_COLUMN_DISPLAY_NAMES } from './constants';

/**
 * Find a column value by ID in a board item
 */
export function findColumnValue(item: BoardItem, columnId: string): ColumnValue | undefined {
  return item.column_values?.find((cv: ColumnValue) => cv.id === columnId);
}

/**
 * Find a board item by ID in the items array
 */
export function findItemById(items: BoardItem[], itemId: string): BoardItem | null {
  return items.find((item) => item.id === itemId) || null;
}

/**
 * Get column value by ID from board item
 */
export function getColumnValue(item: BoardItem, columnId: string): any {
  const column = item.column_values?.find((cv) => cv.id === columnId);
  return column?.value;
}

/**
 * Parse column value from raw string data
 * @param rawValue - The raw value to parse (can be any type)
 * @param columnValueName - Optional name of the column for better error messages
 * @returns Parsed JSON object or null if rawValue is not a valid string
 * @throws Error if JSON parsing fails
 */
export const parseColumnValue = (rawValue: any, columnValueName?: string) => {
        try {
          return rawValue && typeof(rawValue) === 'string' && rawValue.length > 0 ? JSON.parse(rawValue) : null;
        } catch (parseError) {
          if (columnValueName) {
            throw new Error(`Failed to parse column value '${columnValueName}': ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`);
          }
          throw new Error(`Failed to parse column value: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`);
        }
      };

/**
 * Extract document object ID from column value
 * By default,in multiple files column, the first file in the files array is returned
 */
export function extractDocumentObjectId(columnValue: any): string | null {
  if (!columnValue || typeof columnValue !== 'object') return null;
  
  // Check for document ID in various possible fields
  for (const field of DOCUMENT_ID_FIELDS) {
    if (columnValue[field]) {
      return columnValue[field];
    }
  }
  
  // Check in files array
  if (columnValue.files && Array.isArray(columnValue.files) && columnValue.files.length > 0) {
    const firstFile = columnValue.files[0];
    for (const field of DOCUMENT_ID_FIELDS) {
      if (firstFile[field]) {
        return firstFile[field];
      }
    }
  }
  
  return null;
}

/**
 * Get display name for sprint column ID
 */
export function getSprintColumnDisplayName(columnId: keyof typeof SPRINT_COLUMN_DISPLAY_NAMES): string {
  return SPRINT_COLUMN_DISPLAY_NAMES[columnId] || columnId;
}

/**
 * Validate sprint board schema
 */
export function validateSprintsBoardSchema
(boardColumns: ColumnValue[]): { isValid: boolean; errorMessage: string } {
  const existingColumnIds = new Set(boardColumns.map((col: ColumnValue) => col.id));
  
  const missingColumns: string[] = [];
  const requiredColumns = Object.values(REQUIRED_SPRINT_COLUMNS);
  
  for (const columnId of requiredColumns) {
    if (!existingColumnIds.has(columnId)) {
      missingColumns.push(columnId);
    }
  }
  
  if (missingColumns.length > 0) {
    let errorMessage = `BoardID provided is not a valid sprint board. Missing required columns:\n\n`;
    
    missingColumns.forEach(columnId => {
      const columnDisplayName = getSprintColumnDisplayName(columnId as keyof typeof SPRINT_COLUMN_DISPLAY_NAMES);
      errorMessage += `- ${columnDisplayName} (column ID: ${columnId})\n`;
    });
    
    errorMessage += `\nPlease ensure you're using the correct sprint board ID that contains all required sprint columns.`;
    
    return { isValid: false, errorMessage };
  }
  
  return { isValid: true, errorMessage: '' };
}