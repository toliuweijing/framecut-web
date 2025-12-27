
import React, { useRef, useEffect } from 'react';
import { Gauge, PenLine, Brush } from 'lucide-react';
import { Selection } from '../types';

interface ToolbarContextProps {
    selection: Selection;
    selectedSubtitleText?: string;
    selectedZoomScale?: number;
    selectedMosaicBrushSize?: number;
    selectedClipSpeed?: number;
    onSubtitleChange: (text: string) => void;
    onZoomScaleChange: (scale: number) => void;
    onMosaicBrushSizeChange: (size: number) => void;
    onClipSpeedChange: (speed: number) => void;
}

const ToolbarContext: React.FC<ToolbarContextProps> = ({
    selection,
    selectedSubtitleText,
    selectedZoomScale,
    selectedMosaicBrushSize,
    selectedClipSpeed,
    onSubtitleChange,
    onZoomScaleChange,
    onMosaicBrushSizeChange,
    onClipSpeedChange
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
            (e.currentTarget as HTMLInputElement).blur();
        }
    };

    return (
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
                                className={`px-2 py-0.5 text-[10px] rounded transition-all min-w-[30px] ${selectedClipSpeed === speed
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
                <div className="flex items-center bg-zinc-800 rounded-md border border-zinc-700 focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500 transition-all animate-in fade-in slide-in-from-right-5 duration-200">
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
                                className={`px-1.5 py-0.5 text-[10px] rounded transition-all ${selectedZoomScale && Math.abs(selectedZoomScale - scale) < 0.1
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
                                className={`w-6 h-6 flex items-center justify-center rounded transition-all ${selectedMosaicBrushSize === size
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
        </div>
    );
};

export default ToolbarContext;
