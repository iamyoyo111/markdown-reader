export type DictionaryMeaning = {
  partOfSpeech: string;
  definitions: Array<{
    definition: string;
    example?: string;
  }>;
};

export type DictionaryTranslation = {
  partOfSpeech: string;
  text: string;
};

export type DictionaryExample = {
  english: string;
  chinese?: string;
  source?: string;
};

export type DictionaryEntry = {
  word: string;
  phonetic?: string;
  phoneticUk?: string;
  audio?: string;
  translations: DictionaryTranslation[];
  meanings: DictionaryMeaning[];
  examples: DictionaryExample[];
  sourceLabel: string;
  sourceUrl: string;
};

type DictionaryApiEntry = {
  word: string;
  phonetic?: string;
  phonetics?: Array<{
    text?: string;
    audio?: string;
  }>;
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{
      definition?: string;
      example?: string;
    }>;
  }>;
};

type DatamuseEntry = {
  word: string;
  defs?: string[];
};

export async function lookupWord(word: string): Promise<DictionaryEntry> {
  const normalized = word.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Please select an English word.");
  }

  try {
    return await lookupWithYoudao(normalized);
  } catch (bilingualError) {
    try {
      return await lookupWithDictionaryApi(normalized);
    } catch {
      try {
        return await lookupWithDatamuse(normalized);
      } catch {
        throw bilingualError;
      }
    }
  }
}

async function lookupWithYoudao(normalized: string): Promise<DictionaryEntry> {
  const response = await fetch(
    `/api/dictionary?word=${encodeURIComponent(normalized)}`,
    { headers: { Accept: "application/json" } },
  );

  if (!response.ok) {
    throw new Error("The bilingual dictionary is unavailable.");
  }

  const entry = (await response.json()) as DictionaryEntry;
  if (!entry.word || !entry.translations?.length) {
    throw new Error(`No bilingual entry was found for "${normalized}".`);
  }

  return {
    ...entry,
    meanings: Array.isArray(entry.meanings) ? entry.meanings : [],
    examples: Array.isArray(entry.examples) ? entry.examples : [],
  };
}

async function lookupWithDictionaryApi(
  normalized: string,
): Promise<DictionaryEntry> {
  const endpoint = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normalized)}`;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? `No dictionary entry was found for "${normalized}".`
          : "DictionaryAPI is unavailable.",
      );
    }

    const data = (await response.json()) as DictionaryApiEntry[];
    const entry = data[0];
    if (!entry) {
      throw new Error(`No dictionary entry was found for "${normalized}".`);
    }

    const phonetics = entry.phonetics ?? [];
    const audio = phonetics.find((item) => item.audio)?.audio;
    const phonetic =
      entry.phonetic ?? phonetics.find((item) => item.text)?.text ?? undefined;

    return {
      word: entry.word,
      phonetic,
      audio,
      translations: [],
      meanings: (entry.meanings ?? [])
        .map((meaning) => ({
          partOfSpeech: meaning.partOfSpeech ?? "unknown",
          definitions: (meaning.definitions ?? [])
            .filter((definition) => Boolean(definition.definition))
            .slice(0, 4)
            .map((definition) => ({
              definition: definition.definition!,
              example: definition.example,
            })),
        }))
        .filter((meaning) => meaning.definitions.length > 0)
        .slice(0, 3),
      examples: [],
      sourceLabel: "DictionaryAPI",
      sourceUrl: "https://dictionaryapi.dev/",
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

async function lookupWithDatamuse(normalized: string): Promise<DictionaryEntry> {
  const response = await fetch(
    `https://api.datamuse.com/words?sp=${encodeURIComponent(normalized)}&md=dp&max=1`,
    { headers: { Accept: "application/json" } },
  );

  if (!response.ok) {
    throw new Error("The dictionary service is unavailable right now.");
  }

  const data = (await response.json()) as DatamuseEntry[];
  const entry = data.find(
    (candidate) =>
      candidate.word.toLowerCase() === normalized && candidate.defs?.length,
  );
  if (!entry?.defs?.length) {
    throw new Error(`No dictionary entry was found for "${normalized}".`);
  }

  const grouped = new Map<string, DictionaryMeaning["definitions"]>();
  for (const rawDefinition of entry.defs.slice(0, 12)) {
    const [rawPartOfSpeech, ...definitionParts] = rawDefinition.split("\t");
    const definition = definitionParts.join("\t").trim();
    if (!definition) continue;
    const partOfSpeech = rawPartOfSpeech.trim() || "unknown";
    const definitions = grouped.get(partOfSpeech) ?? [];
    definitions.push({ definition });
    grouped.set(partOfSpeech, definitions);
  }

  return {
    word: entry.word,
    translations: [],
    meanings: Array.from(grouped.entries())
      .slice(0, 3)
      .map(([partOfSpeech, definitions]) => ({
        partOfSpeech,
        definitions: definitions.slice(0, 4),
      })),
    examples: [],
    sourceLabel: "Datamuse",
    sourceUrl: "https://www.datamuse.com/api/",
  };
}
