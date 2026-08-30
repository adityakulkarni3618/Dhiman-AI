const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const config = require('../../config');

let openai = null;
if (config.openaiApiKey) {
  openai = new OpenAI({ apiKey: config.openaiApiKey });
}

let anthropic = null;
if (config.anthropicApiKey) {
  anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
}

let localLlm = null;
if (config.localLlmUrl) {
  localLlm = new OpenAI({
    baseURL: config.localLlmUrl,
    apiKey: 'local-dummy-key'
  });
}

/**
 * Route completions to the best model depending on the requested tier.
 * Tiers:
 * - 'fast': simple tasks (e.g. gemini-2.5-flash-lite via OpenRouter or gpt-4o-mini)
 * - 'smart': complex reasoning (e.g. claude-3-5-sonnet-latest via Anthropic or OpenRouter)
 * - 'coding': complex code generation (e.g. Claude 3.5 Sonnet / GPT-4o)
 */
async function generateCompletion({ messages, tools, tier = 'fast' }) {
  // Determine provider and model
  let provider = 'openrouter';
  let modelName = 'google/gemini-2.5-flash-lite';

  if (config.localLlmUrl && localLlm) {
    provider = 'local';
    modelName = config.localLlmModel || 'llama3';
  } else if (tier === 'smart' || tier === 'coding') {
    if (config.anthropicApiKey && anthropic) {
      provider = 'anthropic';
      modelName = 'claude-3-5-sonnet-latest';
    } else if (config.openaiApiKey && openai) {
      provider = 'openai';
      modelName = 'gpt-4o';
    } else {
      provider = 'openrouter';
      modelName = 'anthropic/claude-3.5-sonnet';
    }
  } else {
    // fast / default tier
    if (config.openaiApiKey && openai) {
      provider = 'openai';
      modelName = 'gpt-4o-mini';
    } else {
      provider = 'openrouter';
      modelName = 'google/gemini-2.5-flash-lite';
    }
  }

  console.log(`[LLM ROUTER] Routing request using tier "${tier}" -> Provider: ${provider}, Model: ${modelName}`);


  if (provider === 'anthropic' && anthropic) {
    // Adapt tool formats from OpenAI/OpenRouter style to Anthropic style if tools are present
    const anthropicTools = tools ? tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: {
        type: 'object',
        properties: t.function.parameters?.properties || {},
        required: t.function.parameters?.required || []
      }
    })) : undefined;

    // Separate system message if exists
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const cleanMessages = messages.filter(m => m.role !== 'system').map(m => {
      // Map tool roles
      if (m.role === 'tool') {
        return {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: m.tool_call_id,
              content: m.content
            }
          ]
        };
      }
      if (m.role === 'assistant' && m.tool_calls) {
        return {
          role: 'assistant',
          content: [
            { type: 'text', text: m.content || '' },
            ...m.tool_calls.map(tc => ({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments || '{}')
            }))
          ]
        };
      }
      return { role: m.role, content: m.content };
    });

    const response = await anthropic.messages.create({
      model: modelName,
      max_tokens: 4096,
      system: systemMsg,
      messages: cleanMessages,
      tools: anthropicTools
    });

    // Convert Anthropic response format back to OpenAI-compatible structure
    const toolCalls = [];
    let textContent = '';

    if (Array.isArray(response.content)) {
      for (const block of response.content) {
        if (block.type === 'text') {
          textContent += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input)
            }
          });
        }
      }
    }

    return {
      role: 'assistant',
      content: textContent || null,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }

  if (provider === 'local' && localLlm) {
    const formattedTools = tools ? tools.map(t => ({
      type: 'function',
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters
      }
    })) : undefined;

    const response = await localLlm.chat.completions.create({
      model: modelName,
      messages: messages,
      tools: formattedTools
    });

    return response.choices[0].message;
  }

  if (provider === 'openai' && openai) {
    const formattedTools = tools ? tools.map(t => ({
      type: 'function',
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters
      }
    })) : undefined;

    const response = await openai.chat.completions.create({
      model: modelName,
      messages: messages,
      tools: formattedTools
    });

    return response.choices[0].message;
  }

  // Fallback / OpenRouter direct fetch
  if (!config.openrouterApiKey) {
    throw new Error("Missing OpenRouter API Key for fallback routing.");
  }

  const callRouter = async (model) => {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.openrouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Dhiman Sovereign"
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        tools: tools
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message || `HTTP Request failed with status ${response.status}`);
    }

    return payload.choices[0].message;
  };

  try {
    return await callRouter(modelName);
  } catch (err) {
    console.warn(`[LLM ROUTER] Model ${modelName} failed: ${err.message}. Triggering fallback...`);
    if (modelName !== 'google/gemini-2.5-flash-lite') {
      console.warn(`[LLM ROUTER] Fallback triggered: Model ${modelName} failed, retrying with google/gemini-2.5-flash-lite`);
      return await callRouter('google/gemini-2.5-flash-lite');
    }
    throw err;
  }
}

module.exports = {
  generateCompletion
};
