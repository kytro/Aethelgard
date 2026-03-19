#!/usr/bin/env node

/**
 * Codex MCP Server
 * 
 * Exposes Codex API functionality as MCP tools.
 * Requires CODEX_API_KEY env var (or pass as arg).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";

// Configuration
const CODEX_API_URL = process.env.CODEX_API_URL || "https://home.paindance.com/codex/api";
const API_KEY = process.env.CODEX_API_KEY;

if (!API_KEY) {
    console.error("Error: CODEX_API_KEY environment variable is required.");
    process.exit(1);
}

// Helpers
async function callApi(method, endpoint, body = null) {
    const url = `${CODEX_API_URL}${endpoint}`;
    const headers = {
        "Content-Type": "application/json",
        "x-api-key": API_KEY
    };

    const options = {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    };

    try {
        const res = await fetch(url, options);
        if (!res.ok) {
            const text = await res.text();
            return { _error: true, status: res.status, message: text };
        }
        return await res.json();
    } catch (err) {
        return { _error: true, message: err.message };
    }
}

// Create Server
const server = new McpServer({
    name: "Codex Admin",
    version: "1.0.0"
});

// --- TOOLS ---

// 1. Search Entries
server.tool(
    "search_entries",
    "Search for Codex entries by text, path, or category.",
    {
        search: z.string().optional().describe("Text to search for in name/summary"),
        path: z.string().optional().describe("Path prefix filtering (e.g., 'Locations.City')"),
        category: z.string().optional().describe("Filter by category"),
        limit: z.number().optional().default(20).describe("Max results to return")
    },
    async ({ search, path, category, limit }) => {
        const params = new URLSearchParams();
        if (search) params.append("search", search);
        if (path) params.append("path", path);
        if (category) params.append("category", category);
        if (limit) params.append("limit", String(limit));

        const result = await callApi("GET", `/v1/entries?${params.toString()}`);
        if (result._error) {
            return { content: [{ type: "text", text: `Error: ${result.message}` }] };
        }

        // Simplify output
        const summary = result.data.map(e => ({
            name: e.name,
            path: e.path_components.join('/'),
            id: e._id,
            summary: e.summary
        }));

        return {
            content: [{ type: "text", text: JSON.stringify(summary, null, 2) }]
        };
    }
);

// 2. Read Entry
server.tool(
    "read_entry",
    "Get the full details of a specific Codex entry by path or ID.",
    {
        path: z.string().optional().describe("Full path string (e.g., 'Locations/City/Inn')"),
        id: z.string().optional().describe("Entry ID (optional, use path if known)")
    },
    async ({ path, id }) => {
        if (!path && !id) {
            return { content: [{ type: "text", text: "Error: Must provide either 'path' or 'id'." }] };
        }

        let endpoint = "";
        if (id) {
            endpoint = `/v1/entries/${id}`;
        } else {
            // Encode path components
            // The API expects /entries/by-path/A/B/C
            endpoint = `/v1/entries/by-path/${path}`;
        }

        const result = await callApi("GET", endpoint);
        if (result._error) {
            return { content: [{ type: "text", text: `Error reading entry: ${result.message}` }] };
        }

        return {
            content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
    }
);

// 3. Update Entry
server.tool(
    "update_entry",
    "Update an existing entry's content or metadata. Use this to add text, change stats, etc.",
    {
        id: z.string().optional().describe("Entry ID (alternative to path)"),
        path: z.string().optional().describe("Full path of the entry to update"),
        name: z.string().optional().describe("New name for the entry (rename)"),
        summary: z.string().optional(),
        content: z.array(z.any()).optional().describe("Array of content blocks (heading, paragraph, table, map)"),
        classes: z.array(z.object({ className: z.string(), level: z.number() })).optional().describe("Multiclass array"),
        isCompleted: z.boolean().optional(),
        category: z.string().optional(),
        entity_id: z.string().optional().describe("Entity ID to link")
    },
    async ({ id, path, name, summary, content, classes, isCompleted, category, entity_id }) => {
        if (!id && !path) {
            return { content: [{ type: "text", text: "Error: Must provide either 'id' or 'path'." }] };
        }

        const body = {};
        if (name !== undefined) body.name = name;
        if (summary !== undefined) body.summary = summary;
        if (content !== undefined) body.content = content;
        if (classes !== undefined) {
            if (!body.baseStats) body.baseStats = {};
            body.baseStats.classes = classes;
        }
        if (isCompleted !== undefined) body.isCompleted = isCompleted;
        if (category !== undefined) body.category = category;
        if (entity_id !== undefined) body.entity_id = entity_id;

        const endpoint = id ? `/v1/entries/${id}` : `/v1/entries/by-path/${path}`;
        const result = await callApi("PATCH", endpoint, body);

        if (result._error) {
            return { content: [{ type: "text", text: `Error updating entry: ${result.message}` }] };
        }

        return {
            content: [{ type: "text", text: `Successfully updated entry ${id || path}.` }]
        };
    }
);

// 4. Create Entry
server.tool(
    "create_entry",
    "Create a new Codex entry.",
    {
        name: z.string(),
        path_components: z.array(z.string()).describe("Hierarchy path (e.g. ['Locations', 'City'])"),
        content: z.array(z.any()).optional(),
        category: z.string().optional()
    },
    async ({ name, path_components, content, category }) => {
        const body = { name, path_components, content: content || [], category };
        const result = await callApi("POST", "/v1/entries", body);

        if (result._error) {
            return { content: [{ type: "text", text: `Error creating entry: ${result.message}` }] };
        }

        return {
            content: [{ type: "text", text: `Created entry: ${result.data.name} (ID: ${result.data._id})` }]
        };
    }
);

// 5. Search Entities
server.tool(
    "search_entities",
    "Search for PF1e entities (monsters, NPCs).",
    {
        search: z.string().describe("Name search term"),
        limit: z.number().default(20)
    },
    async ({ search, limit }) => {
        const params = new URLSearchParams({ search, limit: String(limit) });
        const result = await callApi("GET", `/v1/entities?${params.toString()}`);

        if (result._error) {
            return { content: [{ type: "text", text: `Error searching entities: ${result.message}` }] };
        }

        const summary = result.data.map(e => ({
            id: e._id,
            name: e.name,
            class: e.baseStats?.class || 'N/A',
            level: e.baseStats?.level || 'N/A'
        }));

        return {
            content: [{ type: "text", text: JSON.stringify(summary, null, 2) }]
        };
    }
);

// 6. Delete Entry
server.tool(
    "delete_entry",
    "Delete a Codex entry by path or ID. Use cascade=true to delete children.",
    {
        id: z.string().optional().describe("Entry ID (alternative to path)"),
        path: z.string().optional().describe("Full path of the entry to delete"),
        cascade: z.boolean().optional().default(false).describe("Also delete all child entries")
    },
    async ({ id, path, cascade }) => {
        if (!id && !path) {
            return { content: [{ type: "text", text: "Error: Must provide either 'id' or 'path'." }] };
        }

        const endpoint = id
            ? `/v1/entries/${id}`
            : `/v1/entries/by-path/${path}?cascade=${cascade}`;

        const result = await callApi("DELETE", endpoint);

        if (result._error) {
            return { content: [{ type: "text", text: `Error deleting entry: ${result.message}` }] };
        }

        return {
            content: [{ type: "text", text: `Deleted entry ${id || path}${cascade && !id ? ' (and children)' : ''}.` }]
        };
    }
);

// 7. Read Entity
server.tool(
    "read_entity",
    "Get full details for a PF1e entity (monster/NPC) by ID.",
    {
        id: z.string().describe("Entity ID")
    },
    async ({ id }) => {
        const result = await callApi("GET", `/v1/entities/${id}`);
        if (result._error) {
            return { content: [{ type: "text", text: `Error reading entity: ${result.message}` }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
    }
);

// 8. Create Entity
server.tool(
    "create_entity",
    "Create a new PF1e entity (monster/NPC).",
    {
        name: z.string(),
        baseStats: z.record(z.any()).optional().describe("Stats object (HP, AC, Str, Dex, etc.)"),
        tags: z.array(z.string()).optional(),
        facts: z.record(z.any()).optional().describe("Additional facts (alignment, deity, etc.)"),
        inventory: z.array(z.any()).optional().describe("Structured inventory array"),
        spellbook: z.array(z.any()).optional().describe("Spellbook data")
    },
    async ({ name, baseStats, tags, facts, inventory, spellbook }) => {
        const body = { name, baseStats, tags, facts, inventory, spellbook };
        const result = await callApi("POST", "/v1/entities", body);

        if (result._error) {
            return { content: [{ type: "text", text: `Error creating entity: ${result.message}` }] };
        }

        return {
            content: [{ type: "text", text: `Created entity: ${result.data.name} (ID: ${result.data._id})` }]
        };
    }
);

// 9. Update Entity
server.tool(
    "update_entity",
    "Update an existing PF1e entity.",
    {
        id: z.string().describe("Entity ID"),
        name: z.string().optional(),
        baseStats: z.record(z.any()).optional(),
        tags: z.array(z.string()).optional(),
        facts: z.record(z.any()).optional(),
        inventory: z.array(z.any()).optional(),
        spellbook: z.array(z.any()).optional()
    },
    async ({ id, name, baseStats, tags, facts, inventory, spellbook }) => {
        const body = {};
        if (name !== undefined) body.name = name;
        if (baseStats !== undefined) body.baseStats = baseStats;
        if (tags !== undefined) body.tags = tags;
        if (facts !== undefined) body.facts = facts;
        if (inventory !== undefined) body.inventory = inventory;
        if (spellbook !== undefined) body.spellbook = spellbook;

        const result = await callApi("PUT", `/v1/entities/${id}`, body);

        if (result._error) {
            return { content: [{ type: "text", text: `Error updating entity: ${result.message}` }] };
        }

        return { content: [{ type: "text", text: `Updated entity: ${result.data.name}` }] };
    }
);

// 10. Delete Entity
server.tool(
    "delete_entity",
    "Delete a PF1e entity by ID.",
    {
        id: z.string().describe("Entity ID")
    },
    async ({ id }) => {
        const result = await callApi("DELETE", `/v1/entities/${id}`);
        if (result._error) {
            return { content: [{ type: "text", text: `Error deleting entity: ${result.message}` }] };
        }
        return { content: [{ type: "text", text: `Deleted entity ${id}.` }] };
    }
);

// 11. Search Spells
server.tool(
    "search_spells",
    "Search for PF1e spells by name.",
    {
        search: z.string().describe("Spell name to search"),
        limit: z.number().optional().default(20)
    },
    async ({ search, limit }) => {
        const params = new URLSearchParams({ search, limit: String(limit) });
        const result = await callApi("GET", `/v1/spells?${params.toString()}`);

        if (result._error) {
            return { content: [{ type: "text", text: `Error searching spells: ${result.message}` }] };
        }

        const summary = result.data.map(s => ({
            id: s._id,
            name: s.name,
            school: s.school,
            level: s.level
        }));
        return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    }
);

// 12. Read Spell
server.tool(
    "read_spell",
    "Get full details for a PF1e spell by ID.",
    {
        id: z.string().describe("Spell ID")
    },
    async ({ id }) => {
        const result = await callApi("GET", `/v1/spells/${id}`);
        if (result._error) {
            return { content: [{ type: "text", text: `Error reading spell: ${result.message}` }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
    }
);

// 13. Search Rules
server.tool(
    "search_rules",
    "Search for PF1e rules by name.",
    {
        search: z.string().describe("Rule name to search"),
        limit: z.number().optional().default(20)
    },
    async ({ search, limit }) => {
        const params = new URLSearchParams({ search, limit: String(limit) });
        const result = await callApi("GET", `/v1/rules?${params.toString()}`);

        if (result._error) {
            return { content: [{ type: "text", text: `Error searching rules: ${result.message}` }] };
        }

        const summary = result.data.map(r => ({
            id: r._id,
            name: r.name,
            category: r.category
        }));
        return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    }
);

// 14. Read Rule
server.tool(
    "read_rule",
    "Get full details for a PF1e rule by ID.",
    {
        id: z.string().describe("Rule ID")
    },
    async ({ id }) => {
        const result = await callApi("GET", `/v1/rules/${id}`);
        if (result._error) {
            return { content: [{ type: "text", text: `Error reading rule: ${result.message}` }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
    }
);

// 15. Search Equipment
server.tool(
    "search_equipment",
    "Search for PF1e equipment by name.",
    {
        search: z.string().describe("Equipment name to search"),
        limit: z.number().optional().default(20)
    },
    async ({ search, limit }) => {
        const params = new URLSearchParams({ search, limit: String(limit) });
        const result = await callApi("GET", `/v1/equipment?${params.toString()}`);

        if (result._error) {
            return { content: [{ type: "text", text: `Error searching equipment: ${result.message}` }] };
        }

        const summary = result.data.map(e => ({
            id: e._id,
            name: e.name,
            type: e.type,
            price: e.price
        }));
        return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    }
);

// 16. Read Equipment
server.tool(
    "read_equipment",
    "Get full details for PF1e equipment by ID.",
    {
        id: z.string().describe("Equipment ID")
    },
    async ({ id }) => {
        const result = await callApi("GET", `/v1/equipment/${id}`);
        if (result._error) {
            return { content: [{ type: "text", text: `Error reading equipment: ${result.message}` }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
    }
);

// 17. Update Collection Document (Generic)
server.tool(
    "update_collection_doc",
    "Generic tool to update ANY document in ANY collection by ID. Useful for the data browser.",
    {
        collection: z.string().describe("Collection name"),
        id: z.string().describe("Document ID"),
        data: z.record(z.any()).describe("New document data (full replacement)")
    },
    async ({ collection, id, data }) => {
        const result = await callApi("PUT", `/admin/collections/${collection}/${id}`, data);
        if (result._error) {
            return { content: [{ type: "text", text: `Error updating ${collection} doc ${id}: ${result.message}` }] };
        }
        return { content: [{ type: "text", text: `Updated ${collection} doc ${id}.` }] };
    }
);

// 18. Delete Collection Document (Generic)
server.tool(
    "delete_collection_doc",
    "Generic tool to delete ANY document in ANY collection by ID. Useful for the data browser.",
    {
        collection: z.string().describe("Collection name"),
        id: z.string().describe("Document ID")
    },
    async ({ collection, id }) => {
        const result = await callApi("DELETE", `/admin/collections/${collection}/${id}`);
        if (result._error) {
            return { content: [{ type: "text", text: `Error deleting ${collection} doc ${id}: ${result.message}` }] };
        }
        return { content: [{ type: "text", text: `Deleted ${collection} doc ${id}.` }] };
    }
);

// 19. Generate NPC
server.tool(
    "generate_npc",
    "Generate a full NPC using AI, creating both an Entity and Codex entry.",
    {
        name: z.string().describe("NPC name"),
        race: z.string().optional(),
        class: z.string().optional().describe("Class (e.g., Fighter, Wizard)"),
        level: z.number().optional().default(1),
        context: z.string().optional().describe("Additional context for generation")
    },
    async ({ name, race, class: npcClass, level, context }) => {
        const body = {
            npc: { name, race, class: npcClass, level, context },
            options: {}
        };
        const result = await callApi("POST", "/v1/generation/npc", body);

        if (result._error) {
            return { content: [{ type: "text", text: `Error generating NPC: ${result.message}` }] };
        }

        return {
            content: [{
                type: "text",
                text: `Generated NPC: ${result.data.entity.name}\n` +
                    `Entity ID: ${result.data.entity._id}\n` +
                    `Codex Path: ${result.data.codex.path_components.join('/')}`
            }]
        };
    }
);

// 18. Suggest Story
server.tool(
    "suggest_story",
    "Get AI-generated story suggestions based on context.",
    {
        context: z.string().describe("User prompt/context for story suggestions"),
        codexContext: z.string().optional().describe("World/lore context from Codex"),
        sessionContext: z.string().optional().describe("Recent session events")
    },
    async ({ context, codexContext, sessionContext }) => {
        const body = { context, codexContext, sessionContext };
        const result = await callApi("POST", "/v1/generation/story/suggest", body);

        if (result._error) {
            return { content: [{ type: "text", text: `Error getting suggestions: ${result.message}` }] };
        }

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);
// 19. Link Entry to Entity
server.tool(
    "link_entry_entity",
    "Link a Codex entry to an Entity by updating the entry's entity_id field.",
    {
        path: z.string().describe("Full path of the Codex entry"),
        entity_id: z.string().describe("Entity ID to link (or empty string to unlink)")
    },
    async ({ path, entity_id }) => {
        const endpoint = `/v1/entries/by-path/${path}`;
        const body = { entity_id: entity_id || null };
        const result = await callApi("PATCH", endpoint, body);

        if (result._error) {
            return { content: [{ type: "text", text: `Error linking: ${result.message}` }] };
        }

        return {
            content: [{
                type: "text",
                text: entity_id
                    ? `Linked entry "${path}" to entity ${entity_id}`
                    : `Unlinked entry "${path}" from entity`
            }]
        };
    }
);

// Start Server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Codex MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
