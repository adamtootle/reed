export type LaunchMode =
  | { mode: 'directory' }
  | { mode: 'singleFile'; file: string };

export type FileNodeType = 'file' | 'directory' | 'cap';

export interface FileNode {
  name?: string;
  path?: string;
  type: FileNodeType;
  message?: string;
  children?: FileNode[];
}
