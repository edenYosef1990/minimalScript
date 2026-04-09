import {
  CompileDiagnostic,
  ComponentDefinition,
  EntityDefinition,
  IdentifierLiteral,
  MutationStatement,
  NumberLiteral,
  Program,
  ReferenceExpression,
  ResourceDefinition,
  SelectRequirement,
  SelectValueExpression,
  SourceLocation,
  SpawnStatement,
  Statement,
  StringLiteral,
  SystemDefinition,
  ValueExpression
} from './types';

interface ParsedLine {
  lineNumber: number;
  raw: string;
  trimmed: string;
  indent: number;
}

interface ParseContext {
  lines: ParsedLine[];
  index: number;
  diagnostics: CompileDiagnostic[];
}

export function parseEdenScript(source: string): { program: Program; diagnostics: CompileDiagnostic[] } {
  const lines = source.split(/\r?\n/).map((raw, index) => ({
    lineNumber: index + 1,
    raw,
    trimmed: raw.trim(),
    indent: raw.match(/^\s*/)?.[0].length ?? 0
  }));

  const context: ParseContext = {
    lines,
    index: 0,
    diagnostics: []
  };

  const entities: EntityDefinition[] = [];
  const resources: ResourceDefinition[] = [];
  const systems: SystemDefinition[] = [];

  while (context.index < context.lines.length) {
    const line = context.lines[context.index];

    if (shouldSkip(line)) {
      context.index += 1;
      continue;
    }

    if (line.indent !== 0) {
      pushDiagnostic(context.diagnostics, 'error', 'Top-level definitions must start at column 1.', locationOf(line, 1));
      context.index += 1;
      continue;
    }

    if (line.trimmed.startsWith('entity ')) {
      const entity = parseEntity(context, line);
      if (entity) {
        entities.push(entity);
      }
      continue;
    }

    if (line.trimmed.startsWith('resource ')) {
      const resource = parseResource(context, line);
      if (resource) {
        resources.push(resource);
      }
      context.index += 1;
      continue;
    }

    if (line.trimmed.startsWith('system ')) {
      const system = parseSystem(context, line);
      if (system) {
        systems.push(system);
      }
      continue;
    }

    pushDiagnostic(context.diagnostics, 'error', `Unknown top-level statement: "${line.trimmed}"`, locationOf(line, 1));
    context.index += 1;
  }

  return {
    program: {
      source,
      entities,
      resources,
      systems
    },
    diagnostics: context.diagnostics
  };
}

function parseEntity(context: ParseContext, headerLine: ParsedLine): EntityDefinition | null {
  const match = /^entity\s+([A-Za-z_]\w*)\s*:\s*$/.exec(headerLine.trimmed);
  if (!match) {
    pushDiagnostic(context.diagnostics, 'error', 'Entity declaration must be written as: entity Name:', locationOf(headerLine, 1));
    context.index += 1;
    return null;
  }

  const components = parseIndentedBlock(context, headerLine.indent, (line) => parseComponentDefinition(context, line));
  return {
    name: match[1],
    components,
    location: locationOf(headerLine, 1)
  };
}

