import React, { useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Scissors, 
  Trash2, 
  ZoomIn, 
  ZoomOut, 
  ChevronLeft, 
  ChevronRight,
  PenLine,
  Brush,
  Gauge,
  FileAudio,
  Camera
} from 'lucide-react';
import { Selection } from '../types';

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
  onScreenshot?: () => void;
  currentTime: string;
}

const Toolbar: React.FC<ToolbarProps> = ({ 
  isPlaying, 
  selection,
  hasVideo,
  selectedSubtitleText,
  selectedZoomScale,
  selectedMosaicBrushSize,
  selectedClipSpeed,
  onPlayPause, 
  onStepFrame,
  onZoom,
  onSplit,
  onDelete,
  onDetachAudio,
  onSubtitleChange,
  onZoomScaleChange,
  onMosaicBrushSizeChange,
  onClipSpeedChange,
  onScreenshot,
  currentTime
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when a subtitle is selected
  useEffect(() => {
    if (selection?.type === 'subtitle' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [selection?.id, selection?.type]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <div className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0 relative">
      
      {/* Left: Editing Tools */}
      <div className="flex items-center space-x-1 pr-4 z-10">
        <button 
          onClick={onSplit}
          className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed" 
          title="Split Clip (K)"
          disabled={!hasVideo || !selection || (selection.type !== 'clip' && selection.type !== 'audio')}
        >
          <Scissors size={16} />
        </button>
        <button 
          onClick={onDelete}
          className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-red-400 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed" 
          title="Delete Selected"
          disabled={!hasVideo || !selection}
        >
          <Trash2 size={16} />
        </button>
        
        {/* Separator */}
        <div className="w-px h-4 bg-zinc-700 mx-2" />

        <button 
          onClick={onDetachAudio}
          className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed" 
          title="Detach Audio"
          disabled={!hasVideo || !selection || selection.type !== 'clip'}
        >
          <FileAudio size={16} />
        </button>

        <button 
          onClick={onScreenshot}
          className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed" 
          title="Save Screenshot"
          disabled={!hasVideo}
        >
          <Camera size={16} />
        </button>
      </div>

      {/* Center: Playback Controls */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-4 z-0">
        {/* Row 1: Controls */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => onStepFrame(-1)}
            className="p-1 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            title="Previous Frame"
            disabled={!hasVideo}
          >
            <ChevronLeft size={16} />
          </button>

          <button 
            onClick={onPlayPause}
            className="w-8 h-8 flex items-center justify-center bg-white text-black rounded-full hover:bg-zinc-200 transition-colors shadow-lg shadow-white/10 disabled:opacity-30 disabled:hover:bg-white disabled:cursor-not-allowed"
            disabled={!hasVideo}
          >
            {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5"/>}
          </button>

          <button 
            onClick={() => onStepFrame(1)}
            className="p-1 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            title="Next Frame"
            disabled={!hasVideo}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        
        {/* Row 2: Timecode */}
        <div className={`text-zinc-500 font-mono text-xs font-medium tracking-widest select-none ${!hasVideo ? 'opacity-30' : ''}`}>
          {currentTime}
        </div>
      </div>

      {/* Right: Contextual Editor & Zoom */}
      <div className="flex items-center space-x-4 z-10">
        
        {/* Clip Speed Editor */}
        {(selection?.type === 'clip' || selection?.type === 'audio') && (
          <div className="flex items-center space-x-2 animate-in fade-in slide-in-from-right-5 duration-200">
             <span className="text-xs text-zinc-400 font-medium flex items-center gap-1">
               <Gauge size={12} /> Speed:
             </span>
             <div className="flex bg-zinc-800 rounded-md border border-zinc-700 p-0.5">
               {[0.5, 1, 1.5, 2, 4].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => onClipSpeedChange(speed)}
                    className={`px-2 py-0.5 text-[10px] rounded transition-all min-w-[30px] ${
                      selectedClipSpeed === speed
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
                    }`}
                  >
                    {speed}x
                  </button>
               ))}
             </div>
          </div>
        )}

        {/* Subtitle Editor */}
        {selection?.type === 'subtitle' && (
           <div className="flex items-center bg-zinc-800 rounded-md border border-zinc-700 focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500 transition-all">
             <div className="pl-2 text-zinc-400">
               <PenLine size={12} />
             </div>
             <input 
               ref={inputRef}
               type="text"
               value={selectedSubtitleText || ''}
               onChange={(e) => onSubtitleChange(e.target.value)}
               onKeyDown={handleKeyDown}
               className="bg-transparent border-none text-white text-xs px-2 py-1 w-28 md:w-40 focus:outline-none placeholder-zinc-500"
               placeholder="Enter subtitle text..."
             />
           </div>
        )}

        {/* Zoom Effect Editor */}
        {selection?.type === 'zoom' && (
          <div className="flex items-center space-x-2 animate-in fade-in slide-in-from-right-5 duration-200">
            <span className="text-xs text-zinc-400 font-medium">Scale:</span>
            <div className="flex bg-zinc-800 rounded-md border border-zinc-700 p-0.5">
              {[1, 1.5, 2, 3, 4].map((scale) => (
                 <button
                   key={scale}
                   onClick={() => onZoomScaleChange(scale)}
                   className={`px-1.5 py-0.5 text-[10px] rounded transition-all ${
                     // Roughly match current scale with tolerance
                     selectedZoomScale && Math.abs(selectedZoomScale - scale) < 0.1
                     ? 'bg-emerald-600 text-white shadow-sm' 
                     : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
                   }`}
                 >
                   {scale}x
                 </button>
              ))}
            </div>
          </div>
        )}

        {/* Mosaic Brush Size Editor */}
        {selection?.type === 'mosaic' && (
          <div className="flex items-center space-x-2 animate-in fade-in slide-in-from-right-5 duration-200">
            <span className="text-xs text-zinc-400 font-medium flex items-center gap-1">
              <Brush size={12} /> Brush:
            </span>
            <div className="flex bg-zinc-800 rounded-md border border-zinc-700 p-0.5">
              {[5, 10, 20].map((size) => (
                 <button
                   key={size}
                   onClick={() => onMosaicBrushSizeChange(size)}
                   className={`w-6 h-6 flex items-center justify-center rounded transition-all ${
                     selectedMosaicBrushSize === size
                     ? 'bg-pink-600 text-white shadow-sm' 
                     : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
                   }`}
                   title={`Size ${size}`}
                 >
                   <div 
                      className="bg-current rounded-full" 
                      style={{ width: Math.max(3, size / 1.5), height: Math.max(3, size / 1.5) }}
                   />
                 </button>
              ))}
            </div>
          </div>
        )}

        {/* Timeline Zoom */}
        <div className="flex items-center space-x-1 pl-2 border-l border-zinc-800">
          <button 
            onClick={() => onZoom(-1)}
            className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors"
          >
            <ZoomOut size={16} />
          </button>
          <button 
            onClick={() => onZoom(1)}
            className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors"
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Toolbar;