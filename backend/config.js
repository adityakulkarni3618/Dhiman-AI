require('dotenv').config();

const config = {
  port: process.env.PORT || 5005,
  openrouterApiKey: process.env.OPENROUTER_API_KEY || null,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  openaiApiKey: process.env.OPENAI_API_KEY || null,
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/dhiman_ai',
  githubToken: process.env.GITHUB_TOKEN || null,
  tavilyApiKey: process.env.TAVILY_API_KEY || null,
  functionizeClientId: process.env.FUNCTIONIZE_CLIENT_ID || null,
  functionizeClientSecret: process.env.FUNCTIONIZE_CLIENT_SECRET || null,
  emailUser: process.env.EMAIL_USER || null,
  emailPass: process.env.EMAIL_PASS || null
};

// Structural checks for required API credentials
console.log("=========================================");
console.log("⚙️  CONFIG VALIDATION METRICS:");
console.log("🌐 OPENROUTER API KEY:", config.openrouterApiKey ? "✅ FOUND" : "❌ NOT FOUND");
console.log("🌐 ANTHROPIC API KEY :", config.anthropicApiKey ? "✅ FOUND" : "⚠️  MISSING");
console.log("🌐 OPENAI API KEY    :", config.openaiApiKey ? "✅ FOUND" : "⚠️  MISSING");
console.log("🌐 MONGODB URI       :", config.mongodbUri ? "✅ FOUND" : "❌ MISSING");
console.log("🌐 GITHUB TOKEN      :", config.githubToken ? "✅ FOUND" : "⚠️  MISSING (GitHub tools will be mocked)");
console.log("🌐 FUNCTIONIZE API   :", (config.functionizeClientId && config.functionizeClientSecret) ? "✅ FOUND" : "⚠️  MISSING (Functionize tools will be mocked)");
console.log("🌐 EMAIL SERVICE     :", (config.emailUser && config.emailPass) ? "✅ FOUND" : "⚠️  MISSING (Email tools will be mocked)");
console.log("=========================================");

module.exports = config;
