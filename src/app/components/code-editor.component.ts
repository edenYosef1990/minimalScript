import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';

import { CompileDiagnostic } from '../eden-script/types';

@Component({
  selector: 'app-code-editor',
  standalone: true,
  template: '<div #host class="editor-host"></div>',
  styles: [`
    :host,
    .editor-host {
      display: block;
      width: 100%;
      height: 100%;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodeEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();
  @ViewChild('host', { static: true }) hostElement!: ElementRef<HTMLDivElement>;

  private editor: import('monaco-editor').editor.IStandaloneCodeEditor | null = null;
  private model: import('monaco-editor').editor.ITextModel | null = null;
  private monacoInstance: typeof import('monaco-editor') | null = null;

  async ngAfterViewInit(): Promise<void> {
    const monaco = await loadMonaco();
    this.monacoInstance = monaco;
    registerEdenScript(monaco);

    this.model = monaco.editor.createModel(this.value, 'edenscript');
    this.editor = monaco.editor.create(this.hostElement.nativeElement, {
      automaticLayout: true,
      fontFamily: 'Consolas, "Cascadia Code", monospace',
      fontSize: 14,
      lineNumbersMinChars: 3,
      minimap: { enabled: true },
      model: this.model,
      padding: { top: 14 },
      roundedSelection: false,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      theme: 'edenscript-night'
    });

    this.editor.onDidChangeModelContent(() => {
      this.valueChange.emit(this.model?.getValue() ?? '');
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['value'] || !this.model) {
      return;
    }

    const current = this.model.getValue();
    if (current !== this.value) {
      this.model.setValue(this.value);
    }
  }

  setDiagnostics(diagnostics: CompileDiagnostic[]): void {
    if (!this.monacoInstance || !this.model) {
      return;
    }

    this.monacoInstance.editor.setModelMarkers(
      this.model,
      'edenscript',
      diagnostics.map((diagnostic) => ({
        severity: severityToMarker(this.monacoInstance!, diagnostic.severity),
        message: diagnostic.message,
        startLineNumber: diagnostic.location.line,
        startColumn: diagnostic.location.column,
        endLineNumber: diagnostic.location.line,
        endColumn: diagnostic.location.column + (diagnostic.location.length ?? 1)
      }))
    );
  }

  insertText(text: string): void {
    if (!this.editor) {
      return;
    }

    const selection = this.editor.getSelection();
    if (!selection) {
      return;
    }

    this.editor.executeEdits('asset-insert', [{ range: selection, text }]);
    this.editor.focus();
  }

  ngOnDestroy(): void {
    this.editor?.dispose();
    this.model?.dispose();
  }
}

let monacoLoader: Promise<typeof import('monaco-editor')> | null = null;
let languageRegistered = false;

function loadMonaco(): Promise<typeof import('monaco-editor')> {
  if (window.monaco) {
    return Promise.resolve(window.monaco);
  }

  if (monacoLoader) {
    return monacoLoader;
  }

  monacoLoader = new Promise((resolve, reject) => {
    const existingLoader = document.querySelector('script[data-monaco-loader="true"]');
    const monacoBaseUrl = new URL('assets/monaco/vs/', window.location.href).toString().replace(/\/$/, '');
    const monacoLoaderUrl = new URL('assets/monaco/vs/loader.js', window.location.href).toString();

    const finalizeLoad = () => {
      window.require?.config({ paths: { vs: monacoBaseUrl } });
      window.require?.(['vs/editor/editor.main'], () => {
        if (window.monaco) {
          resolve(window.monaco);
        } else {
          reject(new Error('Monaco failed to initialize.'));
        }
      });
    };

    if (existingLoader) {
      finalizeLoad();
      return;
    }

    const script = document.createElement('script');
    script.src = monacoLoaderUrl;
    script.dataset['monacoLoader'] = 'true';
    script.onload = finalizeLoad;
    script.onerror = () => reject(new Error('Could not load Monaco assets.'));
    document.body.appendChild(script);
  });

  return monacoLoader;
}

function registerEdenScript(monaco: typeof import('monaco-editor')): void {
  if (languageRegistered) {
    return;
  }

  monaco.languages.register({ id: 'edenscript' });
  monaco.languages.setMonarchTokensProvider('edenscript', {
    keywords: ['entity', 'system', 'resource', 'run', 'every', 'frame', 'select', 'with', 'if', 'key', 'down', 'spawn', 'delete', 'on', 'collision', 'when', 'hits'],
    tokenizer: {
      root: [
        [/#.*$/, 'comment'],
        [/\b(entity|system|resource|run|every|frame|select|with|if|key|down|spawn|delete|on|collision|when|hits)\b/, 'keyword'],
        [/\b(position|velocity|sprite|health|collider|tag)\b/, 'type.identifier'],
        [/[A-Za-z_]\w*/, 'identifier'],
        [/"[^"]*"/, 'string'],
        [/-?\d+(?:\.\d+)?/, 'number'],
        [/\+=|-=|=/, 'operator'],
        [/[:(),]/, 'delimiter']
      ]
    }
  });

  monaco.languages.setLanguageConfiguration('edenscript', {
    comments: { lineComment: '#' },
    brackets: [['(', ')']],
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: '"', close: '"' }
    ]
  });

  monaco.editor.defineTheme('edenscript-night', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '6db6ff', fontStyle: 'bold' },
      { token: 'type.identifier', foreground: 'ffd76a' },
      { token: 'comment', foreground: '6d7c99' },
      { token: 'string', foreground: '9ce6a8' }
    ],
    colors: {
      'editor.background': '#09111f',
      'editor.lineHighlightBackground': '#12203a',
      'editorCursor.foreground': '#f6fbff',
      'editorIndentGuide.background1': '#1f2e50',
      'editor.selectionBackground': '#1f4c8a66'
    }
  });

  languageRegistered = true;
}

function severityToMarker(
  monaco: typeof import('monaco-editor'),
  severity: CompileDiagnostic['severity']
): import('monaco-editor').MarkerSeverity {
  switch (severity) {
    case 'error':
      return monaco.MarkerSeverity.Error;
    case 'warning':
      return monaco.MarkerSeverity.Warning;
    default:
      return monaco.MarkerSeverity.Info;
  }
}
