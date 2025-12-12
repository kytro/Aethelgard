// services/aiService.js
// Unified AI Service for Gemini and Local Ollama

/**
 * Fetches available models from both Gemini (cloud) and Ollama (local).
 * @param {Object} db - MongoDB connection
 * @returns {Promise<string[]>} List of model names
 */
async function getAvailableModels(db) {
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
        const data = await fetchOllamaWithFallback('/api/tags');
        if (data && data.models) {
            // Prefix with 'ollama:' to distinguish source
            const ollamaModels = data.models.map(m => `ollama:${m.name}`);
            models.push(...ollamaModels);
        }
    } catch (error) {
        console.warn('[AI Service] Local Ollama not detected:', error.message);
    }

    return models;
}

/**
 * Helper to fetch from Ollama with fallback strategies
 */
async function fetchOllamaWithFallback(endpoint, options = {}) {
    const hosts = ['http://192.168.50.176:11434', 'http://localhost:11434'];

    for (const host of hosts) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            const url = `${host}${endpoint}`;
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
                return await response.json();
            }
        } catch (e) {
            // Continue to next host
        }
    }
    throw new Error('Ollama not reachable on any configured host.');
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
        return generateOllamaContent(modelId.replace('ollama:', ''), prompt, options);
    } else {
        return generateGeminiContent(db, modelId, prompt, options);
    }
}

// --- Internal: Ollama Implementation ---
async function generateOllamaContent(modelName, prompt, options) {
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
        const result = await fetchOllamaWithFallback('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

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
