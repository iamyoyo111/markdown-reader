import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDir = path.resolve("artifacts");
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
});

const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
desktop.on("pageerror", (error) => pageErrors.push(error.message));
await desktop.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
await desktop.screenshot({
  path: path.join(outputDir, "desktop.png"),
  fullPage: true,
});

const paragraph = desktop.locator(".markdown-body p").nth(1);
await paragraph.click({
  button: "right",
  position: { x: 120, y: 22 },
});
await desktop.locator(".context-menu").waitFor();
await desktop.waitForTimeout(180);
await desktop.screenshot({
  path: path.join(outputDir, "context-menu.png"),
  fullPage: false,
});

let dictionarySource = "not opened";
let dictionaryCounts = null;
const dictionaryItem = desktop.getByRole("menuitem", { name: /查询字典/ });
if (await dictionaryItem.isEnabled()) {
  await dictionaryItem.click();
  await desktop.locator(".dictionary-drawer").waitFor();
  await desktop.locator(".meanings").waitFor({ timeout: 10000 });
  dictionarySource = await desktop
    .locator(".dictionary-source")
    .innerText();
  dictionaryCounts = {
    translations: await desktop.locator(".translation-panel li").count(),
    englishMeanings: await desktop.locator(".meaning-title").count(),
    bilingualExamples: await desktop.locator(".example-card").count(),
  };
  await desktop.screenshot({
    path: path.join(outputDir, "dictionary.png"),
    fullPage: false,
  });
}

await desktop.getByRole("button", { name: "关闭词典" }).click();
await paragraph.click({
  button: "right",
  position: { x: 120, y: 22 },
});
await desktop
  .getByRole("menuitem", { name: /朗读当前段落/ })
  .click();
await desktop.locator(".speech-dock").waitFor();
let speechPlaybackVerified = false;
try {
  await desktop.waitForFunction(
    () => {
      const button = document.querySelector(
        '.speech-controls button[aria-label="暂停朗读"]',
      );
      return button instanceof HTMLButtonElement && !button.disabled;
    },
    { timeout: 12000 },
  );
  speechPlaybackVerified = true;
} catch {
  speechPlaybackVerified = false;
}
await desktop.screenshot({
  path: path.join(outputDir, "speech-playing.png"),
  fullPage: false,
});
await desktop.getByRole("button", { name: "停止朗读" }).click();

const ttsResponse = await desktop.request.post(
  "http://127.0.0.1:4173/api/tts",
  {
    data: {
      text: "Clear structure and a steady pace make a strong interview answer.",
      voice: "en-US-AvaMultilingualNeural",
      rate: 0.9,
    },
    timeout: 30000,
  },
);
const ttsBody = await ttsResponse.body();
const ttsVerified =
  ttsResponse.ok() &&
  ttsResponse.headers()["content-type"]?.includes("audio/mpeg") &&
  ttsBody.length > 1000;

await desktop.getByRole("tab", { name: /目录/ }).click();
await desktop.screenshot({
  path: path.join(outputDir, "outline.png"),
  fullPage: false,
});
await desktop
  .getByRole("button", { name: /02\. A difficult project/ })
  .click();
await desktop.waitForTimeout(900);
const headingJumpVerified = await desktop.evaluate(() => {
  const heading = document.querySelector("#md-heading-2");
  if (!heading) return false;
  const top = heading.getBoundingClientRect().top;
  return top >= 90 && top <= 200;
});
await desktop
  .getByRole("button", { name: "切换文件与标题导航" })
  .click();
await desktop.locator(".workspace.nav-closed").waitFor();
const sidebarCollapseVerified = await desktop
  .locator(".workspace.nav-closed")
  .count();
await desktop
  .getByRole("button", { name: "切换文件与标题导航" })
  .click();
await desktop.locator(".workspace.nav-open").waitFor();
await desktop.getByRole("tab", { name: /文件/ }).click();

await desktop.getByRole("tab", { name: /目录/ }).click();
await desktop
  .getByRole("button", { name: /03\. Why this role/ })
  .click();
