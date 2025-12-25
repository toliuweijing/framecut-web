

export interface Clip {
  id: string;
  sourceStart: number; // Start time in the source video file
  sourceEnd: number;   // End time in the source video file
  offset: number;      // Start time on the timeline
  speed: number;       // Playback speed multiplier (default 1)
  mediaType: 'intro' | 'main' | 'outro' | 'audio'; // Identifies which source asset to use
  muted?: boolean;     // If true, audio is suppressed (used when audio is detached)
}

export interface MediaAsset {
  id: string;
  src: string;
  name: string;
  duration: number;
  waveformData?: number[]; // Normalized peaks (0-1) for visualization. ~100 samples per second.
  corsCompatible?: boolean; // Whether the asset supports CORS (required for export/canvas operations)
}

export interface Subtitle {
  id: string;
  text: string;
  start: number; // Timeline start
  end: number;   // Timeline end
  x?: number;    // Horizontal position percentage (0-100)
  y?: number;    // Vertical position percentage (0-100)
}

export interface ZoomEffect {
  id: string;
  start: number;
  end: number;
  // Crop Area in Percentages (0-100)
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpotlightEffect {
  id: string;
  start: number;
  end: number;
  // Area in Percentages (0-100)
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MosaicPath {
  points: { x: number; y: number }[]; // Coordinates in Percentages (0-100)
  brushSize: number; // Brush size in Percentages relative to canvas min dimension
}

export interface MosaicEffect {
  id: string;
  start: number;
  end: number;
  paths: MosaicPath[];
}

export type Selection = 
  | { type: 'clip', id: string } 
  | { type: 'audio', id: string }
  | { type: 'subtitle', id: string } 
  | { type: 'zoom', id: string }
  | { type: 'spotlight', id: string }
  | { type: 'mosaic', id: string }
  | null;

export interface EditorState {
  // Assets (Sources)
  intro: MediaAsset | null;
  mainVideo: MediaAsset | null;
  outro: MediaAsset | null;
  audio: MediaAsset | null; // Background Audio Asset

  // Timeline State
  duration: number; // Total timeline duration
  currentTime: number; // Global playhead position
  isPlaying: boolean;
  playbackRate: number;
  zoomLevel: number; // pixels per second
  fileName: string | null;
  
  // Track Data (Absolute Global Time)
  clips: Clip[];        // Video Clips
  audioClips: Clip[];   // Audio Clips (Structurally same as Clip but rendered in Audio Track)
  subtitles: Subtitle[];
  zoomEffects: ZoomEffect[];
  spotlightEffects: SpotlightEffect[];
  mosaicEffects: MosaicEffect[];
  selection: Selection;
}

export interface Dimensions {
  width: number;
  height: number;
}

export const FPS = 30; // Standard frame rate for calculation
export const FRAME_TIME = 1 / FPS;