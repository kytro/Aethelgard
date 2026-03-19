/**
 * Jest tests for Codex MCP Server
 */

// Mock dependencies before importing the module
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

describe('Codex MCP Server', () => {
    let serverInstance;
    let registeredTools = {};

    beforeAll(async () => {
        // Setup env var required by server
        process.env.CODEX_API_KEY = 'test-api-key';

        // Setup McpServer mock to capture tools
        McpServer.mockImplementation(() => {
            return {
                tool: jest.fn((name, desc, schema, callback) => {
                    registeredTools[name] = callback;
                }),
                connect: jest.fn().mockResolvedValue(undefined)
            };
        });

        // Import the server module (which runs main())
        // We use dynamic import to support ESM if needed, or require if transpiled
        // Since the file is .js and uses import, we might need a transform or just require if standard jest setup handles it.
        // Given project structure, we'll try require first if jest handles babel, otherwise dynamic import.
        // Actually, let's use dynamic import() to be safe with mixed modules.
        try {
            jest.isolateModules(() => {
                require('../../mcp/server.js');
            });
        } catch (e) {
            // If require fails due to ESM, we might need to rely on babel-jest doing its job
            // For now, assuming jest config handles JS files.
        }
    });

    beforeEach(() => {
        fetch.mockClear();
        // Reset fetch to default success
        fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ data: [] }),
            text: async () => ''
        });
    });

    test('should register all required tools', () => {
        const toolNames = [
            'search_entries',
            'read_entry',
            'update_entry',
            'create_entry',
            'search_entities',
            'delete_entry',
            'read_entity',
            'create_entity',
            'update_entity',
            'delete_entity',
            'search_spells',
            'read_spell',
            'search_rules',
            'read_rule',
            'search_equipment',
            'read_equipment',
            'generate_npc',
            'suggest_story',
            'link_entry_entity'
        ];

        toolNames.forEach(name => {
            expect(registeredTools[name]).toBeDefined();
        });
    });

    describe('Tool: search_entries', () => {
        it('should call API with correct parameters', async () => {
            await registeredTools.search_entries({ search: 'test', limit: 10 });

            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/entries?search=test&limit=10'),
                expect.objectContaining({
                    method: 'GET',
                    headers: expect.objectContaining({ 'x-api-key': 'test-api-key' })
                })
            );
        });

        it('should format successful results', async () => {
            fetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    data: [{
                        name: 'Test Entry',
                        path_components: ['Loc', 'Test'],
                        _id: '123',
                        summary: 'A test'
                    }]
                })
            });

            const result = await registeredTools.search_entries({ search: 'test' });
            const content = JSON.parse(result.content[0].text);

            expect(content[0].name).toBe('Test Entry');
            expect(content[0].path).toBe('Loc/Test');
        });
    });

    describe('Tool: read_entry', () => {
        it('should fetch by ID', async () => {
            await registeredTools.read_entry({ id: '123' });
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/entries/123'),
                expect.anything()
            );
        });

        it('should fetch by Path', async () => {
            await registeredTools.read_entry({ path: 'Loc/Test' });
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/entries/by-path/Loc/Test'),
                expect.anything()
            );
        });

        it('should return error if neither path nor id provided', async () => {
            const result = await registeredTools.read_entry({});
            expect(result.content[0].text).toContain('Error: Must provide either');
        });
    });

    describe('Tool: create_entry', () => {
        it('should POST to /v1/entries', async () => {
            const entry = { name: 'New', path_components: ['A'] };

            fetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: { _id: 'new-id', name: 'New' } })
            });

            const result = await registeredTools.create_entry(entry);

            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/entries'),
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ ...entry, content: [] })
                })
            );
            expect(result.content[0].text).toContain('Created entry: New');
        });
    });

    describe('Tool: update_entry', () => {
        it('should PATCH to /v1/entries/by-path', async () => {
            await registeredTools.update_entry({ path: 'Loc/Old', summary: 'New Summary', entity_id: 'ent-123' });

            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/entries/by-path/Loc/Old'),
                expect.objectContaining({
                    method: 'PATCH',
                    body: JSON.stringify({ summary: 'New Summary', entity_id: 'ent-123' })
                })
            );
        });
    });

    describe('Tool: delete_entry', () => {
        it('should DELETE to /v1/entries/by-path', async () => {
            await registeredTools.delete_entry({ path: 'Loc/Old', cascade: false });
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/entries/by-path/Loc/Old?cascade=false'),
                expect.objectContaining({ method: 'DELETE' })
            );
        });
    });

    describe('Tool: search_entities', () => {
        it('should call entities endpoint', async () => {
            await registeredTools.search_entities({ search: 'Goblin' });

            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/entities?search=Goblin'),
                expect.any(Object)
            );
        });
    });

    describe('Tool: read_entity', () => {
        it('should GET /v1/entities/:id', async () => {
            await registeredTools.read_entity({ id: 'ent-123' });
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/entities/ent-123'),
                expect.objectContaining({ method: 'GET' })
            );
        });
    });

    describe('Tool: create_entity', () => {
        it('should POST to /v1/entities', async () => {
            fetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: { _id: 'ent-new', name: 'Goblin' } })
            });
            const result = await registeredTools.create_entity({ name: 'Goblin' });
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/entities'),
                expect.objectContaining({ method: 'POST' })
            );
            expect(result.content[0].text).toContain('Created entity: Goblin');
        });
    });

    describe('Tool: update_entity', () => {
        it('should PUT to /v1/entities/:id', async () => {
            fetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: { name: 'Updated' } })
            });
            await registeredTools.update_entity({ id: 'ent-123', name: 'Updated' });
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/entities/ent-123'),
                expect.objectContaining({ method: 'PUT' })
            );
        });
    });

    describe('Tool: delete_entity', () => {
        it('should DELETE /v1/entities/:id', async () => {
            await registeredTools.delete_entity({ id: 'ent-123' });
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/entities/ent-123'),
                expect.objectContaining({ method: 'DELETE' })
            );
        });
    });

    describe('Tool: search_spells', () => {
        it('should call spells endpoint', async () => {
            await registeredTools.search_spells({ search: 'Fireball' });
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/spells?search=Fireball'),
                expect.any(Object)
            );
        });
    });

    describe('Tool: read_spell', () => {
        it('should GET /v1/spells/:id', async () => {
            await registeredTools.read_spell({ id: 'spell-123' });
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/spells/spell-123'),
                expect.objectContaining({ method: 'GET' })
            );
        });
    });

    describe('Tool: search_rules', () => {
        it('should call rules endpoint', async () => {
            await registeredTools.search_rules({ search: 'Grapple' });
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/rules?search=Grapple'),
                expect.any(Object)
            );
        });
    });

    describe('Tool: read_rule', () => {
        it('should GET /v1/rules/:id', async () => {
            await registeredTools.read_rule({ id: 'rule-123' });
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/rules/rule-123'),
                expect.objectContaining({ method: 'GET' })
            );
        });
    });

    describe('Tool: search_equipment', () => {
        it('should call equipment endpoint', async () => {
            await registeredTools.search_equipment({ search: 'Longsword' });
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/equipment?search=Longsword'),
                expect.any(Object)
            );
        });
    });

    describe('Tool: read_equipment', () => {
        it('should GET /v1/equipment/:id', async () => {
            await registeredTools.read_equipment({ id: 'eq-123' });
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/equipment/eq-123'),
                expect.objectContaining({ method: 'GET' })
            );
        });
    });

    describe('Tool: generate_npc', () => {
        it('should POST to /v1/generation/npc', async () => {
            fetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    data: {
                        entity: { _id: 'ent-gen', name: 'Gandalf' },
                        codex: { path_components: ['NPCs', 'Gandalf'] }
                    }
                })
            });
            const result = await registeredTools.generate_npc({ name: 'Gandalf', class: 'Wizard', level: 20 });
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/generation/npc'),
                expect.objectContaining({ method: 'POST' })
            );
            expect(result.content[0].text).toContain('Generated NPC: Gandalf');
        });
    });

    describe('Tool: suggest_story', () => {
        it('should POST to /v1/generation/story/suggest', async () => {
            fetch.mockResolvedValue({
                ok: true,
                json: async () => ({ suggestions: [] })
            });
            await registeredTools.suggest_story({ context: 'A dragon attacks' });
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/generation/story/suggest'),
                expect.objectContaining({ method: 'POST' })
            );
        });
    });

    describe('Tool: link_entry_entity', () => {
        it('should PATCH to /v1/entries/by-path with entity_id', async () => {
            await registeredTools.link_entry_entity({ path: 'Places/The Ariel/Captain', entity_id: 'ent-123' });
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/v1/entries/by-path/Places/The Ariel/Captain'),
                expect.objectContaining({
                    method: 'PATCH',
                    body: JSON.stringify({ entity_id: 'ent-123' })
                })
            );
        });
    });

    // --- Error Handling Tests ---
    describe('Error Handling', () => {
        beforeEach(() => {
            // Mock API failure
            fetch.mockResolvedValue({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error'
            });
        });

        it('search_entries should handle API errors', async () => {
            const result = await registeredTools.search_entries({ search: 'test' });
            expect(result.content[0].text).toContain('Error');
        });

        it('read_entry should handle API errors', async () => {
            const result = await registeredTools.read_entry({ id: '123' });
            expect(result.content[0].text).toContain('Error reading entry');
        });

        it('create_entry should handle API errors', async () => {
            const result = await registeredTools.create_entry({ name: 'Test', path_components: ['A'] });
            expect(result.content[0].text).toContain('Error creating entry');
        });

        it('update_entry should handle API errors', async () => {
            const result = await registeredTools.update_entry({ path: 'A/B', summary: 'Test' });
            expect(result.content[0].text).toContain('Error updating entry');
        });

        it('delete_entry should handle API errors', async () => {
            const result = await registeredTools.delete_entry({ path: 'A/B' });
            expect(result.content[0].text).toContain('Error deleting entry');
        });

        it('search_entities should handle API errors', async () => {
            const result = await registeredTools.search_entities({ search: 'Goblin' });
            expect(result.content[0].text).toContain('Error searching entities');
        });

        it('read_entity should handle API errors', async () => {
            const result = await registeredTools.read_entity({ id: 'ent-123' });
            expect(result.content[0].text).toContain('Error reading entity');
        });

        it('create_entity should handle API errors', async () => {
            const result = await registeredTools.create_entity({ name: 'Goblin' });
            expect(result.content[0].text).toContain('Error creating entity');
        });

        it('update_entity should handle API errors', async () => {
            const result = await registeredTools.update_entity({ id: 'ent-123', name: 'Updated' });
            expect(result.content[0].text).toContain('Error updating entity');
        });

        it('delete_entity should handle API errors', async () => {
            const result = await registeredTools.delete_entity({ id: 'ent-123' });
            expect(result.content[0].text).toContain('Error deleting entity');
        });

        it('search_spells should handle API errors', async () => {
            const result = await registeredTools.search_spells({ search: 'Fireball' });
            expect(result.content[0].text).toContain('Error searching spells');
        });

        it('read_spell should handle API errors', async () => {
            const result = await registeredTools.read_spell({ id: 'spell-123' });
            expect(result.content[0].text).toContain('Error reading spell');
        });

        it('search_rules should handle API errors', async () => {
            const result = await registeredTools.search_rules({ search: 'Grapple' });
            expect(result.content[0].text).toContain('Error searching rules');
        });

        it('read_rule should handle API errors', async () => {
            const result = await registeredTools.read_rule({ id: 'rule-123' });
            expect(result.content[0].text).toContain('Error reading rule');
        });

        it('search_equipment should handle API errors', async () => {
            const result = await registeredTools.search_equipment({ search: 'Longsword' });
            expect(result.content[0].text).toContain('Error searching equipment');
        });

        it('read_equipment should handle API errors', async () => {
            const result = await registeredTools.read_equipment({ id: 'eq-123' });
            expect(result.content[0].text).toContain('Error reading equipment');
        });

        it('generate_npc should handle API errors', async () => {
            const result = await registeredTools.generate_npc({ name: 'Gandalf' });
            expect(result.content[0].text).toContain('Error generating NPC');
        });

        it('suggest_story should handle API errors', async () => {
            const result = await registeredTools.suggest_story({ context: 'A dragon attacks' });
            expect(result.content[0].text).toContain('Error getting suggestions');
        });
    });

    // --- Network Error Tests ---
    describe('Network Errors', () => {
        beforeEach(() => {
            fetch.mockRejectedValue(new Error('Network failure'));
        });

        it('should handle network errors gracefully', async () => {
            const result = await registeredTools.search_entries({ search: 'test' });
            expect(result.content[0].text).toContain('Error');
        });
    });
});
