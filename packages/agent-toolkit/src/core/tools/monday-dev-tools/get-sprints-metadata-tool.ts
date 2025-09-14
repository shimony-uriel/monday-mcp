import { z } from 'zod';
import { GetBoardItemsWithColumnsQuery, GetBoardItemsWithColumnsQueryVariables } from '../../../monday-graphql/generated/graphql';
import { getBoardItemsWithColumns } from '../../../monday-graphql/queries.graphql';
import { ToolInputType, ToolOutputType, ToolType } from '../../tool';
import { BaseMondayApiTool, createMondayApiAnnotations } from '../platform-api-tools/base-monday-api-tool';
import { REQUIRED_SPRINT_COLUMNS, extractDocumentObjectId, validateSprintBoardSchema, getColumnDisplayName, getColumnValue, SPRINT_STATUS, parseColumnValue } from './shared';

export const getSprintsMetadataToolSchema = {
  sprintsBoardId: z.number().describe('The ID of the monday-dev board containing the sprints'),
};

export class GetSprintsMetadataTool extends BaseMondayApiTool<typeof getSprintsMetadataToolSchema> {
  name = 'get_sprints_metadata';
  type = ToolType.READ;
  annotations = createMondayApiAnnotations({
    title: 'Get Sprints Metadata',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  });

  getDescription(): string {
    return `Get comprehensive sprint metadata from a monday-dev sprints board including:

## 🎯 Primary Use Cases:
- **Understand Sprint Status**: Determine if a sprint is planned, in-progress, or completed
- **Sprint Name ↔ Sprint ID Mapping**: Find sprint IDs when you only have sprint names (essential for other sprint tools)

## Data Retrieved:
- Sprint ID
- Sprint Name
- Sprint timeline (planned from/to dates)
- Sprint completion status (completed/in-progress/planned)
- Sprint start date (actual)
- Sprint end date (actual)
- Sprint activation status
- Sprint summary document object ID

## Output Format:
Returns a structured table with sprint metadata to help determine sprint status:
- **Planned**: No start date, not activated
- **In Progress**: Has start date, activated, not completed
- **Completed**: Has both start and end dates, completion checked

## 🔗 Integration with Other Monday Dev Tools:
- use this tool first if you only have sprint names but need sprint IDs for other sprint tools
- use this tool first if you need summary document object id of a sprint

Requires the Main Sprints board ID of the Monday dev containing your sprints.`;
  }

  getInputSchema(): typeof getSprintsMetadataToolSchema {
    return getSprintsMetadataToolSchema;
  }

  protected async executeInternal(input: ToolInputType<typeof getSprintsMetadataToolSchema>): Promise<ToolOutputType<never>> {
    const variables: GetBoardItemsWithColumnsQueryVariables = {
      boardId: input.sprintsBoardId.toString(),
    };

    const res = await this.mondayApi.request<GetBoardItemsWithColumnsQuery>(getBoardItemsWithColumns, variables);
    
    // Validate board exists
    const board = res.boards?.[0];
    if (!board) {
      return {
        content: `Board with ID ${input.sprintsBoardId} not found. Please verify the board ID is correct and you have access to it.`,
      };
    }

    // Validate board schema has required sprint columns
        const sprints = board.items_page?.items || [];

    const schemaValidation = validateSprintBoardSchema(sprints[0]?.column_values);
    if (!schemaValidation.isValid) {
      return {
        content: schemaValidation.errorMessage,
      };
    }

    
    if (sprints.length === 0) {
      return {
        content: `Board ID: ${input.sprintsBoardId} has the correct sprint schema but contains no items. Please add sprint items to this board.`,
      };
    }

    const report = this.generateSprintsMetadataReport(sprints);
    
    return {
      content: report,
    };
  }     


  private generateSprintsMetadataReport(sprints: any[]): string {
    let report = `# Sprints Metadata Report\n\n`;
    report += `**Total Sprints:** ${sprints.length}\n\n`;
    report += `| Sprint Name | Sprint ID | Status | Timeline (Planned) | Start Date (Actual) | End Date (Actual) | Completion | Summary Document ObjectID |\n`;
    report += `|-------------|-----------|--------|-------------------|-------------------|------------------|------------|---------------------------|\\n`;

    sprints.forEach((sprint) => {
      const sprintName = sprint.name || 'Unknown';
      const sprintId = sprint.id;
      

      const sprintActivation = parseColumnValue(getColumnValue(sprint, REQUIRED_SPRINT_COLUMNS.SPRINT_ACTIVATION), REQUIRED_SPRINT_COLUMNS.SPRINT_ACTIVATION);
      const sprintTimeline = parseColumnValue(getColumnValue(sprint, REQUIRED_SPRINT_COLUMNS.SPRINT_TIMELINE), REQUIRED_SPRINT_COLUMNS.SPRINT_TIMELINE);
      const sprintCompletion = parseColumnValue(getColumnValue(sprint, REQUIRED_SPRINT_COLUMNS.SPRINT_COMPLETION), REQUIRED_SPRINT_COLUMNS.SPRINT_COMPLETION);
      const sprintStartDate = parseColumnValue(getColumnValue(sprint, REQUIRED_SPRINT_COLUMNS.SPRINT_START_DATE), REQUIRED_SPRINT_COLUMNS.SPRINT_START_DATE);
      const sprintEndDate = parseColumnValue(getColumnValue(sprint, REQUIRED_SPRINT_COLUMNS.SPRINT_END_DATE), REQUIRED_SPRINT_COLUMNS.SPRINT_END_DATE);
      const sprintSummary = parseColumnValue(getColumnValue(sprint, REQUIRED_SPRINT_COLUMNS.SPRINT_SUMMARY), REQUIRED_SPRINT_COLUMNS.SPRINT_SUMMARY);

      // Determine status
      let status: string = SPRINT_STATUS.PLANNED;
      if (sprintCompletion?.checked) {
        status = SPRINT_STATUS.COMPLETED;
      } else if (sprintActivation?.checked || sprintStartDate) {
        status = SPRINT_STATUS.IN_PROGRESS;
      }

      // Format timeline
      const timeline = sprintTimeline 
        ? `${sprintTimeline.from} to ${sprintTimeline.to}`
        : 'Not set';

      // Format dates
      const startDate = sprintStartDate?.date || 'Not started';
      const endDate = sprintEndDate?.date || 'Not ended';
      const completion = sprintCompletion?.checked ? 'Yes' : 'No';
      
      // Extract document object ID from sprint summary column
      const documentObjectId = extractDocumentObjectId(sprintSummary) || 'No document';

      report += `| ${sprintName} | ${sprintId} | ${status} | ${timeline} | ${startDate} | ${endDate} | ${completion} | ${documentObjectId} |\n`;
    });

    report += `\n## Status Definitions:\n`;
    report += `- **${SPRINT_STATUS.PLANNED}**: Sprint not yet started (no activation, no start date)\n`;
    report += `- **${SPRINT_STATUS.IN_PROGRESS}**: Sprint is active (activated or has start date, but not completed)\n`;
    report += `- **${SPRINT_STATUS.COMPLETED}**: Sprint is finished (completion checkbox is checked)\n\n`;


    return report;
  }
}

