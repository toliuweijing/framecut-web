
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Clip, Subtitle, ZoomEffect, SpotlightEffect, MosaicEffect, Selection, MediaAsset } from '../types';
import { Play, Pause } from 'lucide-react';
import { useTimelineDrag } from '../hooks/useTimelineDrag';
import TracksLayer from './TracksLayer';
import TimelineHeaders from './TimelineHeaders';

interface TimelineProps {
  duration: number; // Total Duration
  // currentTime prop removed to prevent re-renders. Use currentTimeRef.
  currentTimeRef: React.MutableRefObject<number>; // REF for smooth animation
  zoomLevel: number; // Pixels per second
  intro: MediaAsset | null;
  outro: MediaAsset | null;
  mainVideo: MediaAsset | null;
  audio: MediaAsset | null;
  clips: Clip[];
  audioClips: Clip[];
  subtitles: Subtitle[];
  zoomEffects: ZoomEffect[];
  spotlightEffects: SpotlightEffect[];
  mosaicEffects: MosaicEffect[];
  selection: Selection;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onSelect: (selection: Selection) => void;
  onUpdateClip: (clip: Clip) => void;
  onUpdateSubtitle: (subtitle: Subtitle) => void;
  onUpdateZoomEffect: (zoom: ZoomEffect) => void;
  onUpdateSpotlightEffect: (spotlight: SpotlightEffect) => void;
  onUpdateMosaicEffect: (mosaic: MosaicEffect) => void;
  onAddSubtitle: () => void;
  onAddZoom: () => void;
  onAddSpotlight: () => void;
  onAddMosaic: () => void;
  onInteractionStart?: () => void;
  isAudioTrackMuted?: boolean;
  onToggleAudioTrackMute?: () => void;
}

// Helper to organize subtitles into non-overlapping tracks
const organizeSubtitles = (subtitles: Subtitle[]): Subtitle[][] => {
  if (subtitles.length === 0) return [[]];
  
  const sorted = [...subtitles].sort((a, b) => a.start - b.start);
  const tracks: Subtitle[][] = [];

  sorted.forEach(sub => {
    let placed = false;
    for (const track of tracks) {
      const last = track[track.length - 1];
      // Check if this subtitle starts after the last one ends
      if (last.end <= sub.start) {
        track.push(sub);
        placed = true;
        break;
      }
    }
    if (!placed) {
      tracks.push([sub]);
    }
  });

  return tracks.length > 0 ? tracks : [[]];
};

