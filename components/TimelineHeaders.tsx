
import React, { memo } from 'react';
import { Video, Volume2, VolumeX, Type, Scan, Lightbulb, Grid3X3 } from 'lucide-react';
import { Subtitle } from '../types';

interface TimelineHeadersProps {
    isEmpty: boolean;
    isAudioTrackMuted?: boolean;
    onToggleAudioTrackMute?: () => void;
    subtitleTracks: Subtitle[][];
    onAddSubtitle: () => void;
    onAddZoom: () => void;
    onAddSpotlight: () => void;
    onAddMosaic: () => void;
}

const TimelineHeaders: React.FC<TimelineHeadersProps> = memo(({
    isEmpty,
    isAudioTrackMuted,
    onToggleAudioTrackMute,
    subtitleTracks,
    onAddSubtitle,
    onAddZoom,
    onAddSpotlight,
    onAddMosaic
}) => {
    return (
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

                <button onClick={onAddZoom} title="Add Zoom Effect" className="w-full h-6 flex items-center justify-center text-zinc-400 border-r-2 border-transparent hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"><Scan size={14} className="text-emerald-500" /></button>
                <button onClick={onAddSpotlight} title="Add Spotlight Effect" className="w-full h-6 flex items-center justify-center text-zinc-400 border-r-2 border-transparent hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"><Lightbulb size={14} className="text-amber-500" /></button>
                <button onClick={onAddMosaic} title="Add Mosaic Effect" className="w-full h-6 flex items-center justify-center text-zinc-400 border-r-2 border-transparent hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"><Grid3X3 size={14} className="text-pink-500" /></button>
            </div>
        </div>
    );
});

export default TimelineHeaders;
