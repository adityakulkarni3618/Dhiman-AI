const fs = require('fs');
const path = require('path');

/**
 * Maps input application aliases to valid system executable commands or files.
 */
function resolveApplication(appName) {
  const clean = appName.trim().toLowerCase();
  
  const aliases = {
    'vscode': 'code',
    'visual studio code': 'code',
    'chrome': 'chrome',
    'google chrome': 'chrome',
    'notepad': 'notepad',
    'calculator': 'calc',
    'calc': 'calc'
  };

  const name = aliases[clean] || clean;

  // Direct known installation locations on Windows
  const directPaths = {
    code: [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe'),
      path.join(process.env.ProgramFiles || '', 'Microsoft VS Code', 'Code.exe')
    ],
    chrome: [
      path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
    ],
    notepad: ['notepad.exe'],
    calc: ['calc.exe']
  };

  if (directPaths[name]) {
    for (const p of directPaths[name]) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  }

  return name;
}

module.exports = {
  resolveApplication
};
