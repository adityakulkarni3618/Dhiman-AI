import React, { useState, useEffect } from 'react';
import { Trash2, Plus, X, Loader2, ShieldAlert, Cpu, Zap } from 'lucide-react';

export default function MemoryManager({ isOpen, onClose }) {
  const [facts, setFacts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newFact, setNewFact] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [notification, setNotification] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchFacts();
    }
  }, [isOpen]);

  const fetchFacts = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/memory');
      if (res.ok) {
        const data = await res.json();
        setFacts(data.facts || []);
      } else {
        setError('Failed to fetch memory matrix.');
      }
    } catch (err) {
      setError('Connection failure loading memories.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddFact = async (e) => {
    e.preventDefault();
    if (!newFact.trim() || newFact.trim().length < 5) return;
    setIsAdding(true);
    setError('');
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fact: newFact.trim() })
      });
      if (res.ok) {
        setNewFact('');
        setNotification('Durable memory fact logged successfully.');
        fetchFacts();
      } else {
        setError('Failed to append memory.');
      }
    } catch (err) {
      setError('Connection failure logging memory.');
    } finally {
      setIsAdding(false);
      setTimeout(() => setNotification(''), 4000);
    }
  };

  const handleDeleteFact = async (id) => {
    try {
      const res = await fetch(`/api/memory/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setFacts(facts.filter((f) => f.id !== id));
        setNotification('Memory fact purged successfully.');
      } else {
        setError('Failed to purge memory fact.');
      }
    } catch (err) {
      setError('Connection failure purging memory.');
    } finally {
      setTimeout(() => setNotification(''), 4000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm transition-all duration-300">
      {/* Back drop click closer */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Slideout panel content */}
      <div className="relative w-full max-w-lg h-full bg-[#030914] border-l border-blue-900/40 text-slate-100 flex flex-col shadow-2xl p-6 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-blue-950/40 pb-4 mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <Cpu className="text-cyan-400 animate-pulse" size={22} />
            <div>
              <h2 className="text-base font-bold font-mono tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400 uppercase">Long-Term Memory Vault</h2>
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Active cognitive structures stored in vector space</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg border border-blue-900/30 hover:border-cyan-500/40 text-slate-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Info alerts */}
        {notification && (
          <div className="mb-3 text-[10px] bg-emerald-950/20 border border-emerald-900/30 text-emerald-400 p-2.5 rounded-lg font-mono flex items-center gap-1.5 shrink-0">
            <Zap size={11} className="shrink-0" /> {notification}
          </div>
        )}
        {error && (
          <div className="mb-3 text-[10px] bg-red-950/20 border border-red-900/30 text-red-400 p-2.5 rounded-lg font-mono flex items-center gap-1.5 shrink-0">
            <ShieldAlert size={11} className="shrink-0" /> {error}
          </div>
        )}

        {/* Add Memory Fact form */}
        <form onSubmit={handleAddFact} className="mb-4 flex flex-col gap-2 shrink-0">
          <label className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">Log Manual Fact</label>
          <div className="flex gap-2">
            <input 
              type="text"
              value={newFact}
              onChange={(e) => setNewFact(e.target.value)}
              placeholder="e.g. Aditya plans to focus on MIPS instruction pipelining tasks next week."
              className="flex-1 bg-black/40 border border-blue-900/40 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-600 outline-none focus:border-cyan-500 transition-all"
              disabled={isAdding}
            />
            <button 
              type="submit"
              disabled={isAdding || !newFact.trim()}
              className="py-2 px-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 hover:border-cyan-400 rounded-xl text-cyan-400 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shrink-0"
            >
              {isAdding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            </button>
          </div>
        </form>

        {/* Main List */}
        <div className="flex-1 overflow-y-auto space-y-2.5 custom-scrollbar pr-1">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">Persisted Facts ({facts.length})</span>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2 font-mono text-xs">
              <Loader2 className="animate-spin text-cyan-400" size={20} />
              Synchronizing vector space...
            </div>
          ) : facts.length === 0 ? (
            <div className="text-center py-20 text-slate-600 font-mono text-xs italic">
              No facts stored in long term memory. Use memory sync to populate facts automatically.
            </div>
          ) : (
            facts.map((item) => (
              <div 
                key={item.id} 
                className="group flex justify-between items-start gap-4 p-3 rounded-xl bg-white/[0.01] border border-blue-950/40 hover:border-blue-900/30 hover:bg-white/[0.02] transition-all"
              >
                <div className="flex-1 flex gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                  <p className="text-xs text-slate-300 leading-relaxed font-mono">{item.fact}</p>
                </div>
                <button
                  onClick={() => handleDeleteFact(item.id)}
                  className="p-1 rounded bg-red-950/20 hover:bg-red-500/20 border border-red-950/40 hover:border-red-400 text-red-500/80 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                  title="Purge Fact"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
        
        {/* Footer info */}
        <div className="pt-4 border-t border-blue-950/40 mt-4 text-[9px] font-mono text-slate-600 uppercase tracking-widest text-center shrink-0">
          Dhiman Long-Term Memory Core v4.1
        </div>
      </div>
    </div>
  );
}
