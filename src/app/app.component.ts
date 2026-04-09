import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { CodeEditorComponent } from './components/code-editor.component';
import { EDEN_SAMPLES } from './eden-script/samples';
import { CompileDiagnostic } from './eden-script/types';
import { EditorFileService } from './services/editor-file.service';
import { EdenScriptCompilerService } from './services/eden-script-compiler.service';
import { GameRuntimeService } from './services/game-runtime.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, CodeEditorComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements AfterViewInit {
  @ViewChild('previewCanvas', { static: true }) previewCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild(CodeEditorComponent) editorComponent?: CodeEditorComponent;

  readonly fileService = inject(EditorFileService);
  readonly compiler = inject(EdenScriptCompilerService);
  readonly runtime = inject(GameRuntimeService);

  readonly diagnostics = signal<CompileDiagnostic[]>([]);
  readonly source = signal(EDEN_SAMPLES[0].source);
  readonly selectedSampleId = signal(EDEN_SAMPLES[0].id);
  readonly statusMessage = signal('Ready to compile EdenScript.');
  readonly diagnosticsSummary = computed(() => {
    const errors = this.diagnostics().filter((item) => item.severity === 'error').length;
    const warnings = this.diagnostics().filter((item) => item.severity === 'warning').length;
    return `${errors} errors, ${warnings} warnings`;
  });

  readonly samples = EDEN_SAMPLES;

  async ngAfterViewInit(): Promise<void> {
    await this.run();
  }

  onSourceChanged(value: string): void {
    this.source.set(value);
  }

  newFile(): void {
    const document = this.fileService.createUntitled();
    this.source.set(document.content);
    this.selectedSampleId.set('');
    this.clearDiagnostics();
    this.runtime.stop();
    this.statusMessage.set('Created a new editable EdenScript document.');
  }

  async openFile(): Promise<void> {
    const document = await this.fileService.open();
    if (!document) {
      return;
    }

    this.source.set(document.content);
    this.selectedSampleId.set('');
    this.clearDiagnostics();
    this.runtime.stop();
    this.statusMessage.set(`Opened ${document.name}.`);
  }

  async saveFile(): Promise<void> {
    const path = await this.fileService.save(this.source());
    if (path) {
      this.statusMessage.set(`Saved to ${path}.`);
    }
  }

  loadSample(sampleId: string): void {
    this.selectedSampleId.set(sampleId);
    const document = this.fileService.loadSample(sampleId);
    if (!document) {
      return;
    }

    this.source.set(document.content);
    this.clearDiagnostics();
    this.runtime.stop();
    this.statusMessage.set(`Loaded sample: ${document.name}.`);
  }

  async insertAssetPath(): Promise<void> {
    const asset = await this.fileService.chooseAsset();
    if (!asset || !this.editorComponent) {
      return;
    }

    const normalizedPath = asset.filePath.replace(/\\/g, '/');
    this.editorComponent.insertText(`"${normalizedPath}"`);
    this.statusMessage.set(`Inserted asset path for ${asset.fileName}.`);
  }

  async run(): Promise<void> {
    const result = this.compiler.compile(this.source());
    this.diagnostics.set(result.diagnostics);
    this.editorComponent?.setDiagnostics(result.diagnostics);

    if (!result.program) {
      this.runtime.stop();
      this.statusMessage.set('Compile failed. Fix the diagnostics and run again.');
      return;
    }

    const hasWarnings = result.diagnostics.some((diagnostic) => diagnostic.severity === 'warning');
    this.statusMessage.set(
      hasWarnings
        ? 'Compiled with warnings. The preview is running the supported subset.'
        : 'Compiled successfully and launched preview.'
    );

    await this.runtime.start(result.program, this.previewCanvas.nativeElement, this.fileService.currentFilePath());
  }

  stop(): void {
    this.runtime.stop();
    this.statusMessage.set('Preview stopped.');
  }

  trackDiagnostic(_index: number, diagnostic: CompileDiagnostic): string {
    return `${diagnostic.location.line}:${diagnostic.location.column}:${diagnostic.message}`;
  }

  private clearDiagnostics(): void {
    this.diagnostics.set([]);
    this.editorComponent?.setDiagnostics([]);
  }
}
