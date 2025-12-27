
import React, { memo } from 'react';
import { Clip, MediaAsset, Selection } from '../types';
import { Video, MonitorPlay, Film, Gauge, Volume2, Music } from 'lucide-react';

interface ClipTrackProps {
    clips: Clip[];
    type: 'video' | 'audio';
    zoomLevel: number;
    selection: Selection;
    intro: MediaAsset | null;
    outro: MediaAsset | null;
    mainVideo: MediaAsset | null;
    audio: MediaAsset | null;
    onSelect: (selection: Selection) => void;
    onInteractionStart?: () => void;
    handleSeek: (e: React.MouseEvent) => void;
    setDragState: (state: any) => void;
    onSeek: (time: number) => void;
}

const ClipTrack: React.FC<ClipTrackProps> = memo(({
    clips, type, zoomLevel, selection, intro, outro, mainVideo, audio,
    onSelect, onInteractionStart, handleSeek, setDragState, onSeek
}) => {

    const renderWaveform = (clip: Clip) => {
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

    return (
        <div className="h-10 relative w-full group/track">
            <div className="absolute inset-0 bg-zinc-800/30 border-y border-zinc-800/50"></div>
            {clips.map((clip: Clip) => {
                const visualDuration = (clip.sourceEnd - clip.sourceStart) / clip.speed;
                const width = visualDuration * zoomLevel;
                const left = clip.offset * zoomLevel;
                const isSelected = selection?.type === (type === 'video' ? 'clip' : 'audio') && selection.id === clip.id;
                
                // Theme Logic
                let bgColor, borderColor, hoverBorder, selectedBg, textColor, label, Icon;

                if (type === 'video') {
                    // Video Track Defaults
                    bgColor = 'bg-blue-900/40'; borderColor = 'border-blue-500/50'; hoverBorder = 'hover:border-blue-400';
                    selectedBg = 'bg-blue-900/60'; textColor = 'text-blue-100/70'; label = `Clip ${clip.id.substring(0,4)}`; Icon = Video;

                    if (clip.mediaType === 'intro') {
                        bgColor = 'bg-green-900/40'; borderColor = 'border-green-500/50'; hoverBorder = 'hover:border-green-400';
                        selectedBg = 'bg-green-900/60'; textColor = 'text-green-100/70'; label = 'Intro'; Icon = MonitorPlay;
                    } else if (clip.mediaType === 'outro') {
                        bgColor = 'bg-red-900/40'; borderColor = 'border-red-500/50'; hoverBorder = 'hover:border-red-400';
                        selectedBg = 'bg-red-900/60'; textColor = 'text-red-100/70'; label = 'Outro'; Icon = Film;
                    }
                } else {
                    // Audio Track Defaults
                    bgColor = 'bg-orange-900/40'; borderColor = 'border-orange-500/50'; hoverBorder = 'hover:border-orange-400';
                    selectedBg = 'bg-orange-900/60'; textColor = 'text-orange-100/70'; label = `Audio ${clip.id.substring(0,4)}`; Icon = Volume2;

                    if(clip.mediaType === 'audio'){ 
                        bgColor = 'bg-purple-900/40'; borderColor = 'border-purple-500/50'; hoverBorder = 'hover:border-purple-400'; 
                        selectedBg = 'bg-purple-900/60'; textColor = 'text-purple-100/70'; label = 'Music'; Icon = Music;
                    }
                }

                return (
                    <div
                        key={clip.id}
                        className={`absolute top-0.5 bottom-0.5 rounded-md overflow-visible border group cursor-pointer transition-colors duration-75 ${isSelected ? `${selectedBg} border-yellow-400 z-20 ring-1 ring-yellow-400` : `${bgColor} ${borderColor} ${hoverBorder} z-10`}`}
                        style={{ left: `${left}px`, width: `${width}px` }}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            if (onInteractionStart) onInteractionStart();
                            if (isSelected) handleSeek(e); else onSeek(clip.offset);
                            onSelect({ type: type === 'video' ? 'clip' : 'audio', id: clip.id });
                            setDragState({ type: 'move', itemType: type === 'video' ? 'clip' : 'audio', itemId: clip.id, startX: e.clientX, initialItem: clip });
                        }}
                    >
                        <div className={`absolute inset-0 flex items-center justify-center text-[10px] font-medium ${textColor} pointer-events-none overflow-hidden whitespace-nowrap px-2 flex-col leading-tight z-10`}>
                            <div className="flex items-center gap-1">{clip.mediaType !== 'main' && <Icon size={10} />}<span className="truncate">{label}</span></div>
                            {clip.speed !== 1 && <span className="text-[9px] text-yellow-300 bg-black/40 px-1 rounded flex items-center gap-0.5 mt-0.5"><Gauge size={8} /> {clip.speed}x</span>}
                        </div>
                        {(!clip.muted || type === 'audio') && renderWaveform(clip)}
                        {isSelected && (
                            <>
                                <div className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center hover:bg-yellow-400/20 rounded-l-md z-20" onMouseDown={(e) => { e.stopPropagation(); if (onInteractionStart) onInteractionStart(); handleSeek(e); setDragState({ type: 'trim-left', itemType: type === 'video' ? 'clip' : 'audio', itemId: clip.id, startX: e.clientX, initialItem: clip }); }} />
                                <div className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center hover:bg-yellow-400/20 rounded-r-md z-20" onMouseDown={(e) => { e.stopPropagation(); if (onInteractionStart) onInteractionStart(); handleSeek(e); setDragState({ type: 'trim-right', itemType: type === 'video' ? 'clip' : 'audio', itemId: clip.id, startX: e.clientX, initialItem: clip }); }} />
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
});

export default ClipTrack;
