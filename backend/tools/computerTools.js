const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { registerTool } = require('./registry');

/**
 * Execute helper wrapping PowerShell commands.
 */
function runPowerShell(cmd) {
  return new Promise((resolve) => {
    // Escaping script blocks for PowerShell execution
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${cmd.replace(/"/g, '\\"')}"`, (error, stdout, stderr) => {
      resolve({
        success: !error,
        output: (stdout || '').trim(),
        error: (stderr || '').trim()
      });
    });
  });
}

// ==========================================
// 1. COMPUTER_SCREENSHOT
// ==========================================
registerTool({
  name: "computer_screenshot",
  description: "Captures a full screenshot of the primary monitor display and saves it to the workspace.",
  category: "computer",
  parameters: {
    type: "object",
    properties: {
      filename: { type: "string", description: "Target image filename e.g. desktop_screenshot.png" }
    },
    required: ["filename"]
  },
  riskLevel: "SAFE",
  execute: async (args) => {
    const targetPath = path.resolve(args.filename);
    if (!targetPath.startsWith(path.resolve('.'))) {
      return "Security Error: Destination path lies outside workspace.";
    }

    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $screen = [System.Windows.Forms.Screen]::PrimaryScreen
      $bitmap = New-Object System.Drawing.Bitmap $screen.Bounds.Width, $screen.Bounds.Height
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.CopyFromScreen($screen.Bounds.X, $screen.Bounds.Y, 0, 0, $bitmap.Size)
      $bitmap.Save('${targetPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
      $graphics.Dispose()
      $bitmap.Dispose()
    `;

    const res = await runPowerShell(script);
    if (res.success && fs.existsSync(targetPath)) {
      return `Screenshot successfully captured and saved to: ${args.filename}`;
    }
    return `Failed to capture screenshot: ${res.error || 'unknown error'}`;
  }
});

// ==========================================
// 2. COMPUTER_GET_ACTIVE_WINDOWS
// ==========================================
registerTool({
  name: "computer_get_active_windows",
  description: "Lists all currently open desktop application windows and their processes.",
  category: "computer",
  parameters: { type: "object", properties: {} },
  riskLevel: "SAFE",
  execute: async () => {
    const script = `
      Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object -Property Id, ProcessName, MainWindowTitle | ConvertTo-Json
    `;
    const res = await runPowerShell(script);
    if (!res.success) return `Error fetching windows: ${res.error}`;
    return res.output || "No active application windows found.";
  }
});

// ==========================================
// 3. COMPUTER_KEYBOARD_TYPE
// ==========================================
registerTool({
  name: "computer_keyboard_type",
  description: "Simulates pressing key sequences or typing text globally.",
  category: "computer",
  parameters: {
    type: "object",
    properties: {
      keys: { type: "string", description: "Keys to send, e.g. 'Hello World' or hotkey markers like '%{F4}' (Alt+F4)" }
    },
    required: ["keys"]
  },
  riskLevel: "CONFIRM",
  execute: async (args) => {
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait('${args.keys.replace(/'/g, "''")}')
    `;
    const res = await runPowerShell(script);
    return res.success ? `Successfully typed key sequence.` : `Type sequence failed: ${res.error}`;
  }
});

// ==========================================
// 4. COMPUTER_MOUSE_CLICK
// ==========================================
registerTool({
  name: "computer_mouse_click",
  description: "Simulates a mouse movement and click at X, Y screen coordinates.",
  category: "computer",
  parameters: {
    type: "object",
    properties: {
      x: { type: "number" },
      y: { type: "number" },
      clickType: { type: "string", enum: ["left", "right", "double"], default: "left" }
    },
    required: ["x", "y"]
  },
  riskLevel: "CONFIRM",
  execute: async (args) => {
    const clickCode = args.clickType === 'right' ? '0x0008 | 0x0010' : '0x0002 | 0x0004';
    const isDouble = args.clickType === 'double';

    const script = `
      $signature = @'
      [DllImport("user32.dll")]
      public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
      [DllImport("user32.dll")]
      public static extern bool SetCursorPos(int X, int Y);
'@
      $type = Add-Type -MemberDefinition $signature -Name "MouseSimulator" -Namespace "WinAPI" -PassThru
      $null = $type::SetCursorPos(${args.x}, ${args.y})
      $type::mouse_event(${clickCode}, 0, 0, 0, 0)
      if (${isDouble ? 'true' : 'false'}) {
        Start-Sleep -m 100
        $type::mouse_event(${clickCode}, 0, 0, 0, 0)
      }
    `;
    const res = await runPowerShell(script);
    return res.success ? `Mouse clicked at ${args.x}, ${args.y}` : `Mouse action failed: ${res.error}`;
  }
});

// ==========================================
// 5. APPLICATION_LAUNCH
// ==========================================
registerTool({
  name: "application_launch",
  description: "Launches a designated desktop application on the host Windows machine.",
  category: "computer",
  parameters: {
    type: "object",
    properties: {
      appKeyword: { type: "string", description: "Application name keyword, e.g. VS Code, Chrome, Notepad, Calculator" }
    },
    required: ["appKeyword"]
  },
  riskLevel: "CONFIRM",
  execute: async (args) => {
    const { resolveApplication } = require('../agent/appResolver');
    const execName = resolveApplication(args.appKeyword);
    const script = `Start-Process "${execName}"`;
    const res = await runPowerShell(script);
    if (!res.success) {
      return `Failed to launch application: ${res.error}`;
    }

    // Verify execution process existence
    let processKeyword = args.appKeyword.toLowerCase();
    if (processKeyword.includes('code') || processKeyword.includes('vs')) processKeyword = 'code';
    else if (processKeyword.includes('notepad')) processKeyword = 'notepad';
    else if (processKeyword.includes('calc')) processKeyword = 'calculator';
    else if (processKeyword.includes('chrome')) processKeyword = 'chrome';
    
    let launched = false;
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 500));
      const verifyScript = `Get-Process -Name "${processKeyword}" -ErrorAction SilentlyContinue`;
      const verifyRes = await runPowerShell(verifyScript);
      if (verifyRes.success && verifyRes.output) {
        launched = true;
        break;
      }
    }

    if (launched) {
      return `Application "${args.appKeyword}" launched and verified successfully.`;
    }
    return `Application "${args.appKeyword}" launch command executed, but process could not be verified.`;
  }
});

