import { describe, expect, it } from 'vitest';
import { mapBooleanFields } from '../utils';

describe('mapBooleanFields', () => {
  it('normalizes numeric and string SQLite boolean values', () => {
    const mapped = mapBooleanFields(
      { completed: '0', deleted: '1', reminderFired: 0 },
      ['completed', 'deleted', 'reminderFired']
    );

    expect(mapped).toEqual({ completed: false, deleted: true, reminderFired: false });
  });

  it('preserves already normalized booleans', () => {
    const mapped = mapBooleanFields({ completed: false, deleted: true }, ['completed', 'deleted']);
    expect(mapped).toEqual({ completed: false, deleted: true });
  });
});
