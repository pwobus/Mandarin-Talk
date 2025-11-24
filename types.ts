export interface SubtitleData {
  hanzi: string;
  pinyin: string;
  english: string;
}

export interface PronunciationFeedback {
  userText: string;
  pinyin: string;
  score: number;
  feedback: string;
}

export interface ConversationTurn {
  id: string;
  role: 'user' | 'ai';
  text: string; // Hanzi for AI, Recognized Text for User
  pinyin?: string;
  translation?: string;
  timestamp: number;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  topic: string;
  scenario: string; // The specific context instruction for the AI
}

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface AudioVolumeState {
  volume: number; // 0 to 1
}