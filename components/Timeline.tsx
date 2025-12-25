import React, { useRef, useEffect, useState, useMemo, memo } from 'react';
import { formatTimeShort } from '../utils';
import { Clip, Subtitle, ZoomEffect, SpotlightEffect, MosaicEffect, Selection, MediaAsset } from '../types';
import { Play, Pause, Scan, Video, Type, Lightbulb, Grid3X3, MonitorPlay, Film, Gauge, Volume2, Music, VolumeX } from 'lucide-react';

interface TimelineProps {
  duration: number; // Total Duration
  currentTime: number;
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

// --- Extracted & Memoized Tracks Component ---
// This component renders the heavy track DOM elements.
// It DOES NOT receive `currentTime` to prevent re-rendering on every frame.
const TracksLayer = memo(({ 
    isEmpty, totalWidth, ticks, zoomLevel, 
    clips, audioClips, subtitleTracks, zoomEffects, spotlightEffects, mosaicEffects, 
    selection, intro, outro, mainVideo, audio,
    onSelect, onSeek, onInteractionStart, 
    // Pass callbacks for drag start but handle logic in parent
    setDragState, handleSeek
}: any) => {

    const renderWaveform = (clip: Clip) => {
        // Re-implementing basic asset lookup:
        let asset = null;
        if(clip.mediaType === 'intro') asset = intro;
        else if(clip.mediaType === 'outro') asset = outro;
        else if(clip.mediaType === 'audio') asset = audio;
        else asset = mainVideo;

        if (!asset || !asset.waveformData) return null;
        
        const samplesPerSec = 50; 
        const startIdx = Math.floor(clip.sourceStart * samplesPerSec);
        const endIdx = Math.floor(clip.sourceEnd * samplesPerSec);
        const count = endIdx - startIdx;
        const totalAssetSamples = asset.waveformData.length;
        
        if (count <= 0 || totalAssetSamples === 0) return null;

        const displaySamples: number[] = [];
        for (let i = 0; i < count; i++) {
            const sampleIndex = (startIdx + i) % totalAssetSamples;
            displaySamples.push(asset.waveformData[sampleIndex]);
        }
        
        return (
          <div className="absolute inset-0 pointer-events-none opacity-80 flex items-end pb-0.5">
              <svg viewBox={`0 0 ${displaySamples.length * 3} 100`} preserveAspectRatio="none" className="w-full h-2/3">
                 {displaySamples.map((val: number, i: number) => (
                    <rect key={i} x={i * 3} y={100 - (val * 100)} width={2} height={val * 100} fill="white" />
                 ))}
              </svg>
          </div>
        );
    };

    if (isEmpty) {
        return (
            <div className="h-full w-full flex items-center justify-center opacity-20 pointer-events-none">
              <span className="text-zinc-500 text-sm">Add media from the workspace to begin</span>
            </div>
        );
    }

    return (
        <div className="relative h-full min-h-[160px]" style={{ width: `${totalWidth}px` }}>
            {/* Time Ticks */}
            <div className="h-6 w-full border-b border-zinc-700 bg-zinc-900/95 sticky top-0 z-30 flex items-end pointer-events-none backdrop-blur-sm">
            {ticks.map((time: number) => (
                <div key={time} className="absolute border-l border-zinc-600 h-2.5 text-[9px] text-zinc-500 pl-1 font-mono" style={{ left: `${time * zoomLevel}px` }}>{formatTimeShort(time)}</div>
            ))}
            </div>

            <div className="py-1 relative space-y-[2px]">
            {/* Track 1: Video */}
            <div className="h-10 relative w-full group/track">
                <div className="absolute inset-0 bg-zinc-800/30 border-y border-zinc-800/50"></div>
                {clips.map((clip: Clip) => {
                    const visualDuration = (clip.sourceEnd - clip.sourceStart) / clip.speed;
                    const width = visualDuration * zoomLevel;
                    const left = clip.offset * zoomLevel;
                    const isSelected = selection?.type === 'clip' && selection.id === clip.id;
                    
                    let bgColor = 'bg-blue-900/40';
                    let borderColor = 'border-blue-500/50';
                    let hoverBorder = 'hover:border-blue-400';
                    let selectedBg = 'bg-blue-900/60';
                    let textColor = 'text-blue-100/70';
                    let label = `Clip ${clip.id.substring(0,4)}`;
                    let Icon = Video;

                    if (clip.mediaType === 'intro') {
                        bgColor = 'bg-green-900/40';
                        borderColor = 'border-green-500/50';
                        hoverBorder = 'hover:border-green-400';
                        selectedBg = 'bg-green-900/60';
                        textColor = 'text-green-100/70';
                        label = 'Intro';
                        Icon = MonitorPlay;
                    } else if (clip.mediaType === 'outro') {
                        bgColor = 'bg-red-900/40';
                        borderColor = 'border-red-500/50';
                        hoverBorder = 'hover:border-red-400';
                        selectedBg = 'bg-red-900/60';
                        textColor = 'text-red-100/70';
                        label = 'Outro';
                        Icon = Film;
                    }

                    return (
                        <div
                        key={clip.id}
                        className={`absolute top-0.5 bottom-0.5 rounded-md overflow-visible border group cursor-pointer transition-colors duration-75 ${isSelected ? `${selectedBg} border-yellow-400 z-20 ring-1 ring-yellow-400` : `${bgColor} ${borderColor} ${hoverBorder} z-10`}`}
                        style={{ left: `${left}px`, width: `${width}px` }}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            if (onInteractionStart) onInteractionStart();
                            if (selection?.type === 'clip' && selection.id === clip.id) handleSeek(e); else onSeek(clip.offset);
                            onSelect({ type: 'clip', id: clip.id });
                            setDragState({ type: 'move', itemType: 'clip', itemId: clip.id, startX: e.clientX, initialItem: clip });
                        }}
                        >
                        <div className={`absolute inset-0 flex items-center justify-center text-[10px] font-medium ${textColor} pointer-events-none overflow-hidden whitespace-nowrap px-2 flex-col leading-tight z-10`}>
                            <div className="flex items-center gap-1">{clip.mediaType !== 'main' && <Icon size={10} />}<span className="truncate">{label}</span></div>
                            {clip.speed !== 1 && <span className="text-[9px] text-yellow-300 bg-black/40 px-1 rounded flex items-center gap-0.5 mt-0.5"><Gauge size={8} /> {clip.speed}x</span>}
                        </div>
                        {!clip.muted && renderWaveform(clip)}
                        {isSelected && (
                            <>
                            <div className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center hover:bg-yellow-400/20 rounded-l-md z-20" onMouseDown={(e) => { e.stopPropagation(); if (onInteractionStart) onInteractionStart(); handleSeek(e); setDragState({ type: 'trim-left', itemType: 'clip', itemId: clip.id, startX: e.clientX, initialItem: clip }); }} />
                            <div className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center hover:bg-yellow-400/20 rounded-r-md z-20" onMouseDown={(e) => { e.stopPropagation(); if (onInteractionStart) onInteractionStart(); handleSeek(e); setDragState({ type: 'trim-right', itemType: 'clip', itemId: clip.id, startX: e.clientX, initialItem: clip }); }} />
                            </>
                        )}
                        </div>
                    );
                })}
            </div>

            {/* Track 2: Audio */}
            <div className="h-10 relative w-full group/track">
                <div className="absolute inset-0 bg-zinc-800/30 border-y border-zinc-800/50"></div>
                {audioClips.map((clip: Clip) => {
                    const visualDuration = (clip.sourceEnd - clip.sourceStart) / clip.speed;
                    const width = visualDuration * zoomLevel;
                    const left = clip.offset * zoomLevel;
                    const isSelected = selection?.type === 'audio' && selection.id === clip.id;
                    
                    // Simple logic for audio styles
                    let bgColor = 'bg-orange-900/40'; let borderColor = 'border-orange-500/50'; let hoverBorder = 'hover:border-orange-400';
                    let selectedBg = 'bg-orange-900/60'; let textColor = 'text-orange-100/70'; let label = `Audio ${clip.id.substring(0,4)}`;
                    if(clip.mediaType === 'audio'){ bgColor = 'bg-purple-900/40'; borderColor = 'border-purple-500/50'; hoverBorder = 'hover:border-purple-400'; selectedBg = 'bg-purple-900/60'; textColor = 'text-purple-100/70'; label = 'Music'; }

                    return (
                        <div
                            key={clip.id}
                            className={`absolute top-0.5 bottom-0.5 rounded-md overflow-visible border group cursor-pointer transition-colors duration-75 ${isSelected ? `${selectedBg} border-yellow-400 z-20 ring-1 ring-yellow-400` : `${bgColor} ${borderColor} ${hoverBorder} z-10`}`}
                            style={{ left: `${left}px`, width: `${width}px` }}
                            onMouseDown={(e) => {
                                e.stopPropagation();
                                if (onInteractionStart) onInteractionStart();
                                if (selection?.type === 'audio' && selection.id === clip.id) handleSeek(e); else onSeek(clip.offset);
                                onSelect({ type: 'audio', id: clip.id });
                                setDragState({ type: 'move', itemType: 'audio', itemId: clip.id, startX: e.clientX, initialItem: clip });
                            }}
                        >
                            <div className={`absolute inset-0 flex items-center justify-center text-[10px] font-medium ${textColor} pointer-events-none overflow-hidden whitespace-nowrap px-2 flex-col leading-tight z-10`}>
                                <div className="flex items-center gap-1">{clip.mediaType === 'audio' ? <Music size={10} /> : <Volume2 size={10} />}<span className="truncate">{label}</span></div>
                                {clip.speed !== 1 && <span className="text-[9px] text-yellow-300 bg-black/40 px-1 rounded flex items-center gap-0.5 mt-0.5"><Gauge size={8} /> {clip.speed}x</span>}
                            </div>
                            {renderWaveform(clip)}
                            {isSelected && (
                                <>
                                    <div className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center hover:bg-yellow-400/20 rounded-l-md z-20" onMouseDown={(e) => { e.stopPropagation(); if (onInteractionStart) onInteractionStart(); handleSeek(e); setDragState({ type: 'trim-left', itemType: 'audio', itemId: clip.id, startX: e.clientX, initialItem: clip }); }} />
                                    <div className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center hover:bg-yellow-400/20 rounded-r-md z-20" onMouseDown={(e) => { e.stopPropagation(); if (onInteractionStart) onInteractionStart(); handleSeek(e); setDragState({ type: 'trim-right', itemType: 'audio', itemId: clip.id, startX: e.clientX, initialItem: clip }); }} />
                                </>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Subtitle Tracks */}
            {subtitleTracks.map((track: Subtitle[], trackIndex: number) => (
                <div key={`sub-track-body-${trackIndex}`} className="h-6 relative w-full group/track">
                    <div className="absolute inset-0 bg-zinc-800/20 border-y border-zinc-800/50"></div>
                    {track.map((sub) => {
                        const width = (sub.end - sub.start) * zoomLevel;
                        const left = sub.start * zoomLevel;
                        const isSelected = selection?.type === 'subtitle' && selection.id === sub.id;
                        return (
                        <div key={sub.id} className={`absolute top-0.5 bottom-0.5 rounded overflow-visible border group cursor-pointer transition-colors duration-75 ${isSelected ? 'bg-purple-900/60 border-yellow-400 z-20 ring-1 ring-yellow-400' : 'bg-purple-900/40 border-purple-500/50 hover:border-purple-400 z-10'}`} style={{ left: `${left}px`, width: `${width}px` }} onMouseDown={(e) => { e.stopPropagation(); if (onInteractionStart) onInteractionStart(); handleSeek(e); onSelect({ type: 'subtitle', id: sub.id }); setDragState({ type: 'move', itemType: 'subtitle', itemId: sub.id, startX: e.clientX, initialItem: sub }); }}>
                            <div className="absolute inset-0 flex items-center px-1 text-[9px] text-purple-100/90 overflow-hidden pointer-events-none"><span className="truncate">{sub.text}</span></div>
                            {isSelected && ( <><div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-yellow-400/20 rounded-l-md" onMouseDown={(e) => { e.stopPropagation(); if (onInteractionStart) onInteractionStart(); handleSeek(e); setDragState({ type: 'trim-left', itemType: 'subtitle', itemId: sub.id, startX: e.clientX, initialItem: sub }); }} /><div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-yellow-400/20 rounded-r-md" onMouseDown={(e) => { e.stopPropagation(); if (onInteractionStart) onInteractionStart(); handleSeek(e); setDragState({ type: 'trim-right', itemType: 'subtitle', itemId: sub.id, startX: e.clientX, initialItem: sub }); }} /></> )}
                        </div>
                        );
                    })}
                </div>
            ))}

            {/* Effect Tracks */}
            <div className="h-6 relative w-full group/track"><div className="absolute inset-0 bg-zinc-800/20 border-y border-zinc-800/50"></div>{zoomEffects.map((zoom: any)=>{const width=(zoom.end-zoom.start)*zoomLevel;const left=zoom.start*zoomLevel;const isSelected=selection?.type==='zoom'&&selection.id===zoom.id;return(<div key={zoom.id} className={`absolute top-0.5 bottom-0.5 rounded overflow-visible border group cursor-pointer transition-colors duration-75 ${isSelected?'bg-emerald-900/60 border-yellow-400 z-20 ring-1 ring-yellow-400':'bg-emerald-900/40 border-emerald-500/50 hover:border-emerald-400 z-10'}`} style={{left:`${left}px`,width:`${width}px`}} onMouseDown={(e)=>{e.stopPropagation();if (onInteractionStart) onInteractionStart();handleSeek(e);onSelect({type:'zoom',id:zoom.id});setDragState({type:'move',itemType:'zoom',itemId:zoom.id,startX:e.clientX,initialItem:zoom});}}><div className="absolute inset-0 flex items-center px-1 text-[9px] text-emerald-100/90 overflow-hidden pointer-events-none gap-1"><Scan size={10}/><span className="truncate">Zoom</span></div>{isSelected&&( <><div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-yellow-400/20 rounded-l-md" onMouseDown={(e)=>{e.stopPropagation();if (onInteractionStart) onInteractionStart();handleSeek(e);setDragState({type:'trim-left',itemType:'zoom',itemId:zoom.id,startX:e.clientX,initialItem:zoom});}}/><div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-yellow-400/20 rounded-r-md" onMouseDown={(e)=>{e.stopPropagation();if (onInteractionStart) onInteractionStart();handleSeek(e);setDragState({type:'trim-right',itemType:'zoom',itemId:zoom.id,startX:e.clientX,initialItem:zoom});}}/></> )}</div>);})}</div>
            <div className="h-6 relative w-full group/track"><div className="absolute inset-0 bg-zinc-800/20 border-y border-zinc-800/50"></div>{spotlightEffects.map((spot: any)=>{const width=(spot.end-spot.start)*zoomLevel;const left=spot.start*zoomLevel;const isSelected=selection?.type==='spotlight'&&selection.id===spot.id;return(<div key={spot.id} className={`absolute top-0.5 bottom-0.5 rounded overflow-visible border group cursor-pointer transition-colors duration-75 ${isSelected?'bg-amber-900/60 border-yellow-400 z-20 ring-1 ring-yellow-400':'bg-amber-900/40 border-amber-500/50 hover:border-amber-400 z-10'}`} style={{left:`${left}px`,width:`${width}px`}} onMouseDown={(e)=>{e.stopPropagation();if (onInteractionStart) onInteractionStart();handleSeek(e);onSelect({type:'spotlight',id:spot.id});setDragState({type:'move',itemType:'spotlight',itemId:spot.id,startX:e.clientX,initialItem:spot});}}><div className="absolute inset-0 flex items-center px-1 text-[9px] text-amber-100/90 overflow-hidden pointer-events-none gap-1"><Lightbulb size={10}/><span className="truncate">Spotlight</span></div>{isSelected&&( <><div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-yellow-400/20 rounded-l-md" onMouseDown={(e)=>{e.stopPropagation();if (onInteractionStart) onInteractionStart();handleSeek(e);setDragState({type:'trim-left',itemType:'spotlight',itemId:spot.id,startX:e.clientX,initialItem:spot});}}/><div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-yellow-400/20 rounded-r-md" onMouseDown={(e)=>{e.stopPropagation();if (onInteractionStart) onInteractionStart();handleSeek(e);setDragState({type:'trim-right',itemType:'spotlight',itemId:spot.id,startX:e.clientX,initialItem:spot});}}/></> )}</div>);})}</div>
            <div className="h-6 relative w-full group/track"><div className="absolute inset-0 bg-zinc-800/20 border-y border-zinc-800/50"></div>{mosaicEffects.map((mos: any)=>{const width=(mos.end-mos.start)*zoomLevel;const left=mos.start*zoomLevel;const isSelected=selection?.type==='mosaic'&&selection.id===mos.id;return(<div key={mos.id} className={`absolute top-0.5 bottom-0.5 rounded overflow-visible border group cursor-pointer transition-colors duration-75 ${isSelected?'bg-pink-900/60 border-yellow-400 z-20 ring-1 ring-yellow-400':'bg-pink-900/40 border-pink-500/50 hover:border-pink-400 z-10'}`} style={{left:`${left}px`,width:`${width}px`}} onMouseDown={(e)=>{e.stopPropagation();if (onInteractionStart) onInteractionStart();handleSeek(e);onSelect({type:'mosaic',id:mos.id});setDragState({type:'move',itemType:'mosaic',itemId:mos.id,startX:e.clientX,initialItem:mos});}}><div className="absolute inset-0 flex items-center px-1 text-[9px] text-pink-100/90 overflow-hidden pointer-events-none gap-1"><Grid3X3 size={10}/><span className="truncate">Mosaic</span></div>{isSelected&&( <><div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-yellow-400/20 rounded-l-md" onMouseDown={(e)=>{e.stopPropagation();if (onInteractionStart) onInteractionStart();handleSeek(e);setDragState({type:'trim-left',itemType:'mosaic',itemId:mos.id,startX:e.clientX,initialItem:mos});}}/><div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-yellow-400/20 rounded-r-md" onMouseDown={(e)=>{e.stopPropagation();if (onInteractionStart) onInteractionStart();handleSeek(e);setDragState({type:'trim-right',itemType:'mosaic',itemId:mos.id,startX:e.clientX,initialItem:mos});}}/></> )}</div>);})}</div>
            </div>
        </div>
    );
});


const Timeline: React.FC<TimelineProps> = ({ 
  duration, 
  currentTime, 
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
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  
  // Drag State
  const [dragState, setDragState] = useState<{
    type: 'move' | 'trim-left' | 'trim-right' | 'playhead';
    itemType: 'clip' | 'audio' | 'subtitle' | 'zoom' | 'spotlight' | 'mosaic' | 'none';
    itemId: string;
    startX: number;
    initialItem: Clip | Subtitle | ZoomEffect | SpotlightEffect | MosaicEffect | null;
  } | null>(null);

  const playheadClickStartRef = useRef<{x: number, time: number} | null>(null);

  const isEmpty = duration === 0;
  const totalWidth = Math.max(duration * zoomLevel, 100) + 200; 
  
  const ticks = useMemo(() => {
    if (isEmpty) return [];
    const tickInterval = 5; 
    const count = Math.ceil((duration + 10) / tickInterval) + 1;
    return Array.from({ length: count }, (_, i) => i * tickInterval);
  }, [duration, isEmpty]);

  const subtitleTracks = useMemo(() => organizeSubtitles(subtitles), [subtitles]);

  // Direct DOM update for Playhead to avoid React Render Cycle Lag
  useEffect(() => {
      if (playheadRef.current && !isEmpty) {
          playheadRef.current.style.left = `${currentTime * zoomLevel}px`;
      }
  }, [currentTime, zoomLevel, isEmpty]);

  // Handle auto-scroll if playing and playhead goes out of view
  useEffect(() => {
    if (isPlaying && containerRef.current && !isScrubbing && !dragState) {
        const container = containerRef.current;
        const currentPos = currentTime * zoomLevel;
        const scrollLeft = container.scrollLeft;
        const width = container.clientWidth;
        
        // Simple follow logic: if nearly at right edge, scroll
        if (currentPos > scrollLeft + width * 0.9) {
            container.scrollLeft = currentPos - width * 0.1;
        }
    }
  }, [currentTime, zoomLevel, isPlaying, isScrubbing, dragState]);


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

  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    if (isEmpty) return;
    e.stopPropagation();
    playheadClickStartRef.current = { x: e.clientX, time: Date.now() };
    setDragState({ 
      type: 'playhead', 
      itemType: 'none', 
      itemId: 'playhead', 
      startX: e.clientX, 
      initialItem: null 
    });
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

  const handleMouseMove = (e: MouseEvent) => {
    if (isScrubbing) {
      handleSeek(e);
      return;
    }
    
    if (dragState) {
      if (dragState.type === 'playhead') {
        handleSeek(e);
        return;
      }

      const deltaX = e.clientX - dragState.startX;
      const deltaTime = deltaX / zoomLevel;

      if (dragState.itemType === 'clip' || dragState.itemType === 'audio') {
        const initialClip = dragState.initialItem as Clip;
        let newClip = { ...initialClip };

        if (dragState.type === 'move') {
           const proposedOffset = Math.max(0, initialClip.offset + deltaTime);
           // Snapping Logic
           const trackClips = dragState.itemType === 'clip' ? clips : audioClips;
           const snapThreshold = 10 / zoomLevel;
           let closestSnap = proposedOffset;
           let minDiff = Infinity;
           const snapPoints = [0];
           trackClips.forEach(c => {
             if (c.id === initialClip.id) return;
             const duration = (c.sourceEnd - c.sourceStart) / c.speed;
             snapPoints.push(c.offset + duration);
           });
           snapPoints.forEach(point => {
             const diff = Math.abs(proposedOffset - point);
             if (diff < snapThreshold && diff < minDiff) {
                minDiff = diff;
                closestSnap = point;
             }
           });
           newClip.offset = (minDiff < Infinity) ? closestSnap : proposedOffset;
           onSeek(newClip.offset);

        } else if (dragState.type === 'trim-left') {
           const sourceDelta = deltaTime * initialClip.speed;
           const newOffset = initialClip.offset + deltaTime;
           const newSourceStart = initialClip.sourceStart + sourceDelta;
           if (newSourceStart >= 0 && newSourceStart < initialClip.sourceEnd - 0.1) {
              newClip.offset = newOffset;
              newClip.sourceStart = newSourceStart;
           }
        } else if (dragState.type === 'trim-right') {
           const sourceDelta = deltaTime * initialClip.speed;
           const newSourceEnd = initialClip.sourceEnd + sourceDelta;
           if (newSourceEnd > initialClip.sourceStart + 0.1) {
              newClip.sourceEnd = newSourceEnd;
           }
        }
        onUpdateClip(newClip);

      } else if (dragState.itemType === 'subtitle') {
        const initialSub = dragState.initialItem as Subtitle;
        let newSub = { ...initialSub };
        const currentDuration = initialSub.end - initialSub.start;

        if (dragState.type === 'move') {
          const newStart = Math.max(0, initialSub.start + deltaTime);
          newSub.start = newStart;
          newSub.end = newStart + currentDuration;
        } else if (dragState.type === 'trim-left') {
          const newStart = Math.min(initialSub.start + deltaTime, initialSub.end - 0.5);
          newSub.start = newStart;
        } else if (dragState.type === 'trim-right') {
          const newEnd = Math.max(initialSub.end + deltaTime, initialSub.start + 0.5);
          newSub.end = newEnd;
        }
        onUpdateSubtitle(newSub);
      } else if (dragState.itemType === 'zoom') {
        const initialZoom = dragState.initialItem as ZoomEffect;
        let newZoom = { ...initialZoom };
        const currentDuration = initialZoom.end - initialZoom.start;
        if (dragState.type === 'move') {
          newZoom.start = Math.max(0, initialZoom.start + deltaTime);
          newZoom.end = newZoom.start + currentDuration;
        } else if (dragState.type === 'trim-left') {
          newZoom.start = Math.min(initialZoom.start + deltaTime, initialZoom.end - 0.5);
        } else if (dragState.type === 'trim-right') {
          newZoom.end = Math.max(initialZoom.end + deltaTime, initialZoom.start + 0.5);
        }
        onUpdateZoomEffect(newZoom);
      } else if (dragState.itemType === 'spotlight') {
         const initialSpot = dragState.initialItem as SpotlightEffect;
         let newSpot = { ...initialSpot };
         const currentDuration = initialSpot.end - initialSpot.start;
         if (dragState.type === 'move') {
            newSpot.start = Math.max(0, initialSpot.start + deltaTime);
            newSpot.end = newSpot.start + currentDuration;
         } else if (dragState.type === 'trim-left') {
            newSpot.start = Math.min(initialSpot.start + deltaTime, initialSpot.end - 0.5);
         } else if (dragState.type === 'trim-right') {
            newSpot.end = Math.max(initialSpot.end + deltaTime, initialSpot.start + 0.5);
         }
         onUpdateSpotlightEffect(newSpot);
      } else if (dragState.itemType === 'mosaic') {
         const initialMosaic = dragState.initialItem as MosaicEffect;
         let newMosaic = { ...initialMosaic };
         const currentDuration = initialMosaic.end - initialMosaic.start;
         if (dragState.type === 'move') {
            newMosaic.start = Math.max(0, initialMosaic.start + deltaTime);
            newMosaic.end = newMosaic.start + currentDuration;
         } else if (dragState.type === 'trim-left') {
            newMosaic.start = Math.min(initialMosaic.start + deltaTime, initialMosaic.end - 0.5);
         } else if (dragState.type === 'trim-right') {
            newMosaic.end = Math.max(initialMosaic.end + deltaTime, initialMosaic.start + 0.5);
         }
         onUpdateMosaicEffect(newMosaic);
      }
    }
  };

  const handleMouseUp = (e: MouseEvent) => {
    setIsScrubbing(false);
    if (dragState?.type === 'playhead' && playheadClickStartRef.current) {
      const dist = Math.abs(e.clientX - playheadClickStartRef.current.x);
      if (dist < 5) onTogglePlay();
      playheadClickStartRef.current = null;
    }
    setDragState(null);
  };

  useEffect(() => {
    if (isScrubbing || dragState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, dragState, zoomLevel]);

  const playheadColorClass = isPlaying ? 'bg-white' : 'bg-yellow-500';
  const playheadRingClass = isPlaying ? 'border-zinc-300' : 'border-yellow-600';

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-t border-zinc-800 select-none">
      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar: Track Labels */}
        <div className="w-14 flex-shrink-0 bg-zinc-950 border-r border-zinc-800 flex flex-col z-20 shadow-[4px_0_10px_rgba(0,0,0,0.2)]">
          <div className="h-6 border-b border-zinc-700 bg-zinc-900 w-full shrink-0" />
          <div className={`py-1 space-y-[2px] flex-1 relative bg-zinc-900/30 ${isEmpty ? 'opacity-30' : ''}`}>
            
            {/* Video Track */}
            <div title="Video Track" className="h-10 flex items-center justify-center text-zinc-400 border-r-2 border-transparent bg-zinc-900/10">
               <Video size={16} className="text-blue-500" />
            </div>

            {/* Audio Track */}
            <button 
              title={isAudioTrackMuted ? "Unmute Audio" : "Mute Audio"} 
              onClick={onToggleAudioTrackMute}
              className="h-10 w-full flex items-center justify-center text-zinc-400 border-r-2 border-transparent hover:bg-zinc-800 transition-colors bg-zinc-900/10 cursor-pointer"
            >
               {isAudioTrackMuted ? <VolumeX size={16} className="text-red-500" /> : <Volume2 size={16} className="text-orange-500" />}
            </button>

            {/* Subtitle Tracks (Dynamic) */}
            {subtitleTracks.map((_, index) => (
              <div key={`sub-track-${index}`} className="w-full h-6 flex items-center justify-center border-r-2 border-transparent relative">
                {index === 0 ? (
                    <button 
                      onClick={onAddSubtitle} 
                      className="w-full h-full flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                      title="Add Subtitle"
                    >
                      <Type size={14} className="text-purple-500" />
                    </button>
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-900/10" title={`Subtitle Track ${index + 1}`}>
                       <Type size={12} className="text-purple-900/50" />
                    </div>
                )}
              </div>
            ))}

            <button onClick={onAddZoom} className="w-full h-6 flex items-center justify-center text-zinc-400 border-r-2 border-transparent hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"><Scan size={14} className="text-emerald-500" /></button>
            <button onClick={onAddSpotlight} className="w-full h-6 flex items-center justify-center text-zinc-400 border-r-2 border-transparent hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"><Lightbulb size={14} className="text-amber-500" /></button>
            <button onClick={onAddMosaic} className="w-full h-6 flex items-center justify-center text-zinc-400 border-r-2 border-transparent hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"><Grid3X3 size={14} className="text-pink-500" /></button>
          </div>
        </div>

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
          
          {/* Playhead (Position controlled via ref for performance) */}
          {!isEmpty && (
              <div 
                ref={playheadRef}
                className={`absolute top-0 bottom-0 w-[1px] ${playheadColorClass} z-50 pointer-events-none will-change-[left]`} 
                style={{ left: `${currentTime * zoomLevel}px` }}
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
};

export default Timeline;