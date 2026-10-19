import { openWhatsNewOnDemand } from '../hooks/useWhatsNew';
import { useUIStore } from '../stores/uiStore';
import { useProjectStore } from '../stores/projectStore';
import { useSectionStore } from '../stores/sectionStore';
import { computeViewportBounds, isTodayInViewport } from '../utils/dateUtils';
import { downloadProjectJson } from '../utils/exportUtils';
import { importFloidText, FLOID_OPEN_FILTERS } from '../utils/importFloid';
import { holdsOwnDraft } from '../utils/keyboardTargets';
import { openFiles } from '../platform/files';
import { isDesktop } from '../platform/detect';
import { openWriteReview } from '../platform/review';
import { isGestureInFlight } from './gesture';
import { commitWithSlide } from './slideCommit';
import type { Command, CommandId } from './types';

/**
 * Every handler reads state through `getState()` at call time, so a command
 * runs the same from a React click, a DOM keydown, or a native menu item that
 * has never heard of React.
 */

const hasProject = (): boolean => useProjectStore.getState().project !== null;

/**
 * History is greyed out, not merely ignored, while a drag is in the hand: the
 * gesture is resolving its drop against the sheet as it stands, and a step
 * back in time under it would leave that drop landing on rows that no longer
 * exist. `executeCommand` holds every other command back too; these two say
 * so, so a menu built from them can show it.
 */
const canUndo = (): boolean =>
  !isGestureInFlight() && useSectionStore.temporal.getState().pastStates.length > 0;
const canRedo = (): boolean =>
  !isGestureInFlight() && useSectionStore.temporal.getState().futureStates.length > 0;

/**
 * The sheet spans its work and a month either side, so a project wholly in
 * the past or the future has no today on it to go to. Same bounds the sheet
 * is drawn from.
 */
const isTodayOnSheet = (): boolean =>
  hasProject() && isTodayInViewport(computeViewportBounds(useSectionStore.getState().sections));

export const COMMANDS: Record<CommandId, Command> = {
  'project.new': {
    id: 'project.new',
    label: 'New Project…',
    shortcutKeys: ['⌘', 'N'],
    accelerator: 'CmdOrCtrl+N',
    browserReserved: true,
    // The setup modal owns configuration; a command never creates directly
    run: () => useUIStore.getState().openProjectSetupModal(),
  },
  'project.open': {
    id: 'project.open',
    label: 'Open…',
    shortcutKeys: ['⌘', 'O'],
    accelerator: 'CmdOrCtrl+O',
    run: async () => {
      const files = await openFiles({ filters: FLOID_OPEN_FILTERS });
      for (const file of files) {
        await importFloidText(file.text, { fileName: file.name });
      }
    },
  },
  'project.saveBackup': {
    id: 'project.saveBackup',
    label: 'Save Backup',
    shortcutKeys: ['⌘', 'S'],
    accelerator: 'CmdOrCtrl+S',
    isEnabled: hasProject,
    run: async () => {
      const { project } = useProjectStore.getState();
      if (!project) return;
      const { sections, dependencies } = useSectionStore.getState();
      await downloadProjectJson(project, sections, dependencies);
    },
  },
  'project.export': {
    id: 'project.export',
    label: 'Export…',
    shortcutKeys: ['⌘', 'E'],
    accelerator: 'CmdOrCtrl+E',
    isEnabled: hasProject,
    run: () => useUIStore.getState().openExportModal(),
  },
  'schedule.add': {
    id: 'schedule.add',
    label: 'Add Schedule…',
    isEnabled: hasProject,
    run: () => useUIStore.getState().openAddScheduleModal(),
  },
  'edit.undo': {
    id: 'edit.undo',
    label: 'Undo',
    shortcutKeys: ['⌘', 'Z'],
    accelerator: 'CmdOrCtrl+Z',
    isEnabled: canUndo,
    // A step back is a move like any other: rows slide to where they were,
    // bars glide back to their old dates, and whatever returns fades in.
    run: () => {
      // On the Mac the menu takes ⌘Z before the webview sees it; inside a
      // rename the step back is the typing's, not the sheet's
      if (holdsOwnDraft(document.activeElement)) {
        document.execCommand('undo');
        return;
      }
      commitWithSlide(() => useSectionStore.temporal.getState().undo());
    },
  },
  'edit.redo': {
    id: 'edit.redo',
    label: 'Redo',
    shortcutKeys: ['⌘', '⇧', 'Z'],
    accelerator: 'Shift+CmdOrCtrl+Z',
    isEnabled: canRedo,
    run: () => {
      if (holdsOwnDraft(document.activeElement)) {
        document.execCommand('redo');
        return;
      }
      commitWithSlide(() => useSectionStore.temporal.getState().redo());
    },
  },
  'view.zoomIn': {
    id: 'view.zoomIn',
    label: 'Zoom In',
    shortcutKeys: ['⌘', '='],
    accelerator: 'CmdOrCtrl+=',
    run: () => useUIStore.getState().zoomIn(),
  },
  'view.zoomOut': {
    id: 'view.zoomOut',
    label: 'Zoom Out',
    shortcutKeys: ['⌘', '-'],
    accelerator: 'CmdOrCtrl+-',
    run: () => useUIStore.getState().zoomOut(),
  },
  'view.zoomToFit': {
    id: 'view.zoomToFit',
    label: 'Zoom to Fit',
    shortcutKeys: ['⌘', '0'],
    accelerator: 'CmdOrCtrl+0',
    isEnabled: () => useUIStore.getState().timelineViewportWidth > 0,
    run: () => useUIStore.getState().zoomToFit(),
  },
  'view.today': {
    id: 'view.today',
    label: 'Go to Today',
    shortcutKeys: ['⌘', 'T'],
    accelerator: 'CmdOrCtrl+T',
    browserReserved: true,
    isEnabled: isTodayOnSheet,
    run: () => useUIStore.getState().triggerScrollToToday(),
  },
  'view.toggleLeftSidebar': {
    id: 'view.toggleLeftSidebar',
    // The native menu flips this to Show or Hide with the sidebar's state
    label: 'Show/Hide Projects Sidebar',
    shortcutKeys: ['⌘', '1'],
    accelerator: 'CmdOrCtrl+1',
    browserReserved: true,
    run: () => useUIStore.getState().toggleLeftSidebar(),
  },
  'view.toggleInfoSidebar': {
    id: 'view.toggleInfoSidebar',
    label: 'Show/Hide Status Sidebar',
    shortcutKeys: ['⌘', '2'],
    accelerator: 'CmdOrCtrl+2',
    browserReserved: true,
    run: () => useUIStore.getState().toggleInfoSidebar(),
  },
  'app.settings': {
    id: 'app.settings',
    label: 'Settings…',
    shortcutKeys: ['⌘', ','],
    accelerator: 'CmdOrCtrl+,',
    browserReserved: true,
    run: () => useUIStore.getState().openSettingsModal(),
  },
  'help.shortcuts': {
    id: 'help.shortcuts',
    label: 'Keyboard Shortcuts',
    run: () => useUIStore.getState().openKeyboardHelpModal(),
  },
  'help.whatsNew': {
    id: 'help.whatsNew',
    label: 'What’s New',
    run: () => openWhatsNewOnDemand(),
  },
  'help.about': {
    id: 'help.about',
    label: 'About FLOID',
    run: () => useUIStore.getState().openAboutModal(),
  },
  'help.rate': {
    id: 'help.rate',
    label: 'Rate FLOID…',
    // Only the App Store build has a listing to rate
    isEnabled: isDesktop,
    run: () => openWriteReview(),
  },
};