function parseResource(context: ParseContext, line: ParsedLine): ResourceDefinition | null {
  const match = /^resource\s+([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(line.trimmed);
  if (!match) {
    pushDiagnostic(context.diagnostics, 'error', 'Resource declaration must be written as: resource name = value', locationOf(line, 1));
    return null;
  }

  return {
    name: match[1],
    value: parseValueExpression(match[2], context.diagnostics, line),
    location: locationOf(line, 1)
  };
}

function parseSystem(context: ParseContext, headerLine: ParsedLine): SystemDefinition | null {
  const match = /^system\s+([A-Za-z_]\w*)\s*:\s*$/.exec(headerLine.trimmed);
  if (!match) {
    pushDiagnostic(context.diagnostics, 'error', 'System declaration must be written as: system Name:', locationOf(headerLine, 1));
    context.index += 1;
    return null;
  }

  context.index += 1;
  const system: SystemDefinition = {
    name: match[1],
    statements: [],
    location: locationOf(headerLine, 1)
  };

  const expectedIndent = findNextIndent(context, headerLine.indent);
  if (expectedIndent === null) {
    pushDiagnostic(context.diagnostics, 'error', `System "${system.name}" needs an indented body.`, locationOf(headerLine, headerLine.raw.length));
    return system;
  }

  while (context.index < context.lines.length) {
    const line = context.lines[context.index];
    if (shouldSkip(line)) {
      context.index += 1;
      continue;
    }

    if (line.indent <= headerLine.indent) {
      break;
    }

    if (line.indent !== expectedIndent) {
      pushDiagnostic(context.diagnostics, 'error', 'System body indentation is inconsistent.', locationOf(line, 1));
      context.index += 1;
      continue;
    }

    if (line.trimmed === 'run every frame') {
      system.trigger = { type: 'every-frame' };
      context.index += 1;
      continue;
    }

    const everyMatch = /^run\s+every\s+([0-9]+(?:\.[0-9]+)?)s\s*$/.exec(line.trimmed);
    if (everyMatch) {
      system.trigger = { type: 'interval', seconds: Number(everyMatch[1]) };
      context.index += 1;
      continue;
    }

    if (line.trimmed === 'run on collision') {
      system.trigger = { type: 'collision' };
      context.index += 1;
      continue;
    }

    const selectMatch = /^select\s+entity\s+with\s+(.+)$/.exec(line.trimmed);
    if (selectMatch) {
      system.select = selectMatch[1]
        .split(',')
        .map((item) => parseSelectRequirement(item.trim(), context.diagnostics, line))
        .filter((item): item is SelectRequirement => item !== null);
      context.index += 1;
      continue;
    }

    const whenMatch = /^when\s+([A-Za-z_]\w*)\s+hits\s+([A-Za-z_]\w*)\s*$/.exec(line.trimmed);
    if (whenMatch) {
      system.when = {
        source: whenMatch[1],
        target: whenMatch[2],
        location: locationOf(line, 1)
      };
      context.index += 1;
      continue;
    }

    const statement = parseStatement(context, line);
    if (statement) {
      system.statements.push(statement);
    }
  }

  return system;
}

function parseSelectRequirement(
  rawRequirement: string,
  diagnostics: CompileDiagnostic[],
  line: ParsedLine
): SelectRequirement | null {
  const match = /^([A-Za-z_]\w*)(?:\s+(.+))?$/.exec(rawRequirement);
  if (!match) {
    pushDiagnostic(diagnostics, 'error', `Invalid select clause: "${rawRequirement}"`, locationOf(line, 1));
    return null;
  }

  const matchValue = match[2]?.trim();
  if (!matchValue) {
    return {
      componentName: match[1]
    };
  }

  const parsedValue = parseSelectValueExpression(matchValue);
  if (!parsedValue) {
    pushDiagnostic(diagnostics, 'error', `Invalid select filter value: "${matchValue}"`, locationOf(line, 1));
    return null;
  }

  return {
    componentName: match[1],
    matchValue: parsedValue
  };
}

function parseSelectValueExpression(rawValue: string): SelectValueExpression | null {
  if (/^-?[0-9]+(?:\.[0-9]+)?$/.test(rawValue)) {
    return {
      kind: 'number',
      value: Number(rawValue)
    } satisfies NumberLiteral;
  }

  const stringMatch = /^"([^"]+)"$/.exec(rawValue);
  if (stringMatch) {
    return {
      kind: 'string',
      value: stringMatch[1]
    } satisfies StringLiteral;
  }

  if (/^[A-Za-z_][\w-]*$/.test(rawValue)) {
    return {
      kind: 'identifier',
      value: rawValue
    } satisfies IdentifierLiteral;
  }

  return null;
}

function parseStatement(context: ParseContext, line: ParsedLine): Statement | null {
  const ifMatch = /^if\s+key\s+([A-Za-z])\s+down:\s*(.+)$/.exec(line.trimmed);
  if (ifMatch) {
    const nestedLine: ParsedLine = {
      ...line,
      trimmed: ifMatch[2]
    };
    const nested = parseInlineStatement(context, nestedLine);
    if (!nested) {
      pushDiagnostic(context.diagnostics, 'error', 'Conditional key statement must contain a supported action after the colon.', locationOf(line, 1));
      context.index += 1;
      return null;
    }

    context.index += 1;
    return {
      type: 'if-key-down',
      key: ifMatch[1].toUpperCase(),
      statement: nested,
      location: locationOf(line, 1)
    };
  }

  const spawnMatch = /^spawn\s+([A-Za-z_]\w*)\s*:\s*$/.exec(line.trimmed);
  if (spawnMatch) {
    return parseSpawnStatement(context, line, spawnMatch[1]);
  }

  const inline = parseInlineStatement(context, line);
  context.index += 1;
  return inline;
}

function parseInlineStatement(context: ParseContext, line: ParsedLine): Statement | null {
  if (line.trimmed === 'delete entity') {
    return {
      type: 'delete-entity',
      location: locationOf(line, 1)
    };
  }

  const mutationMatch = /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*(\+=|-=|=)\s*(.+)$/.exec(line.trimmed);
  if (mutationMatch) {
    return {
      type: 'mutation',
      target: {
        kind: 'reference',
        path: mutationMatch[1].split('.')
      },
      operator: mutationMatch[2] as MutationStatement['operator'],
      expression: parseValueExpression(mutationMatch[3], context.diagnostics, line),
      location: locationOf(line, 1)
    };
  }

  pushDiagnostic(context.diagnostics, 'error', `Unsupported system statement: "${line.trimmed}"`, locationOf(line, 1));
  return null;
}

function parseSpawnStatement(context: ParseContext, line: ParsedLine, entityName: string): SpawnStatement {
  const components = parseIndentedBlock(context, line.indent, (bodyLine) => parseComponentDefinition(context, bodyLine));

  return {
    type: 'spawn',
    entityName,
    components,
    location: locationOf(line, 1)
  };
}

