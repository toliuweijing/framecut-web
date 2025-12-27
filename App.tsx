
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Circle, StopCircle, CheckCircle, MousePointer2 } from 'lucide-react';
import Player from './components/Player';
import Timeline from './components/Timeline';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import { DebugPanel } from './components/DebugPanel';
import RecordingBar from './components/RecordingBar';
import ExportModal from './components/ExportModal';
import HeaderControls from './components/HeaderControls';
import { formatTimecode, formatTimeShort } from './utils';
import { useEditor } from './hooks/useEditor';
import { useScreenRecorder } from './hooks/useScreenRecorder';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAssetOperations } from './hooks/useAssetOperations';
import { usePlaybackContext } from './hooks/usePlaybackContext';
import { useExport } from './hooks/useExport';
import { PlayerRef } from './types';

const App: React.FC = () => {
  const {
    state, setState, stateRef, pushHistory, handleUndo, handleRedo,
    recalculateDuration, handleDelete, handleSplit, handleUpdateClip,
    handleUpdateSubtitle, handleUpdateZoomEffect, handleUpdateSpotlightEffect,
    handleUpdateMosaicEffect, handleDetachAudio, handleAddSubtitle,
    handleAddZoom, handleAddSpotlight, handleAddMosaic, handleZoomScaleChange,
    handleMosaicBrushSizeChange, handleClipSpeedChange, handleToggleDebug,
    handleSeek, handleSetCoverImage, currentTimeRef
  } = useEditor();

  const playerRef = useRef<PlayerRef>(null);

  const { handleLoadProject, handleUrlImport, handleUploadAsset, handleSetColorAsset, handleRemoveAsset } = useAssetOperations({ setState, pushHistory, recalculateDuration, currentTimeRef });
  const { videoCtx, audioCtx } = usePlaybackContext({ state });
  const { isScreenRecording, recordingMarkersCount, recordingDuration, showFloatingBar, setShowFloatingBar, isPiPActive, pipCanvasRef, pipVideoRef, handleStartScreenRecording, handleStopScreenRecording, handleMarker, handleTogglePiP } = useScreenRecorder({ onRecordingComplete: handleLoadProject });
  const { handleExportAction } = useExport({ state, setState, playerRef, currentTimeRef });

  useKeyboardShortcuts({ onDelete: handleDelete, onUndo: handleUndo, onRedo: handleRedo, onToggleDebug: handleToggleDebug });

  useEffect(() => {
    document.title = isScreenRecording ? `${formatTimeShort(recordingDuration)} • Recording` : "FrameCut Web Editor";
  }, [isScreenRecording, recordingDuration]);

  const handleTogglePlay = useCallback(() => setState(prev => ({ ...prev, isPlaying: !prev.isPlaying })), [setState]);
  const handleSelect = useCallback((sel: any) => setState(prev => ({ ...prev, selection: sel })), [setState]);
  const handleStepFrame = useCallback((dir: -1 | 1) => handleSeek(Math.max(0, Math.min(stateRef.current.duration, stateRef.current.currentTime + (dir * (1/30))))), [handleSeek, stateRef]);
  const handleZoom = useCallback((dir: -1 | 1) => setState(prev => ({ ...prev, zoomLevel: Math.max(10, prev.zoomLevel + (dir * 10)) })), [setState]);
  const handleToggleAudioTrackMute = useCallback(() => { pushHistory(); setState(prev => ({ ...prev, isAudioTrackMuted: !prev.isAudioTrackMuted })); }, [pushHistory, setState]);

  const handleScreenshot = useCallback(() => {
    if (playerRef.current) {
      const dataUrl = playerRef.current.captureFrame();
      if (dataUrl) {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `frame-${formatTimecode(stateRef.current.currentTime).replace(/:/g, '-')}.png`;
        a.click();
      }
    }
  }, [stateRef]);

  return (
    <div className="flex h-screen w-screen bg-black text-white overflow-hidden font-sans">
      {state.showDebug && <DebugPanel state={state} videoTime={videoCtx.time} />}
      <Sidebar intro={state.intro} mainVideo={state.mainVideo} outro={state.outro} onUpload={handleUploadAsset} onImportUrl={handleUrlImport} onRemove={handleRemoveAsset} onSetColor={handleSetColorAsset} />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 flex min-h-0 relative bg-zinc-950">
          <div className="flex-1 flex items-center justify-center p-4">
            <Player
              ref={playerRef}
              src={videoCtx.src}
              introSrc={state.intro?.src}
              mainSrc={state.mainVideo?.src}
              outroSrc={state.outro?.src}
              activeMediaType={videoCtx.mediaType}
              sourceTime={videoCtx.time}
              currentTime={state.currentTime}
              currentTimeRef={currentTimeRef} 
              isMuted={videoCtx.muted}
              corsCompatible={videoCtx.corsCompatible}
              clipTiming={videoCtx.clipTiming}
              audioSrc={audioCtx.src}
              audioSourceTime={audioCtx.time}
              audioPlaybackRate={audioCtx.playbackRate}
              allSubtitles={state.subtitles} // Pass ALL for Ref-filtering
              selectedSubtitleId={state.selection?.type === 'subtitle' ? state.selection.id : null}
              activeZoomEffect={state.zoomEffects.find(z => state.currentTime >= z.start && state.currentTime < z.end)}
              activeSpotlightEffect={state.spotlightEffects.find(s => state.currentTime >= s.start && state.currentTime < s.end)}
              activeMosaicEffect={state.mosaicEffects.find(m => state.currentTime >= m.start && state.currentTime < m.end)}
              selectedZoomEffect={state.selection?.type === 'zoom' ? state.zoomEffects.find(z => z.id === state.selection!.id) || null : null}
              selectedSpotlightEffect={state.selection?.type === 'spotlight' ? state.spotlightEffects.find(s => s.id === state.selection!.id) || null : null}
              selectedMosaicEffect={state.selection?.type === 'mosaic' ? state.mosaicEffects.find(m => m.id === state.selection!.id) || null : null}
              isPlaying={state.isPlaying}
              playbackRate={state.playbackRate}
              currentBrushSize={state.currentBrushSize}
              onDurationChange={() => { }}
              onEnded={() => setState(prev => ({ ...prev, isPlaying: false }))}
              onUpdateSubtitle={handleUpdateSubtitle}
              onUpdateZoomEffect={handleUpdateZoomEffect}
              onUpdateSpotlightEffect={handleUpdateSpotlightEffect}
              onUpdateMosaicEffect={handleUpdateMosaicEffect}
              onSelectSubtitle={(id) => handleSelect(id ? { type: 'subtitle', id } : null)}
              onSelectZoomEffect={(id) => handleSelect({ type: 'zoom', id })}
              onSelectSpotlightEffect={(id) => handleSelect({ type: 'spotlight', id })}
              onSelectMosaicEffect={(id) => handleSelect({ type: 'mosaic', id })}
              onTogglePlay={handleTogglePlay}
              onImportVideo={() => document.getElementById('main-video-upload')?.click()}
              onInteractionStart={pushHistory}
              isAudioTrackMuted={state.isAudioTrackMuted}
              coverImage={state.coverImage}
              onAutoCover={handleSetCoverImage}
              isExporting={state.isExporting} 
            />
          </div>

          {!state.mainVideo && !state.intro && !state.outro && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
              <div className="text-center max-w-md p-6">
                {isScreenRecording ? (
                  <div className="animate-in fade-in zoom-in duration-300">
                    <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4 animate-pulse"><div className="w-10 h-10 rounded-sm bg-red-500" /></div>
                    <h2 className="text-2xl font-bold mb-2">Recording Screen...</h2>
                    <div className="text-4xl font-mono font-bold text-red-500 mb-6 tabular-nums">{formatTimeShort(recordingDuration)}</div>
                    <div className="flex gap-4 justify-center mt-6">
                      <button onClick={handleMarker} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg"><MousePointer2 size={16} /> Add Marker ({recordingMarkersCount})</button>
                      <button onClick={handleStopScreenRecording} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg"><StopCircle size={16} /> Stop Recording</button>
                    </div>
                  </div>
                ) : (
                  <div className="animate-in fade-in slide-in-from-bottom-5 duration-500">
                    <h1 className="text-3xl font-bold mb-3 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">Video Editor</h1>
                    <button onClick={handleStartScreenRecording} className="group relative inline-flex items-center gap-2 px-6 py-3 bg-white text-black rounded-full hover:bg-zinc-200 transition-all font-semibold"><Circle size={12} className="fill-red-500 text-red-500 animate-pulse" /> Start Screen Recording</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <Toolbar
          isPlaying={state.isPlaying}
          selection={state.selection}
          hasVideo={!!state.mainVideo || !!state.intro || !!state.outro}
          currentTimeRef={currentTimeRef} // PASS SOURCE OF TRUTH
          selectedSubtitleText={state.selection?.type === 'subtitle' ? state.subtitles.find(s => s.id === state.selection!.id)?.text : undefined}
          selectedZoomScale={state.selection?.type === 'zoom' ? (100 / (state.zoomEffects.find(z => z.id === state.selection!.id)?.width || 100)) : undefined}
          selectedMosaicBrushSize={state.currentBrushSize}
          selectedClipSpeed={state.selection?.type === 'clip' ? state.clips.find(c => c.id === state.selection!.id)?.speed : state.selection?.type === 'audio' ? state.audioClips.find(c => c.id === state.selection!.id)?.speed : undefined}
          onPlayPause={handleTogglePlay}
          onStepFrame={handleStepFrame}
          onZoom={handleZoom}
          onSplit={handleSplit}
          onDelete={handleDelete}
          onDetachAudio={handleDetachAudio}
          onSubtitleChange={(text) => handleUpdateSubtitle({ ...state.subtitles.find(s => s.id === state.selection!.id)!, text })}
          onZoomScaleChange={handleZoomScaleChange}
          onMosaicBrushSizeChange={handleMosaicBrushSizeChange}
          onClipSpeedChange={handleClipSpeedChange}
          onToggleDebug={handleToggleDebug}
          showDebug={state.showDebug}
          onScreenshot={handleScreenshot}
        />

        <div className="h-72 border-t border-zinc-800 bg-zinc-900 shrink-0">
          <Timeline
            duration={state.duration}
            currentTimeRef={currentTimeRef} 
            zoomLevel={state.zoomLevel}
            intro={state.intro}
            outro={state.outro}
            mainVideo={state.mainVideo}
            audio={state.audio}
            clips={state.clips}
            audioClips={state.audioClips}
            subtitles={state.subtitles}
            zoomEffects={state.zoomEffects}
            spotlightEffects={state.spotlightEffects}
            mosaicEffects={state.mosaicEffects}
            selection={state.selection}
            isPlaying={state.isPlaying}
            onSeek={handleSeek}
            onTogglePlay={handleTogglePlay}
            onSelect={handleSelect}
            onUpdateClip={handleUpdateClip}
            onUpdateSubtitle={handleUpdateSubtitle}
            onUpdateZoomEffect={handleUpdateZoomEffect}
            onUpdateSpotlightEffect={handleUpdateSpotlightEffect}
            onUpdateMosaicEffect={handleUpdateMosaicEffect}
            onAddSubtitle={handleAddSubtitle}
            onAddZoom={handleAddZoom}
            onAddSpotlight={handleAddSpotlight}
            onAddMosaic={handleAddMosaic}
            onInteractionStart={pushHistory}
            isAudioTrackMuted={state.isAudioTrackMuted}
            onToggleAudioTrackMute={handleToggleAudioTrackMute}
          />
        </div>
      </div>
      {state.showSuccessToast && <div className="fixed bottom-8 right-8 bg-zinc-900 border border-zinc-800 text-white px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 z-50"><CheckCircle className="text-emerald-500" size={20} /><div><h4 className="font-semibold text-sm">Export Complete!</h4></div></div>}
      <ExportModal isExporting={state.isExporting} progress={state.exportProgress} />
      <HeaderControls hasClips={state.clips.length > 0 || state.audioClips.length > 0} coverImage={state.coverImage} onCaptureCover={() => {}} onSetCover={handleSetCoverImage} onExport={handleExportAction} />
    </div>
  );
};

export default App;
