import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { SubtitleData, PronunciationFeedback } from '../types';
import { base64ToBytes, decodeAudioData, createPcmBlob, downsampleTo16k, concatenateFloat32Buffers } from '../utils/audioUtils';

interface LiveServiceCallbacks {
  onStateChange: (state: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR') => void;
  onSubtitle: (data: SubtitleData) => void;
  onPronunciationFeedback: (feedback: PronunciationFeedback) => void;
  onUserTranscript: (text: string) => void;
  onAudioVolume: (volume: number) => void; // Used for avatar animation
  onError: (message: string) => void;
}

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';

// Tool definition for subtitles (AI Speech)
const updateSubtitlesTool: FunctionDeclaration = {
  name: 'update_subtitles',
  description: 'Updates the subtitles with the text, pinyin, and english translation of what is being spoken by the AI.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      hanzi: { type: Type.STRING, description: 'The Chinese characters (Hanzi) of the sentence.' },
      pinyin: { type: Type.STRING, description: 'The Pinyin romanization with tones.' },
      english: { type: Type.STRING, description: 'The English translation.' },
    },
    required: ['hanzi', 'pinyin', 'english'],
  },
};

// Tool definition for pronunciation feedback (User Speech)
const pronunciationFeedbackTool: FunctionDeclaration = {
  name: 'provide_pronunciation_feedback',
  description: 'Provides feedback on the user\'s Mandarin pronunciation after they speak.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      userText: { type: Type.STRING, description: 'The Chinese text the user spoke.' },
      pinyin: { type: Type.STRING, description: 'The Pinyin of what the user spoke.' },
      score: { type: Type.NUMBER, description: 'A score from 0 to 100 representing pronunciation accuracy.' },
      feedback: { type: Type.STRING, description: 'Specific, constructive advice on tones or articulation.' },
    },
    required: ['userText', 'pinyin', 'score', 'feedback'],
  },
};

export class LiveApiService {
  private ai: GoogleGenAI;
  private session: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private mediaStream: MediaStream | null = null;
  private callbacks: LiveServiceCallbacks;
  private animationFrameId: number | null = null;
  private isProcessorRunning = false;
  private isConnected = false;
  private isDisconnecting = false;
  private hasReportedFatalError = false;
  private isReportingError = false; // Semaphore to prevent double error handling
  private internalErrorRetryCount = 0;
  private readonly MAX_INTERNAL_ERROR_RETRIES = 2; // Increased retries slightly
  private lastScenarioInstruction?: string;
  private lastSpeakingRate: number = 1.0;
  private currentInputTranscription = '';
  private apiKey: string | undefined;

  // Audio Accumulation Buffer
  private audioBufferChunks: Float32Array[] = [];
  private currentBufferSize = 0;
  // 4096 samples @ 16kHz = 256ms. This is a stable balance between latency and request frequency.
  private readonly BUFFER_THRESHOLD = 4096; 
  
  // Audio Send Queue for Serialization
  private audioSendQueue: Promise<void> = Promise.resolve();
  // Lock to prevent audio sends during tool execution
  private isProcessingTool = false;

  // Keep references to prevent garbage collection
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private inputGain: GainNode | null = null;

