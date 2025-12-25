import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Download, MonitorPlay, Loader2, Circle, StopCircle, CheckCircle, MousePointer2, Music, FileAudio, X, PictureInPicture, PictureInPicture2 } from 'lucide-react';
import Player, { PlayerRef } from './components/Player';
import Timeline from './components/Timeline';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import { DebugPanel } from './components/DebugPanel';
import { EditorState, FPS, FRAME_TIME, Clip, Subtitle, ZoomEffect, SpotlightEffect, MosaicEffect, Selection, MediaAsset } from './types';
import { formatTimecode, generateId, getVideoDuration, extractWaveform, formatTimeShort } from './utils';

interface ExtendedEditorState extends EditorState {
  isExporting: boolean;
  isExportingAudio: boolean;
  currentBrushSize: number;
  exportProgress: number;
  showSuccessToast: boolean;
  isAudioTrackMuted: boolean;
}

// Define the subset of state that should be undoable
type ProjectState = Pick<ExtendedEditorState, 'intro' | 'mainVideo' | 'outro' | 'audio' | 'duration' | 'clips' | 'audioClips' | 'subtitles' | 'zoomEffects' | 'spotlightEffects' | 'mosaicEffects' | 'selection' | 'fileName' | 'isAudioTrackMuted'>;

const App: React.FC = () => {
  const [state, setState] = useState<ExtendedEditorState>({
    intro: null,
    mainVideo: null,
    outro: null,
    audio: null,
    duration: 0,
    currentTime: 0,
    isPlaying: false,
    playbackRate: 1,
    zoomLevel: 50,
    fileName: null,
    clips: [],
    audioClips: [],
    subtitles: [],
    zoomEffects: [],
    spotlightEffects: [],
    mosaicEffects: [],
    selection: null,
    isExporting: false,
    isExportingAudio: false,
    currentBrushSize: 10,
    exportProgress: 0,
    showSuccessToast: false,
    isAudioTrackMuted: false
  });

  const [isScreenRecording, setIsScreenRecording] = useState(false);
  const [recordingMarkersCount, setRecordingMarkersCount] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showFloatingBar, setShowFloatingBar] = useState(true);

  const playerRef = useRef<PlayerRef>(null);
  const lastTimeRef = useRef<number>(Date.now());
  const animationFrameRef = useRef<number>();

  // PiP Refs
  const pipCanvasRef = useRef<HTMLCanvasElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const [isPiPActive, setIsPiPActive] = useState(false);

  // State Ref for accessing latest state in event listeners without re-binding
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // History Ref
  const historyRef = useRef<{ past: ProjectState[]; future: ProjectState[] }>({ past: [], future: [] });

  // Screen Recording Refs
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const screenChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const recordingMarkersRef = useRef<number[]>([]);
  const recordingIntervalRef = useRef<any>(null);

  // Helper to draw the PiP timer
  const updatePiP = useCallback((time: number) => {
    const canvas = pipCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 16:9 Small Canvas
    if (canvas.width !== 256) {
      canvas.width = 256;
      canvas.height = 144;
    }

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    ctx.font = '600 14px sans-serif';
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("● REC", cx, cy - 24);

    ctx.font = '700 48px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(formatTimeShort(time), cx, cy + 16);
  }, []);

  // Update Favicon with a Blinking Red Dot
  const updateFavicon = useCallback((active: boolean) => {
    let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement('link');
      link.type = 'image/x-icon';
      link.rel = 'shortcut icon';
      document.head.appendChild(link);
    }

    if (!active) {
      // Reset to a simple default svg or clear
      // Using a simple data URI for a "stop" square or just clear it
      link.href = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect x='25' y='25' width='50' height='50' fill='%23ccc' rx='10'/></svg>";
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Draw Red Circle
      ctx.beginPath();
      ctx.arc(16, 16, 14, 0, 2 * Math.PI);
      ctx.fillStyle = '#ef4444'; // Red
      ctx.fill();

      // Draw White Inner Square (Stop symbol look)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(10, 10, 12, 12);
    }
    link.href = canvas.toDataURL();
  }, []);

  // Effect: Handle Document Title, PiP updates, and Favicon
  useEffect(() => {
    if (isScreenRecording) {
      const timeStr = formatTimeShort(recordingDuration);
      // Put time FIRST so it is visible in small tabs
      document.title = `${timeStr} • Recording`;

      // Update PiP Canvas if active
      if (isPiPActive) {
        updatePiP(recordingDuration);
      }

      // Blink Favicon every second (toggle opacity or just redraw?)
      // For simplicity, we just keep it red. 
      // If we wanted blinking, we'd need another interval. 
      // Let's just set it to red once when recording starts, handled by effect dependency.
      updateFavicon(true);

    } else {
      document.title = "FrameCut Web Editor";
      updateFavicon(false);
    }
  }, [isScreenRecording, recordingDuration, isPiPActive, updatePiP, updateFavicon]);


  // --- Recalculate Duration ---
  const recalculateDuration = (
    clips: Clip[],
    audioClips: Clip[],
    subtitles: Subtitle[],
    zoomEffects: ZoomEffect[],
    spotlightEffects: SpotlightEffect[],
    mosaicEffects: MosaicEffect[]
  ): number => {

    const lastClipEnd = clips.reduce((max, c) => {
      const duration = (c.sourceEnd - c.sourceStart) / c.speed;
      return Math.max(max, c.offset + duration);
    }, 0);

    const lastAudioEnd = audioClips.reduce((max, c) => {
      const duration = (c.sourceEnd - c.sourceStart) / c.speed;
      return Math.max(max, c.offset + duration);
    }, 0);

    const lastSubEnd = subtitles.reduce((max, s) => Math.max(max, s.end), 0);
    const lastZoomEnd = zoomEffects.reduce((max, z) => Math.max(max, z.end), 0);
    const lastSpotEnd = spotlightEffects.reduce((max, s) => Math.max(max, s.end), 0);
    const lastMosEnd = mosaicEffects.reduce((max, m) => Math.max(max, m.end), 0);

    let total = Math.max(lastClipEnd, lastAudioEnd, lastSubEnd, lastZoomEnd, lastSpotEnd, lastMosEnd);

    // Ensure 0 if empty
    if (clips.length === 0 && audioClips.length === 0 && total === 0) total = 0;

    return total;
  };

  // --- Undo/Redo Logic ---

  const getProjectState = (fullState: ExtendedEditorState): ProjectState => ({
    intro: fullState.intro,
    mainVideo: fullState.mainVideo,
    outro: fullState.outro,
    audio: fullState.audio,
    duration: fullState.duration,
    clips: fullState.clips,
    audioClips: fullState.audioClips,
    subtitles: fullState.subtitles,
    zoomEffects: fullState.zoomEffects,
    spotlightEffects: fullState.spotlightEffects,
    mosaicEffects: fullState.mosaicEffects,
    selection: fullState.selection,
    fileName: fullState.fileName,
    isAudioTrackMuted: fullState.isAudioTrackMuted,
  });

  const pushHistory = useCallback(() => {
    const currentProjectState = getProjectState(stateRef.current);
    historyRef.current.past.push(currentProjectState);
    historyRef.current.future = []; // Clear future on new action
    // Limit history size if needed (e.g., 50 steps)
    if (historyRef.current.past.length > 50) historyRef.current.past.shift();
  }, []);

  const handleUndo = useCallback(() => {
    if (historyRef.current.past.length === 0) return;

    const previous = historyRef.current.past.pop();
    const current = getProjectState(stateRef.current);

    if (previous) {
      historyRef.current.future.push(current);
      setState(prev => ({ ...prev, ...previous }));
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (historyRef.current.future.length === 0) return;

    const next = historyRef.current.future.pop();
    const current = getProjectState(stateRef.current);

    if (next) {
      historyRef.current.past.push(current);
      setState(prev => ({ ...prev, ...next }));
    }
  }, []);

  // --- Core Logic: Playback Context ---

  // Helper to find asset
  const getAsset = useCallback((mediaType: 'intro' | 'main' | 'outro' | 'audio', state: ExtendedEditorState) => {
    if (mediaType === 'intro') return state.intro;
    if (mediaType === 'outro') return state.outro;
    if (mediaType === 'audio') return state.audio;
    return state.mainVideo;
  }, []);

  const getPlaybackContext = useCallback((globalTime: number, state: ExtendedEditorState) => {
    // 1. Video Context
    const activeVideoClip = state.clips.find(clip => {
      const duration = (clip.sourceEnd - clip.sourceStart) / clip.speed;
      return globalTime >= clip.offset && globalTime < clip.offset + duration;
    });

    let videoCtx = {
      src: null as string | null,
      time: 0,
      playbackRate: state.playbackRate,
      mediaType: null as 'intro' | 'main' | 'outro' | 'audio' | null,
      muted: false,
      corsCompatible: true,
      clipTiming: null as { offset: number, sourceStart: number, speed: number } | null
    };

    if (activeVideoClip) {
      const asset = getAsset(activeVideoClip.mediaType, state);
      if (asset) {
        const timeIntoClipVisual = globalTime - activeVideoClip.offset;
        const timeIntoClipSource = timeIntoClipVisual * activeVideoClip.speed;

        let computedTime = activeVideoClip.sourceStart + timeIntoClipSource;
        if (asset.duration > 0 && !asset.src.startsWith('color:')) {
          computedTime = computedTime % asset.duration;
        }

        videoCtx = {
          src: asset.src,
          time: computedTime,
          playbackRate: state.playbackRate * activeVideoClip.speed,
          mediaType: activeVideoClip.mediaType,
          muted: activeVideoClip.muted || false,
          corsCompatible: asset.corsCompatible ?? true,
          clipTiming: {
            offset: activeVideoClip.offset,
            sourceStart: activeVideoClip.sourceStart,
            speed: activeVideoClip.speed
          }
        };
      }
    }

    // 2. Audio Context
    const activeAudioClip = state.audioClips.find(clip => {
      const duration = (clip.sourceEnd - clip.sourceStart) / clip.speed;
      return globalTime >= clip.offset && globalTime < clip.offset + duration;
    });

    let audioCtx = {
      src: null as string | null,
      time: 0,
      playbackRate: state.playbackRate
    };

    if (activeAudioClip) {
      const asset = getAsset(activeAudioClip.mediaType, state);
      if (asset) {
        if (asset.src.startsWith('color:')) {
          audioCtx = { src: null, time: 0, playbackRate: 1 };
        } else {
          const timeIntoClipVisual = globalTime - activeAudioClip.offset;
          const timeIntoClipSource = timeIntoClipVisual * activeAudioClip.speed;

          let computedTime = activeAudioClip.sourceStart + timeIntoClipSource;
          if (asset.duration > 0) {
            computedTime = computedTime % asset.duration;
          }

          audioCtx = {
            src: asset.src,
            time: computedTime,
            playbackRate: state.playbackRate * activeAudioClip.speed
          };
        }
      }
    }

    return { videoCtx, audioCtx };

  }, [getAsset]);


  // --- Actions ---

  const handleSeek = useCallback((time: number) => {
    setState(prev => ({ ...prev, currentTime: time }));
  }, []);

  const handleTogglePlay = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  const handleSelect = useCallback((sel: Selection) => {
    setState(prev => ({ ...prev, selection: sel }));
  }, []);

  const handleSelectSubtitle = useCallback((id: string) => {
    setState(prev => ({ ...prev, selection: { type: 'subtitle', id } }));
  }, []);

  const handleSelectZoom = useCallback((id: string) => {
    setState(prev => ({ ...prev, selection: { type: 'zoom', id } }));
  }, []);

  const handleSelectSpotlight = useCallback((id: string) => {
    setState(prev => ({ ...prev, selection: { type: 'spotlight', id } }));
  }, []);

  const handleSelectMosaic = useCallback((id: string) => {
    setState(prev => ({ ...prev, selection: { type: 'mosaic', id } }));
  }, []);

  const handleStepFrame = useCallback((dir: -1 | 1) => {
    setState(prev => ({ ...prev, currentTime: Math.max(0, Math.min(prev.duration, prev.currentTime + (dir * FRAME_TIME))) }));
  }, []);

  const handleZoom = useCallback((dir: -1 | 1) => {
    setState(prev => ({ ...prev, zoomLevel: Math.max(10, prev.zoomLevel + (dir * 10)) }));
  }, []);

  const handleToggleAudioTrackMute = useCallback(() => {
    pushHistory();
    setState(prev => ({ ...prev, isAudioTrackMuted: !prev.isAudioTrackMuted }));
  }, [pushHistory]);

  const handleScreenshot = useCallback(() => {
    if (playerRef.current) {
      const dataUrl = playerRef.current.captureFrame();
      if (dataUrl) {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `frame-${formatTimecode(stateRef.current.currentTime).replace(/:/g, '-')}.png`;
        a.click();
      } else {
        alert("Could not capture frame. The source video is protected by CORS policy.");
      }
    }
  }, []);

  const handleUrlImport = async (type: 'intro' | 'main' | 'outro' | 'audio', url: string) => {
    pushHistory();
    try {
      // Get Duration and validate CORS access
      const { duration, corsCompatible } = await getVideoDuration(url);

      const asset: MediaAsset = {
        id: generateId(),
        src: url,
        name: url.split('/').pop() || 'Remote Video',
        duration: duration,
        corsCompatible: corsCompatible
      };

      updateStateWithAsset(type, asset, duration);

      // Only extract waveform if CORS is compatible
      if (corsCompatible) {
        extractWaveform(url).then(waveformData => {
          setState(prev => {
            const currentAsset = type === 'intro' ? prev.intro : type === 'outro' ? prev.outro : type === 'audio' ? prev.audio : prev.mainVideo;
            if (currentAsset && currentAsset.id === asset.id) {
              return {
                ...prev,
                intro: type === 'intro' ? { ...currentAsset, waveformData } : prev.intro,
                mainVideo: type === 'main' ? { ...currentAsset, waveformData } : prev.mainVideo,
                outro: type === 'outro' ? { ...currentAsset, waveformData } : prev.outro,
                audio: type === 'audio' ? { ...currentAsset, waveformData } : prev.audio,
              };
            }
            return prev;
          });
        }).catch(e => console.warn("Waveform extract failed", e));
      }

    } catch (e: any) {
      console.error("URL Import Failed", e);
      // Show the specific error message from utils
      const msg = typeof e === 'string' ? e : (e.message || "Failed to load video from URL.");
      alert(msg);
      throw e; // Rethrow so Sidebar stops loading spinner
    }
  };

  const handleUploadAsset = async (type: 'intro' | 'main' | 'outro' | 'audio', file: File) => {
    pushHistory();
    try {
      const url = URL.createObjectURL(file);
      // Local blobs are always CORS compatible
      const { duration } = await getVideoDuration(url);
      const asset: MediaAsset = {
        id: generateId(),
        src: url,
        name: file.name,
        duration: duration,
        corsCompatible: true
      };

      updateStateWithAsset(type, asset, duration);

      extractWaveform(url).then(waveformData => {
        setState(prev => {
          const currentAsset = type === 'intro' ? prev.intro : type === 'outro' ? prev.outro : type === 'audio' ? prev.audio : prev.mainVideo;
          if (currentAsset && currentAsset.id === asset.id) {
            const updatedAsset = { ...currentAsset, waveformData };
            return {
              ...prev,
              intro: type === 'intro' ? updatedAsset : prev.intro,
              mainVideo: type === 'main' ? updatedAsset : prev.mainVideo,
              outro: type === 'outro' ? updatedAsset : prev.outro,
              audio: type === 'audio' ? updatedAsset : prev.audio,
            };
          }
          return prev;
        });
      });

    } catch (e) {
      console.error("Failed to load media", e);
      alert("Failed to load file. Please try a different one.");
    }
  };

  const handleSetColorAsset = (type: 'intro' | 'outro', color: string) => {
    pushHistory();
    const asset: MediaAsset = {
      id: generateId(),
      src: `color:${color}`,
      name: `Color Block`,
      duration: 5.0,
      corsCompatible: true
    };
    updateStateWithAsset(type, asset, 5.0);
  };

  const updateStateWithAsset = (type: 'intro' | 'main' | 'outro' | 'audio', asset: MediaAsset, duration: number) => {
    setState(prev => {
      let newState = { ...prev };

      if (type === 'audio') {
        newState.audio = asset;
        const nonAudioTypeClips = prev.audioClips.filter(c => c.mediaType !== 'audio');
        const newAudioClip: Clip = {
          id: generateId(),
          sourceStart: 0,
          sourceEnd: duration,
          offset: 0,
          speed: 1.0,
          mediaType: 'audio'
        };
        newState.audioClips = [...nonAudioTypeClips, newAudioClip];

      } else if (type === 'intro') {
        newState.intro = asset;
        const otherClips = prev.clips.filter(c => c.mediaType !== 'intro');
        const newIntroClip: Clip = {
          id: generateId(),
          sourceStart: 0,
          sourceEnd: duration,
          offset: 0,
          speed: 1.0,
          mediaType: 'intro'
        };
        otherClips.sort((a, b) => a.offset - b.offset);

        let currentOffset = duration;
        const shiftedClips = otherClips.map(c => {
          const dur = (c.sourceEnd - c.sourceStart) / c.speed;
          const clip = { ...c, offset: currentOffset };
          currentOffset += dur;
          return clip;
        });

        newState.clips = [newIntroClip, ...shiftedClips];

      } else if (type === 'outro') {
        newState.outro = asset;
        const otherClips = prev.clips.filter(c => c.mediaType !== 'outro');

        otherClips.sort((a, b) => a.offset - b.offset);
        let currentOffset = 0;
        otherClips.forEach(c => {
          const dur = (c.sourceEnd - c.sourceStart) / c.speed;
          currentOffset = Math.max(currentOffset, c.offset + dur);
        });

        const newOutroClip: Clip = {
          id: generateId(),
          sourceStart: 0,
          sourceEnd: duration,
          offset: currentOffset,
          speed: 1.0,
          mediaType: 'outro'
        };

        newState.clips = [...otherClips, newOutroClip];

      } else if (type === 'main') {
        newState.mainVideo = asset;
        newState.fileName = asset.name;

        const introClips = prev.clips.filter(c => c.mediaType === 'intro');
        const outroClips = prev.clips.filter(c => c.mediaType === 'outro');

        const newMainClip: Clip = {
          id: generateId(),
          sourceStart: 0,
          sourceEnd: duration,
          offset: 0,
          speed: 1.0,
          mediaType: 'main'
        };

        introClips.sort((a, b) => a.offset - b.offset);

        let currentOffset = 0;
        const finalIntroClips = introClips.map(c => {
          const dur = (c.sourceEnd - c.sourceStart) / c.speed;
          const clip = { ...c, offset: currentOffset };
          currentOffset += dur;
          return clip;
        });

        newMainClip.offset = currentOffset;
        currentOffset += (newMainClip.sourceEnd - newMainClip.sourceStart);

        outroClips.sort((a, b) => a.offset - b.offset);
        const finalOutroClips = outroClips.map(c => {
          const dur = (c.sourceEnd - c.sourceStart) / c.speed;
          const clip = { ...c, offset: currentOffset };
          currentOffset += dur;
          return clip;
        });

        newState.clips = [...finalIntroClips, newMainClip, ...finalOutroClips];
      }

      newState.duration = recalculateDuration(
        newState.clips,
        newState.audioClips,
        newState.subtitles,
        newState.zoomEffects,
        newState.spotlightEffects,
        newState.mosaicEffects
      );

      return newState;
    });
  }

  const handleRemoveAsset = (type: 'intro' | 'main' | 'outro' | 'audio') => {
    pushHistory();
    setState(prev => {
      let newState = { ...prev };
      if (type === 'intro') newState.intro = null;
      if (type === 'outro') newState.outro = null;
      if (type === 'main') newState.mainVideo = null;
      if (type === 'audio') newState.audio = null;

      const remainingClips = newState.clips.filter(c => c.mediaType !== type);

      remainingClips.sort((a, b) => a.offset - b.offset);
      let currentOffset = 0;
      const shiftedClips = remainingClips.map(c => {
        const dur = (c.sourceEnd - c.sourceStart) / c.speed;
        const clip = { ...c, offset: currentOffset };
        currentOffset += dur;
        return clip;
      });

      newState.clips = shiftedClips;
      newState.audioClips = newState.audioClips.filter(c => c.mediaType !== type);

      newState.duration = recalculateDuration(
        newState.clips,
        newState.audioClips,
        newState.subtitles,
        newState.zoomEffects,
        newState.spotlightEffects,
        newState.mosaicEffects
      );
      return newState;
    });
  };

  const loadEditorWithVideo = useCallback(async (url: string, name: string, initialSpotlights: SpotlightEffect[] = []) => {
    // Note: Loading a new video acts like a reset, so we might want to clear history or treat it as first entry.
    // For now, let's treat it as a new start.
    const { duration, corsCompatible } = await getVideoDuration(url);
    const asset: MediaAsset = {
      id: generateId(),
      src: url,
      name: name,
      duration: duration,
      corsCompatible: corsCompatible
    };

    historyRef.current = { past: [], future: [] }; // Reset history on new project load

    setState(prev => ({
      ...prev,
      mainVideo: asset,
      intro: null,
      outro: null,
      audio: null,
      fileName: name,
      currentTime: 0,
      isPlaying: false,
      clips: [{
        id: generateId(),
        sourceStart: 0,
        sourceEnd: duration,
        offset: 0,
        speed: 1.0,
        mediaType: 'main'
      }],
      audioClips: [],
      subtitles: [],
      zoomEffects: [],
      spotlightEffects: initialSpotlights,
      mosaicEffects: [],
      selection: null,
      isExporting: false,
      isExportingAudio: false,
      exportProgress: 0,
      showSuccessToast: false,
      duration: duration
    }));

    if (corsCompatible) {
      extractWaveform(url).then(waveformData => {
        setState(prev => {
          if (prev.mainVideo && prev.mainVideo.id === asset.id) {
            return {
              ...prev,
              mainVideo: { ...prev.mainVideo, waveformData }
            };
          }
          return prev;
        });
      });
    }

  }, []);

  const handleTogglePiP = useCallback(async () => {
    if (isPiPActive) {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      }
      setIsPiPActive(false);
    } else {
      const canvas = pipCanvasRef.current;
      const video = pipVideoRef.current;
      if (canvas && video) {
        updatePiP(recordingDuration); // Force update
        const pipStream = canvas.captureStream(1);
        video.srcObject = pipStream;
        try {
          await video.play();
          await video.requestPictureInPicture();
          setIsPiPActive(true);
        } catch (e) {
          console.warn("Failed to enter PiP", e);
          alert("Failed to open floating timer. You may need to interact with the page first.");
          setIsPiPActive(false);
        }
        video.onleavepictureinpicture = () => {
          setIsPiPActive(false);
        };
      }
    }
  }, [isPiPActive, recordingDuration, updatePiP]);

  const handleStartScreenRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const recorder = new MediaRecorder(stream);
      screenChunksRef.current = [];
      recordingMarkersRef.current = [];
      setRecordingMarkersCount(0);
      setShowFloatingBar(true);
      setIsPiPActive(false); // Reset PiP state

      // Start Timer logic
      setRecordingDuration(0);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(d => d + 1);
      }, 1000);

      recordingStartTimeRef.current = Date.now();
      recorder.ondataavailable = (e) => { if (e.data.size > 0) screenChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);

        // Exit PiP if active
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture().catch(() => { });
        }
        setIsPiPActive(false);

        const blob = new Blob(screenChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toLocaleTimeString().replace(/:/g, '-');
        const generatedSpotlights: SpotlightEffect[] = recordingMarkersRef.current.map(timeMs => {
          const timeSec = timeMs / 1000;
          return { id: generateId(), start: Math.max(0, timeSec - 0.75), end: timeSec + 0.75, x: 40, y: 32, width: 20, height: 35.5 };
        });
        loadEditorWithVideo(url, `Screen Recording ${timestamp}`, generatedSpotlights);
        setIsScreenRecording(false);
        stream.getTracks().forEach(track => track.stop());
      };
      stream.getVideoTracks()[0].onended = () => { if (recorder.state !== 'inactive') recorder.stop(); };

      // NOTE: We do NOT start PiP automatically anymore based on user feedback.

      recorder.start();
      screenRecorderRef.current = recorder;
      setIsScreenRecording(true);
    } catch (err: any) {
      console.error("Screen recording cancelled or failed", err);
      setIsScreenRecording(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert("Screen recording permission was denied. Please allow access to start recording.");
      } else {
        alert("Failed to start screen recording: " + (err.message || "Unknown error"));
      }
    }
  };
  const handleStopScreenRecording = () => {
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    if (screenRecorderRef.current && screenRecorderRef.current.state !== 'inactive') screenRecorderRef.current.stop();
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => { });
    }
  };
  const handleMarker = useCallback(() => {
    if (!isScreenRecording) return;
    recordingMarkersRef.current.push(Date.now() - recordingStartTimeRef.current);
    setRecordingMarkersCount(prev => prev + 1);
  }, [isScreenRecording]);


  const handleExport = useCallback(() => {
    if (state.clips.length === 0 && state.audioClips.length === 0) return;
    setState(prev => ({ ...prev, isPlaying: false, currentTime: 0, exportProgress: 0 }));
    setTimeout(async () => {
      if (playerRef.current) {
        try {
          await playerRef.current.startRecording({ audioOnly: false });
          setState(prev => ({ ...prev, isPlaying: true, isExporting: true, isExportingAudio: false }));
        } catch (e) {
          console.error("Export failed to start", e);
          setState(prev => ({ ...prev, isExporting: false, isPlaying: false }));
        }
      }
    }, 200);
  }, [state.clips, state.audioClips]);

  const handleExportAudio = useCallback(() => {
    if (state.clips.length === 0 && state.audioClips.length === 0) return;
    setState(prev => ({ ...prev, isPlaying: false, currentTime: 0, exportProgress: 0 }));
    setTimeout(async () => {
      if (playerRef.current) {
        try {
          await playerRef.current.startRecording({ audioOnly: true });
          setState(prev => ({ ...prev, isPlaying: true, isExporting: true, isExportingAudio: true }));
        } catch (e) {
          console.error("Audio Export failed to start", e);
          setState(prev => ({ ...prev, isExporting: false, isPlaying: false }));
        }
      }
    }, 200);
  }, [state.clips, state.audioClips]);

  useEffect(() => {
    if (state.isExporting && !state.isPlaying && state.currentTime >= state.duration) {
      const finishExport = async () => {
        if (playerRef.current) {
          const blob = await playerRef.current.stopRecording();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;

          // Determine extension based on actual blob type
          // If browser supports MP4 recording, blob.type will be 'video/mp4'
          const isMp4 = blob.type.includes('mp4');
          const ext = state.isExportingAudio ? 'webm' : (isMp4 ? 'mp4' : 'webm');

          a.download = `exported-${state.fileName || 'project'}.${ext}`;
          a.click();
        }
        setState(prev => ({ ...prev, isExporting: false, isExportingAudio: false, currentTime: 0, exportProgress: 100, showSuccessToast: true }));
        setTimeout(() => setState(prev => ({ ...prev, showSuccessToast: false })), 3000);
      };
      finishExport();
    }
  }, [state.isExporting, state.isPlaying, state.currentTime, state.duration, state.fileName, state.isExportingAudio]);

  useEffect(() => {
    const animate = () => {
      if (state.isPlaying) {
        const now = Date.now();
        const delta = (now - lastTimeRef.current) / 1000;
        lastTimeRef.current = now;

        setState(prev => {
          let nextTime = prev.currentTime + (delta * prev.playbackRate);

          if (nextTime >= prev.duration) {
            return { ...prev, isPlaying: false, currentTime: prev.duration };
          }

          let newProgress = prev.exportProgress;
          if (prev.isExporting) {
            const calculatedProgress = Math.min(100, Math.floor((nextTime / prev.duration) * 100));
            if (calculatedProgress > prev.exportProgress) {
              newProgress = calculatedProgress;
            }
          }

          return {
            ...prev,
            currentTime: nextTime,
            exportProgress: newProgress
          };
        });

        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    if (state.isPlaying) {
      lastTimeRef.current = Date.now();
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [state.isPlaying, state.duration]);

  const handleDetachAudio = useCallback(() => {
    pushHistory();
    setState(prev => {
      if (prev.selection?.type !== 'clip') return prev;
      const clipId = prev.selection.id;
      const videoClip = prev.clips.find(c => c.id === clipId);
      if (!videoClip) return prev;
      const newAudioClip: Clip = { ...videoClip, id: generateId(), muted: false };
      const updatedVideoClips = prev.clips.map(c => c.id === clipId ? { ...c, muted: true } : c);
      const updatedAudioClips = [...prev.audioClips, newAudioClip];
      return { ...prev, clips: updatedVideoClips, audioClips: updatedAudioClips, selection: { type: 'audio', id: newAudioClip.id }, duration: recalculateDuration(updatedVideoClips, updatedAudioClips, prev.subtitles, prev.zoomEffects, prev.spotlightEffects, prev.mosaicEffects) };
    });
  }, [pushHistory]);

  const handleSplit = useCallback(() => {
    pushHistory();
    setState(prev => {
      const cursor = prev.currentTime;
      let newClips = [...prev.clips];
      let newAudioClips = [...prev.audioClips];
      let newSelection = prev.selection;
      if (prev.selection?.type === 'clip') {
        const clipIndex = prev.clips.findIndex(c => c.id === prev.selection!.id);
        if (clipIndex !== -1) {
          const originalClip = prev.clips[clipIndex];
          const duration = (originalClip.sourceEnd - originalClip.sourceStart) / originalClip.speed;
          if (cursor >= originalClip.offset && cursor < originalClip.offset + duration) {
            const timeIntoClipVisual = cursor - originalClip.offset;
            const timeIntoClipSource = timeIntoClipVisual * originalClip.speed;
            const splitPointSource = originalClip.sourceStart + timeIntoClipSource;
            if (timeIntoClipSource >= 0.1 && (originalClip.sourceEnd - splitPointSource) >= 0.1) {
              const leftClip: Clip = { ...originalClip, id: generateId(), sourceEnd: splitPointSource };
              const rightClip: Clip = { ...originalClip, id: generateId(), sourceStart: splitPointSource, offset: cursor };
              newClips.splice(clipIndex, 1, leftClip, rightClip);
              newSelection = { type: 'clip', id: rightClip.id };
            }
          }
        }
      } else if (prev.selection?.type === 'audio') {
        const clipIndex = prev.audioClips.findIndex(c => c.id === prev.selection!.id);
        if (clipIndex !== -1) {
          const originalClip = prev.audioClips[clipIndex];
          const duration = (originalClip.sourceEnd - originalClip.sourceStart) / originalClip.speed;
          if (cursor >= originalClip.offset && cursor < originalClip.offset + duration) {
            const timeIntoClipVisual = cursor - originalClip.offset;
            const timeIntoClipSource = timeIntoClipVisual * originalClip.speed;
            const splitPointSource = originalClip.sourceStart + timeIntoClipSource;
            if (timeIntoClipSource >= 0.1 && (originalClip.sourceEnd - splitPointSource) >= 0.1) {
              const leftClip: Clip = { ...originalClip, id: generateId(), sourceEnd: splitPointSource };
              const rightClip: Clip = { ...originalClip, id: generateId(), sourceStart: splitPointSource, offset: cursor };
              newAudioClips.splice(clipIndex, 1, leftClip, rightClip);
              newSelection = { type: 'audio', id: rightClip.id };
            }
          }
        }
      }
      return { ...prev, clips: newClips, audioClips: newAudioClips, selection: newSelection };
    });
  }, [pushHistory]);

  const handleDelete = useCallback(() => {
    pushHistory();
    setState(prev => {
      if (!prev.selection) return prev;
      let newClips = prev.clips;
      let newAudioClips = prev.audioClips;
      let newSubtitles = prev.subtitles;
      let newZooms = prev.zoomEffects;
      let newSpots = prev.spotlightEffects;
      let newMosaics = prev.mosaicEffects;
      if (prev.selection.type === 'clip') {
        newClips = prev.clips.filter(c => c.id !== prev.selection!.id);
        newClips.sort((a, b) => a.offset - b.offset);
        let currentOffset = 0;
        newClips = newClips.map(clip => {
          const visualDuration = (clip.sourceEnd - clip.sourceStart) / clip.speed;
          const updatedClip = { ...clip, offset: currentOffset };
          currentOffset += visualDuration;
          return updatedClip;
        });
      } else if (prev.selection.type === 'audio') {
        newAudioClips = prev.audioClips.filter(c => c.id !== prev.selection!.id);
      } else if (prev.selection.type === 'subtitle') {
        newSubtitles = prev.subtitles.filter(s => s.id !== prev.selection!.id);
      } else if (prev.selection.type === 'zoom') {
        newZooms = prev.zoomEffects.filter(z => z.id !== prev.selection!.id);
      } else if (prev.selection.type === 'spotlight') {
        newSpots = prev.spotlightEffects.filter(s => s.id !== prev.selection!.id);
      } else if (prev.selection.type === 'mosaic') {
        newMosaics = prev.mosaicEffects.filter(m => m.id !== prev.selection!.id);
      }
      return { ...prev, clips: newClips, audioClips: newAudioClips, subtitles: newSubtitles, zoomEffects: newZooms, spotlightEffects: newSpots, mosaicEffects: newMosaics, selection: null, duration: recalculateDuration(newClips, newAudioClips, newSubtitles, newZooms, newSpots, newMosaics) };
    });
  }, [pushHistory]);

  const handleUpdateClip = useCallback((updatedClip: Clip) => {
    setState(prev => {
      const oldClip = prev.clips.find(c => c.id === updatedClip.id) || prev.audioClips.find(c => c.id === updatedClip.id);
      if (!oldClip) return prev;

      const isAudio = prev.audioClips.some(c => c.id === updatedClip.id);

      // Video Track Ripple Logic
      if (!isAudio) {
        let finalUpdatedClip = { ...updatedClip };

        // Intro Rules: Always starts at 0
        if (finalUpdatedClip.mediaType === 'intro') {
          finalUpdatedClip.offset = 0;
        }

        const oldDuration = (oldClip.sourceEnd - oldClip.sourceStart) / oldClip.speed;
        const newDuration = (finalUpdatedClip.sourceEnd - finalUpdatedClip.sourceStart) / finalUpdatedClip.speed;

        const oldEnd = oldClip.offset + oldDuration;
        const newEnd = finalUpdatedClip.offset + newDuration;
        const shift = newEnd - oldEnd;

        let newClips = prev.clips.map(c => c.id === finalUpdatedClip.id ? finalUpdatedClip : c);

        // Ripple if Intro or if Clip position didn't change (implies duration edit)
        const isOffsetConstant = Math.abs(finalUpdatedClip.offset - oldClip.offset) < 0.001;
        const isIntro = finalUpdatedClip.mediaType === 'intro';

        if ((isIntro || isOffsetConstant) && Math.abs(shift) > 0.001) {
          newClips = newClips.map(c => {
            if (c.id === finalUpdatedClip.id) return c;
            // Shift subsequent clips
            if (c.offset > oldClip.offset + 0.001) {
              return { ...c, offset: c.offset + shift };
            }
            return c;
          });
        }

        return {
          ...prev,
          clips: newClips,
          duration: recalculateDuration(newClips, prev.audioClips, prev.subtitles, prev.zoomEffects, prev.spotlightEffects, prev.mosaicEffects)
        };
      }

      // Audio Track (No Ripple)
      const newAudioClips = prev.audioClips.map(c => c.id === updatedClip.id ? updatedClip : c);
      return {
        ...prev,
        audioClips: newAudioClips,
        duration: recalculateDuration(prev.clips, newAudioClips, prev.subtitles, prev.zoomEffects, prev.spotlightEffects, prev.mosaicEffects)
      };
    });
  }, []);

  const handleUpdateSubtitle = useCallback((updatedSubtitle: Subtitle) => {
    setState(prev => {
      const newSubtitles = prev.subtitles.map(s => s.id === updatedSubtitle.id ? updatedSubtitle : s);
      return {
        ...prev,
        subtitles: newSubtitles,
        duration: recalculateDuration(prev.clips, prev.audioClips, newSubtitles, prev.zoomEffects, prev.spotlightEffects, prev.mosaicEffects)
      };
    });
  }, []);

  const handleUpdateZoomEffect = useCallback((updatedZoom: ZoomEffect) => {
    setState(prev => {
      const newZooms = prev.zoomEffects.map(z => z.id === updatedZoom.id ? updatedZoom : z);
      return {
        ...prev,
        zoomEffects: newZooms,
        duration: recalculateDuration(prev.clips, prev.audioClips, prev.subtitles, newZooms, prev.spotlightEffects, prev.mosaicEffects)
      };
    });
  }, []);

  const handleUpdateSpotlightEffect = useCallback((updatedSpotlight: SpotlightEffect) => {
    setState(prev => {
      const newSpots = prev.spotlightEffects.map(s => s.id === updatedSpotlight.id ? updatedSpotlight : s);
      return {
        ...prev,
        spotlightEffects: newSpots,
        duration: recalculateDuration(prev.clips, prev.audioClips, prev.subtitles, prev.zoomEffects, newSpots, prev.mosaicEffects)
      };
    });
  }, []);

  const handleUpdateMosaicEffect = useCallback((updatedMosaic: MosaicEffect) => {
    setState(prev => {
      const newMosaics = prev.mosaicEffects.map(m => m.id === updatedMosaic.id ? updatedMosaic : m);
      return {
        ...prev,
        mosaicEffects: newMosaics,
        duration: recalculateDuration(prev.clips, prev.audioClips, prev.subtitles, prev.zoomEffects, prev.spotlightEffects, newMosaics)
      };
    });
  }, []);

  const handleAddSubtitle = useCallback(() => {
    pushHistory();
    setState(prev => {
      const newSub: Subtitle = {
        id: generateId(),
        text: "New Subtitle",
        start: prev.currentTime,
        end: prev.currentTime + 3,
        x: 50,
        y: 80
      };
      const newSubtitles = [...prev.subtitles, newSub];
      return {
        ...prev,
        subtitles: newSubtitles,
        selection: { type: 'subtitle', id: newSub.id },
        duration: recalculateDuration(prev.clips, prev.audioClips, newSubtitles, prev.zoomEffects, prev.spotlightEffects, prev.mosaicEffects)
      };
    });
  }, [pushHistory]);

  const handleAddZoom = useCallback(() => {
    pushHistory();
    setState(prev => {
      const newZoom: ZoomEffect = {
        id: generateId(),
        start: prev.currentTime,
        end: prev.currentTime + 3,
        x: 10, y: 10, width: 80, height: 80
      };
      const newZooms = [...prev.zoomEffects, newZoom];
      return {
        ...prev,
        zoomEffects: newZooms,
        selection: { type: 'zoom', id: newZoom.id },
        duration: recalculateDuration(prev.clips, prev.audioClips, prev.subtitles, newZooms, prev.spotlightEffects, prev.mosaicEffects)
      };
    });
  }, [pushHistory]);

  const handleAddSpotlight = useCallback(() => {
    pushHistory();
    setState(prev => {
      const newSpot: SpotlightEffect = {
        id: generateId(),
        start: prev.currentTime,
        end: prev.currentTime + 3,
        x: 40, y: 40, width: 20, height: 20
      };
      const newSpots = [...prev.spotlightEffects, newSpot];
      return {
        ...prev,
        spotlightEffects: newSpots,
        selection: { type: 'spotlight', id: newSpot.id },
        duration: recalculateDuration(prev.clips, prev.audioClips, prev.subtitles, prev.zoomEffects, newSpots, prev.mosaicEffects)
      };
    });
  }, [pushHistory]);

  const handleAddMosaic = useCallback(() => {
    pushHistory();
    setState(prev => {
      const newMosaic: MosaicEffect = {
        id: generateId(),
        start: prev.currentTime,
        end: prev.currentTime + 3,
        paths: []
      };
      const newMosaics = [...prev.mosaicEffects, newMosaic];
      return {
        ...prev,
        mosaicEffects: newMosaics,
        selection: { type: 'mosaic', id: newMosaic.id },
        duration: recalculateDuration(prev.clips, prev.audioClips, prev.subtitles, prev.zoomEffects, prev.spotlightEffects, newMosaics)
      };
    });
  }, [pushHistory]);

  const handleZoomScaleChange = (scale: number) => {
    pushHistory();
    setState(prev => {
      if (prev.selection?.type !== 'zoom') return prev;
      const zoom = prev.zoomEffects.find(z => z.id === prev.selection!.id);
      if (!zoom) return prev;

      const newSize = 100 / scale;
      const centerX = zoom.x + zoom.width / 2;
      const centerY = zoom.y + zoom.height / 2;

      const newWidth = newSize;
      const newHeight = newSize;

      return {
        ...prev,
        zoomEffects: prev.zoomEffects.map(z => z.id === zoom.id ? {
          ...z,
          width: newWidth,
          height: newHeight,
          x: Math.max(0, Math.min(100 - newWidth, centerX - newWidth / 2)),
          y: Math.max(0, Math.min(100 - newHeight, centerY - newHeight / 2))
        } : z)
      };
    });
  };

  const handleMosaicBrushSizeChange = (size: number) => {
    // Brush size is UI state, but if it affects drawing, we might want to capture history only when drawing finishes.
    // Changing the brush size selector doesn't change content until you draw.
    setState(prev => ({ ...prev, currentBrushSize: size }));
  };

  const handleClipSpeedChange = (speed: number) => {
    pushHistory();
    // Implement Ripple Edit logic:
    // When speed changes, duration changes. We need to shift all subsequent clips by the delta.

    setState(prev => {
      const { selection, clips, audioClips } = prev;
      if (!selection) return prev;

      const isAudio = selection.type === 'audio';
      const targetClips = isAudio ? audioClips : clips;
      const targetId = selection.id;

      const clipIndex = targetClips.findIndex(c => c.id === targetId);
      if (clipIndex === -1) return prev;

      const clip = targetClips[clipIndex];

      // Calculate visual duration before change
      const oldDuration = (clip.sourceEnd - clip.sourceStart) / clip.speed;

      // Calculate visual duration after change
      const newDuration = (clip.sourceEnd - clip.sourceStart) / speed;

      const durationDelta = newDuration - oldDuration;

      // Create new clips array
      const newTrackClips = [...targetClips];

      // 1. Update the speed of the selected clip
      newTrackClips[clipIndex] = { ...clip, speed };

      // 2. Shift all subsequent clips (Ripple Edit)
      // We only ripple clips that are conceptually "after" this one on the track
      // Since we are using a single track per type, we can just iterate by index or offset
      // Assuming clips are somewhat sorted or we iterate through all clips and shift those with start time > current end

      // Simple approach: Shift everything with an index > clipIndex
      for (let i = clipIndex + 1; i < newTrackClips.length; i++) {
        newTrackClips[i] = {
          ...newTrackClips[i],
          offset: newTrackClips[i].offset + durationDelta
        };
      }

      const newClips = isAudio ? clips : newTrackClips;
      const newAudioClips = isAudio ? newTrackClips : audioClips;

      return {
        ...prev,
        clips: newClips,
        audioClips: newAudioClips,
        duration: recalculateDuration(newClips, newAudioClips, prev.subtitles, prev.zoomEffects, prev.spotlightEffects, prev.mosaicEffects)
      };
    });
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDelete();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDelete, handleUndo, handleRedo]);

  const { videoCtx, audioCtx } = getPlaybackContext(state.currentTime, state);

  // Calculate interpolated zoom for smooth transition
  // We use strict containment: The effect handles In/Out animations within its own start/end duration.
  const activeZoomEffect = state.zoomEffects.find(z => state.currentTime >= z.start && state.currentTime < z.end);

  return (
    <div className="flex h-screen w-screen bg-black text-white overflow-hidden font-sans">
      <DebugPanel state={state} videoTime={videoCtx.time} />
      <Sidebar
        intro={state.intro}
        mainVideo={state.mainVideo}
        outro={state.outro}
        onUpload={handleUploadAsset}
        onImportUrl={handleUrlImport}
        onRemove={handleRemoveAsset}
        onSetColor={handleSetColorAsset}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 flex min-h-0 relative bg-zinc-950">
          <div className="flex-1 flex items-center justify-center p-4">
            <Player
              ref={playerRef}
              src={videoCtx.src}
              sourceTime={videoCtx.time}
              currentTime={state.currentTime} // Pass global time for effect animations
              isMuted={videoCtx.muted}
              corsCompatible={videoCtx.corsCompatible}
              clipTiming={videoCtx.clipTiming}
              audioSrc={audioCtx.src}
              audioSourceTime={audioCtx.time}
              audioPlaybackRate={audioCtx.playbackRate}
              activeSubtitles={state.subtitles.filter(s => state.currentTime >= s.start && state.currentTime < s.end)}
              activeZoomEffect={activeZoomEffect}
              activeSpotlightEffect={state.spotlightEffects.find(s => state.currentTime >= s.start && state.currentTime < s.end)}
              activeMosaicEffect={state.mosaicEffects.find(m => state.currentTime >= m.start && state.currentTime < m.end)}
              selectedZoomEffect={state.selection?.type === 'zoom' ? state.zoomEffects.find(z => z.id === state.selection!.id) || null : null}
              selectedSpotlightEffect={state.selection?.type === 'spotlight' ? state.spotlightEffects.find(s => s.id === state.selection!.id) || null : null}
              selectedMosaicEffect={state.selection?.type === 'mosaic' ? state.mosaicEffects.find(m => m.id === state.selection!.id) || null : null}
              isPlaying={state.isPlaying}
              playbackRate={state.playbackRate}
              currentBrushSize={state.currentBrushSize}
              onDurationChange={() => { }}
              onEnded={() => setState(prev => ({ ...prev, isPlaying: false }))}
              onUpdateSubtitle={handleUpdateSubtitle}
              onUpdateZoomEffect={handleUpdateZoomEffect}
              onUpdateSpotlightEffect={handleUpdateSpotlightEffect}
              onUpdateMosaicEffect={handleUpdateMosaicEffect}
              onSelectSubtitle={handleSelectSubtitle}
              onSelectZoomEffect={handleSelectZoom}
              onSelectSpotlightEffect={handleSelectSpotlight}
              onSelectMosaicEffect={handleSelectMosaic}
              onTogglePlay={handleTogglePlay}
              onImportVideo={() => document.getElementById('main-video-upload')?.click()}
              onInteractionStart={pushHistory}
              isAudioTrackMuted={state.isAudioTrackMuted}
            />
          </div>

          {!state.mainVideo && !state.intro && !state.outro && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
              <div className="text-center max-w-md p-6">
                {isScreenRecording ? (
                  <div className="animate-in fade-in zoom-in duration-300">
                    <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4 animate-pulse">
                      <div className="w-10 h-10 rounded-sm bg-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Recording Screen...</h2>
                    <div className="text-4xl font-mono font-bold text-red-500 mb-6 tabular-nums">{formatTimeShort(recordingDuration)}</div>
                    <div className="flex gap-4 justify-center mt-6">
                      <button onClick={handleMarker} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">
                        <MousePointer2 size={16} /> Add Marker ({recordingMarkersCount})
                      </button>
                      <button onClick={handleStopScreenRecording} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors">
                        <StopCircle size={16} /> Stop Recording
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="animate-in fade-in slide-in-from-bottom-5 duration-500">
                    <h1 className="text-3xl font-bold mb-3 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">Video Editor</h1>
                    <p className="text-zinc-400 mb-8">Upload media on the left or start a screen recording to begin.</p>
                    <button onClick={handleStartScreenRecording} className="group relative inline-flex items-center gap-2 px-6 py-3 bg-white text-black rounded-full hover:bg-zinc-200 transition-all font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5">
                      <Circle size={12} className="fill-red-500 text-red-500 animate-pulse" /> Start Screen Recording
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <Toolbar
          isPlaying={state.isPlaying}
          selection={state.selection}
          hasVideo={!!state.mainVideo || !!state.intro || !!state.outro}
          currentTime={formatTimecode(state.currentTime)}
          selectedSubtitleText={state.selection?.type === 'subtitle' ? state.subtitles.find(s => s.id === state.selection!.id)?.text : undefined}
          selectedZoomScale={state.selection?.type === 'zoom' ? (100 / (state.zoomEffects.find(z => z.id === state.selection!.id)?.width || 100)) : undefined}
          selectedMosaicBrushSize={state.currentBrushSize}
          selectedClipSpeed={state.selection?.type === 'clip' ? state.clips.find(c => c.id === state.selection!.id)?.speed : state.selection?.type === 'audio' ? state.audioClips.find(c => c.id === state.selection!.id)?.speed : undefined}
          onPlayPause={handleTogglePlay}
          onStepFrame={handleStepFrame}
          onZoom={handleZoom}
          onSplit={handleSplit}
          onDelete={handleDelete}
          onDetachAudio={handleDetachAudio}
          onSubtitleChange={(text) => handleUpdateSubtitle({ ...state.subtitles.find(s => s.id === state.selection!.id)!, text })}
          onZoomScaleChange={handleZoomScaleChange}
          onMosaicBrushSizeChange={handleMosaicBrushSizeChange}
          onClipSpeedChange={handleClipSpeedChange}
          onScreenshot={handleScreenshot}
        />

        <div className="h-72 border-t border-zinc-800 bg-zinc-900 shrink-0">
          <Timeline
            duration={state.duration}
            currentTime={state.currentTime}
            zoomLevel={state.zoomLevel}
            intro={state.intro}
            outro={state.outro}
            mainVideo={state.mainVideo}
            audio={state.audio}
            clips={state.clips}
            audioClips={state.audioClips}
            subtitles={state.subtitles}
            zoomEffects={state.zoomEffects}
            spotlightEffects={state.spotlightEffects}
            mosaicEffects={state.mosaicEffects}
            selection={state.selection}
            isPlaying={state.isPlaying}
            onSeek={handleSeek}
            onTogglePlay={handleTogglePlay}
            onSelect={handleSelect}
            onUpdateClip={handleUpdateClip}
            onUpdateSubtitle={handleUpdateSubtitle}
            onUpdateZoomEffect={handleUpdateZoomEffect}
            onUpdateSpotlightEffect={handleUpdateSpotlightEffect}
            onUpdateMosaicEffect={handleUpdateMosaicEffect}
            onAddSubtitle={handleAddSubtitle}
            onAddZoom={handleAddZoom}
            onAddSpotlight={handleAddSpotlight}
            onAddMosaic={handleAddMosaic}
            onInteractionStart={pushHistory}
            isAudioTrackMuted={state.isAudioTrackMuted}
            onToggleAudioTrackMute={handleToggleAudioTrackMute}
          />
        </div>
      </div>

      {state.showSuccessToast && (
        <div className="fixed bottom-8 right-8 bg-zinc-900 border border-zinc-800 text-white px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 z-50">
          <CheckCircle className="text-emerald-500" size={20} />
          <div>
            <h4 className="font-semibold text-sm">Export Complete!</h4>
            <p className="text-xs text-zinc-400">Your video has been downloaded.</p>
          </div>
        </div>
      )}

      {(state.isExporting || state.exportProgress > 0 && state.exportProgress < 100) && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl text-center">
            <div className="mb-4 relative inline-flex items-center justify-center">
              <Loader2 size={48} className="animate-spin text-blue-500" />
              <span className="absolute text-[10px] font-bold">{state.exportProgress}%</span>
            </div>
            <h3 className="text-lg font-semibold mb-1">Exporting Video...</h3>
            <p className="text-sm text-zinc-500">Please do not close this tab.</p>
          </div>
        </div>
      )}

      <div className="fixed top-4 right-4 flex gap-2 z-50">
        <button
          onClick={handleExportAudio}
          disabled={state.clips.length === 0 && state.audioClips.length === 0}
          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileAudio size={14} /> Export Audio
        </button>
        <button
          onClick={handleExport}
          disabled={state.clips.length === 0 && state.audioClips.length === 0}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg shadow-blue-900/20 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          <Download size={16} /> Export Video
        </button>
      </div>

      {/* Floating Recording Status Bar (Mimics Native Browser Notification) */}
      {isScreenRecording && showFloatingBar && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-4 px-5 py-2.5 bg-[#1e1e1e] border border-zinc-700/50 rounded-lg shadow-2xl animate-in slide-in-from-top-4 select-none">
          <div className="flex items-center gap-3 border-r border-zinc-700 pr-4">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
            <span className="font-mono font-medium text-white tabular-nums text-sm tracking-wide">
              {formatTimeShort(recordingDuration)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleMarker} className="flex items-center gap-1.5 text-xs font-medium text-zinc-300 hover:text-white transition-colors group">
              <MousePointer2 size={14} className="group-hover:text-blue-400 transition-colors" />
              <span>Marker ({recordingMarkersCount})</span>
            </button>

            <button
              onClick={handleStopScreenRecording}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#0b57d0] bg-[#a8c7fa] hover:bg-[#8ab4f8] px-4 py-1.5 rounded-full transition-all shadow-sm"
            >
              Stop Sharing
            </button>

            <div className="w-px h-4 bg-zinc-700 mx-1" />

            <button
              onClick={handleTogglePiP}
              className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors ${isPiPActive ? 'text-blue-400 bg-blue-400/10' : 'text-zinc-500 hover:text-zinc-300'}`}
              title={isPiPActive ? "Close Floating Timer" : "Open Floating Timer"}
            >
              {isPiPActive ? <PictureInPicture2 size={14} /> : <PictureInPicture size={14} />}
              <span className="hidden sm:inline">{isPiPActive ? 'Close Timer' : 'Open Timer'}</span>
            </button>

            <button
              onClick={() => setShowFloatingBar(false)}
              className="ml-1 text-zinc-500 hover:text-zinc-300"
              title="Hide Overlay"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Hidden Canvas and Video for Picture-in-Picture Timer */}
      <canvas ref={pipCanvasRef} className="hidden" width={256} height={144} />
      <video ref={pipVideoRef} className="hidden" muted playsInline />
    </div>
  );
};

export default App;