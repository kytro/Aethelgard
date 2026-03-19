/**
 * Jest tests for Codex MCP Server ID-based operations
 */

jest.mock('node-fetch', () => jest.fn());
jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: jest.fn().mockImplementation(() => ({
        tool: jest.fn(),
        connect: jest.fn().mockResolvedValue(undefined)
    }))
}));
jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: jest.fn()
}));

const fetch = require('node-fetch');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');

describe('Codex MCP Server - ID-based Operations', () => {
    let registeredTools = {};

    beforeAll(async () => {
        process.env.CODEX_API_KEY = 'test-api-key';
        McpServer.mockImplementation(() => {
            return {
                tool: jest.fn((name, desc, schema, callback) => {
                    registeredTools[name] = callback;
                }),
                connect: jest.fn().mockResolvedValue(undefined)
            };
        });

        // Load the server to register tools
        jest.isolateModules(() => {
            require('../../mcp/server.js');
        });
    });

    beforeEach(() => {
        fetch.mockClear();
        fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, data: { name: 'Test' } }),
            text: async () => ''
        });
    });

    test('update_entry should support ID-based update', async () => {
        await registeredTools.update_entry({ id: 'doc-123', summary: 'New Summary' });

        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/v1/entries/doc-123'),
            expect.objectContaining({
                method: 'PATCH',
                body: JSON.stringify({ summary: 'New Summary' })
            })
        );
    });

    test('update_entry should support linking entity via entityId', async () => {
        await registeredTools.update_entry({ id: 'doc-123', entity_id: 'ent-456' });

        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/v1/entries/doc-123'),
            expect.objectContaining({
                method: 'PATCH',
                body: JSON.stringify({ entity_id: 'ent-456' })
            })
        );
    });

    test('delete_entry should support ID-based delete', async () => {
        await registeredTools.delete_entry({ id: 'doc-123' });

        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/v1/entries/doc-123'),
            expect.objectContaining({
                method: 'DELETE'
            })
        );
    });

    test('update_collection_doc should perform PUT to admin API', async () => {
        const testData = { foo: 'bar' };
        await registeredTools.update_collection_doc({ collection: 'my_col', id: '123', data: testData });

        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/admin/collections/my_col/123'),
            expect.objectContaining({
                method: 'PUT',
                body: JSON.stringify(testData)
            })
        );
    });

    test('delete_collection_doc should perform DELETE to admin API', async () => {
        await registeredTools.delete_collection_doc({ collection: 'my_col', id: '123' });

        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/admin/collections/my_col/123'),
            expect.objectContaining({
                method: 'DELETE'
            })
        );
    });
});
