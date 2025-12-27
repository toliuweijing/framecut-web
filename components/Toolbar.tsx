
import React, { useRef, useEffect } from 'react';
import { Play, Pause, Scissors, Trash2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, FileAudio, Camera, Activity } from 'lucide-react';
import { Selection } from '../types';
import ToolbarContext from './ToolbarContext';
import { formatTimecode } from '../utils';

interface ToolbarProps {
  isPlaying: boolean;
  selection: Selection;
  hasVideo: boolean;
  selectedSubtitleText?: string;
  selectedZoomScale?: number;
  selectedMosaicBrushSize?: number;
  selectedClipSpeed?: number;
  onPlayPause: () => void;
  onStepFrame: (direction: -1 | 1) => void;
  onZoom: (direction: -1 | 1) => void;
  onSplit: () => void; 
  onDelete: () => void;
  onDetachAudio: () => void;
  onSubtitleChange: (text: string) => void;
  onZoomScaleChange: (scale: number) => void;
  onMosaicBrushSizeChange: (size: number) => void;
  onClipSpeedChange: (speed: number) => void;
  onToggleDebug: () => void;
  showDebug: boolean;
  onScreenshot?: () => void;
  currentTimeRef: React.MutableRefObject<number>;
}

// DIRECT-DOM CLOCK COMPONENT (High Performance)
const TimecodeDisplay: React.FC<{ refSource: React.MutableRefObject<number>, isPlaying: boolean }> = ({ refSource, isPlaying }) => {
    const textRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        let rafId: number;
        const update = () => {
            if (textRef.current) {
                textRef.current.textContent = formatTimecode(refSource.current);
            }
            rafId = requestAnimationFrame(update);
        };
        rafId = requestAnimationFrame(update);
        return () => cancelAnimationFrame(rafId);
    }, [refSource]);
    return <div ref={textRef} className="text-zinc-500 font-mono text-xs font-medium tracking-widest select-none tabular-nums" />;
};

const Toolbar: React.FC<ToolbarProps> = ({ 
  isPlaying, selection, hasVideo, selectedSubtitleText, selectedZoomScale, 
  selectedMosaicBrushSize, selectedClipSpeed, onPlayPause, onStepFrame, onZoom, 
  onSplit, onDelete, onDetachAudio, onSubtitleChange, onZoomScaleChange, 
  onMosaicBrushSizeChange, onClipSpeedChange, onToggleDebug, showDebug, onScreenshot, currentTimeRef
}) => {
  return (
    <div className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0 relative">
      <div className="flex items-center space-x-1 pr-4 z-10">
        <button onClick={onSplit} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white disabled:opacity-30" disabled={!hasVideo || !selection || (selection.type !== 'clip' && selection.type !== 'audio')}><Scissors size={16} /></button>
        <button onClick={onDelete} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-red-400 disabled:opacity-30" disabled={!hasVideo || !selection}><Trash2 size={16} /></button>
        <div className="w-px h-4 bg-zinc-700 mx-2" />
        <button onClick={onDetachAudio} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white disabled:opacity-30" disabled={!hasVideo || !selection || selection.type !== 'clip'}><FileAudio size={16} /></button>
        <button onClick={onScreenshot} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white disabled:opacity-30" disabled={!hasVideo}><Camera size={16} /></button>
      </div>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-4 z-0">
        <div className="flex items-center gap-2">
          <button onClick={() => onStepFrame(-1)} className="p-1 hover:bg-zinc-800 rounded-full text-zinc-400 disabled:opacity-30" disabled={!hasVideo}><ChevronLeft size={16} /></button>
          <button onClick={onPlayPause} className="w-8 h-8 flex items-center justify-center bg-white text-black rounded-full hover:bg-zinc-200 shadow-lg disabled:opacity-30" disabled={!hasVideo}>{isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5"/>}</button>
          <button onClick={() => onStepFrame(1)} className="p-1 hover:bg-zinc-800 rounded-full text-zinc-400 disabled:opacity-30" disabled={!hasVideo}><ChevronRight size={16} /></button>
        </div>
        <TimecodeDisplay refSource={currentTimeRef} isPlaying={isPlaying} />
      </div>

      <div className="flex items-center space-x-4 z-10">
        <ToolbarContext selection={selection} selectedSubtitleText={selectedSubtitleText} selectedZoomScale={selectedZoomScale} selectedMosaicBrushSize={selectedMosaicBrushSize} selectedClipSpeed={selectedClipSpeed} onSubtitleChange={onSubtitleChange} onZoomScaleChange={onZoomScaleChange} onMosaicBrushSizeChange={onMosaicBrushSizeChange} onClipSpeedChange={onClipSpeedChange} />
        <div className="flex items-center space-x-1 pl-2 border-l border-zinc-800">
          <button onClick={() => onZoom(-1)} className="p-1.5 hover:bg-zinc-800 text-zinc-400"><ZoomOut size={16} /></button>
          <button onClick={() => onZoom(1)} className="p-1.5 hover:bg-zinc-800 text-zinc-400"><ZoomIn size={16} /></button>
        </div>
        <div className="flex items-center pl-2 border-l border-zinc-800">
          <button onClick={onToggleDebug} className={`p-1.5 rounded-md ${showDebug ? 'bg-green-900/30 text-green-400' : 'text-zinc-400 hover:bg-zinc-800'}`}><Activity size={16} /></button>
        </div>
      </div>
    </div>
  );
};

export default Toolbar;