  constructor(callbacks: LiveServiceCallbacks) {
    this.callbacks = callbacks;
    
    // Support both Vite production env (import.meta.env) and standard process.env
    // Also support various naming conventions (VITE_API_KEY, VITE_GEMINI_API_KEY, GEMINI_API_KEY)
    const env = (import.meta as any).env || {};
    const key = env.VITE_API_KEY || env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY;
    
    this.apiKey = key;
    
    // Initialize with provided key or a placeholder to prevent immediate crash.
    // The actual validation happens when we try to connect.
    this.ai = new GoogleGenAI({ apiKey: this.apiKey || 'MISSING_KEY_PLACEHOLDER' });
    
    // Auto-resume audio context when tab becomes visible (fixes mobile "sudden stop" issue)
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  private handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && this.isConnected) {
          if (this.inputAudioContext?.state === 'suspended') {
              try { await this.inputAudioContext.resume(); } catch (e) { console.debug("Resume input failed", e); }
          }
          if (this.outputAudioContext?.state === 'suspended') {
              try { await this.outputAudioContext.resume(); } catch (e) { console.debug("Resume output failed", e); }
          }
      }
  };

  async connect(scenarioInstruction?: string, speakingRate: number = 1.0) {
    if (this.session || this.isConnected) return;
    
    // Check for API Key before attempting anything
    if (!this.apiKey || this.apiKey === 'MISSING_KEY_PLACEHOLDER') {
        this.callbacks.onError("API Key not found. Please add 'VITE_API_KEY=AIza...' to your .env file.");
        return;
    }

    this.callbacks.onStateChange('CONNECTING');
    this.isConnected = true;
    this.isDisconnecting = false;
    this.hasReportedFatalError = false;
    this.isReportingError = false;
    this.internalErrorRetryCount = 0;
    this.lastScenarioInstruction = scenarioInstruction;
    this.lastSpeakingRate = speakingRate;

    // 1. Acquire Microphone Stream FIRST
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error: any) {
      console.error("Microphone access error:", error);
      let errorMessage = "Failed to access microphone.";
      if (error.name === 'NotFoundError' || error.message.includes('Requested device not found')) {
        errorMessage = "No microphone found. Please connect a microphone and try again.";
      } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = "Microphone permission denied. Please allow microphone access settings.";
      }
      this.handleFatalError(errorMessage);
      return; 
    }

    try {
      // 2. Initialize Audio Contexts
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      await this.inputAudioContext.resume();

      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      await this.outputAudioContext.resume();

      this.outputAnalyser = this.outputAudioContext.createAnalyser();
      this.outputAnalyser.fftSize = 256;
      this.startVolumeMonitoring();

      const baseInstruction = `You are a helpful, patient, and friendly Mandarin Chinese language conversation partner and pronunciation coach. 
      You are an animated 3D avatar facing the user.
      
      CORE RESPONSIBILITIES:
      1. SUBTITLES: You MUST call 'update_subtitles' SIMULTANEOUSLY while you speak to provide the text.
      2. PRONUNCIATION COACHING: Listen carefully to the user's input. If they speak Mandarin, analyze their pronunciation immediately.
          - Call the 'provide_pronunciation_feedback' tool with the text you heard, the pinyin, a score (0-100), and constructive feedback.
          - Do this silently via the tool.
      
      Always provide Hanzi, Pinyin, and English for your own speech in the subtitles.`;

      let rateInstruction = "";
      if (speakingRate <= 0.8) {
        rateInstruction = "IMPORTANT: Speak slower than normal. Articulate very clearly and pause slightly between phrases.";
      } else if (speakingRate < 1.0) {
        rateInstruction = "IMPORTANT: Speak slightly slower and clearer than a native speaker.";
      } else if (speakingRate > 1.0) {
        rateInstruction = "IMPORTANT: Speak at a fast, fluent native pace.";
      }

      const contextInstruction = scenarioInstruction || `CONVERSATION CONTEXT:
      Help the user practice spoken Mandarin in a free-flowing conversation. 
      Speak with a clear, standard accent. Keep sentences simple for a learner. 
      Ask questions to keep the conversation going.`;

      // Connect to Gemini Live
      const sessionPromise = this.ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          tools: [{ functionDeclarations: [updateSubtitlesTool, pronunciationFeedbackTool] }],
          inputAudioTranscription: {}, 
          systemInstruction: `${baseInstruction}\n\n${rateInstruction}\n\n${contextInstruction}`,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          }
        },
        callbacks: {
          onopen: () => {
            if (this.isConnected && !this.isDisconnecting) {
              this.callbacks.onStateChange('CONNECTED');
              // Increased delay to 1000ms to ensure server session is fully stabilized and audio contexts are ready
              setTimeout(() => {
                if (this.isConnected && !this.isDisconnecting) {
                   this.startAudioInputStreaming(sessionPromise);
                }
              }, 1000);
            } else {
              sessionPromise.then(s => s.close());
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            if (!this.isConnected || this.isDisconnecting) return;
            await this.handleMessage(message, sessionPromise);
          },
          onclose: () => {
            console.log("Session closed by server");
            if (this.isConnected && !this.isDisconnecting) {
                // If server closes unexpectedly (e.g. timeout), treat as disconnect
                this.stop();
            }
          },
          onerror: (e: any) => {
            // Guard against multiple simultaneous error reports
            if (this.isDisconnecting || this.hasReportedFatalError || this.isReportingError) return;
            this.isReportingError = true;
            
            let errorStr = "Unknown error";
            if (e instanceof Error) {
                errorStr = e.message;
            } else if (e instanceof ErrorEvent) {
                errorStr = e.message || "WebSocket/Network Error";
            } else if (typeof e === 'string') {
                errorStr = e;
            } else {
                try {
                    errorStr = JSON.stringify(e);
                } catch {
                    errorStr = String(e);
                }
            }

            // Filter common transient errors or trigger recovery
            if (errorStr.includes("Network error") || errorStr.includes("Failed to fetch") || errorStr.includes("WebSocket")) {
                console.warn("Network instability detected:", errorStr);
                // Try to recover from network errors instead of just ignoring them, as the socket might be dead
                this.handleInternalErrorRecovery('network error');
                return;
            }

            console.error('Session error object:', e);

            if (errorStr.includes("Internal error")) {
                // Attempt a quick reconnect on transient internal errors before surfacing fatal state
                this.handleInternalErrorRecovery('session');
            } else {
                this.handleFatalError("Connection error: " + errorStr);
            }
          }
        }
      });

      // Handle initial rejection
      sessionPromise.catch((e: any) => {
         console.warn("Session connection refused/rejected:", e);
         if (this.isConnected && !this.isDisconnecting) {
           this.handleFatalError("Failed to establish connection to AI.");
         }
      });

      this.session = sessionPromise;

    } catch (error) {
      console.error("Connection initialization failed:", error);
      this.handleFatalError("Failed to initialize connection.");
    }
  }

  // Wrapper for safe API calls
  private async safeSend(action: (session: any) => Promise<void>, sessionPromise: Promise<any>) {
    if (!this.isConnected || this.isDisconnecting || this.hasReportedFatalError) return;
    
    try {
        const session = await sessionPromise;
        // Double check state after awaiting the session
        if (!this.isConnected || this.isDisconnecting || this.hasReportedFatalError) return;
        
        await action(session);
    } catch (e: any) {
        // Suppress errors during disconnection
        if (!this.isConnected || this.isDisconnecting) return; 
        
        const errStr = String(e);
        console.debug("SafeSend failed:", errStr);

        // If it's an internal error OR network error during a send, attempt recovery
        if ((errStr.includes("Internal error") || errStr.includes("Network error")) && !this.hasReportedFatalError) {
             this.handleInternalErrorRecovery('data transmission');
        }
    }
  }

  private handleFatalError(msg: string) {
      if (this.hasReportedFatalError) return;
      this.hasReportedFatalError = true;
      this.isDisconnecting = true; // Stop everything immediately
      console.error("Fatal Error Triggered:", msg);
      this.callbacks.onError(msg);
      this.callbacks.onStateChange('ERROR');
      this.stop();
  }

  private handleInternalErrorRecovery(origin: string) {
      if (this.internalErrorRetryCount >= this.MAX_INTERNAL_ERROR_RETRIES) {
          this.handleFatalError("Session interrupted (Connection unstable). Please restart.");
          return;
      }

      this.internalErrorRetryCount += 1;
      console.warn(`Error encountered during ${origin}. Attempting quick reconnect (${this.internalErrorRetryCount}/${this.MAX_INTERNAL_ERROR_RETRIES})...`);

      // Stop current session but immediately move back to connecting state
      this.stop();
      this.isDisconnecting = false;
      this.hasReportedFatalError = false;
      this.isReportingError = false;

      this.callbacks.onError("Connection unstable. Reconnecting...");
      this.callbacks.onStateChange('CONNECTING');

      const scenario = this.lastScenarioInstruction;
      const speakingRate = this.lastSpeakingRate;

      // Give the server a brief moment before re-establishing the session
      setTimeout(() => {
          if (!this.hasReportedFatalError && !this.isConnected && !this.isDisconnecting) {
              this.connect(scenario, speakingRate);
          }
      }, 750);
  }

  private startAudioInputStreaming(sessionPromise: Promise<any>) {
    if (!this.inputAudioContext || !this.mediaStream) return;

    this.source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
    this.inputGain = this.inputAudioContext.createGain();
    this.inputGain.gain.value = 1.2; 

    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
    this.isProcessorRunning = true;
    this.audioBufferChunks = [];
    this.currentBufferSize = 0;
    this.audioSendQueue = Promise.resolve();
    this.isProcessingTool = false; // Reset lock

    this.processor.onaudioprocess = (audioProcessingEvent) => {
      // Logic:
      // 1. Check basic state
      // 2. Check if we are currently waiting for a tool response (Subtitles/Feedback).
      //    If we are, we pause sending audio to prevent interrupting the AI or causing race conditions.
      if (!this.isConnected || !this.isProcessorRunning || this.isDisconnecting || this.isProcessingTool) return;

      const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
      const downsampledData = downsampleTo16k(inputData, this.inputAudioContext!.sampleRate);
      
      this.audioBufferChunks.push(downsampledData);
      this.currentBufferSize += downsampledData.length;

      if (this.currentBufferSize >= this.BUFFER_THRESHOLD) {
          const mergedBuffer = concatenateFloat32Buffers(this.audioBufferChunks);
          this.audioBufferChunks = [];
          this.currentBufferSize = 0;

          if (mergedBuffer.length === 0) return;

          const pcmBlob = createPcmBlob(mergedBuffer);

          this.audioSendQueue = this.audioSendQueue
              .then(() => this.safeSend(async (session) => {
                  await session.sendRealtimeInput({ media: pcmBlob });
              }, sessionPromise))
              .catch((e) => {
                   // Just log debug, safeSend handles the fatal logic if needed
                   console.debug("Audio queue chain error:", e);
              });
      }
    };

    this.source.connect(this.inputGain);
    this.inputGain.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private async handleMessage(message: LiveServerMessage, sessionPromise: Promise<any>) {
    if (this.isDisconnecting || this.hasReportedFatalError) return;

    // 1. Transcript
    if (message.serverContent?.inputTranscription) {
      this.currentInputTranscription += message.serverContent.inputTranscription.text;
    }
    if (message.serverContent?.turnComplete && this.currentInputTranscription.trim()) {
       this.callbacks.onUserTranscript(this.currentInputTranscription.trim());
       this.currentInputTranscription = '';
    }

    // 2. Batched Tool Responses
    if (message.toolCall) {
      this.isProcessingTool = true; // LOCK audio sending
      const functionResponses = [];
      for (const fc of message.toolCall.functionCalls) {
        if (fc.name === 'update_subtitles') {
          this.callbacks.onSubtitle(fc.args as unknown as SubtitleData);
        } else if (fc.name === 'provide_pronunciation_feedback') {
           this.callbacks.onPronunciationFeedback(fc.args as unknown as PronunciationFeedback);
        }
        functionResponses.push({
          id: fc.id,
          name: fc.name,
          response: { result: 'ok' }
        });
      }

      if (functionResponses.length > 0) {
        // Prioritize tool response by appending to queue immediately
        this.audioSendQueue = this.audioSendQueue
            .then(() => this.safeSend(async (session) => {
                await session.sendToolResponse({ functionResponses });
                this.isProcessingTool = false; // UNLOCK audio sending after response sent
            }, sessionPromise))
            .catch(e => {
                console.debug("Tool response queue error:", e);
                this.isProcessingTool = false; // Ensure unlock even on error
            });
      } else {
          this.isProcessingTool = false;
      }
    }

    // 3. Audio Output
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio && this.outputAudioContext && this.outputAnalyser && this.isConnected) {
      try {
        const audioBytes = base64ToBytes(base64Audio);
        const audioBuffer = await decodeAudioData(audioBytes, this.outputAudioContext, 24000, 1);
        
        this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);

        const source = this.outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputAnalyser);
        this.outputAnalyser.connect(this.outputAudioContext.destination);
        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
        
        this.sources.add(source);
        source.onended = () => this.sources.delete(source);
      } catch (err) {
        console.error("Audio decode error:", err);
      }
    }

    if (message.serverContent?.interrupted) {
      this.sources.forEach(source => { try { source.stop(); } catch(e) {} });
      this.sources.clear();
      this.nextStartTime = 0;
      this.currentInputTranscription = '';
      this.audioBufferChunks = [];
      this.currentBufferSize = 0;
      this.isProcessingTool = false; // Reset lock on interrupt
    }
  }

  private startVolumeMonitoring() {
    const updateVolume = () => {
      if (!this.isConnected || this.isDisconnecting) return; 

      if (this.outputAnalyser && this.outputAudioContext && this.outputAudioContext.state !== 'closed') {
        const dataArray = new Uint8Array(this.outputAnalyser.frequencyBinCount);
        this.outputAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) { sum += dataArray[i]; }
        const average = sum / dataArray.length;
        this.callbacks.onAudioVolume(average / 255);
        this.animationFrameId = requestAnimationFrame(updateVolume);
      }
    };
    updateVolume();
  }

  stop() {
    // Immediate state lock to prevent new actions
    this.isDisconnecting = true;
    this.isConnected = false;
    this.isProcessorRunning = false;
    this.isProcessingTool = false;

    // Cut off the audio processor loop immediately
    if (this.processor) {
        this.processor.onaudioprocess = null;
        try { this.processor.disconnect(); } catch (e) {}
        this.processor = null;
    }
    
    if (this.inputGain) {
        try { this.inputGain.disconnect(); } catch (e) {}
        this.inputGain = null;
    }

    if (this.source) {
        try { this.source.disconnect(); } catch (e) {}
        this.source = null;
    }

    if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => {
            try { track.stop(); } catch (e) {}
        });
        this.mediaStream = null;
    }

    this.sources.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    this.sources.clear();

    if (this.session) {
      // We ignore errors here because we are intentionally closing
      this.session.then(s => s.close()).catch(() => {});
      this.session = null;
    }

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.inputAudioContext) {
      this.inputAudioContext.close().catch(() => {});
      this.inputAudioContext = null;
    }
    if (this.outputAudioContext) {
      this.outputAudioContext.close().catch(() => {});
      this.outputAudioContext = null;
    }
    
    this.audioBufferChunks = [];
    this.currentBufferSize = 0;
    
    // Reset queue
    this.audioSendQueue = Promise.resolve();
    
    // Only update state if we didn't crash
    if (!this.hasReportedFatalError) {
        this.callbacks.onStateChange('DISCONNECTED');
    }
  }
}