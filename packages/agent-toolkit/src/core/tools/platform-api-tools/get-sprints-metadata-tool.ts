import { z } from 'zod';
import { GetBoardItemsWithColumnsQuery, GetBoardItemsWithColumnsQueryVariables } from '../../../monday-graphql/generated/graphql';
import { getBoardItemsWithColumns } from '../../../monday-graphql/queries.graphql';
import { ToolInputType, ToolOutputType, ToolType } from '../../tool';
import { BaseMondayApiTool, createMondayApiAnnotations } from './base-monday-api-tool';

export const getSprintsMetadataToolSchema = {
  sprintsBoardId: z.number().describe('The ID of the Monday.com board containing the sprints'),
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
    return `Get comprehensive sprint metadata from a Monday.com sprints board including:
    
## Data Retrieved:
- Sprint ID and name
- Sprint timeline (planned from/to dates)
- Sprint completion status (completed/in-progress/planned)
- Sprint start date (actual)
- Sprint end date (actual)
- Sprint activation status

## Output Format:
Returns a structured table with sprint metadata to help determine sprint status:
- **Planned**: No start date, not activated
- **In Progress**: Has start date, activated, not completed
- **Completed**: Has both start and end dates, completion checked

Use this tool to discover available sprints and their current status before analyzing them with the get_sprints_data tool.

Requires the board ID of the Monday.com board containing your sprints.`;
  }

  getInputSchema(): typeof getSprintsMetadataToolSchema {
    return getSprintsMetadataToolSchema;
  }

  protected async executeInternal(input: ToolInputType<typeof getSprintsMetadataToolSchema>): Promise<ToolOutputType<never>> {
    const variables: GetBoardItemsWithColumnsQueryVariables = {
      boardId: input.sprintsBoardId.toString(),
    };

    const res = await this.mondayApi.request<GetBoardItemsWithColumnsQuery>(getBoardItemsWithColumns, variables);
    
    const sprints = res.boards?.[0]?.items_page?.items || [];
    
    if (sprints.length === 0) {
      return {
        content: 'No sprints found in the specified board. Please verify the board ID contains sprint items.',
      };
    }

    const report = this.generateSprintsMetadataReport(sprints);
    
    return {
      content: report,
    };
  }

  private generateSprintsMetadataReport(sprints: any[]): string {
    let report = `# Sprints Metadata Report\n\n`;
    report += `Found ${sprints.length} sprints:\n\n`;
    report += `| Sprint Name | Sprint ID | Status | Timeline (Planned) | Start Date (Actual) | End Date (Actual) | Completion |\n`;
    report += `|-------------|-----------|--------|-------------------|-------------------|------------------|------------|\n`;

    sprints.forEach((sprint) => {
      const sprintName = sprint.name || 'Unknown';
      const sprintId = sprint.id;
      
      // Extract column values
      const columnValues = sprint.column_values || [];
      const getColumnValue = (columnId: string) => {
        const column = columnValues.find((cv: any) => cv.id === columnId);
        return column?.value ? JSON.parse(column.value) : null;
      };

      const sprintActivation = getColumnValue('sprint_activation');
      const sprintTimeline = getColumnValue('sprint_timeline');
      const sprintCompletion = getColumnValue('sprint_completion');
      const sprintStartDate = getColumnValue('sprint_start_date');
      const sprintEndDate = getColumnValue('sprint_end_date');

      // Determine status
      let status = 'Planned';
      if (sprintCompletion?.checked) {
        status = 'Completed';
      } else if (sprintActivation?.checked || sprintStartDate) {
        status = 'In Progress';
      }

      // Format timeline
      const timeline = sprintTimeline 
        ? `${sprintTimeline.from} to ${sprintTimeline.to}`
        : 'Not set';

      // Format dates
      const startDate = sprintStartDate?.date || 'Not started';
      const endDate = sprintEndDate?.date || 'Not ended';
      const completion = sprintCompletion?.checked ? 'Yes' : 'No';

      report += `| ${sprintName} | ${sprintId} | ${status} | ${timeline} | ${startDate} | ${endDate} | ${completion} |\n`;
    });

    report += `\n## Status Definitions:\n`;
    report += `- **Planned**: Sprint not yet started (no activation, no start date)\n`;
    report += `- **In Progress**: Sprint is active (activated or has start date, but not completed)\n`;
    report += `- **Completed**: Sprint is finished (completion checkbox is checked)\n\n`;
    report += `Use the Sprint IDs with the get_sprints_data tool for detailed sprint analysis.`;

    return report;
  }
}

