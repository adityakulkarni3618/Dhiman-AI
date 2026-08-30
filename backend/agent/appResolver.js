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
    'calc': 'calc',
    'paint': 'mspaint',
    'mspaint': 'mspaint',
    'spotify': 'spotify',
    'file explorer': 'explorer',
    'explorer': 'explorer'
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
      path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
    ],
    notepad: ['notepad.exe'],
    calc: ['calc.exe'],
    mspaint: ['mspaint.exe'],
    explorer: ['explorer.exe'],
    spotify: [
      path.join(process.env.APPDATA || '', 'Spotify', 'Spotify.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'Spotify.exe')
    ]
  };

  if (directPaths[name]) {
    for (const p of directPaths[name]) {
      if (p.endsWith('.exe') && !p.includes('\\')) {
        return p; // Return system-wide executable names directly
      }
      if (fs.existsSync(p)) {
        return p;
      }
    }
  }

  // Fallback: return the resolved or original name
  return name;
}

module.exports = {
  resolveApplication
};

