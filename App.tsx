import React, { useEffect, useRef, useState } from 'react';
import Avatar3D from './components/Avatar3D';
import Controls from './components/Controls';
import SubtitleDisplay from './components/SubtitleDisplay';
import FeedbackCard from './components/FeedbackCard';
import HistoryPanel from './components/HistoryPanel';
import LessonLibrary from './components/LessonLibrary';
import { LiveApiService } from './services/liveApiService';
import { ConnectionState, SubtitleData, PronunciationFeedback, ConversationTurn, Lesson } from './types';
import { MessageSquare, AlertCircle, BookOpen, Gauge } from 'lucide-react';

const App: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [currentSubtitle, setCurrentSubtitle] = useState<SubtitleData | null>(null);
  const [pronunciationFeedback, setPronunciationFeedback] = useState<PronunciationFeedback | null>(null);
  const [history, setHistory] = useState<ConversationTurn[]>([]);
  const [audioVolume, setAudioVolume] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLessonLibraryOpen, setIsLessonLibraryOpen] = useState(false);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [speakingRate, setSpeakingRate] = useState<number>(1.0);
  
  const liveServiceRef = useRef<LiveApiService | null>(null);

  useEffect(() => {
    // Initialize service on mount
    liveServiceRef.current = new LiveApiService({
      onStateChange: (state) => setConnectionState(ConnectionState[state]),
      onSubtitle: (data) => {
        setCurrentSubtitle(data);
        addHistoryItem('ai', data.hanzi, data.pinyin, data.english);
      },
      onPronunciationFeedback: (feedback) => setPronunciationFeedback(feedback),
      onUserTranscript: (text) => addHistoryItem('user', text),
      onAudioVolume: (vol) => setAudioVolume(vol),
      onError: (msg) => setErrorMessage(msg),
    });

    return () => {
      // Cleanup on unmount
      if (liveServiceRef.current) {
        liveServiceRef.current.stop();
      }
    };
  }, []);

  const addHistoryItem = (role: 'user' | 'ai', text: string, pinyin?: string, translation?: string) => {
    setHistory(prev => [
      ...prev,
      {
        id: Date.now().toString() + Math.random(),
        role,
        text,
        pinyin,
        translation,
        timestamp: Date.now()
      }
    ]);
  };

  const handleConnect = async () => {
    setErrorMessage(null);
    setHistory([]); // Clear history on new connection
    setCurrentSubtitle(null);
    setPronunciationFeedback(null);
    
    // Use active lesson scenario if available
    const scenario = activeLesson ? activeLesson.scenario : undefined;
    
    if (liveServiceRef.current) {
      await liveServiceRef.current.connect(scenario, speakingRate);
    }
  };

  const handleDisconnect = () => {
    if (liveServiceRef.current) {
      liveServiceRef.current.stop();
      setConnectionState(ConnectionState.DISCONNECTED);
      setAudioVolume(0);
    }
  };

  const handleLessonSelect = (lesson: Lesson | null) => {
    // If switching lessons while connected, disconnect first
    if (connectionState === ConnectionState.CONNECTED || connectionState === ConnectionState.CONNECTING) {
        handleDisconnect();
    }
    setActiveLesson(lesson);
    setIsLessonLibraryOpen(false);
  };

  const toggleSpeakingRate = () => {
      // Cycle: 1.0 -> 0.8 -> 1.2 -> 1.0
      setSpeakingRate(prev => {
          if (prev === 1.0) return 0.8;
          if (prev === 0.8) return 1.2;
          return 1.0;
      });
  };

  const getSpeakingRateLabel = () => {
      if (speakingRate === 0.8) return 'Slow';
      if (speakingRate === 1.2) return 'Fast';
      return 'Normal';
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white relative overflow-hidden font-sans flex flex-col">
      
      {/* 3D Background / Avatar Layer */}
      <div className="absolute inset-0 z-0">
        <Avatar3D volume={audioVolume} />
      </div>

      {/* Lesson Library Overlay */}
      <LessonLibrary 
         isOpen={isLessonLibraryOpen} 
         onClose={() => setIsLessonLibraryOpen(false)} 
         onSelectLesson={handleLessonSelect}
         selectedLessonId={activeLesson?.id || null}
      />

      {/* UI Overlay Layer */}
      <div className="relative z-10 flex flex-col h-full min-h-screen pointer-events-none">
        
        {/* Header */}
        <header className="flex items-center justify-between p-6 bg-gradient-to-b from-black/80 to-transparent pointer-events-auto z-20">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="bg-emerald-500 p-2 rounded-lg shadow-lg shadow-emerald-500/20">
                        <MessageSquare className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-white">Mandarin Talk</h1>
                        <p className="text-xs text-gray-300 font-medium">AI Pronunciation Coach</p>
                    </div>
                </div>

                {/* Active Lesson Pill */}
                {activeLesson && (
                    <div className="hidden md:flex items-center gap-2 px-4 py-1.5 bg-indigo-500/20 border border-indigo-500/30 rounded-full">
                        <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Current Lesson:</span>
                        <span className="text-sm font-semibold text-white">{activeLesson.title}</span>
                    </div>
                )}
            </div>
            
            <div className="flex items-center gap-3 md:gap-4">
                {/* Speaking Rate Control */}
                <button
                    onClick={toggleSpeakingRate}
                    disabled={connectionState !== ConnectionState.DISCONNECTED}
                    title={connectionState !== ConnectionState.DISCONNECTED ? "Disconnect to change speed" : "Change speaking speed"}
                    className={`flex items-center gap-2 px-3 py-2 rounded-full border transition-all text-sm font-medium backdrop-blur-md
                        ${connectionState !== ConnectionState.DISCONNECTED 
                            ? 'bg-white/5 border-white/5 text-gray-400 cursor-not-allowed' 
                            : 'bg-white/10 hover:bg-white/20 border-white/10 hover:border-white/20'
                        }`}
                >
                    <Gauge className="w-4 h-4" />
                    <span className="w-12 text-center">{getSpeakingRateLabel()}</span>
                </button>

                <button 
                    onClick={() => setIsLessonLibraryOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 transition-all text-sm font-medium backdrop-blur-md"
                >
                    <BookOpen className="w-4 h-4" />
                    <span className="hidden sm:inline">Library</span>
                </button>

                <div className={`px-3 py-1 rounded-full text-xs font-bold border shadow-lg backdrop-blur-sm ${
                    connectionState === ConnectionState.CONNECTED ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' :
                    connectionState === ConnectionState.CONNECTING ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300' :
                    connectionState === ConnectionState.ERROR ? 'bg-red-500/20 border-red-500/50 text-red-300' :
                    'bg-gray-800/60 border-gray-600/50 text-gray-400'
                }`}>
                    {connectionState}
                </div>
            </div>
        </header>

        {/* Error Notification */}
        {errorMessage && (
            <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-50 w-auto max-w-md pointer-events-auto">
                <div className="bg-red-500/90 backdrop-blur-md text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-red-400/30 animate-in fade-in slide-in-from-top-4">
                    <AlertCircle className="w-6 h-6 shrink-0" />
                    <p className="font-medium text-sm">{errorMessage}</p>
                    <button onClick={() => setErrorMessage(null)} className="ml-auto text-white/60 hover:text-white">✕</button>
                </div>
            </div>
        )}

        {/* Main Layout Grid */}
        <div className="flex-grow grid grid-cols-1 lg:grid-cols-4 gap-4 px-6 relative z-10 h-[calc(100vh-180px)]">
            
            {/* Left Column: Conversation History */}
            <div className="hidden lg:block lg:col-span-1 h-full pointer-events-auto rounded-2xl overflow-hidden shadow-2xl border border-white/5">
                <HistoryPanel history={history} />
            </div>

            {/* Center Column: Avatar Space & Subtitles */}
            <div className="lg:col-span-2 flex flex-col justify-end pb-10 pointer-events-auto">
               <div className="bg-black/40 backdrop-blur-md rounded-3xl p-5 md:p-8 border border-white/10 shadow-2xl transition-all duration-500 hover:bg-black/50 mx-4 lg:mx-12 mb-8">
                 <SubtitleDisplay data={currentSubtitle} />
                 {!currentSubtitle && activeLesson && (
                    <div className="text-center text-indigo-200/60 text-sm mt-2">
                        Lesson: {activeLesson.title} — Press Start to Begin
                    </div>
                 )}
               </div>
            </div>

            {/* Right Column: Feedback Card */}
            <div className="lg:col-span-1 flex flex-col items-center lg:items-end justify-start pt-4 lg:pt-10 pointer-events-auto">
                <div className="w-full max-w-sm">
                     <FeedbackCard feedback={pronunciationFeedback} />
                </div>
            </div>
        </div>

        {/* Controls Area */}
        <div className="w-full flex justify-center pb-8 pointer-events-auto z-20">
            <Controls 
                connectionState={connectionState} 
                onConnect={handleConnect} 
                onDisconnect={handleDisconnect} 
            />
        </div>
      </div>
    </div>
  );
};

export default App;