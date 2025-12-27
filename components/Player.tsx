
import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Subtitle, ZoomEffect, SpotlightEffect, MosaicEffect, PlayerRef } from '../types';
import { Upload, RotateCcw, Maximize2 } from 'lucide-react';
import { useMediaSync } from '../hooks/useMediaSync';
import { useCanvasInteraction } from '../hooks/useCanvasInteraction';
import { useCanvasRecorder } from '../hooks/useCanvasRecorder';
import { renderVideoFrame, renderMosaic, renderSpotlight, renderSubtitles, renderPreview } from '../utils/canvasRenderer';

interface PlayerProps {
  src: string | null; 
  introSrc: string | null | undefined;
  mainSrc: string | null | undefined;
  outroSrc: string | null | undefined;
  
  sourceTime: number | null; 
  activeMediaType: 'intro' | 'main' | 'outro' | 'audio' | null;
  
  currentTime: number; 
  currentTimeRef: React.MutableRefObject<number>; 
  isMuted?: boolean;
  corsCompatible?: boolean; 
  
  clipTiming?: { offset: number; sourceStart: number; speed: number } | null;

  audioSrc: string | null;
  audioSourceTime: number;
  audioPlaybackRate: number;

  allSubtitles: Subtitle[]; // Change from active to ALL for high-freq filtering
  selectedSubtitleId: string | null; 
  activeZoomEffect?: ZoomEffect; 
  activeSpotlightEffect?: SpotlightEffect; 
  activeMosaicEffect?: MosaicEffect;
  selectedZoomEffect: ZoomEffect | null; 
  selectedSpotlightEffect: SpotlightEffect | null;
  selectedMosaicEffect: MosaicEffect | null;
  isPlaying: boolean;
  playbackRate: number;
  currentBrushSize?: number; 
  onDurationChange: (duration: number) => void;
  onEnded: () => void;
  onUpdateSubtitle: (sub: Subtitle) => void;
  onUpdateZoomEffect: (zoom: ZoomEffect) => void;
  onUpdateSpotlightEffect: (spotlight: SpotlightEffect) => void;
  onUpdateMosaicEffect: (mosaic: MosaicEffect) => void;
  onSelectSubtitle: (id: string | null) => void; 
  onSelectZoomEffect: (id: string) => void;
  onSelectSpotlightEffect: (id: string) => void;
  onSelectMosaicEffect: (id: string) => void;
  onTogglePlay?: () => void;
  onImportVideo?: () => void;
  onInteractionStart?: () => void;
  isAudioTrackMuted?: boolean;
  coverImage?: string | null; 
  onAutoCover?: (dataUrl: string) => void; 
  isExporting?: boolean; 
}