function parseIndentedBlock<T>(
  context: ParseContext,
  parentIndent: number,
  parser: (line: ParsedLine) => T | null
): T[] {
  context.index += 1;
  const expectedIndent = findNextIndent(context, parentIndent);
  const items: T[] = [];

  if (expectedIndent === null) {
    const previousLine = context.lines[context.index - 1];
    pushDiagnostic(context.diagnostics, 'error', 'Indented block expected after declaration.', locationOf(previousLine, previousLine.raw.length));
    return items;
  }

  while (context.index < context.lines.length) {
    const line = context.lines[context.index];
    if (shouldSkip(line)) {
      context.index += 1;
      continue;
    }

    if (line.indent <= parentIndent) {
      break;
    }

    if (line.indent !== expectedIndent) {
      pushDiagnostic(context.diagnostics, 'error', 'Block indentation is inconsistent.', locationOf(line, 1));
      context.index += 1;
      continue;
    }

    const item = parser(line);
    if (item) {
      items.push(item);
    }
    context.index += 1;
  }

  return items;
}

function parseComponentDefinition(context: ParseContext, line: ParsedLine): ComponentDefinition | null {
  const vectorMatch = /^([A-Za-z_]\w*)\s*\(\s*(-?[0-9]+(?:\.[0-9]+)?)\s*,\s*(-?[0-9]+(?:\.[0-9]+)?)\s*\)\s*$/.exec(line.trimmed);
  if (vectorMatch) {
    return {
      name: vectorMatch[1],
      value: {
        kind: 'vector',
        x: Number(vectorMatch[2]),
        y: Number(vectorMatch[3])
      },
      location: locationOf(line, 1)
    };
  }

  const stringMatch = /^([A-Za-z_]\w*)\s+"([^"]+)"\s*$/.exec(line.trimmed);
  if (stringMatch) {
    return {
      name: stringMatch[1],
      value: {
        kind: 'string',
        value: stringMatch[2]
      },
      location: locationOf(line, 1)
    };
  }

  const numberMatch = /^([A-Za-z_]\w*)\s*(-?[0-9]+(?:\.[0-9]+)?)\s*$/.exec(line.trimmed);
  if (numberMatch) {
    return {
      name: numberMatch[1],
      value: {
        kind: 'number',
        value: Number(numberMatch[2])
      },
      location: locationOf(line, 1)
    };
  }

  const identifierMatch = /^([A-Za-z_]\w*)\s+([A-Za-z_][\w-]*)\s*$/.exec(line.trimmed);
  if (identifierMatch) {
    return {
      name: identifierMatch[1],
      value: {
        kind: 'identifier',
        value: identifierMatch[2]
      } satisfies IdentifierLiteral,
      location: locationOf(line, 1)
    };
  }

  pushDiagnostic(context.diagnostics, 'error', `Invalid component syntax: "${line.trimmed}"`, locationOf(line, 1));
  return null;
}

function parseValueExpression(value: string, diagnostics: CompileDiagnostic[], line: ParsedLine): ValueExpression {
  const trimmed = value.trim();

  if (/^-?[0-9]+(?:\.[0-9]+)?$/.test(trimmed)) {
    return {
      kind: 'number',
      value: Number(trimmed)
    };
  }

  const stringMatch = /^"([^"]+)"$/.exec(trimmed);
  if (stringMatch) {
    return {
      kind: 'string',
      value: stringMatch[1]
    };
  }

  const vectorMatch = /^\(\s*(-?[0-9]+(?:\.[0-9]+)?)\s*,\s*(-?[0-9]+(?:\.[0-9]+)?)\s*\)$/.exec(trimmed);
  if (vectorMatch) {
    return {
      kind: 'vector',
      x: Number(vectorMatch[1]),
      y: Number(vectorMatch[2])
    };
  }

  if (/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(trimmed)) {
    return {
      kind: 'reference',
      path: trimmed.split('.')
    } satisfies ReferenceExpression;
  }

  pushDiagnostic(diagnostics, 'error', `Unsupported value expression: "${trimmed}"`, locationOf(line, 1));
  return {
    kind: 'identifier',
    value: trimmed
  };
}

function shouldSkip(line: ParsedLine): boolean {
  return line.trimmed.length === 0 || line.trimmed.startsWith('#');
}

function findNextIndent(context: ParseContext, parentIndent: number): number | null {
  for (let index = context.index; index < context.lines.length; index += 1) {
    const line = context.lines[index];
    if (shouldSkip(line)) {
      continue;
    }

    if (line.indent <= parentIndent) {
      return null;
    }

    return line.indent;
  }

  return null;
}

function pushDiagnostic(
  diagnostics: CompileDiagnostic[],
  severity: CompileDiagnostic['severity'],
  message: string,
  location: SourceLocation,
  code?: string
): void {
  diagnostics.push({
    severity,
    message,
    location,
    code
  });
}

function locationOf(line: ParsedLine, column: number): SourceLocation {
  return {
    line: line.lineNumber,
    column
  };
}
