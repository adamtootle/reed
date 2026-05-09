import type { LaunchMode, FileNode } from './types';

export async function getConfig(): Promise<LaunchMode> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error(`getConfig failed: ${res.status}`);
  return res.json() as Promise<LaunchMode>;
}

export async function getFiles(): Promise<FileNode[]> {
  const res = await fetch('/api/files');
  if (!res.ok) throw new Error(`getFiles failed: ${res.status}`);
  return res.json() as Promise<FileNode[]>;
}

export async function getFile(path: string): Promise<string> {
  const url = `/api/file?path=${encodeURIComponent(path)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`getFile failed: ${res.status}`);
  return res.text();
}

export async function putFile(path: string, content: string): Promise<void> {
  const url = `/api/file?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: content,
    keepalive: true,
  });
  if (!res.ok) throw new Error(`putFile failed: ${res.status}`);
}
