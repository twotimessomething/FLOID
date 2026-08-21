import { create } from 'zustand';
import type {
  ZoomLevel,
  SelectionState,
  ModalPosition,
  ImportAnalysis,
  ImportModalType,
  ItemKind,
} from '../types';

// Theme mode
export type ThemeMode = 'light' | 'dark' | 'system';

// Label column constraints
const MIN_LABEL_WIDTH = 120;
const MAX_LABEL_WIDTH = 400;
const DEFAULT_LABEL_WIDTH = 248;

// Info sidebar constraints
const MIN_INFO_SIDEBAR_WIDTH = 180;
const MAX_INFO_SIDEBAR_WIDTH = 400;
const DEFAULT_INFO_SIDEBAR_WIDTH = 224; // w-56 = 14rem = 224px

// Context menu state
/**
 * Where the menu was opened from. `bar` is an item's bar, `row` the empty space
 * beside it, `header` a schedule's milestone row, `label` the labels column.
 */
export type ContextMenuLocation = 'label' | 'bar' | 'row' | 'header';

export interface ContextMenuState {
  isOpen: boolean;
  position: ModalPosition;
  targetType: SelectionState['type'];
  /** The item, or the schedule when targetType is 'section'. */
  targetId: string | null;
  sectionId: string | null;
  location: ContextMenuLocation;
  /** Day the pointer was over, so "add here" lands where the user clicked. */
  clickDay?: string;
}

/**
 * Live drag state, deliberately coarse.
 *
 * Pointer position and the running day delta are NOT here — those change on
 * every mousemove and are written straight to the preview element's transform.
 * Only values that change a handful of times per drag live in the store, so a
 * drag re-renders a couple of rows instead of the whole timeline.
 */
export interface ItemDragState {
  isActive: boolean;
  itemId: string | null;
  sectionId: string | null;
  kind: ItemKind | null;
  /** `dropTargetKey` of the resolved target; rows compare against their own. */
  dropKey: string | null;
}

const IDLE_ITEM_DRAG: ItemDragState = {
  isActive: false,
  itemId: null,
  sectionId: null,
  kind: null,
  dropKey: null,
};

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

// Confirm dialog state
export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: 'danger' | 'warning' | 'default';
  onConfirm: (() => void) | null;
  onCancel: (() => void) | null;
}

/**
 * Selecting without opening the editor.
 *
 * The outline is free — it can be painted the instant a press lands, because
 * nothing about it is ambiguous. The editor is what has to wait out a possible
 * double-click, so it is the only half that takes an option.
 */
export interface SelectOptions {
  readonly openEditor?: boolean;
}

interface UIState {
  // Zoom
  zoomLevel: ZoomLevel;
  setZoomLevel: (level: ZoomLevel) => void;
  /** Scale of a fitted view, off the named levels. Null while a level is picked. */
  fitPixelsPerDay: number | null;
  setFitPixelsPerDay: (pixelsPerDay: number | null) => void;
  /** Width available to draw the sheet, measured from the scroll container. */
  timelineViewportWidth: number;
  setTimelineViewportWidth: (width: number) => void;

  // Selection — an item id plus the schedule it lives in
  selection: SelectionState;
  selectItem: (
    itemId: string,
    sectionId: string,
    position?: ModalPosition,
    options?: SelectOptions
  ) => void;
  selectSection: (
    sectionId: string,
    position?: ModalPosition,
    options?: SelectOptions
  ) => void;
  clearSelection: () => void;

  // Drag state
  isDragging: boolean;
  dragType: 'resize-start' | 'resize-end' | 'move' | 'draw' | null;
  setDragging: (isDragging: boolean, dragType?: 'resize-start' | 'resize-end' | 'move' | 'draw' | null) => void;

  // Item drag (move / re-parent)
  itemDrag: ItemDragState;
  beginItemDrag: (itemId: string, sectionId: string, kind: ItemKind) => void;
  setItemDropKey: (dropKey: string | null) => void;
  endItemDrag: () => void;

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
  openContextMenu: (options: {
    position: ModalPosition;
    targetType: SelectionState['type'];
    targetId: string | null;
    sectionId: string | null;
    location?: ContextMenuLocation;
    clickDay?: string;
  }) => void;
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

  // Export modal
  isExportModalOpen: boolean;
  /**
   * The project the modal is scoped to, or null for the active project.
   * A scoped modal exports that project without switching to it, and hides
   * the "every project" mode, which means nothing once a project is named.
   */
  exportModalProjectId: string | null;
  openExportModal: (projectId?: string) => void;
  closeExportModal: () => void;

