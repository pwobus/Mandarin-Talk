import React, { useEffect, useState } from 'react';
import { PronunciationFeedback } from '../types';
import { CheckCircle, AlertCircle, TrendingUp, X } from 'lucide-react';

interface FeedbackCardProps {
  feedback: PronunciationFeedback | null;
}

const FeedbackCard: React.FC<FeedbackCardProps> = ({ feedback }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (feedback) {
      setVisible(true);
      // Optional: Hide after a long delay if desired, but usually keeping it until next turn is better.
    }
  }, [feedback]);

  if (!feedback || !visible) return null;

  const isGood = feedback.score >= 80;
  const isAverage = feedback.score >= 60 && feedback.score < 80;
  
  let colorClass = 'text-emerald-400';
  let borderClass = 'border-emerald-500/30';
  let bgClass = 'bg-emerald-950/60';
  let icon = <CheckCircle className="w-5 h-5 text-emerald-400" />;

  if (isAverage) {
    colorClass = 'text-yellow-400';
    borderClass = 'border-yellow-500/30';
    bgClass = 'bg-yellow-950/60';
    icon = <TrendingUp className="w-5 h-5 text-yellow-400" />;
  } else if (feedback.score < 60) {
    colorClass = 'text-rose-400';
    borderClass = 'border-rose-500/30';
    bgClass = 'bg-rose-950/60';
    icon = <AlertCircle className="w-5 h-5 text-rose-400" />;
  }

  return (
    <div className={`relative overflow-hidden backdrop-blur-xl rounded-2xl p-5 border shadow-2xl transition-all duration-500 animate-in slide-in-from-right-10 fade-in zoom-in-95 ${bgClass} ${borderClass}`}>
      <button 
        onClick={() => setVisible(false)}
        className="absolute top-2 right-2 text-white/40 hover:text-white transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-4">
        {/* Score Circle */}
        <div className="relative flex items-center justify-center w-14 h-14 shrink-0">
            <svg className="w-full h-full transform -rotate-90">
                <circle
                    cx="28"
                    cy="28"
                    r="24"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="transparent"
                    className="text-black/30"
                />
                <circle
                    cx="28"
                    cy="28"
                    r="24"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 24}
                    strokeDashoffset={2 * Math.PI * 24 * (1 - feedback.score / 100)}
                    className={`${colorClass} transition-all duration-1000 ease-out`}
                />
            </svg>
            <span className={`absolute font-bold text-lg text-white`}>{feedback.score}</span>
        </div>

        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xs uppercase tracking-wider font-bold text-white/60">Pronunciation Check</h3>
            </div>
            <div className="text-lg font-bold text-white leading-tight truncate">{feedback.userText}</div>
            <div className="text-sm text-emerald-200/80 font-mono mb-2">{feedback.pinyin}</div>
        </div>
      </div>
      
      <div className="mt-3 pt-3 border-t border-white/10 flex items-start gap-2">
         <div className="mt-0.5 shrink-0">{icon}</div>
         <p className="text-sm text-gray-200 leading-relaxed">{feedback.feedback}</p>
      </div>
    </div>
  );
};

export default FeedbackCard;
