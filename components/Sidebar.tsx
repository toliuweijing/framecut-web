
import React, { useRef } from 'react';
import { MonitorPlay, Clapperboard, Film, Music } from 'lucide-react';
import { MediaAsset } from '../types';
import AssetSlot from './AssetSlot';

interface SidebarProps {
  intro: MediaAsset | null;
  mainVideo: MediaAsset | null;
  outro: MediaAsset | null;
  onUpload: (type: 'intro' | 'main' | 'outro' | 'audio', file: File) => void;
  onImportUrl: (type: 'intro' | 'main' | 'outro' | 'audio', url: string) => void;
  onRemove: (type: 'intro' | 'main' | 'outro' | 'audio') => void;
  onSetColor: (type: 'intro' | 'outro', color: string) => void;
}

const Sidebar: React.FC<SidebarProps> = React.memo(({ intro, mainVideo, outro, onUpload, onImportUrl, onRemove, onSetColor }) => {
  const introInputRef = useRef<HTMLInputElement>(null);
  const mainInputRef = useRef<HTMLInputElement>(null);
  const outroInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'intro' | 'main' | 'outro' | 'audio') => {
    if (e.target.files && e.target.files[0]) {
      onUpload(type, e.target.files[0]);
    }
    // Reset value so same file can be selected again
    e.target.value = '';
  };

  // Wrapper to handle the file input logic which was previously inside the component
  const createSlotProps = (
      title: string, 
      icon: any, 
      asset: MediaAsset | null, 
      type: 'intro' | 'main' | 'outro' | 'audio', 
      inputRef: React.RefObject<HTMLInputElement>,
      isAudio: boolean = false
  ) => ({
      title,
      icon,
      asset,
      type,
      inputRef,
      isAudio,
      onImportUrl: async (t: any, u: string) => onImportUrl(t, u), // Promise wrapper
      onRemove,
      onSetColor,
      // Intercept the click on the hidden input to bind the change event
      // Note: The AssetSlot renders the input, but we bind the change here via ref/props if we passed the handler
      // Actually, AssetSlot needs to accept an onChange or similar. 
      // To keep it simple with existing refs, we attach the listener to the hidden input in AssetSlot.
  });

  return (
    <div className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col h-full shrink-0">
      <div className="p-4 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-100">Media Workspace</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div onChange={(e: any) => handleFileChange(e, 'intro')}>
            <AssetSlot {...createSlotProps("Intro", MonitorPlay, intro, 'intro', introInputRef)} />
        </div>
        
        <div onChange={(e: any) => handleFileChange(e, 'main')}>
            <AssetSlot {...createSlotProps("Main Video", Clapperboard, mainVideo, 'main', mainInputRef)} />
        </div>
        
        <div onChange={(e: any) => handleFileChange(e, 'outro')}>
            <AssetSlot {...createSlotProps("Outro", Film, outro, 'outro', outroInputRef)} />
        </div>
        
        <div className="my-4 border-t border-zinc-800" />
        
        <div onChange={(e: any) => handleFileChange(e, 'audio')}>
            <AssetSlot {...createSlotProps("Background Audio", Music, null, 'audio', audioInputRef, true)} />
        </div>

        <div className="mt-4 p-3 bg-blue-900/10 border border-blue-900/30 rounded text-xs text-blue-200/70 leading-relaxed">
           <p className="mb-2 font-medium text-blue-400">How it works:</p>
           The final video will play the <strong>Intro</strong> first, then your edited <strong>Main Video</strong>, and finally the <strong>Outro</strong>. Background audio plays on the separate audio track.
        </div>
      </div>
    </div>
  );
});

export default Sidebar;
