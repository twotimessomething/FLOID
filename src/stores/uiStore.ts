import { create } from 'zustand';
import type { ZoomLevel, SelectionState, ModalPosition, ImportAnalysis, ImportModalType } from '../types';

// Label column constraints
const MIN_LABEL_WIDTH = 120;
const MAX_LABEL_WIDTH = 400;
const DEFAULT_LABEL_WIDTH = 200;

// Info sidebar constraints
const MIN_INFO_SIDEBAR_WIDTH = 180;
const MAX_INFO_SIDEBAR_WIDTH = 400;
const DEFAULT_INFO_SIDEBAR_WIDTH = 224; // w-56 = 14rem = 224px

// Context menu state
export interface ContextMenuState {
  isOpen: boolean;
  position: ModalPosition;
  targetType: SelectionState['type'];
  targetId: string | null;
  sectionId: string | null;
  phaseId: string | null;
}

// Toast state
export type ToastType = 'success' | 'error' | 'warning';

export interface ToastState {
  isVisible: boolean;
  type: ToastType;
  message: string;
  duration: number;
}

// Import modal state
export interface UIImportModalState {
  isOpen: boolean;
  type: ImportModalType | null;
  analysis: ImportAnalysis | null;
}

interface UIState {
  // Zoom
  zoomLevel: ZoomLevel;
  setZoomLevel: (level: ZoomLevel) => void;

  // Selection (with parent context for O(1) lookups)
  selection: SelectionState;
  selectItem: (
    type: SelectionState['type'],
    id: string | null,
    sectionId: string | null,
    phaseId?: string | null,
    position?: ModalPosition
  ) => void;
  clearSelection: () => void;

  // Drag state
  isDragging: boolean;
  dragType: 'resize-start' | 'resize-end' | 'move' | null;
  setDragging: (isDragging: boolean, dragType?: 'resize-start' | 'resize-end' | 'move' | null) => void;

  // Playhead (scrubber)
  playheadPosition: number | null;
  playheadY: number | null;
  setPlayheadPosition: (position: number | null, y?: number | null) => void;

  // Editor modal
  isModalOpen: boolean;
  closeModal: () => void;

  // Left sidebar (project/teams panel)
  isLeftSidebarOpen: boolean;
  toggleLeftSidebar: () => void;

  // Info sidebar (right)
  isInfoSidebarOpen: boolean;
  toggleInfoSidebar: () => void;
  infoSidebarWidth: number;
  setInfoSidebarWidth: (width: number) => void;

  // Project setup modal
  isProjectSetupModalOpen: boolean;
  openProjectSetupModal: () => void;
  closeProjectSetupModal: () => void;

  // Project edit modal
  editingProjectId: string | null;
  openProjectEditModal: (projectId: string) => void;
  closeProjectEditModal: () => void;

  // Label column width
  labelColumnWidth: number;
  setLabelColumnWidth: (width: number) => void;

  // Scroll to today trigger (incremented to trigger scroll)
  scrollToTodayTrigger: number;
  triggerScrollToToday: () => void;

  // Add schedule modal
  isAddScheduleModalOpen: boolean;
  openAddScheduleModal: () => void;
  closeAddScheduleModal: () => void;

  // Context menu
  contextMenu: ContextMenuState;
  openContextMenu: (
    position: ModalPosition,
    targetType: SelectionState['type'],
    targetId: string | null,
    sectionId: string | null,
    phaseId?: string | null
  ) => void;
  closeContextMenu: () => void;

  // Toast notifications
  toast: ToastState;
  showToast: (type: ToastType, message: string, duration?: number) => void;
  hideToast: () => void;

  // Import modal
  importModal: UIImportModalState;
  openImportModal: (
    type: ImportModalType,
    analysis: ImportAnalysis
  ) => void;
  closeImportModal: () => void;

  // File drag state for drop zone
  isDraggingFile: boolean;
  setDraggingFile: (isDragging: boolean) => void;

  // Settings modal
  isSettingsModalOpen: boolean;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Zoom
  zoomLevel: 'month',
  setZoomLevel: (level) => set({ zoomLevel: level }),

