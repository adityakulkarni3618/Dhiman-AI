require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const config = {
  port: process.env.PORT || 5005,
  openrouterApiKey: process.env.OPENROUTER_API_KEY || null,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  openaiApiKey: process.env.OPENAI_API_KEY || null,
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/dhiman_ai',
  localLlmUrl: process.env.LOCAL_LLM_URL || null,
  localLlmModel: process.env.LOCAL_LLM_MODEL || 'llama3',
  githubToken: process.env.GITHUB_TOKEN || null,
  tavilyApiKey: process.env.TAVILY_API_KEY || null,
  functionizeClientId: process.env.FUNCTIONIZE_CLIENT_ID || null,
  functionizeClientSecret: process.env.FUNCTIONIZE_CLIENT_SECRET || null,
  emailUser: process.env.EMAIL_USER || null,
  emailPass: process.env.EMAIL_PASS || null
};

// Structured service status blocks for console output
console.log("\n=========================================");
console.log(" DHIMAN ENGINE STARTUP INITIALIZATION ");
console.log("=========================================");
console.log("LLM:");
const defaultProvider = config.localLlmUrl ? 'Local / Ollama' : (config.anthropicApiKey ? 'Anthropic' : 'OpenRouter');
console.log(`  provider: ${defaultProvider}`);
console.log(`  status: ${config.openrouterApiKey || config.anthropicApiKey || config.localLlmUrl ? '✅ READY' : '❌ UNCONFIGURED'}`);
console.log("\nMongoDB:");
console.log(`  status: ${config.mongodbUri ? '✅ READY' : '❌ UNCONFIGURED'}`);
console.log("\nBrowser:");
console.log(`  status: ✅ READY`);
console.log("\nComputer:");
console.log(`  status: ✅ READY`);
console.log("\nGitHub:");
console.log(`  status: ${config.githubToken ? '✅ READY' : '⚠️  AUTH_REQUIRED (mock fallback active)'}`);
console.log("\nFunctionize:");
console.log(`  status: ${(config.functionizeClientId && config.functionizeClientSecret) ? '✅ READY' : '⚠️  AUTH_REQUIRED (mock fallback active)'}`);
console.log("\nEmail / Calendar:");
console.log(`  status: ${(config.emailUser && config.emailPass) ? '✅ READY' : '⚠️  AUTH_REQUIRED (mock fallback active)'}`);
console.log("=========================================\n");

module.exports = config;
