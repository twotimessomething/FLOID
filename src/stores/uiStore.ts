import { create } from 'zustand';
import type { ZoomLevel, SelectionState, ModalPosition } from '../types';

interface UIState {
  // Zoom
  zoomLevel: ZoomLevel;
  setZoomLevel: (level: ZoomLevel) => void;

  // Selection
  selection: SelectionState;
  setSelection: (selection: SelectionState, position?: ModalPosition) => void;
  clearSelection: () => void;

  // Drag state
  isDragging: boolean;
  dragType: 'resize-start' | 'resize-end' | 'move' | null;
  setDragging: (isDragging: boolean, dragType?: 'resize-start' | 'resize-end' | 'move' | null) => void;

  // Playhead (scrubber)
  playheadPosition: number | null;
  setPlayheadPosition: (position: number | null) => void;

  // Editor modal
  isModalOpen: boolean;
  closeModal: () => void;

  // Industrial Design timeline collapse
  isIDTimelineCollapsed: boolean;
  toggleIDTimelineCollapse: () => void;

  // Left sidebar (project/teams panel)
  isLeftSidebarOpen: boolean;
  toggleLeftSidebar: () => void;

  // Project setup modal
  isProjectSetupModalOpen: boolean;
  openProjectSetupModal: () => void;
  closeProjectSetupModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Zoom
  zoomLevel: 'month',
  setZoomLevel: (level) => set({ zoomLevel: level }),

  // Selection
  selection: { type: null, id: null },
  setSelection: (selection, position) =>
    set({
      selection: { ...selection, position },
      isModalOpen: selection.type !== null,
    }),
  clearSelection: () =>
    set({
      selection: { type: null, id: null },
    }),

  // Drag state
  isDragging: false,
  dragType: null,
  setDragging: (isDragging, dragType = null) =>
    set({ isDragging, dragType }),

  // Playhead
  playheadPosition: null,
  setPlayheadPosition: (position) => set({ playheadPosition: position }),

  // Editor modal
  isModalOpen: false,
  closeModal: () =>
    set({
      isModalOpen: false,
      selection: { type: null, id: null },
    }),

  // Industrial Design timeline collapse
  isIDTimelineCollapsed: false,
  toggleIDTimelineCollapse: () =>
    set((state) => ({ isIDTimelineCollapsed: !state.isIDTimelineCollapsed })),

  // Left sidebar
  isLeftSidebarOpen: true,
  toggleLeftSidebar: () =>
    set((state) => ({ isLeftSidebarOpen: !state.isLeftSidebarOpen })),

  // Project setup modal
  isProjectSetupModalOpen: false,
  openProjectSetupModal: () => set({ isProjectSetupModalOpen: true }),
  closeProjectSetupModal: () => set({ isProjectSetupModalOpen: false }),
}));
