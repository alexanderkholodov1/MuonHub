import { test as base, expect, type ConsoleMessage, type Page } from "@playwright/test";
import { t } from "../src/i18n/t";
import { readState, type SeedState } from "./state";

export const test = base.extend<{ seed: SeedState }>({
  // Playwright requires destructuring even when a fixture has no dependencies.
  // eslint-disable-next-line no-empty-pattern
  seed: async ({}, use) => {
    await use(readState());
  },
  // Every test uses this page, with listeners attached before its first navigation.
  page: async ({ page }, use) => {
    const errors: string[] = [];
    const onConsole = (message: ConsoleMessage): void => {
      if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
    };
    const onPageError = (error: Error): void => {
      errors.push(`pageerror: ${error.message}`);
    };
    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    try {
      await use(page);
    } finally {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      expect(errors, "The page must not emit console errors or uncaught exceptions").toEqual([]);
    }
  },
});

export { expect };

export async function signIn(page: Page, account: SeedState["owner"]): Promise<void> {
  await page.getByRole("textbox", { name: t("auth.email"), exact: true }).fill(account.email);
  await page.getByLabel(t("auth.password"), { exact: true }).fill(account.password);
  await page.getByRole("button", { name: t("nav.signIn"), exact: true }).click();
}

export async function openAsOwner(page: Page, seed: SeedState, path: string): Promise<void> {
  await page.goto(`/signin?next=${encodeURIComponent(path)}`);
  await signIn(page, seed.owner);
  await expect(page).toHaveURL(path);
}
