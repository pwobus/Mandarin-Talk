# Android refactor feasibility

## Current web app architecture
- Built with Vite + React 19; UI composed of components like `Avatar3D`, `Controls`, and `LessonLibrary` mounted from `App.tsx`.
- Interaction flow relies on `LiveApiService`, which manages audio streaming to Gemini Live, status updates, and history/feedback callbacks when the React app connects or disconnects. 【F:App.tsx†L12-L181】
- Audio pipeline uses browser-only Web APIs: `navigator.mediaDevices.getUserMedia`, `AudioContext` (16 kHz input, 24 kHz output), `ScriptProcessorNode`, and analyser nodes to feed avatar volume. PCM chunks are downsampled and converted to base64 blobs before being sent to Gemini. 【F:services/liveApiService.ts†L47-L205】【F:utils/audioUtils.ts†L27-L107】
- Gemini config requires streaming audio responses, subtitle and pronunciation feedback tools, and a system prompt that varies the speaking rate. 【F:services/liveApiService.ts†L144-L179】
- Front-end visuals depend on WebGL via `three`/`@react-three/fiber` for the animated avatar background. 【F:package.json†L12-L22】

## Feasibility for Android
- **Quick path (WebView/PWA)**: The existing React build can run inside an Android WebView or Trusted Web Activity. This reuses the WebAudio streaming logic but depends on the WebView exposing `getUserMedia`, low-latency `AudioContext`, and WebGL. Modern Chrome-based WebViews generally support these, but OEM variations and permission prompts must be validated.
- **Native/React Native port**: A full refactor is feasible but requires re-implementing key browser-only pieces:
  - Microphone capture with Android `AudioRecord` (16 kHz mono) and buffering logic equivalent to the 4096-sample threshold currently used before upload. 【F:services/liveApiService.ts†L69-L205】
  - Audio encoding to PCM base64 blobs and downsampling utilities similar to `downsampleTo16k`/`createPcmBlob`. 【F:utils/audioUtils.ts†L47-L107】
  - Gemini Live client integration: the project currently uses the browser-friendly `@google/genai` SDK. Android would need an HTTP/WebSocket or gRPC client that matches the same model (`gemini-2.5-flash-native-audio-preview-09-2025`), tool declarations, and streaming callbacks.
  - UI and 3D avatar: React Native lacks a drop-in WebGL renderer for the existing Three.js scene. Recreating the avatar would require Expo/React Native GL or a native 3D engine; otherwise, replace the avatar with simpler native animations.
- **State management and lessons**: Higher-level logic (connection state, lesson selection, speaking-rate toggles) is already React state and can be mirrored in React Native without major redesign. 【F:App.tsx†L12-L181】

## Recommended migration path
1. Prototype the current web build in an Android WebView to validate microphone permissions, audio latency, and GPU performance. If stable, package as a TWA for minimal effort.
2. If native performance or platform control is required, plan a React Native module that wraps Android `AudioRecord` and streams PCM to Gemini over WebSocket. Port the lesson/feedback state logic to React Native components and replace the Three.js avatar with a native-friendly equivalent.
3. Whichever path is chosen, define Gemini Live transport early—confirm SDK availability for Android or design a lightweight Node gateway the app can stream to, which forwards audio to Gemini and returns subtitles/feedback events.
