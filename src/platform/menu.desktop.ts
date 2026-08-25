import { Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu';
import { COMMANDS } from '../commands/commands';
import { executeCommand } from '../commands/executeCommand';
import { useSectionStore } from '../stores/sectionStore';
import { useProjectStore } from '../stores/projectStore';
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

function menuItemFor(id: CommandId, initialEnabled = true): Promise<MenuItem> {
  const command = COMMANDS[id];
  return MenuItem.new({
    id: command.id,
    text: command.label,
    accelerator: command.accelerator,
    enabled: initialEnabled,
    action: () => executeCommand(id),
  });
}

export async function setupAppMenu(): Promise<void> {
  const hasProject = (): boolean => useProjectStore.getState().project !== null;

  // Items whose enabled state tracks the stores keep their handles here
  const undoItem = await menuItemFor('edit.undo', false);
  const redoItem = await menuItemFor('edit.redo', false);
  const saveBackupItem = await menuItemFor('project.saveBackup', hasProject());
  const exportItem = await menuItemFor('project.export', hasProject());
  const todayItem = await menuItemFor('view.today', hasProject());

  const appMenu = await Submenu.new({
    text: 'FLOID',
    items: [
      await menuItemFor('help.about'),
      await separator(),
      await menuItemFor('app.settings'),
      await separator(),
      await PredefinedMenuItem.new({ item: 'Services' }),
      await separator(),
      await PredefinedMenuItem.new({ item: 'Hide' }),
      await PredefinedMenuItem.new({ item: 'HideOthers' }),
      await PredefinedMenuItem.new({ item: 'ShowAll' }),
      await separator(),
      await PredefinedMenuItem.new({ item: 'Quit' }),
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
      await menuItemFor('view.toggleLeftSidebar'),
      await menuItemFor('view.toggleInfoSidebar'),
      await separator(),
      await PredefinedMenuItem.new({ item: 'Fullscreen' }),
    ],
  });

  const helpMenu = await Submenu.new({
    text: 'Help',
    items: [await menuItemFor('help.shortcuts')],
  });

  const menu = await Menu.new({
    items: [appMenu, fileMenu, editMenu, viewMenu, helpMenu],
  });
  await menu.setAsAppMenu();

  // Enabled state follows the stores; the previous-value checks keep a busy
  // drag from spamming IPC with redundant setEnabled calls.
  let couldUndo = false;
  let couldRedo = false;
  useSectionStore.temporal.subscribe((state) => {
    const canUndo = state.pastStates.length > 0;
    const canRedo = state.futureStates.length > 0;
    if (canUndo !== couldUndo) {
      couldUndo = canUndo;
      void undoItem.setEnabled(canUndo);
    }
    if (canRedo !== couldRedo) {
      couldRedo = canRedo;
      void redoItem.setEnabled(canRedo);
    }
  });

  let hadProject = hasProject();
  useProjectStore.subscribe((state) => {
    const has = state.project !== null;
    if (has === hadProject) return;
    hadProject = has;
    for (const item of [saveBackupItem, exportItem, todayItem]) {
      void item.setEnabled(has);
    }
  });
}