const Timeline: React.FC<TimelineProps> = React.memo(({ 
  duration, 
  currentTimeRef,
  zoomLevel, 
  intro,
  outro,
  mainVideo,
  audio,
  clips,
  audioClips,
  subtitles,
  zoomEffects,
  spotlightEffects,
  mosaicEffects,
  selection,
  isPlaying,
  onSeek,
  onTogglePlay,
  onSelect,
  onUpdateClip,
  onUpdateSubtitle,
  onUpdateZoomEffect,
  onUpdateSpotlightEffect,
  onUpdateMosaicEffect,
  onAddSubtitle,
  onAddZoom,
  onAddSpotlight,
  onAddMosaic,
  onInteractionStart,
  isAudioTrackMuted,
  onToggleAudioTrackMute
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null); // Direct DOM Ref for Playhead
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  
  const { 
      dragState, 
      setDragState, 
      isScrubbing, 
      setIsScrubbing,
      handlePlayheadMouseDown 
  } = useTimelineDrag({
      zoomLevel,
      clips,
      audioClips,
      onUpdateClip,
      onUpdateSubtitle,
      onUpdateZoomEffect,
      onUpdateSpotlightEffect,
      onUpdateMosaicEffect,
      onSeek,
      onTogglePlay
  });

  const isEmpty = duration === 0;
  const totalWidth = Math.max(duration * zoomLevel, 100) + 200; 
  
  const ticks = useMemo(() => {
    if (isEmpty) return [];
    const tickInterval = 5; 
    const count = Math.ceil((duration + 10) / tickInterval) + 1;
    return Array.from({ length: count }, (_, i) => i * tickInterval);
  }, [duration, isEmpty]);

  const subtitleTracks = useMemo(() => organizeSubtitles(subtitles), [subtitles]);

  // PERFORMANCE: Independent Animation Loop for Playhead
  useEffect(() => {
    let animationFrameId: number;

    const animatePlayhead = () => {
        // Sync Playhead Position directly from Ref
        if (playheadRef.current) {
            playheadRef.current.style.left = `${currentTimeRef.current * zoomLevel}px`;
        }
        
        // Basic Auto-Scroll during playback
        if (isPlaying && containerRef.current && !isScrubbing && !dragState) {
            const container = containerRef.current;
            const currentPos = currentTimeRef.current * zoomLevel;
            const scrollLeft = container.scrollLeft;
            const width = container.clientWidth;
            
            if (currentPos > scrollLeft + width * 0.9) {
                container.scrollLeft = currentPos - width * 0.1;
            }
        }

        animationFrameId = requestAnimationFrame(animatePlayhead);
    };

    animationFrameId = requestAnimationFrame(animatePlayhead);
    return () => cancelAnimationFrame(animationFrameId);
  }, [zoomLevel, isPlaying, isScrubbing, dragState, currentTimeRef]);


  const handleMouseDown = (e: React.MouseEvent) => {
    if (isEmpty) return;
    setIsScrubbing(true);
    handleSeek(e);
  };

  const handleSeek = (e: MouseEvent | React.MouseEvent) => {
    if (!containerRef.current || isEmpty) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + containerRef.current.scrollLeft;
    const newTime = Math.max(0, x / zoomLevel);
    onSeek(newTime);
  };

  const handleContainerMouseMove = (e: React.MouseEvent) => {
    if (isEmpty) return;
    if (!containerRef.current || isScrubbing || dragState) {
      setHoverTime(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + containerRef.current.scrollLeft;
    const time = Math.max(0, x / zoomLevel);
    setHoverTime(time);
  };

  const handleContainerMouseLeave = () => {
    setHoverTime(null);
  };

  const playheadColorClass = isPlaying ? 'bg-white' : 'bg-yellow-500';
  const playheadRingClass = isPlaying ? 'border-zinc-300' : 'border-yellow-600';

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-t border-zinc-800 select-none">
      <div className="flex flex-1 min-h-0">
        <TimelineHeaders 
            isEmpty={isEmpty}
            isAudioTrackMuted={isAudioTrackMuted}
            onToggleAudioTrackMute={onToggleAudioTrackMute}
            subtitleTracks={subtitleTracks}
            onAddSubtitle={onAddSubtitle}
            onAddZoom={onAddZoom}
            onAddSpotlight={onAddSpotlight}
            onAddMosaic={onAddMosaic}
        />

        {/* Timeline Area */}
        <div 
          ref={containerRef}
          className="flex-1 overflow-x-auto overflow-y-auto relative custom-scrollbar bg-zinc-900"
          onMouseDown={!isEmpty ? handleMouseDown : undefined}
          onMouseMove={!isEmpty ? handleContainerMouseMove : undefined}
          onMouseLeave={handleContainerMouseLeave}
        >
          {/* Memoized Track Layer */}
          <TracksLayer 
             isEmpty={isEmpty}
             totalWidth={totalWidth}
             ticks={ticks}
             zoomLevel={zoomLevel}
             clips={clips}
             audioClips={audioClips}
             subtitleTracks={subtitleTracks}
             zoomEffects={zoomEffects}
             spotlightEffects={spotlightEffects}
             mosaicEffects={mosaicEffects}
             selection={selection}
             intro={intro}
             outro={outro}
             mainVideo={mainVideo}
             audio={audio}
             onSelect={onSelect}
             onSeek={onSeek}
             onInteractionStart={onInteractionStart}
             setDragState={setDragState}
             handleSeek={handleSeek}
          />

          {/* Hover Line */}
          {hoverTime !== null && !isEmpty && <div className="absolute top-0 bottom-0 w-[1px] bg-white/30 z-40 pointer-events-none border-l border-dashed border-white/30 transition-opacity duration-75" style={{ left: `${hoverTime * zoomLevel}px` }} />}
          
          {/* Playhead (Position controlled via Animation Frame Loop, NOT React Props) */}
          {!isEmpty && (
              <div 
                ref={playheadRef}
                className={`absolute top-0 bottom-0 w-[1px] ${playheadColorClass} z-50 pointer-events-none will-change-[left]`}
                // Initial position style only, then handled by RAF
                style={{ left: `${currentTimeRef.current * zoomLevel}px` }}
              >
                <div className={`absolute -top-1.5 -translate-x-1/2 w-4 h-4 ${playheadColorClass} rotate-45 transform shadow-md cursor-pointer pointer-events-auto hover:scale-110 transition-transform flex items-center justify-center ring-0 border ${playheadRingClass}`} onMouseDown={handlePlayheadMouseDown} title={isPlaying ? "Pause" : "Play"}>
                    <div className="-rotate-45 text-black flex items-center justify-center">{isPlaying ? <Pause size={8} fill="currentColor" strokeWidth={0} /> : <Play size={8} fill="currentColor" strokeWidth={0} className="ml-0.5" />}</div>
                </div>
              </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default Timeline;