// ==========================================
// 6. APPLICATION_CLOSE
// ==========================================
registerTool({
  name: "application_close",
  description: "Terminates an application process by process name keyword.",
  category: "computer",
  parameters: {
    type: "object",
    properties: {
      processName: { type: "string", description: "Process keyword e.g. notepad, chrome, calc" }
    },
    required: ["processName"]
  },
  riskLevel: "DANGEROUS",
  execute: async (args) => {
    const script = `Stop-Process -Name "${args.processName}" -Force`;
    const res = await runPowerShell(script);
    return res.success ? `Successfully closed process "${args.processName}".` : `Failed to close process: ${res.error}`;
  }
});

// ==========================================
// 7. COMPUTER_OBSERVE
// ==========================================
registerTool({
  name: "computer_observe",
  description: "Collects the current state parameters of the Windows host machine (active window title, process listings, running dev server ports).",
  category: "computer",
  parameters: {
    type: "object",
    properties: {
      scope: { type: "string", enum: ["screenshot", "window", "process", "full"], default: "full" }
    }
  },
  riskLevel: "SAFE",
  execute: async (args) => {
    const scope = args.scope || 'full';
    const state = {
      timestamp: new Date().toISOString()
    };

    if (scope === 'window' || scope === 'full') {
      const winScript = `Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object -Property Id, ProcessName, MainWindowTitle | ConvertTo-Json`;
      const winRes = await runPowerShell(winScript);
      state.windows = winRes.success ? JSON.parse(winRes.output || '[]') : [];
    }

    if (scope === 'process' || scope === 'full') {
      const procScript = `Get-Process | Select-Object -Property Id, ProcessName | ConvertTo-Json`;
      const procRes = await runPowerShell(procScript);
      state.processes = procRes.success ? JSON.parse(procRes.output || '[]').slice(0, 30) : [];
    }

    if (scope === 'screenshot' || scope === 'full') {
      const targetPath = path.resolve('computer_state_check.png');
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen
        $bitmap = New-Object System.Drawing.Bitmap $screen.Bounds.Width, $screen.Bounds.Height
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($screen.Bounds.X, $screen.Bounds.Y, 0, 0, $bitmap.Size)
        $bitmap.Save('${targetPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
        $graphics.Dispose()
        $bitmap.Dispose()
      `;
      await runPowerShell(script);
      state.screenshotPath = targetPath;
    }

    return JSON.stringify(state, null, 2);
  }
});
