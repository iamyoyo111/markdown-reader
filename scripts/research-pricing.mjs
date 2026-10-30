import { chromium } from "playwright";

const providers = [
  {
    name: "Google Cloud",
    url: "https://cloud.google.com/text-to-speech/pricing",
    patterns: ["Chirp", "Neural2", "WaveNet", "Standard", "free"],
  },
  {
    name: "Amazon Polly",
    url: "https://aws.amazon.com/polly/pricing/",
    patterns: ["Generative", "Long-Form", "Neural", "Standard", "million"],
  },
  {
    name: "Azure Speech",
    url: "https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/",
    patterns: ["Neural", "Standard Voice", "million characters", "free"],
  },
  {
    name: "OpenAI",
    url: "https://platform.openai.com/docs/pricing",
    patterns: ["gpt-4o-mini-tts", "tts-1", "per 1M", "characters"],
  },
  {
    name: "OpenAI TTS deprecation",
    url: "https://platform.openai.com/docs/guides/text-to-speech",
    patterns: ["deprecated", "speech models"],
  },
  {
    name: "ElevenLabs",
    url: "https://elevenlabs.io/pricing/api",
    patterns: ["per 1,000 characters", "per month", "credits"],
  },
  {
    name: "Deepgram",
    url: "https://deepgram.com/pricing",
    patterns: ["Text-to-speech", "per 1,000 characters", "Aura"],
  },
  {
    name: "Cartesia",
    url: "https://www.cartesia.ai/pricing",
    patterns: ["credits / month", "credits per character", "per 1M credits"],
  },
  {
    name: "Merriam-Webster",
    url: "https://dictionaryapi.com/products/api-collegiate-dictionary",
    patterns: ["free", "commercial", "query", "license"],
  },
  {
    name: "Oxford Dictionaries",
    url: "https://developer.oxforddictionaries.com/pricing",
    patterns: ["free", "requests", "month", "price"],
  },
];

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const page = await browser.newPage();

for (const provider of providers) {
  try {
    await page.goto(provider.url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(1600);
    const lines = (await page.locator("body").innerText())
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const selected = [];
    for (let index = 0; index < lines.length; index += 1) {
      if (
        provider.patterns.some((pattern) =>
          lines[index].toLowerCase().includes(pattern.toLowerCase()),
        )
      ) {
        selected.push(lines.slice(Math.max(0, index - 2), index + 4).join(" | "));
      }
    }

    console.log(`\n### ${provider.name}`);
    console.log([...new Set(selected)].slice(0, 24).join("\n"));
  } catch (error) {
    console.log(`\n### ${provider.name}\nERROR: ${error.message}`);
  }
}

await browser.close();
