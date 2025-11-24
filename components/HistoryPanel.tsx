import React, { useEffect, useRef } from 'react';
import { ConversationTurn } from '../types';
import { User, Bot } from 'lucide-react';

interface HistoryPanelProps {
  history: ConversationTurn[];
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ history }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when history updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  if (history.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 p-6 text-center border-r border-white/5 bg-black/20 backdrop-blur-sm">
        <p className="text-sm">Conversation history will appear here.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-black/20 backdrop-blur-md border-r border-white/5 overflow-hidden">
      <div className="p-4 border-b border-white/10 bg-black/20">
        <h2 className="text-sm font-bold text-white/80 uppercase tracking-wider">Conversation History</h2>
      </div>
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {history.map((turn) => (
          <div key={turn.id} className={`flex gap-3 ${turn.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            
            {/* Avatar Icon */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 ${
              turn.role === 'user' ? 'bg-indigo-600' : 'bg-emerald-600'
            }`}>
              {turn.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>

            {/* Bubble */}
            <div className={`flex flex-col max-w-[85%] ${turn.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`px-4 py-3 rounded-2xl text-sm ${
                turn.role === 'user' 
                  ? 'bg-indigo-600/20 text-indigo-100 rounded-tr-none border border-indigo-500/30' 
                  : 'bg-emerald-600/20 text-emerald-100 rounded-tl-none border border-emerald-500/30'
              }`}>
                {/* AI Turn: Rich Content */}
                {turn.role === 'ai' ? (
                  <div className="space-y-1">
                    <p className="font-bold text-base">{turn.text}</p>
                    {turn.pinyin && <p className="text-emerald-300 font-mono text-xs opacity-90">{turn.pinyin}</p>}
                    {turn.translation && <p className="text-emerald-100/70 italic text-xs pt-1 border-t border-emerald-500/20 mt-1">{turn.translation}</p>}
                  </div>
                ) : (
                  // User Turn: Simple Text
                  <p>{turn.text}</p>
                )}
              </div>
              <span className="text-[10px] text-gray-500 mt-1 px-1">
                {new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HistoryPanel;