  // Selection
  selection: { type: null, id: null, sectionId: null, phaseId: null },
  selectItem: (type, id, sectionId, phaseId = null, position) =>
    set({
      selection: { type, id, sectionId, phaseId, position },
      isModalOpen: type !== null,
    }),
  clearSelection: () =>
    set({
      selection: { type: null, id: null, sectionId: null, phaseId: null },
    }),

  // Drag state
  isDragging: false,
  dragType: null,
  setDragging: (isDragging, dragType = null) =>
    set({ isDragging, dragType }),

  // Playhead
  playheadPosition: null,
  playheadY: null,
  setPlayheadPosition: (position, y = null) => set({ playheadPosition: position, playheadY: y }),

  // Editor modal
  isModalOpen: false,
  closeModal: () =>
    set({
      isModalOpen: false,
      selection: { type: null, id: null, sectionId: null, phaseId: null },
    }),

  // Left sidebar
  isLeftSidebarOpen: true,
  toggleLeftSidebar: () =>
    set((state) => ({ isLeftSidebarOpen: !state.isLeftSidebarOpen })),

  // Info sidebar (right)
  isInfoSidebarOpen: true,
  toggleInfoSidebar: () =>
    set((state) => ({ isInfoSidebarOpen: !state.isInfoSidebarOpen })),
  infoSidebarWidth: DEFAULT_INFO_SIDEBAR_WIDTH,
  setInfoSidebarWidth: (width) =>
    set({ infoSidebarWidth: Math.max(MIN_INFO_SIDEBAR_WIDTH, Math.min(MAX_INFO_SIDEBAR_WIDTH, width)) }),

  // Project setup modal
  isProjectSetupModalOpen: false,
  openProjectSetupModal: () => set({ isProjectSetupModalOpen: true }),
  closeProjectSetupModal: () => set({ isProjectSetupModalOpen: false }),

  // Project edit modal
  editingProjectId: null,
  openProjectEditModal: (projectId) => set({ editingProjectId: projectId }),
  closeProjectEditModal: () => set({ editingProjectId: null }),

  // Label column width
  labelColumnWidth: DEFAULT_LABEL_WIDTH,
  setLabelColumnWidth: (width) =>
    set({ labelColumnWidth: Math.max(MIN_LABEL_WIDTH, Math.min(MAX_LABEL_WIDTH, width)) }),

  // Scroll to today
  scrollToTodayTrigger: 0,
  triggerScrollToToday: () =>
    set((state) => ({ scrollToTodayTrigger: state.scrollToTodayTrigger + 1 })),

  // Add schedule modal
  isAddScheduleModalOpen: false,
  openAddScheduleModal: () => set({ isAddScheduleModalOpen: true }),
  closeAddScheduleModal: () => set({ isAddScheduleModalOpen: false }),

  // Context menu
  contextMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    targetType: null,
    targetId: null,
    sectionId: null,
    phaseId: null,
  },
  openContextMenu: (position, targetType, targetId, sectionId, phaseId = null) =>
    set({
      contextMenu: {
        isOpen: true,
        position,
        targetType,
        targetId,
        sectionId,
        phaseId,
      },
    }),
  closeContextMenu: () =>
    set((state) => ({
      contextMenu: {
        ...state.contextMenu,
        isOpen: false,
      },
    })),

  // Toast notifications
  toast: {
    isVisible: false,
    type: 'success' as ToastType,
    message: '',
    duration: 3000,
  },
  showToast: (type, message, duration = 3000) =>
    set({
      toast: {
        isVisible: true,
        type,
        message,
        duration,
      },
    }),
  hideToast: () =>
    set((state) => ({
      toast: {
        ...state.toast,
        isVisible: false,
      },
    })),

  // Import modal
  importModal: {
    isOpen: false,
    type: null,
    analysis: null,
  },
  openImportModal: (type, analysis) =>
    set({
      importModal: {
        isOpen: true,
        type,
        analysis,
      },
    }),
  closeImportModal: () =>
    set({
      importModal: {
        isOpen: false,
        type: null,
        analysis: null,
      },
    }),

  // File drag state
  isDraggingFile: false,
  setDraggingFile: (isDragging) => set({ isDraggingFile: isDragging }),

  // Settings modal
  isSettingsModalOpen: false,
  openSettingsModal: () => set({ isSettingsModalOpen: true }),
  closeSettingsModal: () => set({ isSettingsModalOpen: false }),
}));
