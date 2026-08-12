import type { Locator, Page } from 'playwright';

const embeddingPromptDismissedPages = new WeakSet<Page>();

export function appShell(page: Page): Locator {
  return page.locator('body[data-boot-settled="1"] > #root');
}

export function settingsButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Settings', exact: true });
}

export function folderButton(page: Page, name: string): Locator {
  return page.locator('#sidebar-files-section').getByRole('button', { name, exact: true });
}

export async function ensureLibraryExpanded(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Library', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.locator('#sidebar-files-section').waitFor({ state: 'visible' });
}

export function fileTreeRow(page: Page, relativePath: string): Locator {
  return page.locator(`[role="treeitem"][data-path=${JSON.stringify(relativePath)}]`);
}

export function activeFileTreeRow(page: Page, relativePath: string): Locator {
  return fileTreeRow(page, relativePath).filter({ visible: true });
}

export function documentTab(page: Page, relativePath: string): Locator {
  return page.locator(`[role="tab"][title=${JSON.stringify(relativePath)}]`);
}

export function activeDocumentTab(page: Page): Locator {
  return page
    .getByRole('tablist', { name: 'Open documents' })
    .getByRole('tab', { selected: true });
}

export function activeDocument(page: Page): Locator {
  return page.getByRole('tabpanel').getByRole('region', { name: /Markdown document$/ });
}

export function activeMarkdownEditor(page: Page): Locator {
  return activeDocument(page).locator('[contenteditable="true"]');
}

export function renameInput(page: Page, relativePath: string): Locator {
  return fileTreeRow(page, relativePath).locator('input[type="text"]');
}

export function quickOpenDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Quick Open' });
}

export function quickOpenInput(page: Page): Locator {
  return quickOpenDialog(page).getByRole('combobox');
}

export function settingsDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Settings' });
}

export function settingsTab(page: Page, name: string): Locator {
  return settingsDialog(page).getByRole('tab', { name, exact: true });
}

export function appearanceGroup(page: Page, name: string): Locator {
  return settingsDialog(page).getByRole('group', { name, exact: true });
}

export function appearanceChoice(page: Page, groupName: string, choice: string): Locator {
  return appearanceGroup(page, groupName).getByRole('button', { name: choice, exact: true });
}

export function saveStatus(page: Page): Locator {
  return page.locator('main.main').getByText('Saved', { exact: true });
}

export async function dismissEmbeddingKeyPrompt(page: Page): Promise<void> {
  if (embeddingPromptDismissedPages.has(page)) return;
  const skip = page.getByRole('button', { name: 'Skip AI Index for now', exact: true });
  await skip.waitFor({ state: 'visible', timeout: 10_000 });
  await skip.click();
  await skip.waitFor({ state: 'hidden' });
  embeddingPromptDismissedPages.add(page);
}
