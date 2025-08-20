import { z } from 'zod';
import { GetSprintsQuery, GetSprintsQueryVariables } from '../../../monday-graphql/generated/graphql';
import { getSprints } from '../../../monday-graphql/queries.graphql';
import { ToolInputType, ToolOutputType, ToolType } from '../../tool';
import { BaseMondayApiTool, createMondayApiAnnotations } from './base-monday-api-tool';

export const getSprintsToolSchema = {
  sprintIds: z.array(z.string()).describe('Array of sprint IDs to analyze (required)'),
};

export class GetSprintsDataTool extends BaseMondayApiTool<typeof getSprintsToolSchema> {
  name = 'get_sprints_data';
  type = ToolType.READ;
  annotations = createMondayApiAnnotations({
    title: 'Analyze Sprint Data',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  });

  getDescription(): string {
    return `Retrieve raw sprint data from Monday Dev's sprints. This tool returns structured sprint snapshots that you can use to perform your own analysis.

## ⚠️ Important Usage Tip:
When requesting multiple sprints, the tool may fail due to large data size. If you encounter errors with multiple sprint IDs, call the tool **one sprint at a time** for better reliability:
- ✅ Recommended: Call with single sprint ID: ["9526510589"]
- ⚠️ May fail: Call with multiple IDs: ["9526510589", "9460102857", "9339512331"]

## Data Structure:
Returns start and end snapshots for each sprint with item details including:
- Item ID, owner, Done/Not Done status, and story points
- Sprint metadata (dates, state, timeline)
- Snapshot dates for both start and end

## How to Perform Analysis:

### 1. Velocity Calculation:
- **Sprint Velocity**: Count items completed during sprint (done in end but NOT in start) / sprint duration in days
- **Owner Velocity**: Count items completed per owner during sprint / sprint duration in days  
- **Story Points Velocity**: Sum story points of newly completed items / sprint duration

### 2. Planned vs Unplanned vs Removed Items:
- **Commitment**: Number of not done items in start snapshot
- **Planned Items**: Items present in start snapshot (compare Item IDs)
- **Unplanned Items**: Items with Item IDs that exist in end snapshot but NOT in start snapshot
- **Removed Items**: Items with Item IDs that exist in start snapshot but NOT in end snapshot
- **Scope Change %**: (Unplanned + Removed items) / Start items * 100
- **Important**: Compare actual Item IDs between snapshots, not just total counts

### 3. Owner Performance Breakdown:
- Group items by owner ID from task_owner column
- Calculate completion rate per owner: items completed during sprint / total items assigned * 100
- Calculate story points completion per owner (only newly completed items)
- Use get_users_by_ids tool to convert owner IDs to readable names

### 4. Completion Rate Calculation:
- **Sprint Work Completed**: Count items that became "done" during sprint (done in end snapshot but NOT done in start snapshot)
- **Task Completion Rate**: Sprint work completed / total items * 100
- **Story Points Completion Rate**: Story points of newly completed items / total story points * 100
- **Important**: Ignore items already marked "done" in start snapshot when calculating sprint completion

### 5. Estimation Accuracy:
- Compare planned story points (start snapshot) vs actual completion
- Calculate estimation coverage: items with estimates / total items * 100
- Track estimation changes between start and end snapshots

## Data Fields:
- **task_owner**: Contains personsAndTeams array with owner IDs
- **task_status**: Contains status index and metadata
- **task_estimation**: Contains story points (number value)

## Usage:
1. Use get_sprints_metadata tool to discover available sprint IDs and their status
2. Call this tool with sprint IDs to get raw data (⚠️ **one sprint at a time** for large datasets)
3. Use get_users_by_ids tool to convert owner IDs to names
4. Perform your own analysis using the guidelines above

## Best Practices:
- For multiple sprints: Make separate calls for each sprint ID
- For single sprint analysis: Can safely use one sprint ID
- If you get "Internal Server Error": Try calling with individual sprint IDs instead`;
  }

  getInputSchema(): typeof getSprintsToolSchema {
    return getSprintsToolSchema;
  }

  protected async executeInternal(input: ToolInputType<typeof getSprintsToolSchema>): Promise<ToolOutputType<never>> {
    const variables: GetSprintsQueryVariables = {
      sprintIds: input.sprintIds,
    };

    const res = await this.mondayApi.request<GetSprintsQuery>(getSprints, variables);
    
    if (!res.sprints || res.sprints.length === 0) {
      return {
        content: 'No sprint data found for the provided sprint IDs. Please verify the sprint IDs are correct.',
      };
    }

    const report = this.generateRawDataReport(res.sprints);
    
    return {
      content: report,
    };
  }

