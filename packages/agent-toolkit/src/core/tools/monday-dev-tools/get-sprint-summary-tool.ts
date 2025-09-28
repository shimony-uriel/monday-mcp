import { z } from 'zod';
import { ToolInputType, ToolOutputType, ToolType } from '../../tool';
import { BaseMondayApiTool, createMondayApiAnnotations } from '../platform-api-tools/base-monday-api-tool';
import { 
  GetBoardItemsWithColumnsQuery,
  GetBoardItemsWithColumnsQueryVariables,
  ReadDocsQuery,
  ReadDocsQueryVariables,
  ExportMarkdownFromDocMutation,
  ExportMarkdownFromDocMutationVariables,
  ColumnValue,
} from '../../../monday-graphql/generated/graphql';
import {
  getBoardItemsWithColumns as getSprintBoardItems,
  readDocs as readSprintSummaryDocs,
  exportMarkdownFromDoc as exportSprintSummaryMarkdown,
} from '../../../monday-graphql/queries.graphql';
import { Item as BoardItem } from '../../../monday-graphql/generated/graphql';
import {
  ERROR_PREFIXES,
  REQUIRED_SPRINT_COLUMNS,
  DOCS_LIMIT,
  extractDocumentObjectId,
  findItemById,
  getColumnValue,
  parseColumnValue,
  validateSprintsBoardSchema,
} from './shared';

export const getSprintSummaryToolSchema = {
  sprintId: z
    .string()
    .describe('The ID of the specific sprint to get the summary for (e.g., "9526510589")'),
  sprintsBoardId: z
    .string()
    .describe('The ID of the monday-dev board containing the sprints'),
};

export class GetSprintSummaryTool extends BaseMondayApiTool<typeof getSprintSummaryToolSchema> {
  name = 'get_sprint_summary';
  type = ToolType.READ;
  annotations = createMondayApiAnnotations({
    title: 'Get Sprint Summary',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  });

  getDescription(): string {
    return ` monday-dev: Get the complete summary and analysis of a sprint.

## Purpose:
Unlock deep insights into sprint performance. 
This tool retrieves comprehensive sprint summary documents that enable deep dive into sprint performance metrics, velocity forecasting, compleation rates, and scope management.

## What This Tool Returns:
The complete sprint summary content including:
- **Velocity & Performance**: Task completion rates, story points analysis distributed by developer or team
- **Scope Management**: Analysis of planned vs. unplanned tasks, scope creep
- **Team Performance**: Individual velocity, workload distribution per team member
- **Task Distribution**: Breakdown of completed tasks by type (Feature, Bug, Tech Debt, Infrastructure, etc.)
- **AI Recommendations**: Action items, process improvements, retrospective focus areas


## Requirements:
- Sprint must have an AI summary document (sprints started after 1/1/2025)
- Summary document must exist in the sprint_summary column


## Important Note:
When viewing task distribution by owner in section "Completed by Assignee", you'll see user IDs in the format "@12345678". the 8 digits after the @is the user ID. To retrieve the actual owner names, use the list_users_and_teams tool with the user ID and set includeTeams=false for optimal performance.

`;
  }

  getInputSchema(): typeof getSprintSummaryToolSchema {
    return getSprintSummaryToolSchema;
  }

