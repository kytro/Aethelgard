// services/geminiService.js
// No longer need to require node-fetch in Node 20+

async function generateContent(db, prompt, options = {}) {
    // 1. Fetch API Key
    const apiKeysDoc = await db.collection('settings').findOne({ _id: 'api_keys' });
    const activeKeyId = apiKeysDoc?.active_key_id;
    const activeKey = apiKeysDoc?.keys?.find(k => k.id === activeKeyId);
    const apiKey = activeKey?.key;

    if (!apiKey) {
        throw new Error('Gemini API key is not configured in the database.');
    }

    // 2. Determine Model
    // Use provided model, or fall back to system default, or hard fallback
    let modelId = options.model;
    if (!modelId) {
        const generalSettings = await db.collection('settings').findOne({ _id: 'general' });
        const defaultModel = generalSettings?.default_ai_model || 'models/gemini-1.5-flash';
        modelId = defaultModel;
    }
    // Strip 'models/' prefix if present
    modelId = modelId.replace('models/', '');

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    // 3. Construct Payload
    const payload = {
        contents: [{
            parts: [{ text: prompt }]
        }]
    };

    // Add system instruction if provided (only supported by some models/endpoints, but good to have)
    if (options.systemInstruction) {
        payload.systemInstruction = {
            parts: [{ text: options.systemInstruction }]
        };
    }

    // Add generationConfig for JSON mode to encourage a JSON response
    if (options.jsonMode) {
        payload.generationConfig = {
            response_mime_type: "application/json",
        };
    }

    // 4. Make Request
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        let errorMsg = `Gemini API Error: ${response.status} ${response.statusText}`;
        try {
            const errorBody = await response.json();
            if (errorBody.error?.message) errorMsg += ` - ${errorBody.error.message}`;
        } catch (e) { /* ignore parse error */ }
        throw new Error(errorMsg);
    }

    const result = await response.json();
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
        throw new Error('Invalid response structure from Gemini API (no content generated).');
    }

    // 5. Optional: Auto-parse JSON
    if (options.jsonMode) {
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[1] : responseText.trim();
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            console.error("Failed to parse JSON from Gemini:", responseText);
            throw new Error('Failed to parse JSON response from AI.');
        }
    }

    return responseText;
}

module.exports = { generateContent };