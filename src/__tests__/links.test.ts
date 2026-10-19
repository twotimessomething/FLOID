import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openExternal } from '../platform/links';

let open: ReturnType<typeof vi.fn>;

beforeEach(() => {
  open = vi.fn();
  vi.stubGlobal('open', open);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('openExternal on the web', () => {
  it('opens a web page in a new tab, without handing it this window', async () => {
    await openExternal('https://github.com/floid');
    expect(open).toHaveBeenCalledWith('https://github.com/floid', '_blank', 'noopener');
  });

  it('refuses anything that is neither a web page nor mail', async () => {
    await openExternal('javascript:alert(1)');
    await openExternal('http://example.com');
    await openExternal('file:///etc/hosts');
    await openExternal('not a url');
    expect(open).not.toHaveBeenCalled();
  });
});
