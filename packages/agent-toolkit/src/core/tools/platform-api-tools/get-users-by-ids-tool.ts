import { z } from 'zod';
import { GetUsersByIdsQuery, GetUsersByIdsQueryVariables } from '../../../monday-graphql/generated/graphql';
import { getUsersByIds } from '../../../monday-graphql/queries.graphql';
import { ToolInputType, ToolOutputType, ToolType } from '../../tool';
import { BaseMondayApiTool, createMondayApiAnnotations } from './base-monday-api-tool';

export const getUsersByIdsToolSchema = {
  ids: z.array(z.string()).describe('Array of user IDs to get user names for'),
};

export class GetUsersByIdsTool extends BaseMondayApiTool<typeof getUsersByIdsToolSchema> {
  name = 'get_users_by_ids';
  type = ToolType.READ;
  annotations = createMondayApiAnnotations({
    title: 'Get Users by IDs',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  });

  getDescription(): string {
    return 'Get users by their IDs, returns user names and titles for the provided user IDs';
  }

  getInputSchema(): typeof getUsersByIdsToolSchema {
    return getUsersByIdsToolSchema;
  }

  protected async executeInternal(input: ToolInputType<typeof getUsersByIdsToolSchema>): Promise<ToolOutputType<never>> {
    const variables: GetUsersByIdsQueryVariables = {
      ids: input.ids,
    };

    const res = await this.mondayApi.request<GetUsersByIdsQuery>(getUsersByIds, variables);
    return {
      content: `Users:\n${res.users?.map((user) => ` id: ${user?.id}, name: ${user?.name}, title: ${user?.title}`).join('\n')}`,
    };
  }
}