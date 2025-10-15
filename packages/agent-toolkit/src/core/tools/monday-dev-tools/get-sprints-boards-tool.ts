import { ToolInputType, ToolOutputType, ToolType } from '../../tool';
import { BaseMondayApiTool, createMondayApiAnnotations } from '../platform-api-tools/base-monday-api-tool';
import { 
  GetRecentBoardsQuery,
  GetRecentBoardsQueryVariables,
} from '../../../monday-graphql/generated/graphql';
import { getRecentBoards } from '../../../monday-graphql/queries.graphql';
import {
  REQUIRED_SPRINT_COLUMNS,
  REQUIRED_TASKS_COLUMNS,
  MONDAY_DEV_TASK_COLUMN_IDS,
  ERROR_PREFIXES,
  Board,
  SprintsBoardPair,
} from './shared';

export const getSprintsBoardsToolSchema = {};

export class GetSprintsBoardsTool extends BaseMondayApiTool<typeof getSprintsBoardsToolSchema> {
  name = 'get-monday-dev-sprints-boards';
  type = ToolType.READ;
  annotations = createMondayApiAnnotations({
    title: 'monday-dev: Get Sprints Boards',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  });

  getDescription(): string {
    return `Discover monday-dev sprints boards and their associated tasks boards in your account.

## Purpose:
Identifies and returns monday-dev sprints board IDs and tasks board IDs that you need to use with other monday-dev tools. 
This tool scans your recently used boards (up to 100) to find valid monday-dev sprint management boards.

## What it Returns:
- Pairs of sprints boards and their corresponding tasks boards
- Board IDs, names, and workspace information for each pair
- The bidirectional relationship between each sprints board and its tasks board

## Note:
Searches recently used boards (up to 100). If none found, ask user to provide board IDs manually.`;
  }

  getInputSchema(): typeof getSprintsBoardsToolSchema {
    return getSprintsBoardsToolSchema;
  }

