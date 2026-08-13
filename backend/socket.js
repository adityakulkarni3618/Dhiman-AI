const db = require('./db');
const ai = require('./services/ai');
const { toolsConfiguration, agentTools } = require('./services/tools');

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('⚡ Dhiman Neural Link Securely Established');

    socket.on('solve-doubt', async (data) => {
      // Standardize input format (handling either raw string or object)
      const userInput = typeof data === 'string' ? data : data.message;
      const conversationId = typeof data === 'object' ? data.conversationId : null;

      console.log(`📡 Inbound Query: "${userInput}" in conversation "${conversationId}"`);
      socket.emit('state-change', { state: 'thinking' });

      try {
        // 1. Get or create database conversation reference
        const activeConversationId = await db.getOrCreateConversation(conversationId, userInput);
        
        // 2. Save incoming user message
        await db.saveMessage(activeConversationId, 'user', userInput);

        // 3. Fetch history and memories
        const recentMessages = await db.getRecentMessages(activeConversationId, 12);
        
        // Get query embedding and fetch memory facts
        let memoryFacts = [];
        try {
          const queryEmbedding = await ai.getEmbedding(userInput);
          if (queryEmbedding) {
            memoryFacts = await db.fetchRelevantMemoryFacts(queryEmbedding, 4);
          }
        } catch (embError) {
          console.warn('Memory search skipped: failed to generate query embedding', embError.message);
        }

        // 4. Build message payload for model
        let systemPrompt = "You are Dhiman, a knowledgeable, supportive, and highly capable AI assistant for Aditya. You can help him with anything he asks, including technical concepts, general knowledge, daily planning, coding, and creative tasks. Adapt your tone and response style to match the topic he introduces, and answer clearly and helpfully.";
        if (memoryFacts.length > 0) {
          systemPrompt += "\n\nLong-term memory context:\n" + memoryFacts.map((fact, index) => `${index + 1}. ${fact.fact}`).join('\n');
        }

        let conversationHistory = [
          { role: "system", content: systemPrompt },
          ...recentMessages.map((msg) => {
            let contentStr = '';
            if (typeof msg.content === 'string') {
              contentStr = msg.content;
            } else if (Array.isArray(msg.content)) {
              const textBlocks = msg.content.filter(block => block.type === 'text');
              contentStr = textBlocks.map(b => b.text).join('\n');
            } else if (msg.content) {
              contentStr = JSON.stringify(msg.content);
            }
            return { role: msg.role, content: contentStr };
          })
        ];

        let loopGuard = 0;
        let keepProcessing = true;

        while (keepProcessing && loopGuard < 5) {
          loopGuard++;

          const modelMessage = await ai.generateChatCompletion({
            messages: conversationHistory,
            tools: toolsConfiguration
          });

          // Check if the AI model requested an Agentic function loop tool execution
          if (modelMessage.tool_calls && modelMessage.tool_calls.length > 0) {
            console.log(`⚙️ OpenRouter Route intercepted tool request.`);
            
            // Append the assistant's tool-request metadata back into history context arrays
            conversationHistory.push(modelMessage);

            for (const toolCall of modelMessage.tool_calls) {
              const { name, arguments: argsString } = toolCall.function;
              const parsedArgs = JSON.parse(argsString);

              console.log(`🚀 Executing local tool block: ${name}`);
              socket.emit('tool-status', { status: 'running', name, args: parsedArgs });
              
              let executionOutput = { result: "Requested process structure failed to initialize." };
              if (agentTools[name]) {
                executionOutput = await agentTools[name](parsedArgs);
              }

              socket.emit('tool-status', { status: 'completed', name, result: executionOutput.result });

              // Push the matching execution output payload down the OpenAI history stream layout
              conversationHistory.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name: name,
                content: JSON.stringify(executionOutput)
              });
            }
            // Continue loop to feed data results back to the model for synthesizing
          } else {
            // No tools requested, response generation complete
            keepProcessing = false;
            
            // Save reply to DB
            await db.saveMessage(activeConversationId, 'assistant', modelMessage.content || '');

            socket.emit('state-change', { state: 'speaking' });
            socket.emit('dhiman-reply', { text: modelMessage.content || '', conversationId: activeConversationId });
          }
        }

      } catch (error) {
        console.error("❌ Detailed Pipeline Processing Failure:", error);
        socket.emit('state-change', { state: 'idle' });
        socket.emit('dhiman-reply', { 
          text: `⚠️ Dhiman Core Pipeline Failure:\n\n${error.message || "Network handshake interruption."}\n\nCheck your configuration parameters and network connection.` 
        });
      }
    });

    socket.on('disconnect', () => {
      console.log('🔌 Neural Link Severed');
    });
  });
}

module.exports = registerSocketHandlers;
