import type { LaunchMode, FileNode } from '../api/types';

export type ViewMode = 'inline' | 'split';
export type ThemeOverride = 'auto' | 'light' | 'dark';
export type SaveState = 'saved' | 'unsaved' | 'saving' | 'saveFailed';
export type SSEStatus = 'connecting' | 'connected' | 'reconnecting';

export interface ConflictState {
  diskContent: string;
}

export interface AppState {
  config: LaunchMode | null;
  fileTree: FileNode[] | null;
  currentFile: string | null;
  loadedContent: string | null;     // last-loaded-from-disk content for the current file
  viewMode: ViewMode;
  theme: ThemeOverride;
  saveState: SaveState;
  sseStatus: SSEStatus;
  conflict: ConflictState | null;
  sidebarCollapsed: boolean;
}

export const initialAppState: AppState = {
  config: null,
  fileTree: null,
  currentFile: null,
  loadedContent: null,
  viewMode: 'inline',
  theme: 'auto',
  saveState: 'saved',
  sseStatus: 'connecting',
  conflict: null,
  sidebarCollapsed: false,
};
