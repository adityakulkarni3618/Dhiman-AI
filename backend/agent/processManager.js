const { execSync } = require('child_process');

class ProcessManager {
  constructor() {
    this.processes = new Map(); // pid -> meta
  }

  registerProcess(pid, meta) {
    this.processes.set(pid, {
      pid,
      taskId: meta.taskId || null,
      command: meta.command || '',
      cwd: meta.cwd || '',
      port: meta.port || null,
      startTime: new Date()
    });
    console.log(`[PROCESS MANAGER] Registered process ${pid}:`, meta);
  }

  getProcessByTask(taskId) {
    return Array.from(this.processes.values()).find(p => p.taskId === taskId);
  }

  getProcessByCwd(cwd) {
    return Array.from(this.processes.values()).find(p => p.cwd === cwd);
  }

  stopProcess(pid) {
    const proc = this.processes.get(pid);
    if (!proc) return false;

    console.log(`[PROCESS MANAGER] Terminating process tree for PID ${pid}...`);
    try {
      execSync(`taskkill /pid ${pid} /f /t`);
    } catch (err) {
      try {
        process.kill(pid);
      } catch (e) {
        // ignore
      }
    }
    
    this.processes.delete(pid);
    return true;
  }

  stopAllForTask(taskId) {
    const procs = Array.from(this.processes.values()).filter(p => p.taskId === taskId);
    for (const p of procs) {
      this.stopProcess(p.pid);
    }
  }
}

module.exports = new ProcessManager();
