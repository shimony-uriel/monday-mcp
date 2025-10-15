import { MondayAgentToolkit } from 'src/mcp/toolkit';
import { callToolByNameRawAsync, createMockApiClient } from '../../platform-api-tools/test-utils/mock-api-client';
import { GetSprintsMetadataTool, getSprintsMetadataToolSchema } from './get-sprints-metadata-tool';
import { z } from 'zod';
import { ERROR_PREFIXES } from '../shared';
import {
  VALID_SPRINTS_BOARD_SCHEMA,
  REALISTIC_SPRINTS_RESPONSE,
  EMPTY_SPRINTS_RESPONSE,
  INVALID_BOARD_SCHEMA,
  NO_BOARD_FOUND_RESPONSE,
  SPRINTS_WITH_MISSING_TIMELINE,
  MALFORMED_BOARD_RESPONSE,
} from './get-sprints-metadata-tool-test-data';

export type InputType = Partial<z.infer<z.ZodObject<typeof getSprintsMetadataToolSchema>>> & { sprintsBoardId: number };

describe('GetSprintsMetadataTool', () => {
  let mocks: ReturnType<typeof createMockApiClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mocks = createMockApiClient();
    jest.spyOn(MondayAgentToolkit.prototype as any, 'createApiClient').mockReturnValue(mocks.mockApiClient);
  });

  const validBoardSchemaResponse = VALID_SPRINTS_BOARD_SCHEMA;
  const successfulSprintsResponse = REALISTIC_SPRINTS_RESPONSE;
  const emptySprintsResponse = EMPTY_SPRINTS_RESPONSE;

  describe('Basic Functionality', () => {
    it('should successfully get sprints metadata with default limit', async () => {
      mocks
        .getMockRequest()
        .mockResolvedValueOnce(validBoardSchemaResponse)
        .mockResolvedValueOnce(successfulSprintsResponse);

      const args: InputType = { sprintsBoardId: 123456789 };
      const result = await callToolByNameRawAsync('get_sprints_metadata', args);

      expect(result.content[0].text).toContain('# Sprints Metadata Report');
      expect(result.content[0].text).toContain('**Total Sprints:** 5');
      expect(result.content[0].text).toContain('Sprint 25');
      expect(result.content[0].text).toContain('Sprint 24');
      expect(result.content[0].text).toContain('Sprint 23');
      expect(result.content[0].text).toContain('COMPLETED');
      expect(result.content[0].text).toContain('ACTIVE');
      expect(result.content[0].text).toContain('PLANNED');

      const calls = mocks.getMockRequest().mock.calls;
      const schemaCall = calls.find((call) => call[0].includes('query getBoardSchema'));
      const itemsCall = calls.find((call) => call[0].includes('query GetSprintsBoardItemsWithColumns'));

      expect(schemaCall).toBeDefined();
      expect(schemaCall[1]).toEqual({ boardId: '123456789' });

      expect(itemsCall).toBeDefined();
      expect(itemsCall[1]).toEqual({ boardId: '123456789', limit: 25 });
    });

    it('should successfully get sprints metadata with custom limit', async () => {
      mocks
        .getMockRequest()
        .mockResolvedValueOnce(validBoardSchemaResponse)
        .mockResolvedValueOnce(successfulSprintsResponse);

      const args: InputType = { sprintsBoardId: 123456789, limit: 50 };
      const result = await callToolByNameRawAsync('get_sprints_metadata', args);

      expect(result.content[0].text).toContain('# Sprints Metadata Report');
      expect(result.content[0].text).toContain('**Total Sprints:** 5');

      const calls = mocks.getMockRequest().mock.calls;
      const itemsCall = calls.find((call) => call[0].includes('query GetSprintsBoardItemsWithColumns'));

      expect(itemsCall).toBeDefined();
      expect(itemsCall[1]).toEqual({ boardId: '123456789', limit: 50 });
    });

    it('should format timeline dates correctly', async () => {
      mocks
        .getMockRequest()
        .mockResolvedValueOnce(validBoardSchemaResponse)
        .mockResolvedValueOnce(successfulSprintsResponse);

      const args: InputType = { sprintsBoardId: 123456789 };
      const result = await callToolByNameRawAsync('get_sprints_metadata', args);

      const content = result.content[0].text;

      expect(content).toContain('2025-09-21 to 2025-10-19'); // Sprint 24
      expect(content).toContain('2025-09-14 to 2025-09-28'); // Sprint 23
      expect(content).toContain('2025-08-17 to 2025-08-31'); // Sprint 22
    });

    it('should handle document object IDs correctly', async () => {
      mocks
        .getMockRequest()
        .mockResolvedValueOnce(validBoardSchemaResponse)
        .mockResolvedValueOnce(successfulSprintsResponse);

      const args: InputType = { sprintsBoardId: 123456789 };
      const result = await callToolByNameRawAsync('get_sprints_metadata', args);

      const content = result.content[0].text;

      // Sprint 22 has document
      expect(content).toMatch(/Sprint 22.*doc_summary_1004/);

      // Sprint 23, 24, 25, 21 have no document
      expect(content).toMatch(/Sprint 23.*No document/);
      expect(content).toMatch(/Sprint 24.*No document/);
    });

    it('should include status definitions section', async () => {
      mocks
        .getMockRequest()
        .mockResolvedValueOnce(validBoardSchemaResponse)
        .mockResolvedValueOnce(successfulSprintsResponse);

      const args: InputType = { sprintsBoardId: 123456789 };
      const result = await callToolByNameRawAsync('get_sprints_metadata', args);

      const content = result.content[0].text;

      expect(content).toContain('## Status Definitions:');
      expect(content).toContain('**PLANNED**: Sprint not yet started');
      expect(content).toContain('**ACTIVE**: Sprint is active');
      expect(content).toContain('**COMPLETED**: Sprint is finished');
    });
  });

  describe('Schema Validation', () => {
    it('should fail when board is not found', async () => {
      jest.spyOn(mocks, 'mockRequest').mockImplementation(() => {
        return Promise.resolve(NO_BOARD_FOUND_RESPONSE);
      });

      const args: InputType = { sprintsBoardId: 999999999 };
      const result = await callToolByNameRawAsync('get_sprints_metadata', args);

      expect(result.content[0].text).toContain(ERROR_PREFIXES.BOARD_NOT_FOUND);
      expect(result.content[0].text).toContain('999999999');
    });

    it('should fail when board is missing required sprint columns', async () => {
      jest.spyOn(mocks, 'mockRequest').mockImplementation(() => {
        return Promise.resolve(INVALID_BOARD_SCHEMA);
      });

      const args: InputType = { sprintsBoardId: 123456789 };
      const result = await callToolByNameRawAsync('get_sprints_metadata', args);

      expect(result.content[0].text).toContain(ERROR_PREFIXES.VALIDATION_ERROR);
      expect(result.content[0].text).toContain('not a valid sprints board');
      expect(result.content[0].text).toContain('Missing required columns');
    });
  });

  it('should have correct tool metadata', () => {
    const tool = new GetSprintsMetadataTool(mocks.mockApiClient, 'fake_token');

    expect(tool.name).toBe('get_sprints_metadata');
    expect(tool.type).toBe('read');
    expect(tool.annotations.title).toBe('monday-dev: Get Sprints Metadata');
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.annotations.destructiveHint).toBe(false);
    expect(tool.annotations.idempotentHint).toBe(true);
  });

  describe('Empty and Edge Cases', () => {
    it('should handle empty sprints list', async () => {
      mocks
        .getMockRequest()
        .mockResolvedValueOnce(validBoardSchemaResponse)
        .mockResolvedValueOnce(emptySprintsResponse);

      const args: InputType = { sprintsBoardId: 123456789 };
      const result = await callToolByNameRawAsync('get_sprints_metadata', args);

      expect(result.content[0].text).toContain('# Sprints Metadata Report');
      expect(result.content[0].text).toContain('**Total Sprints:** 0');
    });

    it('should handle sprints with missing timeline', async () => {
      mocks
        .getMockRequest()
        .mockResolvedValueOnce(validBoardSchemaResponse)
        .mockResolvedValueOnce(SPRINTS_WITH_MISSING_TIMELINE);

      const args: InputType = { sprintsBoardId: 123456789 };
      const result = await callToolByNameRawAsync('get_sprints_metadata', args);

      const content = result.content[0].text;
      expect(content).toContain('Not set');
      expect(content).toContain('Not started');
      expect(content).toContain('Not ended');
    });

    it('should handle malformed board response', async () => {
      jest.spyOn(mocks, 'mockRequest').mockImplementation(() => {
        return Promise.resolve(MALFORMED_BOARD_RESPONSE);
      });

      const args: InputType = { sprintsBoardId: 123456789 };
      const result = await callToolByNameRawAsync('get_sprints_metadata', args);

      expect(result.content[0].text).toContain(ERROR_PREFIXES.VALIDATION_ERROR);
    });
  });

  describe('Error Handling', () => {
    it('should handle GraphQL errors during schema validation', async () => {
      const errorMessage = 'GraphQL schema error occurred';
      mocks.setError(errorMessage);

      const args: InputType = { sprintsBoardId: 123456789 };
      const result = await callToolByNameRawAsync('get_sprints_metadata', args);

      expect(result.content[0].text).toContain(ERROR_PREFIXES.INTERNAL_ERROR);
      expect(result.content[0].text).toContain('Error validating board schema');
    });

    it('should handle GraphQL errors during items fetch', async () => {
      mocks
        .getMockRequest()
        .mockResolvedValueOnce(validBoardSchemaResponse)
        .mockRejectedValueOnce(new Error('Failed to fetch sprint items'));

      const args: InputType = { sprintsBoardId: 123456789 };
      const result = await callToolByNameRawAsync('get_sprints_metadata', args);

      expect(result.content[0].text).toContain(ERROR_PREFIXES.INTERNAL_ERROR);
      expect(result.content[0].text).toContain('Error retrieving sprints metadata');
    });

    it('should handle network errors gracefully', async () => {
      mocks.setError(new Error('Network connection failed'));

      const args: InputType = { sprintsBoardId: 123456789 };
      const result = await callToolByNameRawAsync('get_sprints_metadata', args);

      expect(result.content[0].text).toContain(ERROR_PREFIXES.INTERNAL_ERROR);
    });
  });

  describe('Limit Validation', () => {
    it('should use default limit of 25 when not specified', async () => {
      mocks
        .getMockRequest()
        .mockResolvedValueOnce(validBoardSchemaResponse)
        .mockResolvedValueOnce(successfulSprintsResponse);

      const args: InputType = { sprintsBoardId: 123456789 };
      await callToolByNameRawAsync('get_sprints_metadata', args);

      const calls = mocks.getMockRequest().mock.calls;
      const itemsCall = calls.find((call) => call[0].includes('query GetSprintsBoardItemsWithColumns'));

      expect(itemsCall).toBeDefined();
      expect(itemsCall[1].limit).toBe(25);
    });

    it('should accept minimum limit of 1', async () => {
      mocks
        .getMockRequest()
        .mockResolvedValueOnce(validBoardSchemaResponse)
        .mockResolvedValueOnce(successfulSprintsResponse);

      const args: InputType = { sprintsBoardId: 123456789, limit: 1 };
      await callToolByNameRawAsync('get_sprints_metadata', args);

      const calls = mocks.getMockRequest().mock.calls;
      const itemsCall = calls.find((call) => call[0].includes('query GetSprintsBoardItemsWithColumns'));

      expect(itemsCall).toBeDefined();
      expect(itemsCall[1].limit).toBe(1);
    });

    it('should accept maximum limit of 100', async () => {
      mocks
        .getMockRequest()
        .mockResolvedValueOnce(validBoardSchemaResponse)
        .mockResolvedValueOnce(successfulSprintsResponse);

      const args: InputType = { sprintsBoardId: 123456789, limit: 100 };
      await callToolByNameRawAsync('get_sprints_metadata', args);

      const calls = mocks.getMockRequest().mock.calls;
      const itemsCall = calls.find((call) => call[0].includes('query GetSprintsBoardItemsWithColumns'));

      expect(itemsCall).toBeDefined();
      expect(itemsCall[1].limit).toBe(100);
    });
  });

  describe('Markdown Table Formatting', () => {
    it('should generate valid markdown table', async () => {
      mocks
        .getMockRequest()
        .mockResolvedValueOnce(validBoardSchemaResponse)
        .mockResolvedValueOnce(successfulSprintsResponse);

      const args: InputType = { sprintsBoardId: 123456789 };
      const result = await callToolByNameRawAsync('get_sprints_metadata', args);

      const content = result.content[0].text;

      // Check table headers
      expect(content).toContain(
        '| Sprint Name | Sprint ID | Status | Timeline (Planned) | Start Date (Actual) | End Date (Actual) | Completion | Summary Document ObjectID |',
      );

      // Check table separator
      expect(content).toMatch(/\|[-]+\|[-]+\|[-]+\|[-]+\|[-]+\|[-]+\|[-]+\|[-]+\|/);

      // Check data rows exist (5 sprints in realistic fixtures)
      const rows = content.split('\n').filter((line: string) => line.trim().startsWith('| Sprint'));
      expect(rows.length).toBeGreaterThanOrEqual(5);
    });
  });
});
