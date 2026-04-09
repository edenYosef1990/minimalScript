import { describe, expect, it } from 'vitest';

import { EdenScriptCompilerService } from './eden-script-compiler.service';

describe('EdenScriptCompilerService', () => {
  const compiler = new EdenScriptCompilerService();

  it('emits a warning for collision systems while still compiling', () => {
    const source = `entity Player:\n  position (0, 0)\n\nsystem Collision:\n  run on collision\n  when bullet hits enemy\n  delete entity\n`;
    const result = compiler.compile(source);

    expect(result.program).toBeDefined();
    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === 'warning')).toBe(true);
  });

  it('fails compilation when spawn references an unknown entity', () => {
    const source = `system Spawn:\n  run every 1s\n  spawn Missing:\n    position (1, 1)\n`;
    const result = compiler.compile(source);

    expect(result.program).toBeUndefined();
    expect(result.diagnostics.some((diagnostic) => diagnostic.message.includes('unknown entity'))).toBe(true);
  });
});
