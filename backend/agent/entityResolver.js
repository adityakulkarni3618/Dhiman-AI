const fs = require('fs');
const path = require('path');

// Active context memory state
let activeContext = {
  activeProject: null,      // Absolute path to current project folder
  activeApp: null,          // e.g. "code", "chrome", "notepad"
  activeFile: null,         // Current active file path
  activeError: null,        // Last error string (e.g. failing test logs)
  activeProcess: null       // ChildProcess object or process identifier
};

// Workspace root directories to search
const workspaceRoots = process.env.WORKSPACE_ROOTS 
  ? process.env.WORKSPACE_ROOTS.split(';').map(p => path.resolve(p.trim()))
  : [path.resolve(path.join(__dirname, '..', '..', '..'))]; // Default parent drive/folder (e.g. e:\)

/**
 * Scans workspace roots to find projects containing package.json or README/git configurations.
 */
function scanProjects() {
  const projects = [];

  for (const root of workspaceRoots) {
    if (!fs.existsSync(root)) continue;
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dirPath = path.join(root, entry.name);

        const projectMeta = {
          name: entry.name,
          path: dirPath,
          aliases: [entry.name.toLowerCase(), entry.name.replace(/[-_]/g, ' ').toLowerCase()],
          type: 'NODE',
          devCommand: 'npm run dev',
          startCommand: 'npm start',
          testCommand: 'npm test'
        };

        // Inspect packages for meta
        const packageJsonPath = path.join(dirPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            if (pkg.name) {
              projectMeta.aliases.push(pkg.name.toLowerCase());
              projectMeta.aliases.push(pkg.name.replace(/[-_]/g, ' ').toLowerCase());
            }
            if (pkg.description) {
              projectMeta.description = pkg.description;
            }
            if (pkg.scripts) {
              if (pkg.scripts.dev) projectMeta.devCommand = 'npm run dev';
              else if (pkg.scripts.start) projectMeta.devCommand = 'npm start';
              
              if (pkg.scripts.test) projectMeta.testCommand = 'npm test';
            }
          } catch (e) {
            // Ignore malformed json
          }
          projects.push(projectMeta);
        } else {
          // General directory fallback (if it contains Git or README)
          const hasGit = fs.existsSync(path.join(dirPath, '.git'));
          const hasReadme = fs.existsSync(path.join(dirPath, 'README.md'));
          if (hasGit || hasReadme) {
            projectMeta.type = 'GENERAL';
            projects.push(projectMeta);
          }
        }
      }
    } catch (err) {
      console.error(`[ENTITY RESOLVER] Error reading workspace root "${root}":`, err.message);
    }
  }

  return projects;
}

/**
 * Resolves natural target references to project entities with confidence scores.
 */
function resolveTarget(query) {
  const clean = query.trim().toLowerCase();
  
  // Contextual reference checks (e.g. "it", "the project", "run it")
  if (/^(it|the project|that|the app|the store|run it|stop it|fix it)$/.test(clean)) {
    if (activeContext.activeProject) {
      return [{
        entity: path.basename(activeContext.activeProject),
        path: activeContext.activeProject,
        type: 'project',
        confidence: 1.0,
        source: 'context'
      }];
    }
  }

  const projects = scanProjects();
  const matches = [];

  for (const p of projects) {
    let score = 0;
    
    // Exact name matches
    if (clean === p.name.toLowerCase()) score = 1.0;
    // Alias matches
    else if (p.aliases.some(a => clean === a || clean.includes(a))) score = 0.9;
    // Keyword match on specific type
    else if (clean.includes('store') && (p.name.toLowerCase().includes('store') || (p.description && p.description.toLowerCase().includes('store')))) score = 0.85;
    else if (clean.includes('ai') && (p.name.toLowerCase().includes('ai') || p.name.toLowerCase().includes('assistant'))) score = 0.8;
    else if (p.name.toLowerCase().includes(clean)) score = 0.7;

    if (score > 0) {
      matches.push({
        entity: p.name,
        path: p.path,
        type: 'project',
        confidence: score,
        source: 'filesystem',
        devCommand: p.devCommand,
        testCommand: p.testCommand
      });
    }
  }

  // Sort by confidence descending
  matches.sort((a, b) => b.confidence - a.confidence);
  return matches;
}

/**
 * Updates active workspace states.
 */
function updateContext(update) {
  activeContext = { ...activeContext, ...update };
  console.log(`[ENTITY RESOLVER] Context updated:`, activeContext);
}

function getContext() {
  return activeContext;
}

module.exports = {
  resolveTarget,
  updateContext,
  getContext,
  scanProjects
};
