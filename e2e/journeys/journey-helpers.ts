import type { ElectronApplication, Page } from 'playwright';

export const primaryKey = process.platform === 'darwin' ? 'Meta' : 'Control';

export async function openFolderPickerMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add folder to library' }).click();
  await page.getByRole('menuitem', { name: 'Open Folder…' }).click();
}

export async function stubOpenFolderDialog(
  electron: ElectronApplication,
  result: { kind: 'success'; path: string } | { kind: 'cancel' } | { kind: 'error'; message: string },
): Promise<void> {
  await electron.evaluate(({ dialog }, next) => {
    dialog.showOpenDialog = async () => {
      if (next.kind === 'error') throw new Error(next.message);
      if (next.kind === 'cancel') return { canceled: true, filePaths: [] };
      return { canceled: false, filePaths: [next.path] };
    };
  }, result);
}

export async function stubExternalBrowser(electron: ElectronApplication): Promise<void> {
  await electron.evaluate(({ shell }) => {
    (globalThis as { __stashbaseOpenedExternal?: string[] }).__stashbaseOpenedExternal = [];
    shell.openExternal = async (url: string) => {
      (globalThis as { __stashbaseOpenedExternal?: string[] }).__stashbaseOpenedExternal?.push(url);
    };
  });
}

export async function openedExternalUrls(electron: ElectronApplication): Promise<string[]> {
  return electron.evaluate(() => (
    (globalThis as { __stashbaseOpenedExternal?: string[] }).__stashbaseOpenedExternal ?? []
  ));
}
