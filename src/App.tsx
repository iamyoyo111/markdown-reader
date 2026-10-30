import {
  ArrowUp,
  AudioLines,
  BookA,
  Check,
  ChevronRight,
  Copy,
  FileText,
  FolderOpen,
  Languages,
  ListTree,
  LoaderCircle,
  Menu,
  Minus,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  Square,
  Volume2,
  X,
} from "lucide-react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { lookupWord, type DictionaryEntry } from "./services/dictionary";
import {
  getDefaultVoice,
  getEnglishVoices,
  speakEnglish,
} from "./services/speech";
import { SAMPLE_MARKDOWN } from "./sample";
import type {
  ContextMenuState,
  DocFile,
  SpeechEngine,
  ToastState,
} from "./types";

type DirectoryHandleWithValues = FileSystemDirectoryHandle & {
  values: () => AsyncIterableIterator<
    FileSystemFileHandle | FileSystemDirectoryHandle
  >;
};

const MARKDOWN_EXTENSION = /\.(md|markdown)$/i;
const EDGE_VOICES = [
  {
    voiceURI: "en-US-AvaMultilingualNeural",
    name: "Ava · 女声",
    lang: "en-US",
  },
  {
    voiceURI: "en-US-AndrewMultilingualNeural",
    name: "Andrew · 男声",
    lang: "en-US",
  },
  {
    voiceURI: "en-US-AriaNeural",
    name: "Aria · 女声",
    lang: "en-US",
  },
  {
    voiceURI: "en-US-GuyNeural",
    name: "Guy · 男声",
    lang: "en-US",
  },
  {
    voiceURI: "en-US-JennyNeural",
    name: "Jenny · 女声",
    lang: "en-US",
  },
  {
    voiceURI: "en-US-BrianMultilingualNeural",
    name: "Brian · 男声",
    lang: "en-US",
  },
] as const;

async function collectMarkdownFiles(
  directory: DirectoryHandleWithValues,
): Promise<DocFile[]> {
  const output: DocFile[] = [];
  for await (const entry of directory.values()) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    if (entry.kind === "file" && MARKDOWN_EXTENSION.test(entry.name)) {
      const fileHandle = entry as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      output.push({
        path: entry.name,
        name: entry.name,
        handle: fileHandle,
        lastModified: file.lastModified,
        size: file.size,
      });
    }
  }

  return output;
}

