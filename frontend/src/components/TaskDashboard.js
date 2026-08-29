import React, { useState, useEffect } from 'react';
import { X, Play, Pause, Trash2, Calendar, Bell, Loader2, Plus } from 'lucide-react';

export default function TaskDashboard({ isOpen, onClose, activeTask, socket }) {
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newGoal, setNewGoal] = useState('');
  const [newFreq, setNewFreq] = useState('daily');
  const [activeTab, setActiveTab] = useState('tasks');

  useEffect(() => {
    if (isOpen) {
      fetchScheduled();
      fetchNotifications();
    }
  }, [isOpen]);

  const fetchScheduled = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/tasks/scheduled');
      if (res.ok) {
        const data = await res.json();
        setScheduledTasks(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/tasks/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddSchedule = async (e) => {
    e.preventDefault();
    if (!newGoal.trim()) return;
    try {
      const res = await fetch('/api/tasks/scheduled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: newGoal.trim(), frequency: newFreq })
      });
      if (res.ok) {
        setNewGoal('');
        fetchScheduled();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelTask = () => {
    if (activeTask && activeTask.id) {
      socket.emit('cancel-task', { taskId: activeTask.id });
    }
  };

  const markAllRead = async () => {
    try {
      await fetch('/api/tasks/notifications/read', { method: 'POST' });
      fetchNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm transition-all duration-300">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-lg h-full bg-[#030914] border-l border-blue-900/40 text-slate-100 flex flex-col shadow-2xl p-6 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-blue-950/40 pb-4 mb-4 shrink-0">
          <div>
            <h2 className="text-base font-bold font-mono tracking-wider text-cyan-400 uppercase">Operational Task Center</h2>
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Active queue, schedules and alerts</p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg border border-blue-900/30 hover:border-cyan-500/40 text-slate-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab selector */}
        <div className="flex gap-2 mb-4 border-b border-blue-950/30 pb-2 shrink-0">
          <button 
            onClick={() => setActiveTab('tasks')}
            className={`px-3 py-1.5 rounded-lg font-mono text-xs transition-all ${activeTab === 'tasks' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Running Tasks
          </button>
          <button 
            onClick={() => setActiveTab('schedule')}
            className={`px-3 py-1.5 rounded-lg font-mono text-xs transition-all ${activeTab === 'schedule' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Scheduler
          </button>
          <button 
            onClick={() => setActiveTab('alerts')}
            className={`px-3 py-1.5 rounded-lg font-mono text-xs transition-all ${activeTab === 'alerts' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Notifications
          </button>
        </div>

        {/* Dynamic tab contents */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
          {activeTab === 'tasks' && (
            <div className="space-y-4">
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">Active Execution Queue</span>
              {activeTask ? (
                <div className="p-4 rounded-xl border border-cyan-500/30 bg-cyan-950/10 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div className="font-mono text-xs text-slate-300">
                      <strong>Goal:</strong> {activeTask.goal}
                    </div>
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-cyan-500 text-black font-bold animate-pulse">
                      {activeTask.status}
                    </span>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button 
                      onClick={handleCancelTask}
                      className="px-3 py-1.5 bg-red-950/20 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-xs font-mono font-bold transition-all"
                    >
                      Cancel Execution
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 text-slate-600 font-mono text-xs italic">
                  No active task running in background.
                </div>
              )}
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-4">
              <form onSubmit={handleAddSchedule} className="p-3.5 rounded-xl border border-blue-950/60 bg-black/20 space-y-3">
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">Schedule New Job</span>
                <input 
                  type="text"
                  value={newGoal}
                  onChange={(e) => setNewGoal(e.target.value)}
                  placeholder="e.g. Check GitHub issues for latest failures"
                  className="w-full bg-black/40 border border-blue-900/40 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 outline-none focus:border-cyan-500 transition-all"
                />
                <div className="flex gap-2">
                  <select 
                    value={newFreq}
                    onChange={(e) => setNewFreq(e.target.value)}
                    className="bg-[#030914] border border-blue-900/40 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500 transition-all flex-1"
                  >
                    <option value="every 5 minutes">Every 5 minutes</option>
                    <option value="every 1 hour">Every Hour</option>
                    <option value="daily">Daily</option>
                  </select>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:text-white rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Add Job
                  </button>
                </div>
              </form>

              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">Active Scheduled Cron Jobs</span>
              {scheduledTasks.length === 0 ? (
                <div className="text-center py-10 text-slate-600 font-mono text-xs italic">No scheduled tasks.</div>
              ) : (
                scheduledTasks.map(t => (
                  <div key={t._id} className="p-3 rounded-xl border border-blue-950/40 bg-white/[0.01] flex justify-between items-center gap-3">
                    <div className="font-mono text-xs">
                      <div className="text-slate-300">{t.goal}</div>
                      <div className="text-slate-500 text-[10px] mt-1 flex items-center gap-1">
                        <Calendar size={11} /> Every {t.frequency} | Next run: {new Date(t.nextRun).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'alerts' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">Alert logs</span>
                <button onClick={markAllRead} className="text-[10px] font-mono text-cyan-400 hover:underline">Mark all read</button>
              </div>

              {notifications.length === 0 ? (
                <div className="text-center py-20 text-slate-600 font-mono text-xs italic">No alerts logged.</div>
              ) : (
                notifications.map(n => (
                  <div key={n._id} className={`p-3 rounded-xl border border-blue-950/40 hover:border-blue-900/30 transition-all flex gap-3 items-start ${n.read ? 'opacity-60 bg-white/[0.005]' : 'bg-cyan-500/[0.02]'}`}>
                    <Bell size={14} className={`mt-0.5 shrink-0 ${n.type === 'FAILURE' ? 'text-red-400' : 'text-cyan-400'}`} />
                    <div className="font-mono text-xs flex-1">
                      <div className="font-bold text-slate-200">{n.title}</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">{n.message}</div>
                      <div className="text-slate-600 text-[9px] mt-1">{new Date(n.createdAt).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
