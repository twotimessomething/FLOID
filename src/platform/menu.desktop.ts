import { Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu';
import { COMMANDS } from '../commands/commands';
import { executeCommand } from '../commands/executeCommand';
import { useSectionStore } from '../stores/sectionStore';
import { useUIStore } from '../stores/uiStore';
import { useProjectStore } from '../stores/projectStore';
import { quitAfterSaving } from './session.desktop';
import type { CommandId } from '../commands/types';

/**
 * The macOS menu bar, defined in TypeScript beside the command registry so a
 * menu item, its accelerator, and the keydown path can never disagree. On
 * desktop the menu owns the accelerators — macOS offers key equivalents to
 * the menu before the webview sees them, and `useKeyboardShortcuts` stands
 * down behind `isDesktop()`.
 */

const separator = (): Promise<PredefinedMenuItem> =>
  PredefinedMenuItem.new({ item: 'Separator' });

function menuItemFor(
  id: CommandId,
  initialEnabled = true,
  text: string = COMMANDS[id].label
): Promise<MenuItem> {
  const command = COMMANDS[id];
  return MenuItem.new({
    id: command.id,
    text,
    accelerator: command.accelerator,
    enabled: initialEnabled,
    action: () => executeCommand(id),
  });
}

/** A toggle names what it will do: Show while the sidebar is away, Hide while it is out. */
const sidebarText = (name: string, isOpen: boolean): string =>
  `${isOpen ? 'Hide' : 'Show'} ${name} Sidebar`;

export async function setupAppMenu(): Promise<void> {
  const hasProject = (): boolean => useProjectStore.getState().project !== null;
  const ui = useUIStore.getState();

  // Items whose enabled state or text tracks the stores keep their handles here
  const undoItem = await menuItemFor('edit.undo', false);
  const redoItem = await menuItemFor('edit.redo', false);
  const saveBackupItem = await menuItemFor('project.saveBackup', hasProject());
  const exportItem = await menuItemFor('project.export', hasProject());
  const canGoToday = (): boolean => COMMANDS['view.today'].isEnabled?.() ?? true;
  const todayItem = await menuItemFor('view.today', canGoToday());
  const projectsSidebarItem = await menuItemFor(
    'view.toggleLeftSidebar',
    true,
    sidebarText('Projects', ui.isLeftSidebarOpen)
  );
  const statusSidebarItem = await menuItemFor(
    'view.toggleInfoSidebar',
    true,
    sidebarText('Status', ui.isInfoSidebarOpen)
  );

  const appMenu = await Submenu.new({
    text: 'FLOID',
    items: [
      await menuItemFor('help.about'),
      await menuItemFor('help.whatsNew'),
      await menuItemFor('help.rate'),
      await separator(),
      await menuItemFor('app.settings'),
      await separator(),
      await PredefinedMenuItem.new({ item: 'Services' }),
      await separator(),
      await PredefinedMenuItem.new({ item: 'Hide' }),
      await PredefinedMenuItem.new({ item: 'HideOthers' }),
      await PredefinedMenuItem.new({ item: 'ShowAll' }),
      await separator(),
      // Not the predefined Quit: that one terminates before the last edits
      // are written. This one saves, then quits.
      await MenuItem.new({
        id: 'app.quit',
        text: 'Quit FLOID',
        accelerator: 'CmdOrCtrl+Q',
        action: () => {
          void quitAfterSaving();
        },
      }),
    ],
  });

  const fileMenu = await Submenu.new({
    text: 'File',
    items: [
      await menuItemFor('project.new'),
      await menuItemFor('project.open'),
      await separator(),
      saveBackupItem,
      exportItem,
      await separator(),
      await PredefinedMenuItem.new({ item: 'CloseWindow' }),
    ],
  });

  // Cut/Copy/Paste/SelectAll must be predefined items: without them the
  // system clipboard is unreachable from text inputs in a WKWebView.
  const editMenu = await Submenu.new({
    text: 'Edit',
    items: [
      undoItem,
      redoItem,
      await separator(),
      await PredefinedMenuItem.new({ item: 'Cut' }),
      await PredefinedMenuItem.new({ item: 'Copy' }),
      await PredefinedMenuItem.new({ item: 'Paste' }),
      await PredefinedMenuItem.new({ item: 'SelectAll' }),
    ],
  });

  const viewMenu = await Submenu.new({
    text: 'View',
    items: [
      await menuItemFor('view.zoomIn'),
      await menuItemFor('view.zoomOut'),
      await menuItemFor('view.zoomToFit'),
      todayItem,
      await separator(),
      projectsSidebarItem,
      statusSidebarItem,
      await separator(),
      await PredefinedMenuItem.new({ item: 'Fullscreen' }),
    ],
  });

  // Minimize (⌘M) and Zoom only exist where a Window menu holds them, and
  // AppKit lists the open windows in whichever menu it was told is this one.
  const windowMenu = await Submenu.new({
    text: 'Window',
    items: [
      await PredefinedMenuItem.new({ item: 'Minimize' }),
      await PredefinedMenuItem.new({ item: 'Maximize' }),
      await separator(),
      await PredefinedMenuItem.new({ item: 'BringAllToFront' }),
    ],
  });

  const helpMenu = await Submenu.new({
    text: 'Help',
    items: [await menuItemFor('help.shortcuts')],
  });

  const menu = await Menu.new({
    items: [appMenu, fileMenu, editMenu, viewMenu, windowMenu, helpMenu],
  });
  await menu.setAsAppMenu();
  await windowMenu.setAsWindowsMenuForNSApp();
  // The Help menu, so told, also carries the system's own search field
  await helpMenu.setAsHelpMenuForNSApp();

  // Enabled state follows the stores; the previous-value checks keep a busy
  // drag from spamming IPC with redundant setEnabled calls.
  let couldUndo = false;
  let couldRedo = false;
  // The registry decides — it also says no while a drag holds the sheet, so
  // the menu greys out for the length of the gesture rather than offering an
  // undo that would rewind what the hand is still holding.
  const refreshHistory = (): void => {
    const canUndo = COMMANDS['edit.undo'].isEnabled?.() ?? true;
    const canRedo = COMMANDS['edit.redo'].isEnabled?.() ?? true;
    if (canUndo !== couldUndo) {
      couldUndo = canUndo;
      void undoItem.setEnabled(canUndo);
    }
    if (canRedo !== couldRedo) {
      couldRedo = canRedo;
      void redoItem.setEnabled(canRedo);
    }
  };
  useSectionStore.temporal.subscribe(refreshHistory);
  useUIStore.subscribe(refreshHistory);

  let wasProjectsOpen = ui.isLeftSidebarOpen;
  let wasStatusOpen = ui.isInfoSidebarOpen;
  useUIStore.subscribe((state) => {
    if (state.isLeftSidebarOpen !== wasProjectsOpen) {
      wasProjectsOpen = state.isLeftSidebarOpen;
      void projectsSidebarItem.setText(sidebarText('Projects', wasProjectsOpen));
    }
    if (state.isInfoSidebarOpen !== wasStatusOpen) {
      wasStatusOpen = state.isInfoSidebarOpen;
      void statusSidebarItem.setText(sidebarText('Status', wasStatusOpen));
    }
  });

  let hadProject = hasProject();
  useProjectStore.subscribe((state) => {
    const has = state.project !== null;
    if (has === hadProject) return;
    hadProject = has;
    for (const item of [saveBackupItem, exportItem]) {
      void item.setEnabled(has);
    }
  });

  // Today needs a project *and* today on its sheet — a project wholly in the
  // past or future has nowhere to go — so it follows the schedules as well
  let couldGoToday = canGoToday();
  const refreshToday = (): void => {
    const can = canGoToday();
    if (can === couldGoToday) return;
    couldGoToday = can;
    void todayItem.setEnabled(can);
  };
  useSectionStore.subscribe(refreshToday);
  useProjectStore.subscribe(refreshToday);
}
