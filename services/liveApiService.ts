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
  private hasReportedFatalError = false; // Prevent multiple error popups
  private currentInputTranscription = '';

  // Audio Accumulation Buffer
  private audioBufferChunks: Float32Array[] = [];
  private currentBufferSize = 0;
  // Increased threshold to ~512ms (8192 samples at 16k) for stability
  private readonly BUFFER_THRESHOLD = 8192; 
  
  // Audio Send Queue for Serialization
  private audioSendQueue: Promise<void> = Promise.resolve();

  // Keep references to prevent garbage collection
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private inputGain: GainNode | null = null;

  constructor(callbacks: LiveServiceCallbacks) {
    this.callbacks = callbacks;
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async connect(scenarioInstruction?: string, speakingRate: number = 1.0) {
    if (this.session || this.isConnected) return;

    this.callbacks.onStateChange('CONNECTING');
    this.isConnected = true;
    this.isDisconnecting = false;
    this.hasReportedFatalError = false;

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
              this.startAudioInputStreaming(sessionPromise);
            } else {
              // User cancelled while connecting
              sessionPromise.then(s => s.close());
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            if (!this.isConnected || this.isDisconnecting) return;
            await this.handleMessage(message, sessionPromise);
          },
          onclose: () => {
            console.log("Session closed by server");
            if (this.isConnected && !this.isDisconnecting && !this.hasReportedFatalError) {
                this.stop();
            }
          },
          onerror: (e: any) => {
            if (this.isDisconnecting || this.hasReportedFatalError) return; 
            
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

            console.error('Session error:', errorStr, e);
            
            // Deduplicate: If we are already handling an error, stop.
            if (this.hasReportedFatalError) return;

            // Treat Network Errors as warnings first
            if (errorStr.includes("Network error") || errorStr.includes("Failed to fetch") || errorStr.includes("WebSocket")) {
                console.warn("Network instability detected.");
                return;
            }

            // Internal Errors usually require a full reset
            if (errorStr.includes("Internal error")) {
                this.handleFatalError("Session interrupted. Please restart.");
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
        // Re-check state after await
        if (!this.isConnected || this.isDisconnecting || this.hasReportedFatalError) return;
        
        await action(session);
    } catch (e: any) {
        if (!this.isConnected || this.isDisconnecting) return; // Ignore errors during teardown
        
        console.debug("SafeSend failed:", e);
        // If an Internal Error occurs during send, trigger fatal handling to prevent queue backup
        if (String(e).includes("Internal error")) {
            this.handleFatalError("Session connection lost.");
        }
    }
  }

  private handleFatalError(msg: string) {
      if (this.hasReportedFatalError) return;
      this.hasReportedFatalError = true;
      console.error("Fatal Error Triggered:", msg);
      
      this.callbacks.onError(msg);
      this.callbacks.onStateChange('ERROR');
      this.stop();
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

    this.processor.onaudioprocess = (audioProcessingEvent) => {
      // Strict guard: stop processing if disconnecting or error occurred
      if (!this.isConnected || !this.isProcessorRunning || this.isDisconnecting || this.hasReportedFatalError) return;

      const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
      const downsampledData = downsampleTo16k(inputData, this.inputAudioContext!.sampleRate);
      
      this.audioBufferChunks.push(downsampledData);
      this.currentBufferSize += downsampledData.length;

      if (this.currentBufferSize >= this.BUFFER_THRESHOLD) {
          const mergedBuffer = concatenateFloat32Buffers(this.audioBufferChunks);
          this.audioBufferChunks = [];
          this.currentBufferSize = 0;

          // Don't send empty or tiny chunks
          if (mergedBuffer.length < 128) return;

          const pcmBlob = createPcmBlob(mergedBuffer);

          // SERIALIZED SENDING
          this.audioSendQueue = this.audioSendQueue
              .then(() => this.safeSend(async (session) => {
                  await session.sendRealtimeInput({ media: pcmBlob });
              }, sessionPromise))
              .catch((e) => {
                   // Swallow errors in the chain
                   console.debug("Audio queue error:", e);
              });
      }
    };

    this.source.connect(this.inputGain);
    this.inputGain.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private async handleMessage(message: LiveServerMessage, sessionPromise: Promise<any>) {
    if (this.isDisconnecting || this.hasReportedFatalError) return;

    try {
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
            this.audioSendQueue = this.audioSendQueue
                .then(() => this.safeSend(async (session) => {
                    await session.sendToolResponse({ functionResponses });
                }, sessionPromise))
                .catch(e => console.debug("Tool response queue error:", e));
          }
        }

        // 3. Audio Output
        const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (base64Audio && this.outputAudioContext && this.outputAnalyser && this.isConnected) {
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
        }

        if (message.serverContent?.interrupted) {
          this.sources.forEach(source => { try { source.stop(); } catch(e) {} });
          this.sources.clear();
          this.nextStartTime = 0;
          this.currentInputTranscription = '';
          this.audioBufferChunks = [];
          this.currentBufferSize = 0;
        }
    } catch (e) {
        console.error("Error processing message:", e);
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
    if (this.isDisconnecting) return; // Already stopping
    this.isDisconnecting = true;
    this.isConnected = false;
    this.isProcessorRunning = false;

    // Break the audio loop immediately
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
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
    }

    this.sources.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    this.sources.clear();

    if (this.session) {
      this.session.then(s => s.close()).catch(() => {});
      this.session = null;
    }

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Close contexts asynchronously
    if (this.inputAudioContext) {
      this.inputAudioContext.close().catch(() => {});
      this.inputAudioContext = null;
    }
    if (this.outputAudioContext) {
      this.outputAudioContext.close().catch(() => {});
      this.outputAudioContext = null;
    }
    
    // Clear buffer to be safe
    this.audioBufferChunks = [];
    this.currentBufferSize = 0;
    
    // We don't set state to DISCONNECTED here if we have a fatal error, 
    // because handleFatalError sets state to ERROR.
    if (!this.hasReportedFatalError) {
        this.callbacks.onStateChange('DISCONNECTED');
    }
  }
}