  protected async executeInternal(
    input: ToolInputType<typeof getSprintsBoardsToolSchema>
  ): Promise<ToolOutputType<never>> {
    try {
      // Fetch recent active boards (limit 100 for performance)
      const variables: GetRecentBoardsQueryVariables = {
        limit: 100,
      };

      const res = await this.mondayApi.request<GetRecentBoardsQuery>(getRecentBoards, variables);

      const boards = (res.boards || []).filter((board): board is Board => board !== null);

      if (boards.length === 0) {
        return {
          content: `${ERROR_PREFIXES.BOARD_NOT_FOUND} No boards found in your account. Please verify you have access to monday.com boards.`,
        };
      }

      // Extract board pairs from column relationships
      const pairs = this.extractBoardPairs(boards);
      
      if (pairs.length === 0) {
        return {
          content: this.generateNotFoundMessage(boards.length),
        };
      }

      const report = this.generateReport(pairs);

      return {
        content: report,
      };
    } catch (error) {
      return {
        content: `${ERROR_PREFIXES.INTERNAL_ERROR} Error retrieving sprints boards: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }


  /**
   * Checks if a board has all required columns
   * @param board - Board to check
   * @param requiredColumnIds - Array of required column IDs
   */
  private hasAllRequiredColumns(board: Board, requiredColumnIds: string[]): boolean {
    if (!board.columns) return false;
    const columnIds = new Set(
      board.columns.filter((col): col is NonNullable<typeof col> => col !== null).map((col) => col.id)
    );
    return requiredColumnIds.every((colId) => columnIds.has(colId));
  }

  /**
   * Checks if a board is a valid sprints board (has all required sprint columns)
   */
  private isSprintsBoard(board: Board): boolean {
    return this.hasAllRequiredColumns(board, Object.values(REQUIRED_SPRINT_COLUMNS));
  }

  /**
   * Checks if a board is a valid tasks board (has all required tasks columns)
   */
  private isTasksBoard(board: Board): boolean {
    return this.hasAllRequiredColumns(board, Object.values(REQUIRED_TASKS_COLUMNS));
  }

  /**
   * Extracts board pairs directly from column relationships
   * This approach works even if one board in the pair wasn't fetched (not in recent 100)
   * We can identify pairs from either direction:
   * - From sprints board: sprint_tasks column references tasks board
   * - From tasks board: task_sprint column references sprints board
   */
  private extractBoardPairs(boards: Board[]): SprintsBoardPair[] {
    const pairsMap = new Map<string, SprintsBoardPair>(); // Key: "sprintsBoardId:tasksBoardId"
    const boardsById = new Map(boards.map((board) => [board.id, board]));

    for (const board of boards) {
      if (!board.columns) continue;

      // Check if this is a valid sprints board (has all required sprint columns)
      if (this.isSprintsBoard(board)) {
        const sprintTasksColumn = board.columns
          .filter((col): col is NonNullable<typeof col> => col !== null)
          .find((col) => col.id === REQUIRED_SPRINT_COLUMNS.SPRINT_TASKS && col.type === 'board_relation');

        if (sprintTasksColumn?.settings) {
          const settings = sprintTasksColumn.settings as any;
          const tasksBoardId = 
            (settings.boardIds && Array.isArray(settings.boardIds) && settings.boardIds[0]?.toString()) ||
            settings.boardId?.toString();

          if (tasksBoardId) {
            const pairKey = `${board.id}:${tasksBoardId}`;
            if (!pairsMap.has(pairKey)) {
              const tasksBoard = boardsById.get(tasksBoardId);
              pairsMap.set(pairKey, {
                sprintsBoard: {
                  id: board.id,
                  name: board.name,
                  workspaceId: board.workspace?.id || 'unknown',
                  workspaceName: board.workspace?.name || 'Unknown',
                },
                tasksBoard: {
                  id: tasksBoardId,
                  name: tasksBoard?.name || `Tasks Board ${tasksBoardId}`,
                  workspaceId: tasksBoard?.workspace?.id || 'unknown',
                  workspaceName: tasksBoard?.workspace?.name || 'Unknown',
                },
              });
            }
          }
        }
      }

      // Check if this is a valid tasks board (has all required tasks columns)
      if (this.isTasksBoard(board)) {
        const taskSprintColumn = board.columns
          .filter((col): col is NonNullable<typeof col> => col !== null)
          .find((col) => col.id === MONDAY_DEV_TASK_COLUMN_IDS.TASK_SPRINT && col.type === 'board_relation');

        if (taskSprintColumn?.settings) {
          const settings = taskSprintColumn.settings as any;
          const sprintsBoardId = 
            (settings.boardIds && Array.isArray(settings.boardIds) && settings.boardIds[0]?.toString()) ||
            settings.boardId?.toString();

          if (sprintsBoardId) {
            const pairKey = `${sprintsBoardId}:${board.id}`;
            if (!pairsMap.has(pairKey)) {
              const sprintsBoard = boardsById.get(sprintsBoardId);
              pairsMap.set(pairKey, {
                sprintsBoard: {
                  id: sprintsBoardId,
                  name: sprintsBoard?.name || `Sprints Board ${sprintsBoardId}`,
                  workspaceId: sprintsBoard?.workspace?.id || 'unknown',
                  workspaceName: sprintsBoard?.workspace?.name || 'Unknown',
                },
                tasksBoard: {
                  id: board.id,
                  name: board.name,
                  workspaceId: board.workspace?.id || 'unknown',
                  workspaceName: board.workspace?.name || 'Unknown',
                },
              });
            }
          }
        }
      }
    }

    return Array.from(pairsMap.values());
  }

  /**
   * Generates the output report
   */
  private generateReport(pairs: SprintsBoardPair[]): string {
    let report = '# Monday-Dev Sprints Boards Discovery\n\n';

    // Add warning if multiple pairs exist
    if (pairs.length > 1) {
      report += `## ⚠️ Multiple SprintsBoard Detected\n\n`;
      report += `**${pairs.length}** different board pairs found. Each pair is isolated and workspace-specific.\n\n`;
      report += `**AI Agent - REQUIRED:** Before ANY operation, confirm with user which pair and workspace to use.\n\n`;
      report += `---\n\n`;
    }

    report += `## Boards\n\n`;
    report += `Found **${pairs.length}** matched pair(s):\n\n`;

    pairs.forEach((pair, index) => {
      report += `### Pair ${index + 1}\n`;
      report += `**Sprints Board:**\n`;
      report += `- ID: \`${pair.sprintsBoard.id}\`\n`;
      report += `- Name: ${pair.sprintsBoard.name}\n`;
      report += `- Workspace: ${pair.sprintsBoard.workspaceName} (ID: ${pair.sprintsBoard.workspaceId})\n\n`;
      
      report += `**Tasks Board:**\n`;
      report += `- ID: \`${pair.tasksBoard.id}\`\n`;
      report += `- Name: ${pair.tasksBoard.name}\n`;
      report += `- Workspace: ${pair.tasksBoard.workspaceName} (ID: ${pair.tasksBoard.workspaceId})\n\n`;
      
      report += `---\n\n`;
    });

    // Add technical notes
    report += `## 📋 Technical Reference\n\n`;
    report += `**Sprint Operations** (all require correct board pair):\n`;
    report += `• Add to Sprint: Update \`task_sprint\` column with sprint item ID\n`;
    report += `• Remove from Sprint: Clear \`task_sprint\` column (set to null)\n`;
    report += `• Search in Sprint: Filter where \`task_sprint\` equals sprint item ID\n`;
    report += `• Move Between Sprints: Update \`task_sprint\` with new sprint item ID\n`;
    report += `• Backlog Tasks: \`task_sprint\` is empty/null\n\n`;
    report += `**Critical:** \`task_sprint\` column references ONLY its paired sprints board. Cross-pair operations WILL FAIL.\n`;

    return report;
  }

  /**
   * Generates a helpful message when no boards are found
   */
  private generateNotFoundMessage(boardsChecked: number): string {
    return `## No Monday-Dev Sprints Board Pairs Found

**Boards Checked:** ${boardsChecked} (recently used)

No board pairs with sprint relationships found in your recent boards.

### Possible Reasons:
1. Boards exist but not accessed recently by your account
2. Missing access permissions to sprint/task boards
3. Monday-dev sprints not set up in account

### Next Steps:
1. Access monday-dev boards in UI to refresh recent boards list
2. Verify permissions to view sprint and task boards
3. Ask user to provide board IDs manually if known`;
  }
}

