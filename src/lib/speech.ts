interface RecognitionResultItem {
  transcript: string;
}

interface RecognitionResultList {
  [index: number]: { [index: number]: RecognitionResultItem; isFinal: boolean };
  length: number;
}

interface RecognitionEventLike extends Event {
  resultIndex: number;
  results: RecognitionResultList;
}

interface RecognitionErrorLike {
  error: string;
  message?: string;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => RecognitionLike;

function getCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export const speechSupported = Boolean(getCtor());

export interface SpeechCallbacks {
  onFinal?: (text: string) => void;
  onInterim?: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}

const ERROR_MESSAGE: Record<string, string> = {
  'not-allowed': '麦克风权限被拒绝，检查浏览器地址栏的权限设置',
  'service-not-allowed': '浏览器不允许使用语音服务',
  'no-speech': '没有听到声音，再试一次',
  network: '语音服务连不上网络',
  aborted: '',
};

export class SpeechRecognizer {
  private recognition: RecognitionLike | null = null;
  private callbacks: SpeechCallbacks;
  private stopped = false;

  constructor(callbacks: SpeechCallbacks) {
    this.callbacks = callbacks;
  }

  get supported(): boolean {
    return Boolean(getCtor());
  }

  start(): boolean {
    const Ctor = getCtor();
    if (!Ctor) {
      this.callbacks.onError?.('当前浏览器不支持语音识别，推荐用 Chrome 或 Edge');
      return false;
    }
    this.stop();

    const recognition = new Ctor();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) this.callbacks.onFinal?.(text);
        else interim += text;
      }
      if (interim) this.callbacks.onInterim?.(interim);
    };

    recognition.onerror = (event) => {
      const message = ERROR_MESSAGE[event.error];
      if (message) this.callbacks.onError?.(message);
    };

    recognition.onend = () => {
      this.callbacks.onEnd?.();
    };

    this.recognition = recognition;
    this.stopped = false;

    try {
      recognition.start();
      return true;
    } catch (error) {
      this.callbacks.onError?.(error instanceof Error ? error.message : '语音识别启动失败');
      return false;
    }
  }

  stop(): void {
    if (!this.recognition) return;
    this.stopped = true;
    try {
      this.recognition.stop();
    } catch {
    }
    this.recognition = null;
  }

  get active(): boolean {
    return this.recognition !== null && !this.stopped;
  }
}
