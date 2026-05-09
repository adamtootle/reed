export type LaunchMode =
  | { mode: 'directory'; rootName: string }
  | { mode: 'singleFile'; file: string; rootName: string };

export type FileNodeType = 'file' | 'directory' | 'cap';

export interface FileNode {
  name?: string;
  path?: string;
  type: FileNodeType;
  message?: string;
  children?: FileNode[];
}
