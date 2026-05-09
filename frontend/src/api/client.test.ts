import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getConfig, getFiles, getFile, putFile } from './client';

describe('api/client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getConfig parses the directory mode response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mode: 'directory' }),
    }));
    const config = await getConfig();
    expect(config).toEqual({ mode: 'directory' });
    expect(fetch).toHaveBeenCalledWith('/api/config');
  });

  it('getConfig parses the singleFile mode response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mode: 'singleFile', file: 'notes.md' }),
    }));
    const config = await getConfig();
    expect(config).toEqual({ mode: 'singleFile', file: 'notes.md' });
  });

  it('getFiles returns the tree', async () => {
    const tree = [{ type: 'file', name: 'a.md', path: 'a.md' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => tree,
    }));
    const result = await getFiles();
    expect(result).toEqual(tree);
    expect(fetch).toHaveBeenCalledWith('/api/files');
  });

  it('getFile reads a file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '# hi',
    }));
    const content = await getFile('readme.md');
    expect(content).toBe('# hi');
    expect(fetch).toHaveBeenCalledWith('/api/file?path=readme.md');
  });

  it('getFile url-encodes the path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'x',
    }));
    await getFile('docs/My Notes.md');
    expect(fetch).toHaveBeenCalledWith('/api/file?path=docs%2FMy%20Notes.md');
  });

  it('putFile sends the body as text/plain', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await putFile('readme.md', 'hello');
    expect(fetch).toHaveBeenCalledWith('/api/file?path=readme.md', expect.objectContaining({
      method: 'PUT',
      body: 'hello',
      headers: expect.objectContaining({ 'Content-Type': 'text/plain; charset=utf-8' }),
    }));
  });

  it('putFile rejects on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(putFile('missing.md', 'x')).rejects.toThrow(/404/);
  });

  it('getConfig rejects on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(getConfig()).rejects.toThrow(/500/);
  });

  it('getFiles rejects on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(getFiles()).rejects.toThrow(/500/);
  });

  it('getFile rejects on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(getFile('missing.md')).rejects.toThrow(/404/);
  });
});