  // Keyboard help modal
  isKeyboardHelpModalOpen: boolean;
  openKeyboardHelpModal: () => void;
  closeKeyboardHelpModal: () => void;

  // Theme
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;

  // Confirm dialog
  confirmDialog: ConfirmDialogState;
  openConfirmDialog: (options: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'warning' | 'default';
    onConfirm: () => void;
    onCancel?: () => void;
  }) => void;
  closeConfirmDialog: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Zoom
  zoomLevel: 'month',
  setZoomLevel: (level) => set({ zoomLevel: level, fitPixelsPerDay: null }),
  fitPixelsPerDay: null,
  setFitPixelsPerDay: (pixelsPerDay) => set({ fitPixelsPerDay: pixelsPerDay }),
  timelineViewportWidth: 0,
  setTimelineViewportWidth: (width) =>
    set((state) => (state.timelineViewportWidth === width ? state : { timelineViewportWidth: width })),

  // Selection
  selection: { type: null, id: null, sectionId: null },
  selectItem: (itemId, sectionId, position, options) =>
    set({
      selection: { type: 'item', id: itemId, sectionId, position },
      isModalOpen: options?.openEditor ?? true,
    }),
  selectSection: (sectionId, position, options) =>
    set({
      selection: { type: 'section', id: sectionId, sectionId, position },
      isModalOpen: options?.openEditor ?? true,
    }),
  clearSelection: () =>
    set({ selection: { type: null, id: null, sectionId: null }, isModalOpen: false }),

  // Drag state
  isDragging: false,
  dragType: null,
  setDragging: (isDragging, dragType = null) =>
    set({ isDragging, dragType }),

  // Item drag
  itemDrag: IDLE_ITEM_DRAG,
  beginItemDrag: (itemId, sectionId, kind) =>
    set({ itemDrag: { isActive: true, itemId, sectionId, kind, dropKey: null } }),
  setItemDropKey: (dropKey) =>
    set((state) =>
      state.itemDrag.dropKey === dropKey
        ? state
        : { itemDrag: { ...state.itemDrag, dropKey } }
    ),
  endItemDrag: () => set({ itemDrag: IDLE_ITEM_DRAG }),

  // Playhead
  playheadPosition: null,
  playheadY: null,
  setPlayheadPosition: (position, y = null) => set({ playheadPosition: position, playheadY: y }),

  // Editor modal
  isModalOpen: false,
  closeModal: () =>
    set({ isModalOpen: false, selection: { type: null, id: null, sectionId: null } }),

  // Left sidebar
  isLeftSidebarOpen: false,
  toggleLeftSidebar: () =>
    set((state) => ({ isLeftSidebarOpen: !state.isLeftSidebarOpen })),

  // Info sidebar (right)
  isInfoSidebarOpen: false,
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
    location: 'label',
  },
  openContextMenu: ({ position, targetType, targetId, sectionId, location = 'label', clickDay }) =>
    set({
      contextMenu: { isOpen: true, position, targetType, targetId, sectionId, location, clickDay },
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

  // Export modal
  isExportModalOpen: false,
  exportModalProjectId: null,
  openExportModal: (projectId) =>
    set({ isExportModalOpen: true, exportModalProjectId: projectId ?? null }),
  // The scope outlives the close: clearing it here would re-label the panel
  // mid-exit. Every open sets it, so a closed modal's leftover id is inert.
  closeExportModal: () => set({ isExportModalOpen: false }),

  // Keyboard help modal
  isKeyboardHelpModalOpen: false,
  openKeyboardHelpModal: () => set({ isKeyboardHelpModalOpen: true }),
  closeKeyboardHelpModal: () => set({ isKeyboardHelpModalOpen: false }),

  // Theme
  theme: 'system',
  setTheme: (theme) => set({ theme }),

  // Confirm dialog
  confirmDialog: {
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    variant: 'default',
    onConfirm: null,
    onCancel: null,
  },
  openConfirmDialog: ({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'default', onConfirm, onCancel }) =>
    set({
      confirmDialog: {
        isOpen: true,
        title,
        message,
        confirmLabel,
        cancelLabel,
        variant,
        onConfirm,
        onCancel: onCancel || null,
      },
    }),
  closeConfirmDialog: () =>
    set((state) => ({
      confirmDialog: {
        ...state.confirmDialog,
        isOpen: false,
        onConfirm: null,
        onCancel: null,
      },
    })),
}));