  protected async executeInternal(input: ToolInputType<typeof getSprintSummaryToolSchema>): Promise<ToolOutputType<never>> {
    try {
      // Step 1: Get the sprint metadata to find the summary document object ID
      const sprintMetadata = await this.getSprintMetadata(input.sprintsBoardId, input.sprintId);
      if (!sprintMetadata.success) {
        return { content: sprintMetadata.error || `${ERROR_PREFIXES.INTERNAL_ERROR} Unknown error occurred while getting sprint metadata` };
      }

      // Step 2: Read the document content using the object ID
      const documentContent = await this.readSprintSummaryDocument(sprintMetadata.documentObjectId!);
      if (!documentContent.success) {
        return { content: documentContent.error || `${ERROR_PREFIXES.INTERNAL_ERROR} Unknown error occurred while reading document content` };
      }

      return {
        content: documentContent.content!,
      };
    } catch (error) {
      return {
        content: `${ERROR_PREFIXES.INTERNAL_ERROR} Error retrieving sprint summary: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Gets sprint metadata and extracts the summary document object ID
   */
  private async getSprintMetadata(sprintsBoardId: string, sprintId: string): Promise<any> {
    try {
      const variables: GetBoardItemsWithColumnsQueryVariables = {
        boardId: sprintsBoardId.toString(),
      };

      const res = await this.mondayApi.request<GetBoardItemsWithColumnsQuery>(getSprintBoardItems, variables);
      
      const board = res.boards?.[0];
      if (!board) {
        return {
          success: false,
          error: `${ERROR_PREFIXES.BOARD_NOT_FOUND} Board with ID ${sprintsBoardId} not found. Please verify the board ID is correct and you have access to it.`,
        };
      }

      // Validate board schema has required sprint columns
      const sprints = board.items_page?.items || [];
      if (sprints.length > 0) {
        const schemaValidation = validateSprintsBoardSchema(sprints[0]?.column_values as ColumnValue[]);
        if (!schemaValidation.isValid) {
          return {
            success: false,
            error: `${ERROR_PREFIXES.VALIDATION_ERROR} ${schemaValidation.errorMessage}`,
          };
        }
      }
      
      if (sprints.length === 0) {
        return {
          success: false,
          error: `${ERROR_PREFIXES.BOARD_NOT_FOUND} No sprints found in the specified board. Please verify the board ID contains sprint items.`,
        };
      }

      // Find the specific sprint
      const sprint = findItemById(sprints as BoardItem[], sprintId);
      
      if (!sprint) {
        return {
          success: false,
          error: `${ERROR_PREFIXES.SPRINT_NOT_FOUND} Sprint with ID ${sprintId} not found in board ${sprintsBoardId}. Please verify the sprint ID is correct.`,
        };
      }

      // Get sprint summary column value
      const summaryColumnValue = getColumnValue(sprint, REQUIRED_SPRINT_COLUMNS.SPRINT_SUMMARY);
      
      if (!summaryColumnValue) {
        return {
          success: false,
          error: `${ERROR_PREFIXES.DOCUMENT_NOT_FOUND} No sprint summary document found for sprint "${sprint.name}" (ID: ${sprintId}). Sprint summary is only available for completed sprints that have analysis documents.`,
        };
      }

      // Extract document object ID
      const sprintSummary = parseColumnValue(summaryColumnValue, REQUIRED_SPRINT_COLUMNS.SPRINT_SUMMARY);
      const documentObjectId = extractDocumentObjectId(sprintSummary);
      
      if (!documentObjectId) {
        return {
          success: false,
          error: `${ERROR_PREFIXES.DOCUMENT_INVALID} Sprint summary document exists but document object ID not found for sprint "${sprint.name}" (ID: ${sprintId}).
          ${summaryColumnValue}`,
        };
      }

      return {
        success: true,
        documentObjectId,
        sprintName: sprint.name,
      };
    } catch (error) {
      return {
        success: false,
        error: `${ERROR_PREFIXES.INTERNAL_ERROR} Error getting sprint metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Reads the sprint summary document content
   */
  private async readSprintSummaryDocument(documentObjectId: string): Promise<any> {
    try {
      // First, get the document metadata
      const readDocsVariables: ReadDocsQueryVariables = {
        object_ids: [documentObjectId],
        limit: DOCS_LIMIT,
      };

      const docsResponse = await this.mondayApi.request<ReadDocsQuery>(readSprintSummaryDocs, readDocsVariables);
      
      const docs = docsResponse.docs || [];
      if (docs.length === 0) {
        return {
          success: false,
          error: `${ERROR_PREFIXES.DOCUMENT_NOT_FOUND} Document with object ID ${documentObjectId} not found or not accessible.`,
        };
      }

      const doc = docs[0];
      if (!doc || !doc.id) {
        return {
          success: false,
          error: `${ERROR_PREFIXES.DOCUMENT_INVALID} Document data is invalid for object ID ${documentObjectId}.`,
        };
      }
      
      // Export the document content as markdown
      const exportVariables: ExportMarkdownFromDocMutationVariables = {
        docId: doc.id,
        blockIds: [], // Empty array to get all blocks
      };

      const exportResponse = await this.mondayApi.request<ExportMarkdownFromDocMutation>(
        exportSprintSummaryMarkdown, 
        exportVariables
      );

      if (!exportResponse.export_markdown_from_doc?.success) {
        return {
          success: false,
          error: `${ERROR_PREFIXES.EXPORT_FAILED} Failed to export markdown from document: ${exportResponse.export_markdown_from_doc?.error || 'Unknown error'}`,
        };
      }

      const markdown = exportResponse.export_markdown_from_doc.markdown;
      if (!markdown) {
        return {
          success: false,
          error: `${ERROR_PREFIXES.DOCUMENT_EMPTY} Document content is empty or could not be retrieved.`,
        };
      }

      return {
        success: true,
        content: markdown,
      };
    } catch (error) {
      return {
        success: false,
        error: `${ERROR_PREFIXES.INTERNAL_ERROR} Error reading document: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
