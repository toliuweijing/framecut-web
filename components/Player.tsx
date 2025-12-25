import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Subtitle, ZoomEffect, SpotlightEffect, MosaicEffect, MosaicPath } from '../types';
import { Upload } from 'lucide-react';

// Easing functions for smooth animation in Canvas loop
const easeInOutCubic = (t: number): number => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const lerp = (start: number, end: number, t: number) => {
  return start + (end - start) * t;
};

// Helper to calculate zoom rect at a specific time
const calculateZoomRect = (zoom: ZoomEffect, currentTime: number) => {
    // We constrain the animation to happen STRICTLY within the start/end times.
    const duration = zoom.end - zoom.start;
    // Dynamic transition duration: max 1s, but shrink if clip is too short (e.g. < 2s)
    const transitionDuration = Math.min(1.0, duration / 2); 
    
    // Check if we are outside (shouldn't happen if filtered correctly, but safe guard)
    if (currentTime < zoom.start || currentTime > zoom.end) {
        return { x: 0, y: 0, width: 100, height: 100, isTransitioning: false };
    }

    const localTime = currentTime - zoom.start;

    // 1. Entry Phase (Zoom In)
    if (localTime < transitionDuration) {
        // Interpolate IN (Full -> Zoomed)
        const t = easeInOutCubic(localTime / transitionDuration);
        return {
            x: lerp(0, zoom.x, t),
            y: lerp(0, zoom.y, t),
            width: lerp(100, zoom.width, t),
            height: lerp(100, zoom.height, t),
            isTransitioning: true
        };
    } 
    
    // 2. Exit Phase (Zoom Out)
    if (localTime > (duration - transitionDuration)) {
         const exitElapsed = localTime - (duration - transitionDuration);
         const t = easeInOutCubic(exitElapsed / transitionDuration);
         // Interpolate OUT (Zoomed -> Full)
         return {
             x: lerp(zoom.x, 0, t),
             y: lerp(zoom.y, 0, t),
             width: lerp(zoom.width, 100, t),
             height: lerp(zoom.height, 100, t),
             isTransitioning: true
         };
    }

    // 3. Static Zoomed State (Hold)
    return {
        x: zoom.x,
        y: zoom.y,
        width: zoom.width,
        height: zoom.height,
        isTransitioning: false
    };
};

interface PlayerProps {
  src: string | null;
  sourceTime: number | null; // The exact frame to show from source video. Null if in gap.
  currentTime: number; // Global timeline time
  isMuted?: boolean;
  corsCompatible?: boolean; // Whether the source video supports CORS
  
  // Timing context for smooth interpolation
  clipTiming?: { offset: number; sourceStart: number; speed: number } | null;

  // Audio Track Props
  audioSrc: string | null;
  audioSourceTime: number;
  audioPlaybackRate: number;

  activeSubtitles: Subtitle[];
  activeZoomEffect?: ZoomEffect; // Effect to apply during rendering
  activeSpotlightEffect?: SpotlightEffect; 
  activeMosaicEffect?: MosaicEffect;
  selectedZoomEffect: ZoomEffect | null; // Effect being edited
  selectedSpotlightEffect: SpotlightEffect | null;
  selectedMosaicEffect: MosaicEffect | null;
  isPlaying: boolean;
  playbackRate: number;
  currentBrushSize?: number; // Only for mosaic
  onDurationChange: (duration: number) => void;
  onEnded: () => void;
  onUpdateSubtitle: (sub: Subtitle) => void;
  onUpdateZoomEffect: (zoom: ZoomEffect) => void;
  onUpdateSpotlightEffect: (spotlight: SpotlightEffect) => void;
  onUpdateMosaicEffect: (mosaic: MosaicEffect) => void;
  onSelectSubtitle: (id: string) => void;
  onSelectZoomEffect: (id: string) => void;
  onSelectSpotlightEffect: (id: string) => void;
  onSelectMosaicEffect: (id: string) => void;
  onTogglePlay?: () => void;
  onImportVideo?: () => void;
  onInteractionStart?: () => void;
  isAudioTrackMuted?: boolean;
}

export interface PlayerRef {
  startRecording: (options?: { audioOnly?: boolean }) => Promise<void>;
  stopRecording: () => Promise<Blob>;
  captureFrame: () => string | null;
}

