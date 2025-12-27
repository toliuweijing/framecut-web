
import { useEffect } from 'react';

interface KeyboardShortcutsProps {
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleDebug: () => void;
}

export const useKeyboardShortcuts = ({
  onDelete,
  onUndo,
  onRedo,
  onToggleDebug
}: KeyboardShortcutsProps) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        onDelete();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        onRedo();
      }

      if (e.key === 'd' || e.key === 'D') {
        onToggleDebug();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDelete, onUndo, onRedo, onToggleDebug]);
};