function filesFromInput(fileList: FileList): DocFile[] {
  return Array.from(fileList)
    .filter((file) => {
      if (!MARKDOWN_EXTENSION.test(file.name)) return false;
      const relativePath = file.webkitRelativePath || file.name;
      return relativePath.split("/").filter(Boolean).length === 2;
    })
    .map((file) => {
      return {
        path: file.name,
        name: file.name,
        file,
        lastModified: file.lastModified,
        size: file.size,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function normalizeWord(value: string) {
  return value
    .replace(/^[^A-Za-z]+|[^A-Za-z'-]+$/g, "")
    .replace(/^'+|'+$/g, "");
}

function isDictionaryWord(value: string) {
  return /^[A-Za-z][A-Za-z'-]*$/.test(value);
}

type MarkdownHeading = {
  id: string;
  text: string;
  level: number;
};

type SidebarTab = "files" | "outline";

function renderMarkdownDocument(content: string) {
  const sanitized = DOMPurify.sanitize(
    marked.parse(content, { gfm: true }) as string,
  );
  const documentNode = new DOMParser().parseFromString(sanitized, "text/html");
  const headings: MarkdownHeading[] = [];

  documentNode
    .querySelectorAll("h1, h2, h3, h4, h5, h6")
    .forEach((heading, index) => {
    const id = `md-heading-${index}`;
    heading.id = id;
    headings.push({
      id,
      text: heading.textContent?.trim() || `Section ${index + 1}`,
      level: Number(heading.tagName.slice(1)),
    });
    });

  return {
    html: documentNode.body.innerHTML,
    headings,
  };
}

function getCaretRangePoint(x: number, y: number) {
  const documentWithCaret = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  if (documentWithCaret.caretPositionFromPoint) {
    const position = documentWithCaret.caretPositionFromPoint(x, y);
    if (!position) return null;
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }

  return documentWithCaret.caretRangeFromPoint?.(x, y) ?? null;
}

function wordAtPoint(range: Range | null) {
  if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return "";
  const text = range.startContainer.textContent ?? "";
  let start = range.startOffset;
  let end = range.startOffset;

  while (start > 0 && /[A-Za-z'-]/.test(text[start - 1])) start -= 1;
  while (end < text.length && /[A-Za-z'-]/.test(text[end])) end += 1;
  return normalizeWord(text.slice(start, end));
}

function formatFileMeta(doc?: DocFile) {
  if (!doc || !doc.size) return "Markdown";
  const size = doc.size < 1024 ? `${doc.size} B` : `${Math.ceil(doc.size / 1024)} KB`;
  return `${size} · 本地文件`;
}

function App() {
  const [files, setFiles] = useState<DocFile[]>([]);
  const [activePath, setActivePath] = useState("");
  const [content, setContent] = useState(SAMPLE_MARKDOWN);
  const [isSample, setIsSample] = useState(true);
  const [folderName, setFolderName] = useState("示例文章");
  const [fileSearch, setFileSearch] = useState("");
  const [isLoadingFolder, setIsLoadingFolder] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dictionary, setDictionary] = useState<DictionaryEntry | null>(null);
  const [dictionaryWord, setDictionaryWord] = useState("");
  const [dictionaryError, setDictionaryError] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speechEngine, setSpeechEngine] = useState<SpeechEngine>("edge");
  const [edgeVoice, setEdgeVoice] = useState<string>(
    EDGE_VOICES[0].voiceURI,
  );
  const [selectedVoiceUri, setSelectedVoiceUri] = useState("");
  const [speechRate, setSpeechRate] = useState(0.9);
  const [speechState, setSpeechState] = useState<
    "idle" | "loading" | "playing" | "paused"
  >("idle");
  const [speakingLabel, setSpeakingLabel] = useState("");
  const [showVoicePanel, setShowVoicePanel] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("files");
  const [activeHeadingId, setActiveHeadingId] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const articleRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef("");
  const playbackTypeRef = useRef<"audio" | "browser" | null>(null);

  const renderedMarkdown = useMemo(
    () => renderMarkdownDocument(content),
    [content],
  );
  const markdownHtml = renderedMarkdown.html;
  const headings = renderedMarkdown.headings;

  const activeFile = files.find((file) => file.path === activePath);
  const filteredFiles = files.filter((file) =>
    file.path.toLowerCase().includes(fileSearch.trim().toLowerCase()),
  );
  const displayedFileCount =
    filteredFiles.length + (isSample && !fileSearch ? 1 : 0);
  const englishVoices = useMemo(() => getEnglishVoices(voices), [voices]);
  const selectedBrowserVoice =
    englishVoices.find((voice) => voice.voiceURI === selectedVoiceUri) ??
    englishVoices[0] ??
    null;

  const showToast = useCallback((message: string, tone: "default" | "error" = "default") => {
    setToast({ message, tone });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    const loadVoices = () => {
      const available = getEnglishVoices(window.speechSynthesis?.getVoices() ?? []);
      setVoices(window.speechSynthesis?.getVoices() ?? []);
      if (!selectedVoiceUri && available.length > 0) {
        const preferred = getDefaultVoice(available);
        if (preferred) setSelectedVoiceUri(preferred.voiceURI);
      }
    };

    loadVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
      window.speechSynthesis?.cancel();
      releaseAudio();
    };
  }, [selectedVoiceUri]);

  useEffect(() => {
    const closeOverlays = () => {
      setContextMenu(null);
      setShowVoicePanel(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeOverlays();
        setShowSidebar(false);
      }
    };
    window.addEventListener("pointerdown", closeOverlays);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOverlays);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (!articleRef.current) return;
    articleRef.current.querySelectorAll("a").forEach((link) => {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noreferrer");
    });
  }, [markdownHtml]);

  useEffect(() => {
    if (!articleRef.current || headings.length === 0) {
      setActiveHeadingId("");
      return;
    }

    let animationFrame = 0;
    const updateActiveHeading = () => {
      animationFrame = 0;
      let currentId = headings[0]?.id ?? "";
      for (const heading of headings) {
        const element = document.getElementById(heading.id);
        if (element && element.getBoundingClientRect().top <= 150) {
          currentId = heading.id;
        }
      }
      setActiveHeadingId(currentId);
    };
    const handleScroll = () => {
      if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(updateActiveHeading);
      }
    };

    updateActiveHeading();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [headings, markdownHtml]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  async function chooseFolder() {
    const picker = (
      window as Window & {
        showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker;

    if (!picker) {
      fileInputRef.current?.click();
      return;
    }

    try {
      setIsLoadingFolder(true);
      const directory = (await picker()) as DirectoryHandleWithValues;
      const markdownFiles = (await collectMarkdownFiles(directory)).sort((a, b) =>
        a.path.localeCompare(b.path),
      );

      if (markdownFiles.length === 0) {
        showToast("这个文件夹里没有找到 Markdown 文件。", "error");
        return;
      }

      setFiles(markdownFiles);
      setFolderName(directory.name);
      setFileSearch("");
      setIsSample(false);
      setActivePath("");
      setContent("");
      await openFile(markdownFiles[0]);
      setShowSidebar(false);
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        showToast("无法读取文件夹，请确认浏览器权限。", "error");
      }
    } finally {
      setIsLoadingFolder(false);
    }
  }

  async function openFile(doc: DocFile) {
    try {
      setIsLoadingFile(true);
      const file = doc.file ?? (await doc.handle?.getFile());
      if (!file) throw new Error("File unavailable");
      const text = await file.text();
      setActivePath(doc.path);
      setContent(text);
      setContextMenu(null);
      setDictionary(null);
      setDictionaryError("");
      setShowSidebar(false);
      window.scrollTo({ top: 0 });
    } catch {
      showToast("无法读取这个文件。", "error");
    } finally {
      setIsLoadingFile(false);
    }
  }

  function handleFallbackFiles(fileList: FileList | null) {
    if (!fileList) return;
    const nextFiles = filesFromInput(fileList);
    if (nextFiles.length === 0) {
      showToast("这个文件夹里没有找到 Markdown 文件。", "error");
      return;
    }
    const root = fileList[0]?.webkitRelativePath?.split("/")[0] ?? "本地文件夹";
    setFiles(nextFiles);
    setFolderName(root);
    setFileSearch("");
    setIsSample(false);
    void openFile(nextFiles[0]);
  }

  function handleContextMenu(event: React.MouseEvent) {
    event.preventDefault();
    if (!articleRef.current) return;

    const selection = window.getSelection();
    const selectedText =
      selection &&
      selection.rangeCount > 0 &&
      selection.anchorNode &&
      articleRef.current.contains(selection.anchorNode)
        ? selection.toString().trim()
        : "";

    const range = getCaretRangePoint(event.clientX, event.clientY);
    const target = event.target as Element;
    const block = target.closest(
      "p, li, h1, h2, h3, h4, blockquote, td, th, pre",
    );
    const paragraph = block?.textContent?.trim() ?? selectedText;
    const currentWord = wordAtPoint(range) || normalizeWord(selectedText);
    const menuWidth = 260;
    const menuHeight = selectedText ? 230 : 178;

    setShowVoicePanel(false);
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - menuWidth - 12),
      y: Math.min(event.clientY, window.innerHeight - menuHeight - 12),
      selectedText,
      currentWord,
      paragraph,
    });
  }

  async function handleDictionary(word: string) {
    const normalized = normalizeWord(word);
    if (!isDictionaryWord(normalized)) {
      showToast("请选择一个英文单词后再查词。", "error");
      return;
    }
    setContextMenu(null);
    setDictionaryWord(normalized);
    setDictionary(null);
    setDictionaryError("");
    setIsLookingUp(true);
    try {
      setDictionary(await lookupWord(normalized));
    } catch (error) {
      setDictionaryError(
        error instanceof Error ? error.message : "The dictionary service is unavailable.",
      );
    } finally {
      setIsLookingUp(false);
    }
  }

  function releaseAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = "";
    }
    playbackTypeRef.current = null;
  }

  function stopSpeech() {
    releaseAudio();
    window.speechSynthesis?.cancel();
    setSpeechState("idle");
    setSpeakingLabel("");
  }

  function speakWithBrowser(text: string, label: string, isFallback = false) {
    if (!("speechSynthesis" in window)) {
      setSpeechState("idle");
      setSpeakingLabel("");
      showToast("云端与浏览器语音均不可用。", "error");
      return;
    }

    window.speechSynthesis.cancel();
    playbackTypeRef.current = "browser";
    setSpeechState("loading");
    setSpeakingLabel(label);
    if (isFallback) {
      showToast("在线语音暂不可用，已切换到浏览器语音。");
    }

    speakEnglish({
      text,
      voice: selectedBrowserVoice,
      rate: speechRate,
      onStart: () => setSpeechState("playing"),
      onEnd: () => {
        playbackTypeRef.current = null;
        setSpeechState("idle");
        setSpeakingLabel("");
      },
      onError: () => {
        playbackTypeRef.current = null;
        setSpeechState("idle");
        setSpeakingLabel("");
        showToast("朗读失败，请稍后重试或切换语音。", "error");
      },
    });
  }

  async function speakText(text: string, label: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      showToast("没有可朗读的英文内容。", "error");
      return;
    }

    releaseAudio();
    window.speechSynthesis?.cancel();
    setContextMenu(null);
    setSpeakingLabel(label);
    setSpeechState("loading");

    if (speechEngine === "browser") {
      speakWithBrowser(trimmed, label);
      return;
    }

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          voice: edgeVoice,
          rate: speechRate,
        }),
      });

      if (!response.ok) {
        let message = "Online speech synthesis failed.";
        try {
          const payload = (await response.json()) as { error?: string };
          message = payload.error || message;
        } catch {
          // The server may return an empty or non-JSON error body.
        }
        throw new Error(message);
      }

      const audioBlob = await response.blob();
      if (audioBlob.size < 512) {
        throw new Error("The speech response did not contain audio.");
      }

      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audioUrlRef.current = url;
      audioRef.current = audio;
      playbackTypeRef.current = "audio";
      audio.onended = () => {
        releaseAudio();
        setSpeechState("idle");
        setSpeakingLabel("");
      };
      audio.onerror = () => {
        releaseAudio();
        setSpeechState("idle");
        setSpeakingLabel("");
        showToast("在线语音播放失败。", "error");
      };
      await audio.play();
      setSpeechState("playing");
    } catch {
      speakWithBrowser(trimmed, label, true);
    }
  }

  function toggleSpeech() {
    if (speechState === "loading") return;

    if (playbackTypeRef.current === "audio" && audioRef.current) {
      if (speechState === "playing") {
        audioRef.current.pause();
        setSpeechState("paused");
      } else if (speechState === "paused") {
        void audioRef.current.play();
        setSpeechState("playing");
      }
      return;
    }

    if (playbackTypeRef.current === "browser" && "speechSynthesis" in window) {
      if (speechState === "playing") {
        window.speechSynthesis.pause();
        setSpeechState("paused");
      } else if (speechState === "paused") {
        window.speechSynthesis.resume();
        setSpeechState("playing");
      }
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("已复制到剪贴板。");
    } catch {
      showToast("复制失败，请检查浏览器权限。", "error");
    }
    setContextMenu(null);
  }

  function playDictionaryAudio() {
    void speakText(
      dictionary?.word ?? dictionaryWord,
      `单词：${dictionaryWord}`,
    );
  }

  function handleArticleClick(event: React.MouseEvent) {
    const target = event.target as Element;
    if (target.closest("a")) return;
    setContextMenu(null);
  }

  function toggleNavigation() {
    if (window.matchMedia("(max-width: 960px)").matches) {
      setShowSidebar((open) => !open);
    } else {
      setIsNavOpen((open) => !open);
    }
  }

  function jumpToHeading(id: string) {
    const heading = document.getElementById(id);
    if (!heading) return;
    setActiveHeadingId(id);
    heading.scrollIntoView({ behavior: "smooth", block: "start" });
    if (window.matchMedia("(max-width: 960px)").matches) {
      setShowSidebar(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <button
            className="icon-button mobile-menu sidebar-toggle"
            onClick={toggleNavigation}
            aria-label="切换文件与标题导航"
            title="切换文件与标题导航"
          >
            <Menu size={19} />
          </button>
          <div className="brand-mark" aria-hidden="true">
            <AudioLines size={20} strokeWidth={2.2} />
          </div>
          <div className="brand-copy">
            <strong>Interview Reader</strong>
            <span>Read. Listen. Rehearse.</span>
          </div>
        </div>

        <div className="topbar-actions">
          <span className="us-badge">
            <span className="us-dot" />
            US English
          </span>
          <div className="popover-anchor">
            <button
              className={`toolbar-button ${showVoicePanel ? "is-active" : ""}`}
              onPointerDown={(event) => {
                event.stopPropagation();
                setContextMenu(null);
                setShowVoicePanel((open) => !open);
              }}
              aria-expanded={showVoicePanel}
              aria-label="语音设置"
            >
              <Settings2 size={16} />
              语音设置
            </button>
            {showVoicePanel && (
              <div
                className="voice-popover"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="popover-heading">
                  <div>
                    <strong>Voice & pace</strong>
                    <span>美式英语优先</span>
                  </div>
                  <button
                    className="icon-button subtle"
                    onClick={() => setShowVoicePanel(false)}
                    aria-label="关闭语音设置"
                  >
                    <X size={16} />
                  </button>
                </div>

                <label className="field-label" htmlFor="engine-select">
                  朗读引擎
                </label>
                <select
                  id="engine-select"
                  className="select-input"
                  value={speechEngine}
                  onChange={(event) =>
                    setSpeechEngine(event.target.value as SpeechEngine)
                  }
                >
                  <option value="edge">Edge Neural · 在线美式语音</option>
                  <option value="browser">浏览器语音 · 本地</option>
                </select>
                <p className="engine-note">
                  {speechEngine === "edge"
                    ? "无需 API Key，使用微软 Edge 在线 Neural 语音。"
                    : "不联网，声音取决于当前浏览器与系统。"}
                </p>

                <label className="field-label" htmlFor="voice-select">
                  语音
                </label>
                <select
                  id="voice-select"
                  className="select-input"
                  value={
                    speechEngine === "edge"
                      ? edgeVoice
                      : selectedBrowserVoice?.voiceURI ?? ""
                  }
                  onChange={(event) => {
                    if (speechEngine === "edge") {
                      setEdgeVoice(event.target.value);
                    } else {
                      setSelectedVoiceUri(event.target.value);
                    }
                  }}
                >
                  {speechEngine === "browser" && englishVoices.length === 0 && (
                    <option value="">暂无英文语音</option>
                  )}
                  {(speechEngine === "edge" ? EDGE_VOICES : englishVoices).map(
                    (voice) => (
                      <option value={voice.voiceURI} key={voice.voiceURI}>
                        {voice.name} · {voice.lang}
                      </option>
                    ),
                  )}
                </select>

                <div className="rate-heading">
                  <label className="field-label" htmlFor="speech-rate">
                    语速
                  </label>
                  <span>{speechRate.toFixed(2)}×</span>
                </div>
                <input
                  id="speech-rate"
                  className="range-input"
                  type="range"
                  min="0.65"
                  max="1.25"
                  step="0.05"
                  value={speechRate}
                  onChange={(event) =>
                    setSpeechRate(Number(event.target.value))
                  }
                />
                <div className="rate-presets">
                  {[0.75, 0.9, 1].map((rate) => (
                    <button
                      key={rate}
                      className={speechRate === rate ? "selected" : ""}
                      onClick={() => setSpeechRate(rate)}
                    >
                      {rate === 1 ? "自然" : `${rate}×`}
                    </button>
                  ))}
                </div>
                <button
                  className="primary-wide-button"
                  onClick={() =>
                    void speakText(
                      "Clear structure and a steady pace make a strong interview answer.",
                      "试听语音",
                    )
                  }
                >
                  <Volume2 size={16} />
                  试听当前语音
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div
        className={`workspace ${isNavOpen ? "nav-open" : "nav-closed"}`}
      >
        {showSidebar && (
          <button
            className="sidebar-backdrop"
            aria-label="关闭文件列表"
            onClick={() => setShowSidebar(false)}
          />
        )}
        <aside
          className={`sidebar ${showSidebar ? "is-open" : ""} ${
            isNavOpen ? "nav-open" : "nav-closed"
          }`}
        >
          <div className="sidebar-top">
            <div className="folder-label">
              <span>当前资料夹</span>
              <strong title={folderName}>{folderName}</strong>
            </div>
            <button
              className="folder-button"
              onClick={chooseFolder}
              disabled={isLoadingFolder}
              title="选择包含 Markdown 文件的文件夹"
            >
              {isLoadingFolder ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <FolderOpen size={17} />
              )}
              {isLoadingFolder ? "正在读取" : "打开文件夹"}
            </button>
          </div>

          <div className="sidebar-tabs" role="tablist" aria-label="导航类型">
            <button
              className={sidebarTab === "files" ? "active" : ""}
              role="tab"
              aria-selected={sidebarTab === "files"}
              onClick={() => setSidebarTab("files")}
            >
              <FileText size={14} />
              文件
              <span>{displayedFileCount}</span>
            </button>
            <button
              className={sidebarTab === "outline" ? "active" : ""}
              role="tab"
              aria-selected={sidebarTab === "outline"}
              onClick={() => setSidebarTab("outline")}
            >
              <ListTree size={14} />
              目录
              <span>{headings.length}</span>
            </button>
          </div>

          {sidebarTab === "files" && (
            <div className="search-wrap">
              <Search size={15} />
              <input
                value={fileSearch}
                onChange={(event) => setFileSearch(event.target.value)}
                placeholder="按文件名搜索"
                aria-label="按文件名搜索"
              />
              {fileSearch && (
                <button
                  className="clear-search"
                  onClick={() => setFileSearch("")}
                  aria-label="清除搜索"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          <div className="file-list-header">
            <span>{sidebarTab === "files" ? "当前文件夹" : "文档标题"}</span>
            <span>
              {sidebarTab === "files" ? displayedFileCount : headings.length}
            </span>
          </div>

          {sidebarTab === "files" ? (
            <nav className="file-list" aria-label="当前文件夹中的 Markdown 文件">
              {(isSample || files.length === 0) && !fileSearch && (
                <button
                  className={`file-item ${isSample ? "active" : ""}`}
                  onClick={() => {
                    setContent(SAMPLE_MARKDOWN);
                    setIsSample(true);
                    setActivePath("");
                    setDictionary(null);
                    setShowSidebar(false);
                  }}
                >
                  <span className="file-icon current">
                    <FileText size={16} />
                  </span>
                  <span className="file-copy">
                    <strong>Technical Interview Guide</strong>
                    <small>示例文章 · {headings.length} 个标题</small>
                  </span>
                  {isSample && <ChevronRight size={15} />}
                </button>
              )}

              {filteredFiles.map((file) => (
                <button
                  className={`file-item ${activePath === file.path ? "active" : ""}`}
                  key={file.path}
                  onClick={() => void openFile(file)}
                  title={file.path}
                >
                  <span className="file-icon">
                    <FileText size={16} />
                  </span>
                  <span className="file-copy">
                    <strong>{file.name.replace(/\.(md|markdown)$/i, "")}</strong>
                    <small>当前文件夹</small>
                  </span>
                  {activePath === file.path && <ChevronRight size={15} />}
                </button>
              ))}

              {files.length > 0 && filteredFiles.length === 0 && (
                <div className="empty-search">没有匹配的文件</div>
              )}
            </nav>
          ) : (
            <nav className="outline-list" aria-label="Markdown 标题导航">
              <div className="outline-document">
                {isSample
                  ? "Technical Interview Guide"
                  : activeFile?.name.replace(/\.(md|markdown)$/i, "")}
              </div>
              {headings.length === 0 ? (
                <div className="empty-search">当前文档没有可用标题</div>
              ) : (
                headings.map((heading) => (
                  <button
                    className={`outline-item ${
                      activeHeadingId === heading.id ? "active" : ""
                    }`}
                    key={heading.id}
                    onClick={() => jumpToHeading(heading.id)}
                    style={{ paddingLeft: 9 + (heading.level - 1) * 12 }}
                    title={heading.text}
                  >
                    <span>H{heading.level}</span>
                    <strong>{heading.text}</strong>
                  </button>
                ))
              )}
            </nav>
          )}

          <div className="sidebar-footer">
            <div className="privacy-line">
              <Check size={14} />
              文件只在本机浏览器中读取
            </div>
            <span>Edge Neural · Youdao Dictionary</span>
          </div>
        </aside>

        <main className="reader">
          <div className="reader-toolbar">
            <div className="breadcrumb">
              <span>{folderName}</span>
              <ChevronRight size={13} />
              <strong>
                {isSample
                  ? "Technical Interview Guide"
                  : activeFile?.name.replace(/\.(md|markdown)$/i, "")}
              </strong>
            </div>
            <div className="reader-tools">
              <div className="font-control" aria-label="字号">
                <button
                  onClick={() => setFontSize((size) => Math.max(15, size - 1))}
                  disabled={fontSize <= 15}
                  aria-label="缩小字号"
                  title="缩小字号"
                >
                  <Minus size={15} />
                </button>
                <span>{fontSize}</span>
                <button
                  onClick={() => setFontSize((size) => Math.min(24, size + 1))}
                  disabled={fontSize >= 24}
                  aria-label="放大字号"
                  title="放大字号"
                >
                  <Plus size={15} />
                </button>
              </div>
              <button
                className="scroll-top-button"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                aria-label="回到顶部"
                title="回到顶部"
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>

          <div className="document-stage">
            <article
              ref={articleRef}
              className={`markdown-body ${isLoadingFile ? "is-loading" : ""}`}
              style={{ "--reader-font-size": `${fontSize}px` } as React.CSSProperties}
              onClick={handleArticleClick}
              onContextMenu={handleContextMenu}
              dangerouslySetInnerHTML={{ __html: markdownHtml }}
            />
            {isLoadingFile && (
              <div className="loading-file">
                <LoaderCircle className="spin" size={18} />
                正在读取文档
              </div>
            )}
            <div className="document-meta">
              <span>{formatFileMeta(activeFile)}</span>
              <span>右键单词查词 · 选中段落后朗读</span>
            </div>
          </div>
        </main>
      </div>

      <input
        ref={fileInputRef}
        className="hidden-input"
        type="file"
        accept=".md,.markdown,text/markdown"
        multiple
        {...({ webkitdirectory: "" } as Record<string, string>)}
        onChange={(event) => handleFallbackFiles(event.target.files)}
      />

      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          role="menu"
          aria-label="选中文字操作"
        >
          <div className="context-preview">
            <span>当前内容</span>
            <strong>
              {contextMenu.selectedText
                ? contextMenu.selectedText
                : contextMenu.currentWord || contextMenu.paragraph}
            </strong>
          </div>
          <button
            role="menuitem"
            onClick={() => {
              const selectedWord = normalizeWord(contextMenu.selectedText);
              void handleDictionary(
                isDictionaryWord(selectedWord)
                  ? selectedWord
                  : contextMenu.currentWord,
              );
            }}
            disabled={
              !isDictionaryWord(normalizeWord(contextMenu.selectedText)) &&
              !isDictionaryWord(contextMenu.currentWord)
            }
          >
            <BookA size={16} />
            <span>
              查询字典
              {(isDictionaryWord(normalizeWord(contextMenu.selectedText))
                ? normalizeWord(contextMenu.selectedText)
                : contextMenu.currentWord) && (
                <small>
                  {isDictionaryWord(normalizeWord(contextMenu.selectedText))
                    ? normalizeWord(contextMenu.selectedText)
                    : contextMenu.currentWord}
                </small>
              )}
            </span>
          </button>
          <button
            role="menuitem"
            onClick={() =>
              void speakText(
                contextMenu.selectedText || contextMenu.paragraph,
                contextMenu.selectedText ? "选中内容" : "当前段落",
              )
            }
          >
            <Volume2 size={16} />
            <span>{contextMenu.selectedText ? "朗读选中内容" : "朗读当前段落"}</span>
          </button>
          <button
            role="menuitem"
            onClick={() => void copyText(contextMenu.selectedText || contextMenu.paragraph)}
          >
            <Copy size={16} />
            <span>复制文字</span>
          </button>
          <div className="context-hint">
            <Languages size={13} />
            {contextMenu.selectedText
              ? "已按选区处理"
              : `右键位置：${contextMenu.currentWord || "段落"}`}
          </div>
        </div>
      )}

      {(dictionaryWord || isLookingUp) && (
        <aside className="dictionary-drawer" aria-label="词典">
          <div className="drawer-heading">
            <div>
              <span className="eyebrow">Dictionary</span>
              <h2>{dictionary?.word ?? dictionaryWord}</h2>
              {dictionary?.phonetic && (
                <p className="dictionary-phonetics">
                  <span>US</span>/{dictionary.phonetic}/
                  {dictionary.phoneticUk && (
                    <>
                      <span>UK</span>/{dictionary.phoneticUk}/
                    </>
                  )}
                </p>
              )}
            </div>
            <div className="drawer-actions">
              <button
                className="icon-button subtle"
                onClick={playDictionaryAudio}
                aria-label="播放单词发音"
                title="播放单词发音"
              >
                <Volume2 size={18} />
              </button>
              <button
                className="icon-button subtle"
                onClick={() => {
                  setDictionaryWord("");
                  setDictionary(null);
                  setDictionaryError("");
                }}
                aria-label="关闭词典"
                title="关闭词典"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {isLookingUp && (
            <div className="dictionary-loading">
              <LoaderCircle className="spin" size={19} />
              Looking up the word…
            </div>
          )}

          {dictionaryError && (
            <div className="dictionary-error">
              <strong>没有查到这个词</strong>
              <p>{dictionaryError}</p>
              <button
                className="secondary-button"
                onClick={() =>
                  void speakText(dictionaryWord, `单词：${dictionaryWord}`)
                }
              >
                <Volume2 size={15} />
                用当前语音朗读
              </button>
            </div>
          )}

          {dictionary && (
            <div className="meanings">
              {dictionary.translations.length > 0 && (
                <section className="translation-panel">
                  <div className="section-kicker">中文释义</div>
                  <ul>
                    {dictionary.translations.map((translation, index) => (
                      <li key={`${translation.partOfSpeech}-${index}`}>
                        {translation.partOfSpeech && (
                          <span className="part-of-speech">
                            {translation.partOfSpeech}.
                          </span>
                        )}
                        {translation.text}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {dictionary.meanings.length > 0 && (
                <div className="dictionary-section-heading">英文释义</div>
              )}
              {dictionary.meanings.map((meaning) => (
                <section key={meaning.partOfSpeech}>
                  <div className="meaning-title">
                    <span>{meaning.partOfSpeech}</span>
                    <span>{meaning.definitions.length}</span>
                  </div>
                  <ol>
                    {meaning.definitions.map((item, index) => (
                      <li key={`${meaning.partOfSpeech}-${index}`}>
                        <p>{item.definition}</p>
                        {item.example && <em>“{item.example}”</em>}
                      </li>
                    ))}
                  </ol>
                </section>
              ))}

              {dictionary.examples.length > 0 && (
                <section className="examples-panel">
                  <div className="dictionary-section-heading">中英例句</div>
                  <div className="example-list">
                    {dictionary.examples.map((example, index) => (
                      <article
                        className="example-card"
                        key={`${example.english}-${index}`}
                      >
                        <p>{example.english}</p>
                        {example.chinese && <em>{example.chinese}</em>}
                        {example.source && <small>{example.source}</small>}
                      </article>
                    ))}
                  </div>
                </section>
              )}

              <div className="dictionary-source">
                <span>
                  {dictionary.translations.length > 0
                    ? "中英释义"
                    : "English definitions"}{" "}
                  · {dictionary.sourceLabel}
                </span>
                <a href={dictionary.sourceUrl} target="_blank" rel="noreferrer">
                  Open reference
                </a>
              </div>
            </div>
          )}
        </aside>
      )}

      {speechState !== "idle" && (
        <div className="speech-dock">
          <div className="speech-dock-icon">
            {speechState === "loading" ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <AudioLines size={18} />
            )}
          </div>
          <div className="speech-copy">
            <span>
              {speechState === "loading"
                ? "Edge Neural · 正在生成"
                : `${speechEngine === "edge" ? "Edge Neural" : "Browser voice"} · ${speechRate.toFixed(2)}×`}
            </span>
            <strong>
              {speechState === "loading"
                ? "正在准备美式语音…"
                : speakingLabel || "正在朗读"}
            </strong>
          </div>
          <div className="speech-controls">
            <button
              onClick={toggleSpeech}
              disabled={speechState === "loading"}
              aria-label={speechState === "paused" ? "继续朗读" : "暂停朗读"}
              title={speechState === "paused" ? "继续朗读" : "暂停朗读"}
            >
              {speechState === "paused" ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button onClick={stopSpeech} aria-label="停止朗读" title="停止朗读">
              <Square size={14} />
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.tone === "error" ? "error" : ""}`} role="status">
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default App;
