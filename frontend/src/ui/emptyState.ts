export type EmptyStateKind =
  | { kind: 'select-file' }
  | { kind: 'no-markdown' }
  | { kind: 'connection-lost' }
  | { kind: 'file-deleted' };

export function renderEmptyState(target: HTMLElement, state: EmptyStateKind): void {
  const messages: Record<EmptyStateKind['kind'], string> = {
    'select-file': 'Select a file to open.',
    'no-markdown': 'No markdown files in this folder.',
    'connection-lost': 'Connection lost — refresh the page when reed is running again.',
    'file-deleted': 'File no longer exists.',
  };
  target.innerHTML = `<div class="h-full flex items-center justify-center text-zinc-500">${messages[state.kind]}</div>`;
}
