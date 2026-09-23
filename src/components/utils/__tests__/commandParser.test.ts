import { describe, expect, it } from 'vitest';
import { parseCommand } from '../commandParser';

describe('焦点视图命令', () => {
  it('识别焦点视图的常用表达', () => {
    expect(parseCommand('焦点')).toEqual({ kind: 'open-view', view: 'focus' });
    expect(parseCommand('打开今天只看这几件事')).toEqual({ kind: 'open-view', view: 'focus' });
  });
});