const Player = forwardRef<PlayerRef, PlayerProps>(({
  src,
  sourceTime,
  currentTime,
  isMuted = false,
  corsCompatible = true,
  clipTiming = null,
  audioSrc,
  audioSourceTime,
  audioPlaybackRate,
  activeSubtitles,
  activeZoomEffect,
  activeSpotlightEffect,
  activeMosaicEffect,
  selectedZoomEffect,
  selectedSpotlightEffect,
  selectedMosaicEffect,
  isPlaying,
  playbackRate,
  currentBrushSize = 10,
  onDurationChange,
  onEnded,
  onUpdateSubtitle,
  onUpdateZoomEffect,
  onUpdateSpotlightEffect,
  onUpdateMosaicEffect,
  onSelectSubtitle,
  onSelectZoomEffect,
  onSelectSpotlightEffect,
  onSelectMosaicEffect,
  onTogglePlay,
  onImportVideo,
  onInteractionStart,
  isAudioTrackMuted = false
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Offscreen canvases for Mosaic processing
  const pixelCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const maskCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null); 
  const requestRef = useRef<number>();
  
  // Recorder Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // State for Video Aspect Ratio
  const [aspectRatio, setAspectRatio] = useState<number>(16 / 9);
  
  // Refs for loop state to avoid stale closures
  const srcRef = useRef(src);
  const sourceTimeRef = useRef(sourceTime);
  const currentTimeRef = useRef(currentTime);
  const clipTimingRef = useRef(clipTiming);
  const activeSubtitlesRef = useRef(activeSubtitles);
  const activeZoomEffectRef = useRef(activeZoomEffect);
  const activeSpotlightEffectRef = useRef(activeSpotlightEffect);
  const activeMosaicEffectRef = useRef(activeMosaicEffect);
  const selectedZoomEffectRef = useRef(selectedZoomEffect);
  const selectedSpotlightEffectRef = useRef(selectedSpotlightEffect);
  const selectedMosaicEffectRef = useRef(selectedMosaicEffect);
  const isPlayingRef = useRef(isPlaying);
  
  // Drag State for Subtitles
  const [subDragState, setSubDragState] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  // Drag State for Zoom Box
  const [zoomDragState, setZoomDragState] = useState<{
    type: 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br';
    startX: number;
    startY: number;
    initialBox: { x: number, y: number, width: number, height: number };
  } | null>(null);

  // Drag State for Spotlight Box
  const [spotlightDragState, setSpotlightDragState] = useState<{
    type: 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br';
    startX: number;
    startY: number;
    initialBox: { x: number, y: number, width: number, height: number };
  } | null>(null);

  // Drawing State for Mosaic
  const [isDrawing, setIsDrawing] = useState(false);
  const currentPathRef = useRef<MosaicPath | null>(null);

  useImperativeHandle(ref, () => ({
    startRecording: async (options?: { audioOnly?: boolean }) => {
      const { audioOnly = false } = options || {};
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      let stream: MediaStream | null = null;
      let optionsMime = "";

      const audioContext = new AudioContext();
      const dest = audioContext.createMediaStreamDestination();
      
      // Capture Audio from Video Element
      if (!video.muted && (video as any).captureStream) {
          try {
            const vidStream = (video as any).captureStream() as MediaStream;
            if (vidStream.getAudioTracks().length > 0) {
                 const source = audioContext.createMediaStreamSource(vidStream);
                 source.connect(dest);
            }
          } catch(e) { console.warn("Video audio capture failed", e); }
      }
      
      // Capture Audio from Audio Element
      if (audioRef.current && (audioRef.current as any).captureStream) {
           try {
             const audStream = (audioRef.current as any).captureStream() as MediaStream;
             if (audStream.getAudioTracks().length > 0) {
                 const source = audioContext.createMediaStreamSource(audStream);
                 source.connect(dest);
             }
           } catch(e) { console.warn("Audio element capture failed", e); }
      }

      if (audioOnly) {
         stream = dest.stream;
         const mimeTypes = ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
         optionsMime = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || "";
      } else {
         try {
             stream = canvas.captureStream(30);
         } catch (e) {
             console.error("Canvas capture failed", e);
             alert("Cannot export video: The source video format does not support export (CORS restriction).");
             return;
         }
         
         if (dest.stream.getAudioTracks().length > 0) {
            stream.addTrack(dest.stream.getAudioTracks()[0]);
         }
         const mimeTypes = ["video/mp4", "video/mp4;codecs=avc1,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
         optionsMime = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || "video/webm";
      }

      if (!stream) return;

      mediaRecorderRef.current = new MediaRecorder(stream, { 
        mimeType: optionsMime,
        ...(audioOnly ? { audioBitsPerSecond: 128000 } : { videoBitsPerSecond: 5000000 })
      });
      recordedChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.start();
    },
    stopRecording: async () => {
      return new Promise<Blob>((resolve) => {
        const recorder = mediaRecorderRef.current;
        if (!recorder) {
          resolve(new Blob());
          return;
        }
        const cleanup = () => {
          recorder.onstop = null;
          recorder.onerror = null;
        };
        const handleData = () => {
          const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/webm' });
          cleanup();
          resolve(blob);
        };
        if (recorder.state === 'inactive') {
          handleData();
        } else {
          recorder.onstop = handleData;
          try { recorder.stop(); } catch (e) { handleData(); }
        }
      });
    },
    captureFrame: () => {
      if (canvasRef.current) {
        try {
            return canvasRef.current.toDataURL('image/png');
        } catch (e) {
            console.error("Capture frame failed", e);
            return null;
        }
      }
      return null;
    }
  }));

  // Sync refs
  useEffect(() => { srcRef.current = src; }, [src]);
  useEffect(() => { sourceTimeRef.current = sourceTime; }, [sourceTime]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { clipTimingRef.current = clipTiming; }, [clipTiming]);
  useEffect(() => { activeSubtitlesRef.current = activeSubtitles; }, [activeSubtitles]);
  useEffect(() => { activeZoomEffectRef.current = activeZoomEffect; }, [activeZoomEffect]);
  useEffect(() => { activeSpotlightEffectRef.current = activeSpotlightEffect; }, [activeSpotlightEffect]);
  useEffect(() => { activeMosaicEffectRef.current = activeMosaicEffect; }, [activeMosaicEffect]);
  useEffect(() => { selectedZoomEffectRef.current = selectedZoomEffect; }, [selectedZoomEffect]);
  useEffect(() => { selectedSpotlightEffectRef.current = selectedSpotlightEffect; }, [selectedSpotlightEffect]);
  useEffect(() => { selectedMosaicEffectRef.current = selectedMosaicEffect; }, [selectedMosaicEffect]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // Handle color asset dimensions setup
  useEffect(() => {
    if (src && src.startsWith('color:') && canvasRef.current) {
        if (canvasRef.current.width === 0 || canvasRef.current.width === 300) {
            canvasRef.current.width = 1920;
            canvasRef.current.height = 1080;
            setAspectRatio(16/9);
        }
    }
  }, [src]);

  // Sync Playback Rate & Muted
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
      videoRef.current.muted = isMuted;
    }
    if (audioRef.current) {
      audioRef.current.playbackRate = audioPlaybackRate;
      audioRef.current.muted = isAudioTrackMuted;
    }
  }, [playbackRate, isMuted, audioPlaybackRate, isAudioTrackMuted]);

  // Sync Video Time
  useEffect(() => {
    if (!videoRef.current || sourceTime === null) return;
    const video = videoRef.current;
    if (!src?.startsWith('color:')) {
        const diff = Math.abs(video.currentTime - sourceTime);
        const currentRate = video.playbackRate || 1;
        
        let driftThreshold;
        if (isPlaying) {
             if (currentRate > 1) {
                 driftThreshold = 1.0 * currentRate; 
             } else {
                 driftThreshold = 0.25;
             }
        } else {
            driftThreshold = 0.05; 
        }

        if (diff > driftThreshold) {
          video.currentTime = sourceTime;
        }
    }
  }, [sourceTime, isPlaying, src]);

  // Sync Audio Time
  useEffect(() => {
    if (!audioRef.current) return;
    if (!audioSrc) {
        audioRef.current.pause();
        return;
    }
    const audio = audioRef.current;
    const diff = Math.abs(audio.currentTime - audioSourceTime);
    const currentRate = audio.playbackRate || 1;
    let driftThreshold;

    if (isPlaying) {
         if (currentRate > 1) {
             driftThreshold = 1.0 * currentRate;
         } else {
             driftThreshold = 0.25;
         }
    } else {
        driftThreshold = 0.05;
    }

    if (diff > driftThreshold) {
      audio.currentTime = audioSourceTime;
    }
  }, [audioSourceTime, isPlaying, audioSrc]);

  // Play/Pause Control
  useEffect(() => {
    if (isPlaying) {
       if (videoRef.current && sourceTime !== null && !src?.startsWith('color:')) videoRef.current.play().catch(() => {});
       if (audioRef.current && audioSrc) audioRef.current.play().catch(() => {});
    } else {
       if (videoRef.current) videoRef.current.pause();
       if (audioRef.current) audioRef.current.pause();
    }
  }, [isPlaying, sourceTime, audioSrc, src]);

  // Rendering Loop
  const renderFrame = () => {
    const video = videoRef.current;
    const currentSrc = srcRef.current;
    const currentSourceTime = sourceTimeRef.current;
    const currentGlobalTime = currentTimeRef.current;
    const activeClipTiming = clipTimingRef.current;
    
    const currentSubtitles = activeSubtitlesRef.current;
    const zoom = activeZoomEffectRef.current;
    const spotlight = activeSpotlightEffectRef.current;
    const mosaic = activeMosaicEffectRef.current;
    const selectedZoom = selectedZoomEffectRef.current;
    const selectedSpotlight = selectedSpotlightEffectRef.current;
    const playing = isPlayingRef.current;

    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        if (currentSourceTime === null) {
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else if (currentSrc && currentSrc.startsWith('color:')) {
            const color = currentSrc.split('color:')[1];
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else if (video && video.readyState >= 2) {
             const shouldCrop = zoom && (playing || !selectedZoom);
             ctx.clearRect(0, 0, canvas.width, canvas.height);
             
             // Optimize: Use low quality during playback for fps, high when paused for clarity
             // Note: 'medium' is often a good balance if available, but standard is 'low'/'high'
             ctx.imageSmoothingEnabled = true;
             ctx.imageSmoothingQuality = playing ? 'low' : 'high';
             
             try {
                 if (shouldCrop) {
                    let rect = { x: zoom.x, y: zoom.y, width: zoom.width, height: zoom.height, isTransitioning: false };
                    
                    // CRITICAL FIX FOR SMOOTH ZOOM:
                    // If playing, calculate effective time directly from video element timestamp
                    // This bypasses React's render loop lag/jitter.
                    let effectiveTime = currentGlobalTime;
                    if (playing && !video.paused && !video.ended && activeClipTiming) {
                         effectiveTime = ((video.currentTime - activeClipTiming.sourceStart) / activeClipTiming.speed) + activeClipTiming.offset;
                    }

                    if (effectiveTime != null) {
                        rect = calculateZoomRect(zoom, effectiveTime);
                    }

                    const sx = (rect.x / 100) * video.videoWidth;
                    const sy = (rect.y / 100) * video.videoHeight;
                    const sw = (rect.width / 100) * video.videoWidth;
                    const sh = (rect.height / 100) * video.videoHeight;
                    
                    // Main Frame
                    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
                 } else {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                 }
             } catch(e) {
                 // Squelch drawing errors
             }

             // Mosaic & Spotlight rendering
             const effectiveMosaic = mosaic;
             if (effectiveMosaic && effectiveMosaic.paths.length > 0) {
               const width = canvas.width;
               const height = canvas.height;
               const pCanvas = pixelCanvasRef.current;
               pCanvas.width = width;
               pCanvas.height = height;
               const pCtx = pCanvas.getContext('2d');
               if (pCtx) {
                 const pixelFactor = 0.02; 
                 const wScaled = Math.max(1, width * pixelFactor);
                 const hScaled = Math.max(1, height * pixelFactor);
                 try {
                     // Reuse crop logic for mosaic base if needed, currently simplifying to full frame or cropped match
                     // Ideally we apply the same crop transform to the source
                     if (shouldCrop) {
                        // Re-calc specific rect for sync
                        let drawX = zoom!.x, drawY = zoom!.y, drawW = zoom!.width, drawH = zoom!.height;
                        let effectiveTime = currentGlobalTime;
                        if (playing && !video.paused && !video.ended && activeClipTiming) {
                             effectiveTime = ((video.currentTime - activeClipTiming.sourceStart) / activeClipTiming.speed) + activeClipTiming.offset;
                        }
                        if (effectiveTime != null) {
                             const zRect = calculateZoomRect(zoom!, effectiveTime);
                             drawX = zRect.x; drawY = zRect.y; drawW = zRect.width; drawH = zRect.height;
                        }

                        const sx = (drawX / 100) * video.videoWidth;
                        const sy = (drawY / 100) * video.videoHeight;
                        const sw = (drawW / 100) * video.videoWidth;
                        const sh = (drawH / 100) * video.videoHeight;
                        pCtx.drawImage(video, sx, sy, sw, sh, 0, 0, wScaled, hScaled);
                     } else {
                        pCtx.drawImage(video, 0, 0, wScaled, hScaled);
                     }
                 } catch(e) {}

                 pCtx.imageSmoothingEnabled = false;
                 pCtx.drawImage(pCanvas, 0, 0, wScaled, hScaled, 0, 0, width, height);
                 const mCanvas = maskCanvasRef.current;
                 mCanvas.width = width;
                 mCanvas.height = height;
                 const mCtx = mCanvas.getContext('2d');
                 if (mCtx) {
                    mCtx.lineCap = 'round';
                    mCtx.lineJoin = 'round';
                    mCtx.fillStyle = 'white';
                    mCtx.strokeStyle = 'white';
                    effectiveMosaic.paths.forEach(path => {
                      if (path.points.length === 0) return;
                      const brushPx = (path.brushSize / 100) * Math.min(width, height);
                      mCtx.lineWidth = brushPx;
                      mCtx.beginPath();
                      path.points.forEach((pt, i) => {
                         const x = (pt.x / 100) * width;
                         const y = (pt.y / 100) * height;
                         if (i === 0) mCtx.moveTo(x, y); else mCtx.lineTo(x, y);
                      });
                      if (path.points.length === 1) {
                         const pt = path.points[0];
                         mCtx.moveTo((pt.x / 100) * width, (pt.y / 100) * height);
                         mCtx.lineTo((pt.x / 100) * width, (pt.y / 100) * height);
                      }
                      mCtx.stroke();
                    });
                    pCtx.globalCompositeOperation = 'destination-in';
                    pCtx.drawImage(mCanvas, 0, 0);
                    pCtx.globalCompositeOperation = 'source-over'; 
                    ctx.drawImage(pCanvas, 0, 0);
                 }
               }
             }

             if (spotlight) {
                const isEditingSpot = selectedSpotlight && selectedSpotlight.id === spotlight.id && !playing;
                if (playing || !isEditingSpot) {
                   const lx = (spotlight.x / 100) * canvas.width;
                   const ly = (spotlight.y / 100) * canvas.height;
                   const lw = (spotlight.width / 100) * canvas.width;
                   const lh = (spotlight.height / 100) * canvas.height;
                   const cx = lx + lw / 2;
                   const cy = ly + lh / 2;
                   const radius = Math.max(lw, lh) / 2; 
                   const g = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * 1.5);
                   g.addColorStop(0, 'rgba(0,0,0,0)');
                   g.addColorStop(0.5, 'rgba(0,0,0,0.1)'); 
                   g.addColorStop(1, 'rgba(0,0,0,0.85)');    
                   ctx.save();
                   ctx.fillStyle = g;
                   ctx.fillRect(0, 0, canvas.width, canvas.height);
                   ctx.restore();
                }
             }

             // Subtitles Rendering
             if (currentSubtitles && currentSubtitles.length > 0) {
                const fontSize = Math.max(20, canvas.height * 0.03); 
                ctx.font = `500 ${fontSize}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                currentSubtitles.forEach(sub => {
                   const x = (sub.x !== undefined ? sub.x : 50) / 100 * canvas.width;
                   const y = (sub.y !== undefined ? sub.y : 80) / 100 * canvas.height;
                   const text = sub.text;
                   
                   const words = text.split(' ');
                   const maxWidth = canvas.width * 0.8;
                   let lines = [];
                   let currentLine = words[0];

                   for (let i = 1; i < words.length; i++) {
                      const width = ctx.measureText(currentLine + " " + words[i]).width;
                      if (width < maxWidth) {
                         currentLine += " " + words[i];
                      } else {
                         lines.push(currentLine);
                         currentLine = words[i];
                      }
                   }
                   lines.push(currentLine);

                   const lineHeight = fontSize * 1.4;
                   const totalHeight = lines.length * lineHeight;
                   const paddingX = fontSize * 0.6;
                   const paddingY = fontSize * 0.3;
                   
                   lines.forEach((line, i) => {
                      const metrics = ctx.measureText(line);
                      const bgWidth = metrics.width + paddingX * 2;
                      const lineY = y - (totalHeight / 2) + (i * lineHeight) + (lineHeight/2);
                      
                      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                      if (ctx.roundRect) {
                         ctx.roundRect(x - bgWidth / 2, lineY - lineHeight / 2 - paddingY / 2, bgWidth, lineHeight, 8);
                      } else {
                         ctx.rect(x - bgWidth / 2, lineY - lineHeight / 2 - paddingY / 2, bgWidth, lineHeight);
                      }
                      ctx.fill();

                      ctx.fillStyle = 'white';
                      ctx.shadowColor = 'rgba(0,0,0,0.8)';
                      ctx.shadowBlur = 4;
                      ctx.shadowOffsetY = 1;
                      ctx.fillText(line, x, lineY);
                      ctx.shadowColor = 'transparent'; 
                   });
                });
             }
        }
      }
    }
    
    // Preview Rendering (Small box in corner)
    const isEditingZoom = selectedZoom && zoom && selectedZoom.id === zoom.id && !playing;
    const isEditingSpotlight = selectedSpotlight && spotlight && selectedSpotlight.id === spotlight.id && !playing;

    if (previewCanvasRef.current && video && video.readyState >= 2 && !currentSrc?.startsWith('color:')) {
      const pCanvas = previewCanvasRef.current;
      const pCtx = pCanvas.getContext('2d');
      if (pCtx) {
        if (isEditingZoom) {
            const sx = (selectedZoom.x / 100) * video.videoWidth;
            const sy = (selectedZoom.y / 100) * video.videoHeight;
            const sw = (selectedZoom.width / 100) * video.videoWidth;
            const sh = (selectedZoom.height / 100) * video.videoHeight;
            pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
            pCtx.imageSmoothingEnabled = true;
            pCtx.imageSmoothingQuality = 'high';
            try {
               pCtx.drawImage(video, sx, sy, sw, sh, 0, 0, pCanvas.width, pCanvas.height);
            } catch(e) {}
        } else if (isEditingSpotlight) {
            // ... (spotlight preview logic)
            const sx = (selectedSpotlight.x / 100) * video.videoWidth;
            const sy = (selectedSpotlight.y / 100) * video.videoHeight;
            const sw = (selectedSpotlight.width / 100) * video.videoWidth;
            const sh = (selectedSpotlight.height / 100) * video.videoHeight;
            pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
            pCtx.imageSmoothingEnabled = true;
            pCtx.imageSmoothingQuality = 'high';
            pCtx.save();
            pCtx.beginPath();
            const radius = pCanvas.width / 2;
            pCtx.arc(pCanvas.width / 2, pCanvas.height / 2, radius, 0, 2 * Math.PI);
            pCtx.clip();
            try {
               pCtx.drawImage(video, sx, sy, sw, sh, 0, 0, pCanvas.width, pCanvas.height);
            } catch(e) {}
            pCtx.restore();
        }
      }
    }
    requestRef.current = requestAnimationFrame(renderFrame);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(renderFrame);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, []); 

  // ... rest of component
  const handleLoadedMetadata = () => {
    if (videoRef.current && canvasRef.current) {
      onDurationChange(videoRef.current.duration);
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      if (videoRef.current.videoHeight > 0) {
        setAspectRatio(videoRef.current.videoWidth / videoRef.current.videoHeight);
      }
    }
  };

  // Keep interaction handlers same
  const handleMosaicMouseDown = (e: React.MouseEvent) => {
    if (!selectedMosaicEffect || isPlaying) return;
    const isEditMode = selectedMosaicEffect.id === activeMosaicEffect?.id;
    if (!isEditMode) return;
    e.preventDefault(); e.stopPropagation(); 
    if (onInteractionStart) onInteractionStart();
    setIsDrawing(true);
    if (contentRef.current) {
       const rect = contentRef.current.getBoundingClientRect();
       const xPct = ((e.clientX - rect.left) / rect.width) * 100;
       const yPct = ((e.clientY - rect.top) / rect.height) * 100;
       currentPathRef.current = { points: [{ x: xPct, y: yPct }], brushSize: currentBrushSize || 10 };
       const updatedPaths = [...selectedMosaicEffect.paths, currentPathRef.current];
       onUpdateMosaicEffect({ ...selectedMosaicEffect, paths: updatedPaths });
    }
  };
  const handleMosaicMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !currentPathRef.current || !selectedMosaicEffect || !contentRef.current) return;
    e.preventDefault(); e.stopPropagation();
    const rect = contentRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    currentPathRef.current.points.push({ x: xPct, y: yPct });
    const paths = [...selectedMosaicEffect.paths];
    paths[paths.length - 1] = { ...currentPathRef.current };
    onUpdateMosaicEffect({ ...selectedMosaicEffect, paths: paths });
  };
  const handleMosaicMouseUp = () => { if (isDrawing) { setIsDrawing(false); currentPathRef.current = null; } };
  
  const handleSubMouseDown = (e: React.MouseEvent, sub: Subtitle) => { 
    e.preventDefault(); e.stopPropagation(); 
    if (onInteractionStart) onInteractionStart();
    onSelectSubtitle(sub.id); 
    setSubDragState({ id: sub.id, x: sub.x ?? 50, y: sub.y ?? 80 }); 
  };
  
  const handleZoomMouseDown = (e: React.MouseEvent, type: any) => { 
    e.preventDefault(); e.stopPropagation(); 
    if (!selectedZoomEffect) return; 
    if (onInteractionStart) onInteractionStart();
    setZoomDragState({ type, startX: e.clientX, startY: e.clientY, initialBox: { x: selectedZoomEffect.x, y: selectedZoomEffect.y, width: selectedZoomEffect.width, height: selectedZoomEffect.height } }); 
  };
  
  const handleSpotlightMouseDown = (e: React.MouseEvent, type: any) => { 
    e.preventDefault(); e.stopPropagation(); 
    if (!selectedSpotlightEffect) return; 
    if (onInteractionStart) onInteractionStart();
    setSpotlightDragState({ type, startX: e.clientX, startY: e.clientY, initialBox: { x: selectedSpotlightEffect.x, y: selectedSpotlightEffect.y, width: selectedSpotlightEffect.width, height: selectedSpotlightEffect.height } }); 
  };
  
  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!contentRef.current) return;
      const rect = contentRef.current.getBoundingClientRect();
      if (subDragState) {
        let relativeX = e.clientX - rect.left; let relativeY = e.clientY - rect.top;
        let percentX = (relativeX / rect.width) * 100; let percentY = (relativeY / rect.height) * 100;
        percentX = Math.max(0, Math.min(100, percentX)); percentY = Math.max(0, Math.min(100, percentY));
        setSubDragState(prev => prev ? { ...prev, x: percentX, y: percentY } : null);
      }
      if (zoomDragState && selectedZoomEffect) {
         const init = zoomDragState.initialBox;
         const handleBoxResize = (e: MouseEvent, rect: DOMRect, dragState: any, init: any, updateCallback: (box: any) => void) => {
             if (dragState.type === 'move') {
               const deltaXPx = e.clientX - dragState.startX; const deltaYPx = e.clientY - dragState.startY;
               const newX = Math.max(0, Math.min(100 - init.width, init.x + (deltaXPx / rect.width) * 100));
               const newY = Math.max(0, Math.min(100 - init.height, init.y + (deltaYPx / rect.height) * 100));
               updateCallback({ x: newX, y: newY, width: init.width, height: init.height });
             } else {
                let anchorX = 0, anchorY = 0, isLeft = false, isTop = false;
                if (dragState.type.includes('tl')) { anchorX = init.x + init.width; anchorY = init.y + init.height; isLeft = true; isTop = true; }
                else if (dragState.type.includes('tr')) { anchorX = init.x; anchorY = init.y + init.height; isLeft = false; isTop = true; }
                else if (dragState.type.includes('bl')) { anchorX = init.x + init.width; anchorY = init.y; isLeft = true; isTop = false; }
                else { anchorX = init.x; anchorY = init.y; isLeft = false; isTop = false; }
                let mousePctX = ((e.clientX - rect.left) / rect.width) * 100;
                let mousePctY = ((e.clientY - rect.top) / rect.height) * 100;
                let rawWidth = Math.abs(mousePctX - anchorX); let rawHeight = Math.abs(mousePctY - anchorY);
                let size = Math.max(rawWidth, rawHeight);
                const limit = Math.min(isLeft ? anchorX : (100 - anchorX), isTop ? anchorY : (100 - anchorY));
                size = Math.min(size, limit); size = Math.max(5, size);
                updateCallback({ x: isLeft ? anchorX - size : anchorX, y: isTop ? anchorY - size : anchorY, width: size, height: size });
             }
         };
         handleBoxResize(e, rect, zoomDragState, init, (newBox) => onUpdateZoomEffect({ ...selectedZoomEffect, ...newBox }));
      }
      if (spotlightDragState && selectedSpotlightEffect) {
         const init = spotlightDragState.initialBox;
          const handleSpotlightResize = (e: MouseEvent, rect: DOMRect, dragState: any, init: any, updateCallback: (box: any) => void) => {
             const initXPx = (init.x / 100) * rect.width; const initYPx = (init.y / 100) * rect.height;
             const initWidthPx = (init.width / 100) * rect.width; const initHeightPx = (init.height / 100) * rect.height;
             if (dragState.type === 'move') {
               const deltaXPx = e.clientX - dragState.startX; const deltaYPx = e.clientY - dragState.startY;
               const newXPx = Math.max(0, Math.min(rect.width - initWidthPx, initXPx + deltaXPx));
               const newYPx = Math.max(0, Math.min(rect.height - initHeightPx, initYPx + deltaYPx));
               updateCallback({ x: (newXPx / rect.width) * 100, y: (newYPx / rect.height) * 100, width: init.width, height: init.height });
             } else {
                let anchorXPx = 0, anchorYPx = 0, isLeft = false, isTop = false;
                if (dragState.type.includes('tl')) { anchorXPx = initXPx + initWidthPx; anchorYPx = initYPx + initHeightPx; isLeft = true; isTop = true; }
                else if (dragState.type.includes('tr')) { anchorXPx = initXPx; anchorYPx = initYPx + initHeightPx; isLeft = false; isTop = true; }
                else if (dragState.type.includes('bl')) { anchorXPx = initXPx + initWidthPx; anchorYPx = initYPx; isLeft = true; isTop = false; }
                else { anchorXPx = initXPx; anchorYPx = initYPx; isLeft = false; isTop = false; }
                const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
                let rawWidthPx = Math.abs(mouseX - anchorXPx); let rawHeightPx = Math.abs(mouseY - anchorYPx);
                let sizePx = Math.max(rawWidthPx, rawHeightPx);
                const limitPx = Math.min(isLeft ? anchorXPx : (rect.width - anchorXPx), isTop ? anchorYPx : (rect.height - anchorYPx));
                sizePx = Math.min(sizePx, limitPx); sizePx = Math.max(20, sizePx);
                updateCallback({ x: ((isLeft ? anchorXPx - sizePx : anchorXPx) / rect.width) * 100, y: ((isTop ? anchorYPx - sizePx : anchorYPx) / rect.height) * 100, width: (sizePx / rect.width) * 100, height: (sizePx / rect.height) * 100 });
             }
         };
         handleSpotlightResize(e, rect, spotlightDragState, init, (newBox) => onUpdateSpotlightEffect({ ...selectedSpotlightEffect, ...newBox }));
      }
    };
    const handleWindowMouseUp = () => {
      if (subDragState) {
        const draggedSub = activeSubtitles.find(s => s.id === subDragState.id);
        if (draggedSub) onUpdateSubtitle({ ...draggedSub, x: subDragState.x, y: subDragState.y });
        setSubDragState(null);
      }
      setZoomDragState(null); setSpotlightDragState(null); if (isDrawing) { setIsDrawing(false); currentPathRef.current = null; }
    };
    if (subDragState || zoomDragState || spotlightDragState || isDrawing) { window.addEventListener('mousemove', handleWindowMouseMove); window.addEventListener('mouseup', handleWindowMouseUp); }
    return () => { window.removeEventListener('mousemove', handleWindowMouseMove); window.removeEventListener('mouseup', handleWindowMouseUp); };
  }, [subDragState, zoomDragState, spotlightDragState, isDrawing, activeSubtitles, selectedZoomEffect, selectedSpotlightEffect, onUpdateSubtitle, onUpdateZoomEffect, onUpdateSpotlightEffect]);

  // Initial render state
  if (!src && !audioSrc) {
    return (
      <div className="relative w-full h-full bg-zinc-900/50 text-zinc-500 border-2 border-dashed border-zinc-800 rounded-lg cursor-pointer hover:bg-zinc-900 hover:border-zinc-700 transition-colors group" onClick={onImportVideo}>
        <div className="absolute left-[calc(50vw+0.625rem)] top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center text-center">
          <div className="p-4 rounded-full bg-zinc-800 group-hover:bg-zinc-700 transition-colors mb-4 inline-flex"><Upload size={32} className="text-zinc-600 group-hover:text-zinc-400" /></div>
          <p className="font-medium text-lg text-zinc-400 group-hover:text-zinc-300">Click to Upload Video</p><p className="text-sm mt-1">or drag and drop here</p>
        </div>
      </div>
    );
  }

  // Derived state for editing visuals
  const isEditingZoom = selectedZoomEffect && activeZoomEffect && selectedZoomEffect.id === activeZoomEffect.id && !isPlaying;
  const isEditingSpotlight = selectedSpotlightEffect && activeSpotlightEffect && selectedSpotlightEffect.id === activeSpotlightEffect.id && !isPlaying;
  const isEditingMosaic = selectedMosaicEffect && activeMosaicEffect && selectedMosaicEffect.id === activeMosaicEffect.id && !isPlaying;

  const currentScale = selectedZoomEffect ? (100 / selectedZoomEffect.width).toFixed(1) : '';
  const getVisualSpotlightStyle = (spot: SpotlightEffect) => { const wRel = spot.width; const hRel = spot.height / aspectRatio; const maxRel = Math.max(wRel, hRel); const visWidth = maxRel; const visHeight = maxRel * aspectRatio; return { left: `${(spot.x + spot.width / 2) - visWidth / 2}%`, top: `${(spot.y + spot.height / 2) - visHeight / 2}%`, width: `${visWidth}%`, height: `${visHeight}%` }; };
  const spotlightStyle = (isEditingSpotlight && selectedSpotlightEffect) ? getVisualSpotlightStyle(selectedSpotlightEffect) : {};

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden rounded-lg shadow-xl" onDoubleClick={() => onTogglePlay && onTogglePlay()}>
      <video ref={videoRef} src={src?.startsWith('color:') ? undefined : (src || undefined)} className="hidden" onLoadedMetadata={handleLoadedMetadata} onEnded={onEnded} playsInline muted={isMuted} crossOrigin={corsCompatible ? "anonymous" : undefined} />
      <audio ref={audioRef} src={audioSrc || undefined} className="hidden" />

      <div ref={contentRef} className="relative shadow-2xl" style={{ aspectRatio: aspectRatio, maxWidth: '100%', maxHeight: '100%' }} onMouseDown={isEditingMosaic ? handleMosaicMouseDown : undefined} onMouseMove={isEditingMosaic ? handleMosaicMouseMove : undefined} onMouseUp={isEditingMosaic ? handleMosaicMouseUp : undefined}>
        <canvas ref={canvasRef} className={`w-full h-full object-contain display-block ${isEditingMosaic ? 'cursor-crosshair' : 'pointer-events-none'}`} />
        
        {isEditingZoom && selectedZoomEffect && (
          <div className="absolute inset-0">
            <div className="absolute z-30" style={{ left: `${selectedZoomEffect.x}%`, top: `${selectedZoomEffect.y}%`, width: `${selectedZoomEffect.width}%`, height: `${selectedZoomEffect.height}%`, touchAction: 'none', boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7)' }} onMouseDown={(e) => handleZoomMouseDown(e, 'move')}>
              <div className="w-full h-full border-2 border-emerald-400 bg-emerald-500/10 cursor-move relative shadow-sm">
                <div className="absolute -left-1.5 -top-1.5 w-3 h-3 bg-white border border-emerald-500 cursor-nw-resize z-40" onMouseDown={(e) => handleZoomMouseDown(e, 'resize-tl')} />
                <div className="absolute -right-1.5 -top-1.5 w-3 h-3 bg-white border border-emerald-500 cursor-ne-resize z-40" onMouseDown={(e) => handleZoomMouseDown(e, 'resize-tr')} />
                <div className="absolute -left-1.5 -bottom-1.5 w-3 h-3 bg-white border border-emerald-500 cursor-sw-resize z-40" onMouseDown={(e) => handleZoomMouseDown(e, 'resize-bl')} />
                <div className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-white border border-emerald-500 cursor-se-resize z-40" onMouseDown={(e) => handleZoomMouseDown(e, 'resize-br')} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] text-white bg-emerald-600 px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap">{currentScale}x</div>
              </div>
            </div>
          </div>
        )}

        {isEditingSpotlight && selectedSpotlightEffect && (
          <div className="absolute inset-0">
            <div className="absolute z-30" style={{ ...spotlightStyle, touchAction: 'none' }} onMouseDown={(e) => handleSpotlightMouseDown(e, 'move')}>
              <div className="w-full h-full border-2 border-amber-400 bg-amber-500/10 cursor-move relative shadow-sm rounded-full"></div>
            </div>
          </div>
        )}

        {activeSubtitles.map((sub) => {
          const isDragging = subDragState?.id === sub.id;
          const displayX = isDragging ? subDragState.x : (sub.x ?? 50);
          const displayY = isDragging ? subDragState.y : (sub.y ?? 80);
          return (
            <div key={sub.id} className={`absolute p-2 cursor-move select-none transition-transform duration-75 origin-center ${isDragging ? 'z-50 scale-105' : 'z-40'}`} style={{ left: `${displayX}%`, top: `${displayY}%`, transform: 'translate(-50%, -50%)' }} onMouseDown={(e) => handleSubMouseDown(e, sub)}>
              <span className={`inline-block px-3 py-1 bg-black/60 text-white rounded text-lg md:text-xl lg:text-2xl font-medium shadow-sm break-words text-center max-w-[80vw] ${isDragging ? 'ring-2 ring-yellow-400' : 'hover:ring-1 hover:ring-white/50'}`} style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.8)' }}>{sub.text}</span>
            </div>
          );
        })}
      </div>

      {(isEditingZoom || isEditingSpotlight) && (
        <div className="absolute bottom-4 right-4 z-50 flex flex-col items-end animate-in fade-in zoom-in duration-300">
           <div className="bg-zinc-900 text-xs text-zinc-300 px-2 py-1 rounded-t-md border-t border-x border-zinc-700 font-medium">{isEditingZoom ? 'Zoom Result Preview' : 'Spotlight Preview'}</div>
           <canvas ref={previewCanvasRef} className="w-48 bg-black border-2 border-zinc-700 rounded-b-md rounded-tl-md shadow-2xl" style={{ aspectRatio: isEditingSpotlight ? '1/1' : aspectRatio }} width={320} height={isEditingSpotlight ? 320 : (320 / aspectRatio)} />
        </div>
      )}
    </div>
  );
});

export default Player;