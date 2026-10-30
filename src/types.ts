export type DocFile = {
  path: string;
  name: string;
  file?: File;
  handle?: FileSystemFileHandle;
  lastModified?: number;
  size?: number;
};

export type ContextMenuState = {
  x: number;
  y: number;
  selectedText: string;
  currentWord: string;
  paragraph: string;
};

export type ToastState = {
  message: string;
  tone: "default" | "error";
};

export type SpeechEngine = "edge" | "browser";
