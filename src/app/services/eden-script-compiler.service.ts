import { Injectable } from '@angular/core';

import { parseEdenScript } from '../eden-script/parser';
import { CompileDiagnostic, CompileResult, Program, Statement, SystemDefinition } from '../eden-script/types';

@Injectable({
  providedIn: 'root'
})
export class EdenScriptCompilerService {
  compile(source: string): CompileResult {
    const parsed = parseEdenScript(source);
    const diagnostics = [...parsed.diagnostics, ...this.validateProgram(parsed.program)];
    const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === 'error');

    return {
      program: hasErrors ? undefined : parsed.program,
      diagnostics: this.sortDiagnostics(diagnostics)
    };
  }

  private validateProgram(program: Program): CompileDiagnostic[] {
    const diagnostics: CompileDiagnostic[] = [];
    const entityNames = new Set(program.entities.map((entity) => entity.name));
    const resourceNames = new Set(program.resources.map((resource) => resource.name));

    for (const system of program.systems) {
      if (!system.trigger) {
        diagnostics.push({
          severity: 'error',
          message: `System "${system.name}" is missing a run condition.`,
          location: system.location
        });
      }

      if (system.trigger?.type === 'collision') {
        diagnostics.push({
          severity: 'warning',
          message: `System "${system.name}" uses collision triggers, which are not implemented in the preview runtime yet.`,
          location: system.location,
          code: 'collision-preview'
        });
      }

      if (system.when) {
        diagnostics.push({
          severity: 'warning',
          message: `Collision clause "${system.when.source} hits ${system.when.target}" is parsed, but collision execution is not implemented in v1.`,
          location: system.when.location,
          code: 'collision-clause'
        });
      }

      for (const statement of system.statements) {
        this.validateStatement(statement, diagnostics, entityNames, resourceNames, system);
      }
    }

    return diagnostics;
  }

  private validateStatement(
    statement: Statement,
    diagnostics: CompileDiagnostic[],
    entityNames: Set<string>,
    resourceNames: Set<string>,
    system: SystemDefinition
  ): void {
    if (statement.type === 'if-key-down') {
      if (system.trigger?.type !== 'every-frame') {
        diagnostics.push({
          severity: 'warning',
          message: `Keyboard input in "${system.name}" works best with "run every frame".`,
          location: statement.location
        });
      }

      this.validateStatement(statement.statement, diagnostics, entityNames, resourceNames, system);
      return;
    }

    if (statement.type === 'spawn') {
      if (!entityNames.has(statement.entityName)) {
        diagnostics.push({
          severity: 'error',
          message: `System "${system.name}" spawns unknown entity "${statement.entityName}".`,
          location: statement.location
        });
      }
      return;
    }

    if (statement.type === 'mutation') {
      const base = statement.target.path[0];
      if (base !== 'entity' && !resourceNames.has(base)) {
        diagnostics.push({
          severity: 'error',
          message: `Mutations currently support "entity.*" paths or direct resource names. Found "${statement.target.path.join('.')}".`,
          location: statement.location
        });
      }

      if (statement.expression.kind === 'reference') {
        const expressionBase = statement.expression.path[0];
        if (expressionBase !== 'entity' && !resourceNames.has(expressionBase)) {
          diagnostics.push({
            severity: 'error',
            message: `Reference "${statement.expression.path.join('.')}" does not point to the selected entity or a resource.`,
            location: statement.location
          });
        }
      }
    }
  }

  private sortDiagnostics(diagnostics: CompileDiagnostic[]): CompileDiagnostic[] {
    const severityOrder: Record<CompileDiagnostic['severity'], number> = {
      error: 0,
      warning: 1,
      info: 2
    };

    return diagnostics.slice().sort((left, right) => {
      if (left.location.line !== right.location.line) {
        return left.location.line - right.location.line;
      }

      if (left.location.column !== right.location.column) {
        return left.location.column - right.location.column;
      }

      return severityOrder[left.severity] - severityOrder[right.severity];
    });
  }
}
