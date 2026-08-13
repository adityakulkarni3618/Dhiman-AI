require('dotenv').config();

const config = {
  port: process.env.PORT || 5005,
  openrouterApiKey: process.env.OPENROUTER_API_KEY || null,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  openaiApiKey: process.env.OPENAI_API_KEY || null,
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/dhiman_ai'
};

// Structural checks for required API credentials
console.log("=========================================");
console.log("⚙️  CONFIG VALIDATION METRICS:");
console.log("🌐 OPENROUTER API KEY:", config.openrouterApiKey ? "✅ FOUND" : "❌ NOT FOUND");
console.log("🌐 ANTHROPIC API KEY :", config.anthropicApiKey ? "✅ FOUND" : "⚠️  MISSING (will fallback to OpenRouter)");
console.log("🌐 OPENAI API KEY    :", config.openaiApiKey ? "✅ FOUND (Embeddings active)" : "⚠️  MISSING (Embedding logic will be skipped)");
console.log("🌐 MONGODB URI       :", config.mongodbUri ? "✅ FOUND" : "❌ MISSING");
console.log("=========================================");

module.exports = config;
