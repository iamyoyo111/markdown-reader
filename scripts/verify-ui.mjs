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
await desktop.waitForFunction(
  () => {
    const button = document.querySelector(
      '.speech-controls button[aria-label="暂停朗读"]',
    );
    return button instanceof HTMLButtonElement && !button.disabled;
  },
  { timeout: 30000 },
);
const speechPlaybackVerified = true;
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
const rootFileCount = await desktop.locator(".file-item").count();
const nestedFileVisible = await desktop
  .getByText("ignored", { exact: false })
  .count();
await desktop.getByRole("button", { name: /02-project-story/ }).click();
await desktop
  .locator(".markdown-body h1", { hasText: "Project Story" })
  .waitFor();

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
