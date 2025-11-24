import React from 'react';
import { LESSONS } from '../data/lessons';
import { Lesson } from '../types';
import { BookOpen, Sparkles, ShoppingBag, Coffee, Car, Briefcase, X } from 'lucide-react';

interface LessonLibraryProps {
  onSelectLesson: (lesson: Lesson) => void;
  selectedLessonId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const getIconForTopic = (topic: string) => {
  switch (topic.toLowerCase()) {
    case 'social': return <Sparkles className="w-5 h-5" />;
    case 'shopping': return <ShoppingBag className="w-5 h-5" />;
    case 'daily life': return <Coffee className="w-5 h-5" />;
    case 'travel': return <Car className="w-5 h-5" />;
    case 'professional': return <Briefcase className="w-5 h-5" />;
    default: return <BookOpen className="w-5 h-5" />;
  }
};

const getLevelColor = (level: string) => {
  switch (level) {
    case 'Beginner': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    case 'Intermediate': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
    case 'Advanced': return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
    default: return 'bg-gray-500/20 text-gray-300';
  }
};

const LessonLibrary: React.FC<LessonLibraryProps> = ({ onSelectLesson, selectedLessonId, isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-4xl h-[80vh] bg-gray-900 rounded-3xl border border-white/10 flex flex-col shadow-2xl overflow-hidden relative">
        
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-black/40">
          <div>
             <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <BookOpen className="w-7 h-7 text-emerald-400" />
                Lesson Library
             </h2>
             <p className="text-gray-400 text-sm mt-1">Select a structured conversation module to practice.</p>
          </div>
          <button 
             onClick={onClose}
             className="p-2 rounded-full hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
          >
             <X className="w-6 h-6" />
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Free Talk Card */}
              <button
                onClick={() => onSelectLesson(null as any)}
                className={`text-left group relative p-5 rounded-2xl border transition-all duration-300 hover:scale-[1.02] flex flex-col h-full
                    ${selectedLessonId === null 
                      ? 'bg-emerald-900/40 border-emerald-500/50 shadow-emerald-500/10' 
                      : 'bg-gray-800/50 border-white/5 hover:border-emerald-500/30 hover:bg-gray-800'
                    }`}
              >
                  <div className="flex items-start justify-between mb-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 text-emerald-400">
                          <Sparkles className="w-6 h-6" />
                      </div>
                      {selectedLessonId === null && <span className="text-xs font-bold text-emerald-400 px-2 py-1 bg-emerald-500/20 rounded">ACTIVE</span>}
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Free Talk Mode</h3>
                  <p className="text-sm text-gray-400 leading-relaxed mb-4 flex-1">
                      Casual conversation practice on any topic you like. Good for general fluency.
                  </p>
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Unstructured</div>
              </button>

              {/* Structured Lessons */}
              {LESSONS.map((lesson) => (
                <button
                  key={lesson.id}
                  onClick={() => onSelectLesson(lesson)}
                  className={`text-left group relative p-5 rounded-2xl border transition-all duration-300 hover:scale-[1.02] flex flex-col h-full
                    ${selectedLessonId === lesson.id 
                      ? 'bg-indigo-900/40 border-indigo-500/50 shadow-indigo-500/10' 
                      : 'bg-gray-800/50 border-white/5 hover:border-indigo-500/30 hover:bg-gray-800'
                    }`}
                >
                   <div className="flex items-start justify-between mb-4">
                      <div className={`p-3 rounded-xl ${
                          selectedLessonId === lesson.id ? 'bg-indigo-500/20 text-indigo-400' : 'bg-gray-700/50 text-gray-400 group-hover:text-indigo-400'
                      }`}>
                          {getIconForTopic(lesson.topic)}
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${getLevelColor(lesson.level)}`}>
                          {lesson.level}
                      </span>
                  </div>
                  
                  <h3 className="text-lg font-bold text-white mb-2 group-hover:text-indigo-300 transition-colors">{lesson.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed mb-4 flex-1 line-clamp-3">
                      {lesson.description}
                  </p>

                  <div className="flex items-center gap-2 pt-4 border-t border-white/5">
                      <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">{lesson.topic}</span>
                      {selectedLessonId === lesson.id && (
                          <span className="ml-auto text-xs font-bold text-indigo-400 flex items-center gap-1">
                             Active <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                          </span>
                      )}
                  </div>
                </button>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
};

export default LessonLibrary;