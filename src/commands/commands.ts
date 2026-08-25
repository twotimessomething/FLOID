import { useUIStore } from '../stores/uiStore';
import { useProjectStore } from '../stores/projectStore';
import { useSectionStore } from '../stores/sectionStore';
import { downloadProjectJson } from '../utils/exportUtils';
import { importFloidText, FLOID_OPEN_FILTERS } from '../utils/importFloid';
import { openFiles } from '../platform/files';
import type { Command, CommandId } from './types';

/**
 * Every handler reads state through `getState()` at call time, so a command
 * runs the same from a React click, a DOM keydown, or a native menu item that
 * has never heard of React.
 */

const hasProject = (): boolean => useProjectStore.getState().project !== null;

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
        await importFloidText(file.text);
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
    isEnabled: () => useSectionStore.temporal.getState().pastStates.length > 0,
    run: () => useSectionStore.temporal.getState().undo(),
  },
  'edit.redo': {
    id: 'edit.redo',
    label: 'Redo',
    shortcutKeys: ['⌘', '⇧', 'Z'],
    accelerator: 'Shift+CmdOrCtrl+Z',
    isEnabled: () => useSectionStore.temporal.getState().futureStates.length > 0,
    run: () => useSectionStore.temporal.getState().redo(),
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
    isEnabled: hasProject,
    run: () => useUIStore.getState().triggerScrollToToday(),
  },
  'view.toggleLeftSidebar': {
    id: 'view.toggleLeftSidebar',
    label: 'Toggle Projects Sidebar',
    shortcutKeys: ['⌘', '1'],
    accelerator: 'CmdOrCtrl+1',
    browserReserved: true,
    run: () => useUIStore.getState().toggleLeftSidebar(),
  },
  'view.toggleInfoSidebar': {
    id: 'view.toggleInfoSidebar',
    label: 'Toggle Info Sidebar',
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
  'help.about': {
    id: 'help.about',
    label: 'About FLOID',
    run: () => useUIStore.getState().openAboutModal(),
  },
};