  private generateRawDataReport(sprints: any[]): string {
    let report = `# Sprint Raw Data Report\n\n`;
    
    sprints.forEach((sprint, index) => {
      if (!sprint) return;
      
      const startSnapshot = sprint.snapshots?.find((s: any) => s.type === 'START');
      const endSnapshot = sprint.snapshots?.find((s: any) => s.type === 'COMPLETE');
      
      report += `## Sprint: ${sprint.name || `Sprint ${sprint.id}`}\n\n`;
      report += `**Sprint ID:** ${sprint.id}\n`;
      report += `**State:** ${sprint.state}\n`;
      report += `**Start Date:** ${sprint.start_date || 'Not started'}\n`;
      report += `**End Date:** ${sprint.end_date || 'Not completed'}\n`;
      
      if (sprint.timeline) {
        report += `**Planned Timeline:** ${sprint.timeline.from || 'N/A'} to ${sprint.timeline.to || 'N/A'}\n`;
      }
      
      // Start Snapshot (Commitment)
      if (startSnapshot?.items) {
        const statusMetadata = startSnapshot.columns_metadata?.find((meta: any) => meta.id === 'task_status');
        const doneIndexes = statusMetadata?.done_status_indexes || [];
        
        report += `\n### Start Sprint Snapshot (Commitment) - ${startSnapshot.items.length} items:\n`;
        report += `**Snapshot Date:** ${startSnapshot.created_at || startSnapshot.updated_at || 'N/A'}\n\n`;
        report += `| Item ID | Owner | Done/Not Done | Estimated Story Points |\n`;
        report += `|---------|-------|---------------|------------------------|\n`;
        
        startSnapshot.items.forEach((item: any) => {
          const ownerColumn = item.column_values?.find((cv: any) => cv.id === 'task_owner');
          const statusColumn = item.column_values?.find((cv: any) => cv.id === 'task_status');
          const estimationColumn = item.column_values?.find((cv: any) => cv.id === 'task_estimation');
          
          const owners = ownerColumn?.value?.personsAndTeams?.map((p: any) => p.id).join(', ') || 'Unassigned';
          const isCompleted = statusColumn?.value && doneIndexes.includes(statusColumn.value.index);
          const statusDisplay = isCompleted ? 'Done' : 'Not Done';
          const storyPoints = estimationColumn?.value || 0;
          
          report += `| ${item.id} | ${owners} | ${statusDisplay} | ${storyPoints} |\n`;
        });
      } else {
        report += `\n### Start Sprint Snapshot (Commitment): No data available\n`;
      }
      
      // End Snapshot (Actual)
      if (endSnapshot?.items) {
        const statusMetadata = endSnapshot.columns_metadata?.find((meta: any) => meta.id === 'task_status');
        const doneIndexes = statusMetadata?.done_status_indexes || [];
        const completedItems = endSnapshot.items.filter((item: any) => {
          const statusColumn = item.column_values?.find((cv: any) => cv.id === 'task_status');
          return statusColumn?.value && doneIndexes.includes(statusColumn.value.index);
        }).length;
        
        report += `\n### End Sprint Snapshot (Actual) - ${endSnapshot.items.length} items / ${completedItems} done items:\n`;
        report += `**Snapshot Date:** ${endSnapshot.created_at || endSnapshot.updated_at || 'N/A'}\n\n`;
        report += `| Item ID | Owner | Done/Not Done | Estimated Story Points |\n`;
        report += `|---------|-------|---------------|------------------------|\n`;
        
        endSnapshot.items.forEach((item: any) => {
          const ownerColumn = item.column_values?.find((cv: any) => cv.id === 'task_owner');
          const statusColumn = item.column_values?.find((cv: any) => cv.id === 'task_status');
          const estimationColumn = item.column_values?.find((cv: any) => cv.id === 'task_estimation');
          
          const owners = ownerColumn?.value?.personsAndTeams?.map((p: any) => p.id).join(', ') || 'Unassigned';
          const isCompleted = statusColumn?.value && doneIndexes.includes(statusColumn.value.index);
          const statusDisplay = isCompleted ? 'Done' : 'Not Done';
          const storyPoints = estimationColumn?.value || 0;
          
          report += `| ${item.id} | ${owners} | ${statusDisplay} | ${storyPoints} |\n`;
        });
      } else {
        report += `\n### End Sprint Snapshot (Actual): No data available\n`;
      }
      
      if (index < sprints.length - 1) {
        report += `\n---\n\n`;
      }
    });
    
    report += `\n## Analysis Guidelines:\n\n`;
    
    report += `### Owner Performance:\n`;
    report += `- Group items by Owner ID from the Owner column\n`;
    report += `- Calculate completion rate per owner: done items / total items * 100\n`;
    report += `- Use get_users_by_ids tool to convert Owner IDs to readable names\n\n`;
    
    report += `### Scope Analysis:\n`;
    report += `- **Commitment**: Number of not done items in start snapshot\n`;
    report += `- **Planned Items**: Items present in start snapshot (compare Item IDs)\n`;
    report += `- **Unplanned Items**: Items with Item IDs that exist in end snapshot but NOT in start snapshot\n`;
    report += `- **Removed Items**: Items with Item IDs that exist in start snapshot but NOT in end snapshot\n`;
    report += `- **Important**: Compare actual Item IDs between snapshots, not just total counts\n\n`;
    
    report += `### Velocity Calculation:\n`;
    report += `- **Sprint Velocity**: Items completed DURING sprint (done in end but NOT in start) / sprint duration in days\n`;
    report += `- **Owner Velocity**: Items completed per owner during sprint / sprint duration\n`;
    report += `- **Story Points Velocity**: Story points of newly completed items / duration\n\n`;
    
    report += `### Completion Rate:\n`;
    report += `- **Sprint Work Completion**: Items completed DURING sprint (done in end but NOT in start) / total items * 100\n`;
    report += `- **Story Points Completion**: Story points of newly completed items / total story points * 100\n`;
    report += `- **Important**: Exclude items already "done" in start snapshot from completion calculations\n\n`;
    
    report += `---\n*Use get_users_by_ids tool to convert Owner IDs to readable names*`;
    
    return report;
  }
}
