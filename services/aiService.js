// services/aiService.js
// Unified AI Service for Gemini and Local Ollama

// Cache for models to prevent excessive API calls
let modelCache = {
    models: [],
    timestamp: 0
};
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches available models from both Gemini (cloud) and Ollama (local).
 * Uses caching to prevent excessive quota usage.
 * @param {Object} db - MongoDB connection
 * @returns {Promise<string[]>} List of model names
 */
async function getAvailableModels(db) {
    // Return cached if valid
    const now = Date.now();
    if (modelCache.models.length > 0 && (now - modelCache.timestamp < CACHE_DURATION_MS)) {
        return modelCache.models;
    }

    const models = [];

    // 1. Fetch Gemini Models
    try {
        const apiKeysDoc = await db.collection('settings').findOne({ _id: 'api_keys' });
        const activeKey = apiKeysDoc?.keys?.find(k => k.id === apiKeysDoc.active_key_id);

        if (activeKey?.key) {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${activeKey.key}`);
            const data = await response.json();
            if (data.models) {
                const geminiModels = data.models
                    .filter(m => m.supportedGenerationMethods.includes('generateContent'))
                    .map(m => m.name.replace('models/', ''));
                models.push(...geminiModels);
            }
        }
    } catch (error) {
        console.error('[AI Service] Failed to fetch Gemini models:', error.message);
    }

    // 2. Fetch Local Ollama Models
    try {
        const data = await fetchOllamaWithFallback('/api/tags', {}, 5000, db);
        if (data && data.models) {
            // Prefix with 'ollama:' to distinguish source
            const ollamaModels = data.models.map(m => `ollama:${m.name}`);
            models.push(...ollamaModels);
        }
    } catch (error) {
        console.warn('[AI Service] Local Ollama not detected:', error.message);
    }

    // Update cache
    if (models.length > 0) {
        modelCache = {
            models: models,
            timestamp: now
        };
    }

    return models;
}

// Default Ollama hosts - includes Docker-compatible options
// Order: Docker host → Docker gateways → LAN IP → localhost
const DEFAULT_OLLAMA_HOSTS = [
    'http://host.docker.internal:11434',  // Docker Desktop (Windows/Mac)
    'http://172.18.0.1:11434',             // Custom Docker network gateway
    'http://172.17.0.1:11434',             // Default Docker bridge gateway
    'http://192.168.50.176:11434',         // LAN IP
    'http://localhost:11434'               // Local fallback
];
let cachedOllamaHosts = null;

/**
 * Get Ollama hosts from environment, settings, or use defaults
 */
async function getOllamaHosts(db) {
    // 1. Check environment variable first (fastest, no DB lookup)
    if (process.env.OLLAMA_HOST) {
        console.log(`[AI Service] Using OLLAMA_HOST from environment: ${process.env.OLLAMA_HOST}`);
        return [process.env.OLLAMA_HOST];
    }

    if (cachedOllamaHosts) return cachedOllamaHosts;

    try {
        if (db) {
            const settings = await db.collection('settings').findOne({ _id: 'general' });
            if (settings?.ollama_hosts && Array.isArray(settings.ollama_hosts)) {
                cachedOllamaHosts = settings.ollama_hosts;
                return cachedOllamaHosts;
            }
        }
    } catch (e) {
        console.warn('[AI Service] Could not load Ollama hosts from settings:', e.message);
    }

    cachedOllamaHosts = DEFAULT_OLLAMA_HOSTS;
    return cachedOllamaHosts;
}

/**
 * Helper to fetch from Ollama with fallback strategies
 * @param {string} endpoint - The Ollama API endpoint (e.g., '/api/tags', '/api/chat')
 * @param {Object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds (default: 5000 for queries, use higher for generation)
 * @param {Object} db - Optional database connection to get settings
 */
async function fetchOllamaWithFallback(endpoint, options = {}, timeoutMs = 5000, db = null) {
    const hosts = await getOllamaHosts(db);
    const errors = [];

    for (const host of hosts) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            const url = `${host}${endpoint}`;
            console.log(`[AI Service] Trying Ollama at: ${url}`);
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
                console.log(`[AI Service] Ollama connected successfully at: ${host}`);
                return await response.json();
            } else {
                errors.push(`${host}: HTTP ${response.status}`);
            }
        } catch (e) {
            const errMsg = e.name === 'AbortError' ? 'timeout' : e.message;
            errors.push(`${host}: ${errMsg}`);
            console.warn(`[AI Service] Ollama not available at ${host}: ${errMsg}`);
        }
    }
    throw new Error(`Ollama not reachable on any configured host. Tried: ${errors.join(', ')}`);
}

/**
 * Generates content using the specified model (Gemini or Ollama).
 */
async function generateContent(db, prompt, options = {}) {
    // 1. Determine Model
    let modelId = options.model;
    if (!modelId) {
        const generalSettings = await db.collection('settings').findOne({ _id: 'general' });
        modelId = generalSettings?.default_ai_model || 'gemini-1.5-flash';
    }

    // 2. Route to appropriate provider
    if (modelId.startsWith('ollama:')) {
        return generateOllamaContent(db, modelId.replace('ollama:', ''), prompt, options);
    } else {
        return generateGeminiContent(db, modelId, prompt, options);
    }
}

// --- Internal: Ollama Implementation ---
async function generateOllamaContent(db, modelName, prompt, options) {
    const messages = [];
    if (options.systemInstruction) {
        messages.push({ role: 'system', content: options.systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    const payload = {
        model: modelName,
        messages: messages,
        stream: false
    };

    if (options.jsonMode) {
        payload.format = 'json';
    }

    try {
        // Use 600 second (10 min) timeout for generation - large models on CPU are very slow
        const result = await fetchOllamaWithFallback('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }, 600000, db);

        const responseText = result.message?.content;

        if (options.jsonMode) {
            return parseJsonSafe(responseText);
        }
        return responseText;

    } catch (error) {
        throw new Error(`Ollama Generation Failed: ${error.message}`);
    }
}

// --- Internal: Gemini Implementation ---
async function generateGeminiContent(db, modelId, prompt, options) {
    // Fetch API Key
    const apiKeysDoc = await db.collection('settings').findOne({ _id: 'api_keys' });
    const activeKey = apiKeysDoc?.keys?.find(k => k.id === apiKeysDoc.active_key_id);
    const apiKey = activeKey?.key;

    if (!apiKey) throw new Error('Gemini API key is not configured.');

    // Clean model ID
    modelId = modelId.replace('models/', '');
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }]
    };

    if (options.systemInstruction) {
        payload.systemInstruction = { parts: [{ text: options.systemInstruction }] };
    }
    if (options.jsonMode) {
        payload.generationConfig = { response_mime_type: "application/json" };
    }

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(`Gemini API Error ${response.status}: ${errBody.error?.message || response.statusText}`);
    }

    const result = await response.json();
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) throw new Error('No content generated from Gemini.');

    if (options.jsonMode) {
        return parseJsonSafe(responseText);
    }
    return responseText;
}

// Helper: Robust JSON parsing
function parseJsonSafe(text) {
    // Try to find JSON code block first
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonString = jsonMatch ? jsonMatch[1] : text.trim();
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.error("Failed to parse JSON:", text);
        throw new Error('Failed to parse JSON response from AI.');
    }
}

module.exports = { generateContent, getAvailableModels };
