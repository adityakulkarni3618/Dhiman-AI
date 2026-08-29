import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { 
  Mic, BookOpen, Zap, Cpu, MessageSquare, Power, ShieldAlert, Eye, 
  Menu, Plus, History, Terminal, Loader2, ChevronLeft, ChevronRight,
  CheckCircle, Circle, AlertCircle, PlayCircle, Calendar
} from 'lucide-react';

import DhimanOrb from './components/DhimanOrb';
import MarkdownText from './components/MarkdownText';
import MemoryManager from './components/MemoryManager';
import TaskDashboard from './components/TaskDashboard';

const socket = io('http://localhost:5005');

export default function App() {
  const [systemState, setSystemState] = useState('idle');
  const [inputText, setInputText] = useState('');
  const [isLiveMic, setIsLiveMic] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [messages, setMessages] = useState([
    { from: 'Dhiman', text: "Cognitive core initialized, Aditya. Ready for Socratic verification routines or task assignments." }
  ]);

  // Unified State management
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [toolLogs, setToolLogs] = useState([]);
  const [isSyncingMemory, setIsSyncingMemory] = useState(false);
  const [memoryNotification, setMemoryNotification] = useState(null);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [pendingCommandApproval, setPendingCommandApproval] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  const [currentToolRunning, setCurrentToolRunning] = useState(null);
  const [isTaskDashboardOpen, setIsTaskDashboardOpen] = useState(false);

  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const response = await fetch('/api/conversations');
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    }
  };

  const loadConversation = async (conversationId) => {
    setActiveConversationId(conversationId);
    setErrorMessage('');
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`);
      if (response.ok) {
        const data = await response.json();
        const formatted = (data.messages || []).map((m) => ({
          from: m.role === 'user' ? 'You' : 'Dhiman',
          text: m.content
        }));
        setMessages(formatted.length > 0 ? formatted : [
          { from: 'Dhiman', text: "Conversation loaded. State metrics initialized." }
        ]);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      setErrorMessage('Failed to load conversation history.');
    }
  };

  const startNewChat = () => {
    setActiveConversationId(null);
    setMessages([
      { from: 'Dhiman', text: "New session started, Aditya. Direct Socket link enabled for tool execution." }
    ]);
  };

  const syncMemory = async () => {
    if (!activeConversationId) {
      setErrorMessage('Please start a conversation before extracting memory.');
      return;
    }
    setIsSyncingMemory(true);
    setMemoryNotification(null);
    try {
      const response = await fetch('/api/memory/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeConversationId })
      });
      const data = await response.json();
      if (response.ok) {
        setMemoryNotification(`Synced ${data.inserted} memory fact(s) successfully.`);
      } else {
        setErrorMessage(data.error || 'Failed to sync memory.');
      }
    } catch (error) {
      setErrorMessage('Memory extraction network failure.');
    } finally {
      setIsSyncingMemory(false);
      setTimeout(() => setMemoryNotification(null), 5000);
    }
  };

  // Core Speech Synthesizer (Vocal Output Engine)
  const speakOutLoud = (textToSpeak) => {
    if (!textToSpeak) return;
    // Clear out any running speech text to avoid queue overlaps
    window.speechSynthesis.cancel();

    // Clean up markdown markers so Dhiman doesn't spell out asterisks or code symbols
    const cleanText = textToSpeak.replace(/[*#`_\-]/g, "");

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Bind orb tracking cycles straight to vocal engine outputs
    utterance.onstart = () => setSystemState('speaking');
    utterance.onend = () => setSystemState('idle');
    utterance.onerror = () => setSystemState('idle');

    // Pick a steady, high-quality built-in voice tone
    const voices = window.speechSynthesis.getVoices();
    const premiumVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) || voices[0];
    if (premiumVoice) utterance.voice = premiumVoice;

    window.speechSynthesis.speak(utterance);
  };

  // Wire up Speech-to-Text Recognition on Mount
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false; // Stop listening automatically once you finish your statement
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsLiveMic(true);
        setSystemState('listening');
      };

      recognition.onresult = (event) => {
        const voiceTranscript = event.results[0][0].transcript;
        console.log(`🗣️ Captured Transcript: "${voiceTranscript}"`);
        handleDispatch(voiceTranscript); // Ship the text payload straight down the pipeline!
      };

      recognition.onend = () => {
        setIsLiveMic(false);
      };

      recognition.onerror = (err) => {
        console.error("Speech Recognition Fault:", err);
        setSystemState('idle');
        setIsLiveMic(false);
      };

      recognitionRef.current = recognition;
    }
    
    // Handle initial voices payload sync required by some browsers
    window.speechSynthesis.getVoices();
  }, [activeConversationId]);

  useEffect(() => {
    // Intercept state-change events
    socket.on('state-change', (data) => {
      setSystemState(data.state);
    });

    // Intercept outbound reply packages from server
    socket.on('dhiman-reply', (data) => {
      setMessages((prev) => [...prev, { from: 'Dhiman', text: data.text }]);
      if (data.conversationId) {
        setActiveConversationId(data.conversationId);
        fetchConversations();
      }
      speakOutLoud(data.text);
      setIsSending(false);
    });

    // Intercept tool logs
    socket.on('tool-status', (data) => {
      setToolLogs((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          timestamp: new Date().toLocaleTimeString(),
          ...data
        }
      ]);
      if (data.status === 'running') {
        setCurrentToolRunning({ name: data.name, args: data.args });
      } else if (data.status === 'completed' || data.status === 'failed') {
        setCurrentToolRunning(null);
      }
    });

    // Intercept command execution approvals
    socket.on('request-command-approval', (data) => {
      setPendingCommandApproval(data);
    });

    // Intercept real-time task updates and timelines
    socket.on('task-update', (data) => {
      setActiveTask((prev) => {
        if (data.status === 'PLANNING') {
          return { id: data.taskId, goal: data.goal || '', status: 'PLANNING', steps: [] };
        }
        if (data.status === 'RUNNING' && data.steps) {
          return {
            id: data.taskId,
            goal: data.goal || (prev ? prev.goal : ''),
            status: 'RUNNING',
            steps: data.steps.map((s, idx) => ({
              description: s.description,
              status: idx === data.currentStepIndex ? 'RUNNING' : (idx < data.currentStepIndex ? 'COMPLETED' : 'PENDING')
            }))
          };
        }
        if (prev && prev.id === data.taskId) {
          const updatedSteps = [...prev.steps];
          if (data.currentStepIndex !== undefined && updatedSteps[data.currentStepIndex]) {
            updatedSteps[data.currentStepIndex].status = data.status === 'VERIFYING' ? 'VERIFYING' : (data.status === 'COMPLETED' ? 'COMPLETED' : 'RUNNING');
          }
          if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(data.status)) {
            setCurrentToolRunning(null);
          }
          return {
            ...prev,
            status: data.status,
            steps: updatedSteps,
            result: data.result || prev.result,
            error: data.error || prev.error
          };
        }
        return prev;
      });
    });

    return () => {
      socket.off('state-change');
      socket.off('dhiman-reply');
      socket.off('tool-status');
      socket.off('request-command-approval');
      socket.off('task-update');
    };
  }, []);

  const handleDispatch = async (explicitText = inputText) => {
    if (!explicitText.trim() || isSending) return;

    setMessages((prev) => [...prev, { from: 'You', text: explicitText }]);
    setErrorMessage('');
    setSystemState('thinking');
    setIsSending(true);
    setInputText('');

    // Emit straight through Socket.io to trigger agentic tool pipelines
    socket.emit('solve-doubt', {
      message: explicitText,
      conversationId: activeConversationId
    });
  };

  // Zero-Latency Interruption: Tap the mic icon while Dhiman is talking to instantly mute him and start listening
  const toggleVoiceStream = () => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel(); // Kill current speech output stream in <30ms
      setSystemState('idle');
    }

    if (isLiveMic) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  };

  const loadProtocolPreset = (type) => {
    const macros = {
      feynman: "[Protocol: Feynman Technique] Evaluate my understanding. Ask me a complex question about RISC vs CISC computer architectures and wait for me to explain it.",
      recall: "[Protocol: Active Recall] Kick off a deep execution query drill on database indexing and B-Trees schemas.",
      agent: "Search the web for the latest updates on GATE 2027 syllabus modifications and add a study milestone blueprint to my dashboard calendar structure."
    };
    handleDispatch(macros[type]);
  };

  return (
    <div className="min-h-screen bg-[#030914] text-slate-100 font-sans flex flex-row selection:bg-cyan-500/30 selection:text-white overflow-hidden h-screen">
      
      {/* Sidebar: Glassmorphic History & Memory panel */}
      <div className={`transition-all duration-300 ${sidebarOpen ? 'w-80' : 'w-0'} bg-black/45 border-r border-blue-950/40 backdrop-blur flex flex-col justify-between overflow-hidden shrink-0`}>
        <div className="p-4 flex flex-col gap-4 overflow-hidden flex-1">
          <div className="flex justify-between items-center">
            <span className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <History size={13} className="text-cyan-400"/> History Matrix
            </span>
            <button 
              onClick={startNewChat}
              className="p-1.5 rounded-lg border border-blue-900/30 bg-blue-950/20 hover:border-cyan-500/40 text-cyan-400 hover:text-white transition-all duration-200"
              title="Start New Chat"
            >
              <Plus size={15} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
            {conversations.length === 0 ? (
              <div className="text-xs text-slate-600 font-mono italic p-3">No sessions logged.</div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => loadConversation(c.id)}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all text-xs font-mono truncate block ${c.id === activeConversationId ? 'bg-cyan-500/10 border-cyan-400 text-white shadow-[0_0_15px_rgba(6,182,212,0.15)]' : 'bg-transparent border-transparent hover:border-blue-950/80 hover:bg-white/[0.02] text-slate-400 hover:text-slate-200'}`}
                >
                  {c.title || 'New conversation'}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Memory curation / extract console */}
        <div className="p-4 border-t border-blue-950/40 bg-black/10 flex flex-col gap-2">
          <button
            onClick={syncMemory}
            disabled={isSyncingMemory || !activeConversationId}
            className="w-full py-2 px-4 rounded-xl border border-cyan-500/30 hover:border-cyan-400 bg-cyan-950/10 hover:bg-cyan-500/10 text-cyan-400 hover:text-white font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSyncingMemory ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                CURATING MEMORIES...
              </>
            ) : (
              <>
                <Cpu size={14} />
                SYNC LONG-TERM MEMORY
              </>
            )}
          </button>
          
          <button
            onClick={() => setIsMemoryOpen(true)}
            className="w-full py-2 px-4 rounded-xl border border-blue-900/30 hover:border-cyan-500/40 bg-blue-950/10 hover:bg-blue-950/30 text-slate-400 hover:text-cyan-400 font-mono text-xs font-bold transition-all flex items-center justify-center gap-2"
          >
            <Cpu size={14} />
            MANAGE MEMORY VAULT
          </button>

          {memoryNotification && (
            <div className="text-[10px] bg-emerald-950/20 border border-emerald-900/30 text-emerald-400 p-2 rounded-lg font-mono flex items-center gap-1.5">
              <ShieldAlert size={11} /> {memoryNotification}
            </div>
          )}
        </div>
      </div>

      {/* Main View Panel */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header Panel */}
        <header className="px-8 py-4 bg-black/20 border-b border-blue-950/40 backdrop-blur flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              {sidebarOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
            </button>
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${systemState !== 'idle' ? 'bg-cyan-400 animate-ping' : 'bg-emerald-500'}`} />
              <h1 className="text-xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400 font-mono">DHIMAN SOVEREIGN v4.1</h1>
            </div>
          </div>
          <div className="flex items-center gap-6 font-mono text-xs text-slate-400">
            <button
              onClick={() => setIsTaskDashboardOpen(true)}
              className="bg-cyan-500/10 px-3 py-1 rounded border border-cyan-500/30 text-cyan-400 font-bold hover:bg-cyan-500/20 hover:text-white transition-all flex items-center gap-1.5"
            >
              <Calendar size={13} /> TASK CENTER
            </button>
            <div className="flex items-center gap-1"><Eye size={12} className="text-cyan-400"/> <span>GEMINI ENGINE</span></div>
            <div className="bg-blue-950/40 px-3 py-1 rounded border border-blue-900/30 text-cyan-400">
              STATE: <span className="uppercase font-bold">{systemState}</span>
            </div>
            <Power className="text-slate-500 hover:text-red-400 cursor-pointer transition-colors" size={16} />
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch max-h-[calc(100vh-140px)]">
          
          {/* Left Side: Conversation Log Container */}
          <div className="lg:col-span-5 bg-black/30 border border-blue-950/40 rounded-2xl p-4 flex flex-col justify-between overflow-hidden h-full">
            <span className="text-xs font-mono tracking-wider font-bold text-slate-500 block mb-3 uppercase">Cognitive Stream Matrix</span>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {messages.map((m, idx) => (
                <div key={idx} className={`p-3.5 rounded-xl text-sm leading-relaxed ${m.from === 'Dhiman' ? 'bg-blue-950/20 border border-blue-900/20 text-cyan-200 text-left' : 'bg-emerald-950/20 border border-emerald-900/20 text-emerald-100 text-right ml-auto max-w-[85%]'}`}>
                  <div className="text-[9px] uppercase font-mono font-black tracking-widest opacity-40 mb-1">{m.from}</div>
                  <MarkdownText text={m.text} />
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Center Field: 3D Animated Orb Element + Realtime Tool Logs */}
          <div className="lg:col-span-4 flex flex-col justify-between overflow-hidden bg-gradient-to-b from-blue-950/5 to-transparent rounded-3xl p-6 border border-blue-950/10 h-full">
            <div className="flex-1 flex flex-col items-center justify-center relative min-h-0">
              <DhimanOrb state={systemState} />
              
              <div className="mt-4 flex flex-col items-center gap-2 shrink-0">
                <button 
                  onClick={toggleVoiceStream}
                  className={`p-5 rounded-full border transition-all duration-300 ${isLiveMic ? 'bg-cyan-500/20 border-cyan-400 shadow-[0_0_40px_rgba(0,200,255,0.3)] animate-pulse' : 'bg-black/40 border-blue-900/40 hover:border-cyan-500/50 text-cyan-400'}`}
                >
                  <Mic size={28} />
                </button>
                <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase text-center">
                  {isLiveMic ? 'LISTENING... SPEAK NOW' : systemState === 'speaking' ? 'DHIMAN IS SPEAKING (TAP MIC TO INTERRUPT)' : 'TAP TO TRANSMIT VOICE'}
                </span>
              </div>
            </div>

            {/* Realtime Tool Logs Console Terminal */}
            <div className="h-44 bg-black/50 border border-blue-950/60 rounded-2xl p-3 flex flex-col gap-2 overflow-hidden mt-4">
              <span className="text-[10px] font-mono font-bold text-cyan-400/80 uppercase tracking-widest flex items-center gap-1 shrink-0">
                <Terminal size={12}/> Agent Execution Terminal Logs
              </span>
              <div className="flex-1 overflow-y-auto font-mono text-[10px] text-slate-300 space-y-1.5 custom-scrollbar pr-1">
                {toolLogs.length === 0 ? (
                  <div className="text-slate-600 italic">Listening for autonomous ecosystem calls...</div>
                ) : (
                  toolLogs.map((log) => (
                    <div key={log.id} className="border-b border-blue-950/30 pb-1.5 last:border-0">
                      <div className="flex items-center justify-between text-slate-500 text-[9px] mb-0.5">
                        <span>[{log.timestamp}]</span>
                        <span className={`font-bold ${log.status === 'running' ? 'text-cyan-400 animate-pulse' : 'text-emerald-400'}`}>
                          {log.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-slate-200">
                        Method: <span className="text-yellow-500 font-bold">{log.name}</span>
                      </div>
                      {log.args && (
                        <div className="text-[9px] text-slate-400 truncate">
                          Args: {JSON.stringify(log.args)}
                        </div>
                      )}
                      {log.result && (
                        <div className="text-[9px] text-emerald-300/90 whitespace-pre-wrap bg-emerald-950/10 p-1 rounded border border-emerald-900/10 mt-1">
                          Output: {log.result}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Side: Operational Layout Controls & Active Task Timeline */}
          <div className="lg:col-span-3 flex flex-col gap-4 overflow-hidden h-full">
            {activeTask && (
              <div className="bg-slate-950/40 border border-blue-950/40 rounded-2xl p-4 flex-1 flex flex-col overflow-hidden">
                <h3 className="text-xs font-bold font-mono tracking-widest text-cyan-400 mb-2.5 uppercase flex items-center gap-1.5 shrink-0">
                  <Zap size={14} className="animate-pulse"/> ACTIVE GOAL TRACKER
                </h3>
                <div className="text-[11px] text-slate-300 font-mono mb-3 bg-black/35 p-2 rounded border border-blue-950/50 shrink-0">
                  Goal: {activeTask.goal}
                </div>
                {currentToolRunning && (
                  <div className="mb-3 text-[10px] text-cyan-400 font-mono flex items-center gap-1.5 bg-cyan-950/20 p-2 rounded border border-cyan-900/30 shrink-0 animate-pulse">
                    {currentToolRunning.name === 'browser_open' && "🌐 Opening browser..."}
                    {currentToolRunning.name === 'browser_navigate' && `→ Navigating to ${currentToolRunning.args?.url || 'URL'}...`}
                    {currentToolRunning.name === 'browser_get_page' && "👁 Reading page..."}
                    {currentToolRunning.name === 'browser_click' && `🖱 Clicking element ID ${currentToolRunning.args?.elementId || ''}...`}
                    {currentToolRunning.name === 'browser_type' && `⌨ Typing input query...`}
                    {currentToolRunning.name === 'browser_screenshot' && "📸 Capturing viewport screenshot..."}
                    {!['browser_open', 'browser_navigate', 'browser_get_page', 'browser_click', 'browser_type', 'browser_screenshot'].includes(currentToolRunning.name) && `⚙️ Running: ${currentToolRunning.name}...`}
                  </div>
                )}
                <div className="flex-1 overflow-y-auto space-y-2.5 custom-scrollbar pr-1">
                  {activeTask.steps.map((step, idx) => (
                    <div key={idx} className="flex gap-2.5 items-start text-xs font-mono">
                      {step.status === 'COMPLETED' && <CheckCircle size={14} className="text-emerald-400 shrink-0 mt-0.5" />}
                      {step.status === 'RUNNING' && <Loader2 size={14} className="text-cyan-400 animate-spin shrink-0 mt-0.5" />}
                      {step.status === 'VERIFYING' && <Loader2 size={14} className="text-yellow-400 animate-spin shrink-0 mt-0.5" />}
                      {step.status === 'PENDING' && <Circle size={14} className="text-slate-600 shrink-0 mt-0.5" />}
                      {step.status === 'FAILED' && <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />}
                      <span className={`${step.status === 'COMPLETED' ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                        {step.description}
                      </span>
                    </div>
                  ))}
                  {activeTask.steps.length === 0 && (
                    <div className="text-[10px] text-slate-500 italic p-2">Formulating strategy...</div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-slate-950/40 border border-blue-950/40 rounded-2xl p-4 flex-1 overflow-y-auto custom-scrollbar">
              <h3 className="text-xs font-bold font-mono tracking-widest text-cyan-400 mb-3 uppercase flex items-center gap-1">
                <Cpu size={14}/> Operational Protocol Blueprints
              </h3>
              <div className="space-y-2.5">
                <button onClick={() => loadProtocolPreset('feynman')} className="w-full text-left p-3.5 rounded-xl bg-white/[0.02] hover:bg-cyan-500/10 border border-blue-900/20 hover:border-cyan-500/30 transition-all flex items-center gap-3 text-xs">
                  <Cpu size={15} className="text-cyan-400 shrink-0"/>
                  <div>
                    <div className="font-bold text-white mb-0.5">Feynman Verification</div>
                    <div className="text-[10px] text-slate-400 leading-snug">Assess architecture concepts via active Socratic discussion loops.</div>
                  </div>
                </button>
                <button onClick={() => loadProtocolPreset('recall')} className="w-full text-left p-3.5 rounded-xl bg-white/[0.02] hover:bg-cyan-500/10 border border-blue-900/20 hover:border-cyan-500/30 transition-all flex items-center gap-3 text-xs">
                  <BookOpen size={15} className="text-cyan-400 shrink-0"/>
                  <div>
                    <div className="font-bold text-white mb-0.5">Spaced Recall Drill</div>
                    <div className="text-[10px] text-slate-400 leading-snug">Kick off custom queries focused on key database/data-structure indices.</div>
                  </div>
                </button>
                <button onClick={() => loadProtocolPreset('agent')} className="w-full text-left p-3.5 rounded-xl bg-white/[0.02] hover:bg-emerald-500/10 border border-blue-900/20 hover:border-emerald-500/30 transition-all flex items-center gap-3 text-xs">
                  <Zap size={15} className="text-emerald-400 shrink-0"/>
                  <div>
                    <div className="font-bold text-white mb-0.5">Autonomous Tasks</div>
                    <div className="text-[10px] text-slate-400 leading-snug">Delegate live external web scraping or system triggers to Gemini tools.</div>
                  </div>
                </button>
              </div>
            </div>

            <div className="bg-slate-950/40 border border-blue-950/40 rounded-2xl p-4 flex items-center gap-3 text-xs text-amber-400/80 bg-amber-500/[0.01] shrink-0">
              <ShieldAlert size={18} className="shrink-0"/>
              <p className="font-mono text-[10px] leading-relaxed">System architecture securely operating inside Zero-Knowledge Trust Framework boundaries.</p>
            </div>
          </div>

        </div>

        {/* Footer Interface Processing Bar */}
        <footer className="p-6 bg-gradient-to-t from-black/40 to-transparent shrink-0">
          <form onSubmit={(e) => { e.preventDefault(); handleDispatch(); }} className="relative max-w-4xl mx-auto">
            <input 
              type="text" 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Issue high-level technical prompt or stream context metrics down to Dhiman..."
              className="w-full bg-black/40 border border-blue-900/40 rounded-2xl py-4 pl-6 pr-16 text-sm text-white placeholder:text-slate-500 outline-none focus:border-cyan-400 focus:shadow-[0_0_20px_rgba(0,200,255,0.05)] transition-all"
              disabled={isSending}
            />
            <button type="submit" disabled={isSending} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl text-cyan-400 hover:text-white hover:bg-cyan-500/20 transition-all disabled:cursor-not-allowed disabled:opacity-50">
              {isSending ? <Loader2 size={18} className="animate-spin text-cyan-400" /> : <MessageSquare size={18} />}
            </button>
            {isSending && <div className="mt-2 text-xs text-cyan-400/80 font-mono animate-pulse flex items-center gap-1.5"><Zap size={12} /> Dhiman pipeline solving doubt...</div>}
            {errorMessage && <div className="mt-2 text-xs text-red-400 font-mono">{errorMessage}</div>}
          </form>
        </footer>
      </div>

      {/* Memory Manager Slideover Panel */}
      <MemoryManager isOpen={isMemoryOpen} onClose={() => setIsMemoryOpen(false)} />

      {/* Task Dashboard Panel */}
      <TaskDashboard isOpen={isTaskDashboardOpen} onClose={() => setIsTaskDashboardOpen(false)} activeTask={activeTask} socket={socket} />

      {/* Terminal Command Approval Modal */}
      {pendingCommandApproval && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-[#0b1329] border border-amber-500/40 rounded-2xl p-6 max-w-md w-full shadow-[0_0_50px_rgba(245,158,11,0.15)] flex flex-col gap-4">
            <div className="flex items-center gap-3 text-amber-400">
              <ShieldAlert size={28} />
              <span className="font-mono font-bold text-sm tracking-wider uppercase">Security Approval Required</span>
            </div>
            <p className="text-xs text-slate-300 font-mono leading-relaxed">
              Dhiman is requesting permission to execute the following terminal command on your device:
            </p>
            <div className="bg-black/50 border border-blue-900/30 rounded-xl p-3 font-mono text-xs text-cyan-400 break-all whitespace-pre-wrap select-text">
              {pendingCommandApproval.command}
            </div>
            <p className="text-[10px] text-amber-500/80 font-mono italic">
              Warning: Review this command carefully before approving.
            </p>
            <div className="flex gap-3 justify-end mt-2">
              <button
                type="button"
                onClick={() => {
                  socket.emit('command-approval-response', { id: pendingCommandApproval.id, approved: false });
                  setPendingCommandApproval(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-bold font-mono transition-all"
              >
                DENY
              </button>
              <button
                type="button"
                onClick={() => {
                  socket.emit('command-approval-response', { id: pendingCommandApproval.id, approved: true });
                  setPendingCommandApproval(null);
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold font-mono transition-all"
              >
                APPROVE & EXECUTE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}