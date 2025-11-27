import React from 'react';
import { SubtitleData } from '../types';

interface SubtitleDisplayProps {
  data: SubtitleData | null;
}

const SubtitleDisplay: React.FC<SubtitleDisplayProps> = ({ data }) => {
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-500 opacity-50">
        <p>Waiting for conversation...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Hanzi */}
      <div className="text-4xl md:text-5xl font-black text-white tracking-wider drop-shadow-lg">
        {data.hanzi}
      </div>
      
      {/* Pinyin */}
      <div className="text-xl md:text-2xl font-medium text-emerald-400 tracking-wide">
        {data.pinyin}
      </div>
      
      {/* English */}
      <div className="text-base md:text-lg text-gray-300 font-light italic border-t border-gray-700 pt-2 px-8 mt-2">
        "{data.english}"
      </div>
    </div>
  );
};

export default SubtitleDisplay;