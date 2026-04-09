export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface SourceLocation {
  line: number;
  column: number;
  length?: number;
}

export interface CompileDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  location: SourceLocation;
  code?: string;
}

export interface Program {
  source: string;
  entities: EntityDefinition[];
  resources: ResourceDefinition[];
  systems: SystemDefinition[];
}

export interface EntityDefinition {
  name: string;
  components: ComponentDefinition[];
  location: SourceLocation;
}

export interface ResourceDefinition {
  name: string;
  value: ValueExpression;
  location: SourceLocation;
}

export interface ComponentDefinition {
  name: string;
  value: ValueExpression;
  location: SourceLocation;
}

export interface SystemDefinition {
  name: string;
  trigger?: SystemTrigger;
  select?: string[];
  statements: Statement[];
  when?: CollisionClause;
  location: SourceLocation;
}

export type SystemTrigger =
  | { type: 'every-frame' }
  | { type: 'interval'; seconds: number }
  | { type: 'collision' };

export interface CollisionClause {
  source: string;
  target: string;
  location: SourceLocation;
}

export type Statement =
  | MutationStatement
  | ConditionalKeyStatement
  | SpawnStatement
  | DeleteEntityStatement;

export interface MutationStatement {
  type: 'mutation';
  target: ReferenceExpression;
  operator: '=' | '+=' | '-=';
  expression: ValueExpression;
  location: SourceLocation;
}

export interface ConditionalKeyStatement {
  type: 'if-key-down';
  key: string;
  statement: Statement;
  location: SourceLocation;
}

export interface SpawnStatement {
  type: 'spawn';
  entityName: string;
  components: ComponentDefinition[];
  location: SourceLocation;
}

export interface DeleteEntityStatement {
  type: 'delete-entity';
  location: SourceLocation;
}

export type ValueExpression =
  | NumberLiteral
  | StringLiteral
  | VectorLiteral
  | ReferenceExpression
  | IdentifierLiteral;

export interface NumberLiteral {
  kind: 'number';
  value: number;
}

export interface StringLiteral {
  kind: 'string';
  value: string;
}

export interface VectorLiteral {
  kind: 'vector';
  x: number;
  y: number;
}

export interface ReferenceExpression {
  kind: 'reference';
  path: string[];
}

export interface IdentifierLiteral {
  kind: 'identifier';
  value: string;
}

export interface CompileResult {
  program?: Program;
  diagnostics: CompileDiagnostic[];
}

export interface RuntimeEntity {
  id: number;
  name: string;
  components: Record<string, RuntimeValue>;
  markedForDeletion?: boolean;
}

export type RuntimeValue =
  | number
  | string
  | RuntimeVector
  | boolean
  | null
  | undefined;

export interface RuntimeVector {
  x: number;
  y: number;
}

export interface RuntimeWorldSummary {
  entityCount: number;
  runningSystems: number;
  activeSprites: number;
}