const Player = forwardRef<PlayerRef, PlayerProps>(({
  src,
  introSrc,
  mainSrc,
  outroSrc,
  sourceTime,
  activeMediaType,
  currentTime,
  currentTimeRef,
  isMuted = false,
  corsCompatible = true,
  clipTiming = null,
  audioSrc,
  audioSourceTime,
  audioPlaybackRate,
  allSubtitles,
  selectedSubtitleId,
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
  isAudioTrackMuted = false,
  coverImage,
  onAutoCover,
  isExporting = false
}, ref) => {
  const introVideoRef = useRef<HTMLVideoElement>(null);
  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const outroVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixelCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const maskCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null); 
  const requestRef = useRef<number | null>(null);
  
  const [aspectRatio, setAspectRatio] = useState<number>(16 / 9);
  
  const srcRef = useRef(src);
  const activeMediaTypeRef = useRef(activeMediaType);
  const sourceTimeRef = useRef(sourceTime);
  const clipTimingRef = useRef(clipTiming);
  const allSubtitlesRef = useRef(allSubtitles);
  const activeZoomEffectRef = useRef(activeZoomEffect);
  const activeSpotlightEffectRef = useRef(activeSpotlightEffect);
  const activeMosaicEffectRef = useRef(activeMosaicEffect);
  const selectedZoomEffectRef = useRef(selectedZoomEffect);
  const selectedSpotlightEffectRef = useRef(selectedSpotlightEffect);
  const selectedMosaicEffectRef = useRef(selectedMosaicEffect);
  const isPlayingRef = useRef(isPlaying);
  const coverImageRef = useRef(coverImage);
  const isExportingRef = useRef(isExporting); 
  const autoCoverAttemptedRef = useRef(false);

  useMediaSync({
      introRef: introVideoRef,
      mainRef: mainVideoRef,
      outroRef: outroVideoRef,
      audioRef,
      activeMediaType,
      sourceTime,
      audioSourceTime,
      isPlaying,
      playbackRate,
      audioPlaybackRate,
      isMuted,
      isAudioTrackMuted,
      src,
      isExporting 
  });

  const { 
      subDragState, 
      handleSubMouseDown, 
      handleZoomMouseDown, 
      handleSpotlightMouseDown, 
      handleMosaicMouseDown, 
      handleMosaicMouseMove, 
      handleMosaicMouseUp, 
      draggedItemIdRef
  } = useCanvasInteraction({
      activeSubtitles: allSubtitles.filter(s => currentTime >= s.start && currentTime < s.end),
      selectedZoomEffect,
      selectedSpotlightEffect,
      selectedMosaicEffect,
      activeMosaicEffect,
      isPlaying,
      contentRef,
      currentBrushSize,
      onUpdateSubtitle,
      onUpdateZoomEffect,
      onUpdateSpotlightEffect,
      onUpdateMosaicEffect,
      onSelectSubtitle,
      onInteractionStart
  });

  const { startRecording, stopRecording, captureFrame } = useCanvasRecorder({
      canvasRef,
      introRef: introVideoRef,
      mainRef: mainVideoRef,
      outroRef: outroVideoRef,
      audioRef,
      coverImageRef
  });

  const seekTo = (time: number): Promise<void> => {
      return new Promise((resolve) => {
          let targetVideo: HTMLVideoElement | null = null;
          if (introSrc) targetVideo = introVideoRef.current;
          else if (mainSrc) targetVideo = mainVideoRef.current;
          else if (outroSrc) targetVideo = outroVideoRef.current;

          if (!targetVideo || !targetVideo.src || targetVideo.src.startsWith('color:')) { resolve(); return; }
          const onSeeked = () => { targetVideo?.removeEventListener('seeked', onSeeked); resolve(); };
          targetVideo.addEventListener('seeked', onSeeked);
          if (Math.abs(targetVideo.currentTime - 0) < 0.1 && targetVideo.readyState >= 2) { targetVideo.removeEventListener('seeked', onSeeked); resolve(); return; }
          setTimeout(() => { targetVideo?.removeEventListener('seeked', onSeeked); resolve(); }, 2000);
      });
  };

  useImperativeHandle(ref, () => ({ startRecording, stopRecording, captureFrame, seekTo }));

  useEffect(() => { srcRef.current = src; }, [src]);
  useEffect(() => { activeMediaTypeRef.current = activeMediaType; }, [activeMediaType]);
  useEffect(() => { sourceTimeRef.current = sourceTime; }, [sourceTime]);
  useEffect(() => { clipTimingRef.current = clipTiming; }, [clipTiming]);
  useEffect(() => { allSubtitlesRef.current = allSubtitles; }, [allSubtitles]);
  useEffect(() => { activeZoomEffectRef.current = activeZoomEffect; }, [activeZoomEffect]);
  useEffect(() => { activeSpotlightEffectRef.current = activeSpotlightEffect; }, [activeSpotlightEffect]);
  useEffect(() => { activeMosaicEffectRef.current = activeMosaicEffect; }, [activeMosaicEffect]);
  useEffect(() => { selectedZoomEffectRef.current = selectedZoomEffect; }, [selectedZoomEffect]);
  useEffect(() => { selectedSpotlightEffectRef.current = selectedSpotlightEffect; }, [selectedSpotlightEffect]);
  useEffect(() => { selectedMosaicEffectRef.current = selectedMosaicEffect; }, [selectedMosaicEffect]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { coverImageRef.current = coverImage; }, [coverImage]);
  useEffect(() => { isExportingRef.current = isExporting; }, [isExporting]);

  useEffect(() => { autoCoverAttemptedRef.current = false; }, [mainSrc]);

  const renderFrame = () => {
    const currentMediaType = activeMediaTypeRef.current;
    let video: HTMLVideoElement | null = null;
    if (currentMediaType === 'intro') video = introVideoRef.current;
    else if (currentMediaType === 'outro') video = outroVideoRef.current;
    else if (currentMediaType === 'main') video = mainVideoRef.current;

    const currentSrc = srcRef.current; 
    const currentSourceTime = sourceTimeRef.current;
    const currentGlobalTime = currentTimeRef.current;
    const activeClipTiming = clipTimingRef.current;
    
    // DECISION: Render all subtitles via high-frequency filtering from Ref
    const subtitlesToRender = allSubtitlesRef.current.filter(s => currentGlobalTime >= s.start && currentGlobalTime < s.end);
    
    const zoom = activeZoomEffectRef.current;
    const spotlight = activeSpotlightEffectRef.current;
    const mosaic = activeMosaicEffectRef.current;
    const selectedZoom = selectedZoomEffectRef.current;
    const playing = isPlayingRef.current;

    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Auto-Cover Capture Logic
        if (!coverImageRef.current && !autoCoverAttemptedRef.current && onAutoCover && activeMediaTypeRef.current === 'main') {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            if (dataUrl && dataUrl !== 'data:,') {
                onAutoCover(dataUrl);
                autoCoverAttemptedRef.current = true;
            }
        }

        if (currentSourceTime === null) {
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else if (currentSrc && currentSrc.startsWith('color:')) {
            const color = currentSrc.split('color:')[1];
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Render Effects on Color Backgrounds
            if (mosaic) renderMosaic(ctx, null, mosaic, pixelCanvasRef.current, maskCanvasRef.current, canvas.width, canvas.height, null, color);
            if (spotlight) renderSpotlight(ctx, spotlight, canvas.width, canvas.height, selectedSpotlightEffectRef.current, playing, currentGlobalTime);

            renderSubtitles(ctx, subtitlesToRender, canvas.width, canvas.height);
        } else if (video && video.readyState >= 2) {
             const cropInfo = renderVideoFrame(ctx, video, canvas.width, canvas.height, zoom, playing, selectedZoom, currentGlobalTime, activeClipTiming);
             if (mosaic) renderMosaic(ctx, video, mosaic, pixelCanvasRef.current, maskCanvasRef.current, canvas.width, canvas.height, cropInfo);
             if (spotlight) renderSpotlight(ctx, spotlight, canvas.width, canvas.height, selectedSpotlightEffectRef.current, playing, currentGlobalTime);
             // ALWAYS render subtitles on canvas for 60FPS sync
             renderSubtitles(ctx, subtitlesToRender, canvas.width, canvas.height);
        }
      }
    }
    if (previewCanvasRef.current && video && video.readyState >= 2 && !currentSrc?.startsWith('color:')) {
        renderPreview(previewCanvasRef.current, video, selectedZoom, zoom, selectedSpotlightEffectRef.current, spotlight, playing, currentGlobalTime);
    }
    requestRef.current = requestAnimationFrame(renderFrame);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(renderFrame);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, []); 

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const video = e.currentTarget;
    const isMain = video === mainVideoRef.current;
    
    // Priority: Main Video defines canvas size.
    // If no main video exists, allow Intro or Outro to define it.
    if (video && canvasRef.current) {
        if (isMain || (!mainSrc && video === introVideoRef.current) || (!mainSrc && !introSrc && video === outroVideoRef.current)) {
            onDurationChange(video.duration); // Keep existing callback
            canvasRef.current.width = video.videoWidth;
            canvasRef.current.height = video.videoHeight;
            if (video.videoHeight > 0) setAspectRatio(video.videoWidth / video.videoHeight);
        }
    }
  };

  const isEditingZoom = selectedZoomEffect && activeZoomEffect && selectedZoomEffect.id === activeZoomEffect.id && !isPlaying;
  const isEditingSpotlight = selectedSpotlightEffect && activeSpotlightEffect && selectedSpotlightEffect.id === activeSpotlightEffect.id && !isPlaying;
  const currentScale = selectedZoomEffect ? (100 / selectedZoomEffect.width).toFixed(1) : '';
  const spotlightStyle = (isEditingSpotlight && selectedSpotlightEffect) ? { left: `${selectedSpotlightEffect.x}%`, top: `${selectedSpotlightEffect.y}%`, width: `${selectedSpotlightEffect.width}%`, height: `${selectedSpotlightEffect.height}%` } : {};

  if (!introSrc && !mainSrc && !outroSrc && !audioSrc) {
    return (
      <div className="relative w-full h-full bg-zinc-900/50 text-zinc-500 border-2 border-dashed border-zinc-800 rounded-lg cursor-pointer hover:bg-zinc-900 hover:border-zinc-700 transition-colors group" onClick={onImportVideo}>
        <div className="absolute left-[calc(50vw+0.625rem)] top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center text-center">
          <div className="p-4 rounded-full bg-zinc-800 group-hover:bg-zinc-700 transition-colors mb-4 inline-flex"><Upload size={32} className="text-zinc-600 group-hover:text-zinc-400" /></div>
          <p className="font-medium text-lg text-zinc-400 group-hover:text-zinc-300">Click to Upload Video</p>
        </div>
      </div>
    );
  }

  const activeSubs = allSubtitles.filter(s => currentTime >= s.start && currentTime < s.end);

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center bg-black rounded-lg shadow-xl overflow-visible" onDoubleClick={() => onTogglePlay && onTogglePlay()}>
      {introSrc && !introSrc.startsWith('color:') && <video ref={introVideoRef} src={introSrc} className="hidden" onLoadedMetadata={handleLoadedMetadata} playsInline muted={isMuted} crossOrigin="anonymous" />}
      {mainSrc && !mainSrc.startsWith('color:') && <video ref={mainVideoRef} src={mainSrc} className="hidden" onLoadedMetadata={handleLoadedMetadata} playsInline muted={isMuted} crossOrigin="anonymous" />}
      {outroSrc && !outroSrc.startsWith('color:') && <video ref={outroVideoRef} src={outroSrc} className="hidden" onLoadedMetadata={handleLoadedMetadata} playsInline muted={isMuted} crossOrigin="anonymous" />}
      <audio ref={audioRef} src={audioSrc || undefined} className="hidden" crossOrigin="anonymous" />

      <div ref={contentRef} className="relative shadow-2xl overflow-visible" style={{ aspectRatio, maxWidth: '100%', maxHeight: '100%' }} onMouseDown={selectedMosaicEffect && activeMosaicEffect?.id === selectedMosaicEffect.id && !isPlaying ? handleMosaicMouseDown : (e) => e.target === canvasRef.current && onSelectSubtitle(null)}>
        <canvas ref={canvasRef} className={`w-full h-full object-contain display-block rounded-lg ${selectedMosaicEffect && !isPlaying ? 'cursor-crosshair' : 'pointer-events-none'}`} />
        
        {isEditingZoom && selectedZoomEffect && (
          <div className="absolute z-30" style={{ ...spotlightStyle /* reuse prop logic but no inset-0 */, left: `${selectedZoomEffect.x}%`, top: `${selectedZoomEffect.y}%`, width: `${selectedZoomEffect.width}%`, height: `${selectedZoomEffect.height}%`, touchAction: 'none', boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7)' }} onMouseDown={(e) => handleZoomMouseDown(e, 'move')}>
            <div className="w-full h-full border-2 border-emerald-400 bg-emerald-500/10 cursor-move relative shadow-sm">
                <div className="absolute -left-1.5 -top-1.5 w-3 h-3 bg-white border border-emerald-500 cursor-nw-resize z-40" onMouseDown={(e) => handleZoomMouseDown(e, 'resize-tl')} />
                <div className="absolute -right-1.5 -top-1.5 w-3 h-3 bg-white border border-emerald-500 cursor-ne-resize z-40" onMouseDown={(e) => handleZoomMouseDown(e, 'resize-tr')} />
                <div className="absolute -left-1.5 -bottom-1.5 w-3 h-3 bg-white border border-emerald-500 cursor-sw-resize z-40" onMouseDown={(e) => handleZoomMouseDown(e, 'resize-bl')} />
                <div className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-white border border-emerald-500 cursor-se-resize z-40" onMouseDown={(e) => handleZoomMouseDown(e, 'resize-br')} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] text-white bg-emerald-600 px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap">{currentScale}x</div>
            </div>
          </div>
        )}

        {isEditingSpotlight && selectedSpotlightEffect && (
          <div className="absolute z-30" style={{ ...spotlightStyle, touchAction: 'none' }} onMouseDown={(e) => handleSpotlightMouseDown(e, 'move')}>
            <div className="w-full h-full border-2 border-amber-400 bg-amber-500/10 cursor-move relative shadow-sm rounded-full group">
                {/* Resize Handles for Spotlight */}
                <div className="absolute -left-1.5 -top-1.5 w-3 h-3 bg-white border border-amber-500 rounded-full cursor-nw-resize z-40" onMouseDown={(e) => handleSpotlightMouseDown(e, 'resize-tl')} />
                <div className="absolute -right-1.5 -top-1.5 w-3 h-3 bg-white border border-amber-500 rounded-full cursor-ne-resize z-40" onMouseDown={(e) => handleSpotlightMouseDown(e, 'resize-tr')} />
                <div className="absolute -left-1.5 -bottom-1.5 w-3 h-3 bg-white border border-amber-500 rounded-full cursor-sw-resize z-40" onMouseDown={(e) => handleSpotlightMouseDown(e, 'resize-bl')} />
                <div className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-white border border-amber-500 rounded-full cursor-se-resize z-40" onMouseDown={(e) => handleSpotlightMouseDown(e, 'resize-br')} />
            </div>
          </div>
        )}

        {/* DOM INTERACTION LAYER: Only for selected subtitle or dragging */}
        {!isExporting && activeSubs.map((sub) => {
          const isSelected = selectedSubtitleId === sub.id;
          const isDragging = subDragState?.id === sub.id;
          if (!isSelected && !isDragging) return null;
          
          const displayX = isDragging ? subDragState.x : (sub.x ?? 50);
          const displayY = isDragging ? subDragState.y : (sub.y ?? 80);
          const displayRotation = isDragging ? subDragState.rotation : (sub.rotation ?? 0);
          const displayScale = isDragging ? subDragState.scale : (sub.scale ?? 1);

          return (
            <div key={sub.id} className="absolute cursor-move select-none z-50 origin-center" style={{ left: `${displayX}%`, top: `${displayY}%`, transform: `translate(-50%, -50%) rotate(${displayRotation}deg) scale(${displayScale})` }}>
                <div className="relative p-2" onMouseDown={(e) => handleSubMouseDown(e, sub, 'move')}>
                    <div className="absolute inset-0 border-2 border-yellow-400 pointer-events-none rounded-sm">
                        <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-yellow-500 rounded-full cursor-nwse-resize pointer-events-auto" onMouseDown={(e) => handleSubMouseDown(e, sub, 'scale')} />
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto" onMouseDown={(e) => handleSubMouseDown(e, sub, 'rotate')}>
                            <div className="w-0.5 h-4 bg-yellow-400" /><div className="w-6 h-6 rounded-full bg-zinc-800 border-2 border-yellow-400 flex items-center justify-center cursor-alias"><RotateCcw size={12} className="text-yellow-400" /></div>
                        </div>
                    </div>
                    <span className="inline-block px-3 py-1 bg-black/60 text-white rounded text-lg md:text-xl lg:text-2xl font-medium opacity-0">{sub.text}</span>
                </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default Player;
