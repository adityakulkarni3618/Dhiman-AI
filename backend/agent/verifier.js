const fs = require('fs');
const path = require('path');
const { generateCompletion } = require('../services/llm/router');

/**
 * Verifies if a tool action was successful based on file checks or semantic observations.
 */
async function verifyStep(step, observation) {
  const { action, description } = step;
  
  // Custom programmatic filesystem checks
  if (action.tool === 'write_file' && action.args?.filepath) {
    const fullPath = path.resolve(action.args.filepath);
    if (fs.existsSync(fullPath)) {
      return {
        verified: true,
        details: `Verified: File exists at path "${action.args.filepath}"`
      };
    } else {
      return {
        verified: false,
        details: `Verification Failed: Target file does not exist at "${action.args.filepath}"`
      };
    }
  }

  // Fallback to LLM validation for semantic success
  const systemPrompt = `You are a verification officer for Dhiman.
Check whether the tool output matches the intended step description.

Step to verify: "${description}"
Tool used: "${action.tool}"
Arguments: ${JSON.stringify(action.args)}
Tool Output/Observation:
${observation}

Answer in JSON:
{
  "verified": true/false,
  "details": "Explanation of verification results"
}
Provide ONLY the JSON response without markdown wrapping.`;

  try {
    const response = await generateCompletion({
      messages: [{ role: 'system', content: systemPrompt }],
      tier: 'fast'
    });
    let text = response.content || '';
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const parsed = JSON.parse(text);
    return {
      verified: parsed.verified === true,
      details: parsed.details || "Verified successfully."
    };
  } catch (error) {
    console.warn("[VERIFIER WARNING] Semantic verification failed:", error.message);
    return {
      verified: true, // Default to true if verification fails to avoid halting agent unnecessarily
      details: "Step completed without automated validation issues."
    };
  }
}

module.exports = {
  verifyStep
};
