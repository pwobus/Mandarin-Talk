import React from 'react';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import { ConnectionState } from '../types';

interface ControlsProps {
  connectionState: ConnectionState;
  onConnect: () => void;
  onDisconnect: () => void;
}

const Controls: React.FC<ControlsProps> = ({ connectionState, onConnect, onDisconnect }) => {
  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;

  return (
    <div className="flex items-center justify-center gap-6 p-6 bg-gray-900/80 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-800">
      {!isConnected ? (
        <button
          onClick={onConnect}
          disabled={isConnecting}
          className={`group relative flex items-center gap-3 px-8 py-4 rounded-full text-white font-bold text-lg transition-all duration-300
            ${isConnecting ? 'bg-gray-600 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 hover:scale-105 hover:shadow-emerald-500/25 shadow-lg'}`}
        >
          {isConnecting ? (
            <>
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <Phone className="w-6 h-6" />
              <span>Start Conversation</span>
            </>
          )}
        </button>
      ) : (
        <button
          onClick={onDisconnect}
          className="flex items-center gap-3 px-8 py-4 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-lg transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-rose-500/25"
        >
          <PhoneOff className="w-6 h-6" />
          <span>End Call</span>
        </button>
      )}

      {/* Visual Indicator for Mic Status (Passive) */}
      <div className={`p-4 rounded-full transition-colors duration-300 ${isConnected ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-800 text-gray-500'}`}>
        {isConnected ? <Mic className="w-6 h-6 animate-pulse" /> : <MicOff className="w-6 h-6" />}
      </div>
    </div>
  );
};

export default Controls;