await desktop.waitForTimeout(700);
await desktop.getByRole("button", { name: "编辑 Markdown" }).click();
const returnPositionEditor = desktop.getByRole("textbox", {
  name: "Markdown 源码编辑器",
});
await returnPositionEditor.evaluate((element) => {
  const editor = element;
  if (!(editor instanceof HTMLTextAreaElement)) return;
  const offset = editor.value.indexOf("This role combines");
  editor.focus();
  editor.setSelectionRange(offset, offset);
  editor.dispatchEvent(new Event("select", { bubbles: true }));
});
await desktop.getByRole("button", { name: "阅读模式" }).click();
await desktop.waitForTimeout(250);
const editorReturnVerified = await desktop.evaluate(() => {
  const paragraph = Array.from(document.querySelectorAll("p")).find((item) =>
    item.textContent?.includes("This role combines"),
  );
  if (!paragraph) return false;
  const top = paragraph.getBoundingClientRect().top;
  return window.scrollY > 0 && top > 100 && top < window.innerHeight;
});

const desktopOverflow = await desktop.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth,
);

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
await mobile.screenshot({
  path: path.join(outputDir, "mobile.png"),
  fullPage: true,
});
await mobile
  .getByRole("button", { name: "切换文件与标题导航" })
  .click();
await mobile.locator(".sidebar.is-open").waitFor();
await mobile.waitForTimeout(260);
await mobile.screenshot({
  path: path.join(outputDir, "mobile-sidebar.png"),
  fullPage: false,
});
const mobileOverflow = await mobile.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth,
);

await desktop
  .locator("input[type=file]")
  .setInputFiles(path.resolve("sample-library"));
await desktop
  .locator(".markdown-body h1", { hasText: "Introduction" })
  .waitFor();
await desktop.getByRole("tab", { name: /文件/ }).click();
const rootFileCount = await desktop.locator(".file-item").count();
const nestedFileVisible = await desktop
  .getByText("ignored", { exact: false })
  .count();
await desktop.getByRole("button", { name: /02-project-story/ }).click();
await desktop
  .locator(".markdown-body h1", { hasText: "Project Story" })
  .waitFor();

await desktop.getByRole("button", { name: "编辑 Markdown" }).click();
const markdownEditor = desktop.getByRole("textbox", {
  name: "Markdown 源码编辑器",
});
await markdownEditor.waitFor();
const editedMarkdown = `# Project Story

## Saved from editor

This paragraph was added in Markdown Reader.

## Keyboard shortcut

Use Ctrl+S to save the document.
`;
await markdownEditor.fill(editedMarkdown);
const dirtyStateVisible = await desktop
  .locator(".save-button.has-changes")
  .isVisible();
await desktop.screenshot({
  path: path.join(outputDir, "editor.png"),
  fullPage: false,
});

const saveDownloadPromise = desktop.waitForEvent("download");
await desktop.getByRole("button", { name: "保存 Markdown" }).click();
const saveDownload = await saveDownloadPromise;
await desktop.getByText("已下载 Markdown 副本；上传模式无法覆盖原文件。").waitFor();

await markdownEditor.fill(
  `${editedMarkdown}\n## Saved with keyboard\n\nCtrl+S also works.\n`,
);
const shortcutDownloadPromise = desktop.waitForEvent("download");
await desktop.keyboard.press("Control+s");
const shortcutDownload = await shortcutDownloadPromise;

await desktop.getByRole("button", { name: "阅读模式" }).click();
await desktop.getByRole("tab", { name: /目录/ }).click();
await desktop
  .getByRole("button", { name: /Saved with keyboard/ })
  .waitFor();
const editorVerified = true;

console.log(
  JSON.stringify(
    {
      title: await desktop.title(),
      activeFileHeading: await desktop.locator(".markdown-body h1").innerText(),
      dictionarySource,
      dictionaryCounts,
      ttsVerified,
      speechPlaybackVerified,
      ttsBytes: ttsBody.length,
      fileSwitchingVerified: true,
      rootFileCount,
      nestedFileVisible,
      headingJumpVerified,
      sidebarCollapseVerified: sidebarCollapseVerified === 1,
      editorReturnVerified,
      editorVerified,
      dirtyStateVisible,
      saveDownloadName: saveDownload.suggestedFilename(),
      shortcutDownloadName: shortcutDownload.suggestedFilename(),
      desktopOverflow,
      mobileOverflow,
      pageErrors,
      screenshots: outputDir,
    },
    null,
    2,
  ),
);

await browser.close();
