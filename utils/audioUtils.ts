import { Blob } from '@google/genai';

export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  // Use a simple loop to avoid stack overflow with String.fromCharCode.apply on large buffers
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Convert Int16 to Float32 (-1.0 to 1.0)
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export function downsampleTo16k(buffer: Float32Array, fromSampleRate: number): Float32Array {
  if (buffer.length === 0) return new Float32Array(0);
  if (fromSampleRate === 16000) return buffer;
  
  const ratio = fromSampleRate / 16000;
  const newLength = Math.ceil(buffer.length / ratio);
  const result = new Float32Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    const offset = i * ratio;
    const index = Math.floor(offset);
    const nextIndex = Math.min(Math.ceil(offset), buffer.length - 1);
    const t = offset - index;
    
    // Linear interpolation
    const val = buffer[index] * (1 - t) + buffer[nextIndex] * t;
    // Check for NaN or Infinity just in case
    result[i] = Number.isFinite(val) ? val : 0;
  }
  return result;
}

export function concatenateFloat32Buffers(buffers: Float32Array[]): Float32Array {
    let totalLength = 0;
    for (const buffer of buffers) {
        totalLength += buffer.length;
    }
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const buffer of buffers) {
        result.set(buffer, offset);
        offset += buffer.length;
    }
    return result;
}

export function createPcmBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    let val = data[i];
    // Safety check for bad audio data
    if (!Number.isFinite(val)) val = 0;
    
    // Clamp values to [-1, 1] before converting
    const s = Math.max(-1, Math.min(1, val));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return {
    data: bytesToBase64(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}