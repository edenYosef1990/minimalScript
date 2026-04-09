import { describe, expect, it } from 'vitest';

import { EDEN_SAMPLES } from './samples';
import { parseEdenScript } from './parser';

describe('parseEdenScript', () => {
  it('parses the bundled sample into entities and systems', () => {
    const result = parseEdenScript(EDEN_SAMPLES[0].source);

    expect(result.diagnostics).toEqual([]);
    expect(result.program.entities.map((entity) => entity.name)).toEqual(['Player', 'Enemy']);
    expect(result.program.systems.map((system) => system.name)).toEqual(['Input', 'Move', 'SpawnEnemies']);
    expect(result.program.systems[2].statements[0]).toMatchObject({
      type: 'spawn',
      entityName: 'Enemy'
    });
  });

  it('reports malformed top-level statements', () => {
    const result = parseEdenScript('entity Broken\n  position (1, 2)');

    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(true);
  });
});
