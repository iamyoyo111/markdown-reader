import express from "express";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { EdgeTTS } from "node-edge-tts";

const root = path.dirname(fileURLToPath(import.meta.url));
const isDevelopment = process.argv.includes("--dev");
const port = Number(process.env.PORT || 4173);
const app = express();

const EDGE_VOICES = new Set([
  "en-US-AvaMultilingualNeural",
  "en-US-AndrewMultilingualNeural",
  "en-US-AriaNeural",
  "en-US-GuyNeural",
  "en-US-JennyNeural",
  "en-US-BrianMultilingualNeural",
]);

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    tts: "edge-neural",
    dictionary: "youdao",
  });
});

app.get("/api/dictionary", async (request, response) => {
  const word = String(request.query.word || "").trim().toLowerCase();
  if (!/^[a-z][a-z'-]*$/i.test(word)) {
    response.status(400).json({ error: "Please provide one English word." });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const upstream = await fetch(
      `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}`,
      {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/132 Safari/537.36",
        },
      },
    );

    if (!upstream.ok) {
      throw new Error(`Youdao returned ${upstream.status}.`);
    }

    const payload = await upstream.json();
    const entry = parseYoudaoEntry(payload, word);
    if (entry.translations.length === 0) {
      response.status(404).json({ error: "No bilingual entry found." });
      return;
    }
    response.setHeader("Cache-Control", "public, max-age=86400");
    response.json(entry);
  } catch (error) {
    response.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "The bilingual dictionary is unavailable.",
    });
  } finally {
    clearTimeout(timeout);
  }
});

app.post("/api/tts", async (request, response) => {
  const text = String(request.body?.text || "").trim();
  const voice = String(request.body?.voice || "en-US-AvaMultilingualNeural");
  const requestedRate = Number(request.body?.rate ?? 0.9);
  const rate = Number.isFinite(requestedRate)
    ? Math.min(1.25, Math.max(0.65, requestedRate))
    : 0.9;

  if (!text || text.length > 5000) {
    response
      .status(400)
      .json({ error: "Text must contain between 1 and 5000 characters." });
    return;
  }
  if (!EDGE_VOICES.has(voice)) {
    response.status(400).json({ error: "Unsupported voice." });
    return;
  }

  const ratePercent = Math.round((rate - 1) * 100);
  const rateTag = `${ratePercent >= 0 ? "+" : ""}${ratePercent}%`;
  const tts = new EdgeTTS({
    voice,
    lang: "en-US",
    outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    rate: rateTag,
    timeout: 30000,
  });

  let temporaryDirectory = "";
  try {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), "markdown-reader-tts-"),
    );
    const audioPath = path.join(temporaryDirectory, "speech.mp3");
    await tts.ttsPromise(text, audioPath);

    const audio = await readFile(audioPath);
    if (audio.length < 512) {
      throw new Error("The speech service returned no audio.");
    }

    response.setHeader("Content-Type", "audio/mpeg");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Voice", voice);
    response.setHeader("Content-Length", String(audio.length));
    response.send(audio);
  } catch (error) {
    if (!response.headersSent) {
      response.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : "The speech service is unavailable.",
      });
    } else {
      response.end();
    }
  } finally {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
});

if (isDevelopment) {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(root, "dist")));
  app.use((request, response, next) => {
    if (request.method !== "GET") {
      next();
      return;
    }
    response.sendFile(path.join(root, "dist", "index.html"));
  });
}

app.listen(port, "127.0.0.1", () => {
  console.log(
    `Markdown Reader running at http://127.0.0.1:${port}/ (${isDevelopment ? "development" : "production"})`,
  );
});

function parseYoudaoEntry(payload, fallbackWord) {
  const ecWord = first(payload?.ec?.word);
  const simpleWord = first(payload?.simple?.word);
  const word = textValue(ecWord?.["return-phrase"]) || fallbackWord;
  const usphone = textValue(ecWord?.usphone) || textValue(simpleWord?.usphone);
  const ukphone = textValue(ecWord?.ukphone) || textValue(simpleWord?.ukphone);

  const translations = collectTranslations(ecWord);
  const meanings = collectEnglishMeanings(payload?.ee?.word);
  const examples = collectExamples(payload?.blng_sents_part?.["sentence-pair"]);

  return {
    word,
    phonetic: usphone || undefined,
    phoneticUk: ukphone || undefined,
    audio: `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`,
    translations,
    meanings,
    examples,
    sourceLabel: "有道词典",
    sourceUrl: `https://dict.youdao.com/result?word=${encodeURIComponent(word)}&lang=en`,
  };
}

function collectTranslations(ecWord) {
  const output = [];
  const seen = new Set();

  for (const meaningGroup of asArray(ecWord?.trs)) {
    for (const translation of asArray(meaningGroup?.tr)) {
      const text = textValue(translation?.l?.i).replace(/\s+/g, " ").trim();
      if (!text) continue;
      const match = text.match(/^([a-z]+(?:\/[a-z]+)?)\.\s*(.*)$/i);
      const partOfSpeech = match?.[1]?.toLowerCase() ?? "";
      const chinese = (match?.[2] ?? text).trim();
      const key = `${partOfSpeech}:${chinese}`;
      if (!chinese || seen.has(key)) continue;
      seen.add(key);
      output.push({ partOfSpeech, text: chinese });
    }
  }

  return output.slice(0, 6);
}

function collectEnglishMeanings(eeWord) {
  return asArray(eeWord?.trs)
    .map((group) => {
      const definitions = asArray(group?.tr)
        .map((definition) => {
          const text = textValue(definition?.l?.i).trim();
          if (!text) return null;
          const example = textValue(definition?.exam?.i?.f?.l).trim();
          return { definition: text, example: example || undefined };
        })
        .filter(Boolean)
        .slice(0, 4);

      return {
        partOfSpeech: textValue(group?.pos) || "meaning",
        definitions,
      };
    })
    .filter((meaning) => meaning.definitions.length > 0)
    .slice(0, 4);
}

function collectExamples(pairs) {
  const output = [];
  const seen = new Set();

  for (const pair of asArray(pairs)) {
    const english = stripTags(textValue(pair?.sentence)).trim();
    const chinese = textValue(pair?.["sentence-translation"]).trim();
    if (!english || !chinese || seen.has(english)) continue;
    seen.add(english);
    output.push({
      english,
      chinese,
      source: textValue(pair?.source) || undefined,
    });
  }

  return output.slice(0, 4);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function first(value) {
  return asArray(value)[0];
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, "");
}

function textValue(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => textValue(item))
      .filter(Boolean)
      .join("；");
  }
  if (typeof value === "object") {
    if ("i" in value) return textValue(value.i);
    if ("l" in value) return textValue(value.l);
    if ("text" in value) return textValue(value.text);
  }
  return "";
}
