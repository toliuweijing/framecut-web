
import React, { useRef, useState } from 'react';
import { Download, FileAudio, Image as ImageIcon, Camera, Upload, Trash2, ChevronDown } from 'lucide-react';

interface HeaderControlsProps {
    hasClips: boolean;
    coverImage: string | null;
    onCaptureCover: () => void;
    onSetCover: (url: string | null) => void;
    onExport: (audioOnly: boolean, format?: 'mp4' | 'webm') => void;
}

const HeaderControls: React.FC<HeaderControlsProps> = ({
    hasClips,
    coverImage,
    onCaptureCover,
    onSetCover,
    onExport
}) => {
    const [showCoverMenu, setShowCoverMenu] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const coverInputRef = useRef<HTMLInputElement>(null);

    const handleUploadCover = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (evt) => {
                if (evt.target?.result) {
                    onSetCover(evt.target.result as string);
                    setShowCoverMenu(false);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleCaptureClick = () => {
        onCaptureCover();
        setShowCoverMenu(false);
    };

    return (
        <div className="fixed top-4 right-4 flex gap-2 z-50 items-center">
            {/* Cover Image Selector */}
            <div className="relative">
                <button
                    onClick={() => setShowCoverMenu(!showCoverMenu)}
                    disabled={!hasClips}
                    className={`px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border ${coverImage ? 'border-blue-500/50 text-blue-400' : 'border-transparent'}`}
                    title="Set Cover Image (Thumbnail)"
                >
                    <ImageIcon size={14} />
                    {coverImage ? 'Cover Set' : 'Set Cover'}
                </button>

                {showCoverMenu && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowCoverMenu(false)} />
                        <div className="absolute top-full right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50 p-1 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-100">
                            <button onClick={handleCaptureClick} className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 text-zinc-300 text-xs rounded text-left">
                                <Camera size={14} /> Use Current Frame
                            </button>
                            <button onClick={() => coverInputRef.current?.click()} className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 text-zinc-300 text-xs rounded text-left">
                                <Upload size={14} /> Upload Image
                            </button>
                            {coverImage && (
                                <>
                                    <div className="h-px bg-zinc-800 my-1" />
                                    <div className="px-3 py-1">
                                        <div className="w-full aspect-video rounded overflow-hidden border border-zinc-700 bg-black">
                                            <img src={coverImage} alt="Cover Preview" className="w-full h-full object-cover" />
                                        </div>
                                    </div>
                                    <button onClick={() => { onSetCover(null); setShowCoverMenu(false); }} className="flex items-center gap-2 px-3 py-2 hover:bg-red-900/30 text-red-400 text-xs rounded text-left">
                                        <Trash2 size={14} /> Remove Cover
                                    </button>
                                </>
                            )}
                        </div>
                    </>
                )}
                <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleUploadCover}
                />
            </div>

            <button
                onClick={() => onExport(true)}
                disabled={!hasClips}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <FileAudio size={14} /> Export Audio
            </button>
            
            {/* Video Export Dropdown */}
            <div className="relative">
                <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    disabled={!hasClips}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg shadow-blue-900/20 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                    <Download size={16} /> 
                    Export Video
                    <ChevronDown size={14} className={`transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
                </button>

                {showExportMenu && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                        <div className="absolute top-full right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50 p-1 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-100">
                            <button 
                                onClick={() => { onExport(false, 'mp4'); setShowExportMenu(false); }} 
                                className="flex flex-col gap-0.5 px-3 py-2 hover:bg-zinc-800 text-zinc-300 rounded text-left"
                            >
                                <span className="text-xs font-semibold text-white flex items-center gap-2">
                                    MP4 <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1.5 rounded-full">Social Ready</span>
                                </span>
                                <span className="text-[10px] text-zinc-500">Best for Instagram, TikTok, WhatsApp</span>
                            </button>
                            
                            <button 
                                onClick={() => { onExport(false, 'webm'); setShowExportMenu(false); }} 
                                className="flex flex-col gap-0.5 px-3 py-2 hover:bg-zinc-800 text-zinc-300 rounded text-left"
                            >
                                <span className="text-xs font-semibold text-white">WebM</span>
                                <span className="text-[10px] text-zinc-500">Best for Web & Archive (High Quality)</span>
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default HeaderControls;
