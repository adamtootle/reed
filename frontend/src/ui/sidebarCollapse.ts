export interface SidebarCollapseElements {
  sidebar: HTMLElement;
  collapseBtn: HTMLElement;
  expandHandle: HTMLElement;
}

export class SidebarCollapseController {
  constructor(private readonly els: SidebarCollapseElements) {}

  start(): void {
    this.els.collapseBtn.addEventListener('click', () => this.collapse());
    this.els.expandHandle.addEventListener('click', () => this.expand());
    window.addEventListener('keydown', (ev) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === '\\') {
        ev.preventDefault();
        this.toggle();
      }
    });
  }

  toggle(): void {
    if (this.els.sidebar.classList.contains('hidden')) this.expand();
    else this.collapse();
  }

  collapse(): void {
    this.els.sidebar.classList.add('hidden');
    this.els.expandHandle.classList.remove('hidden');
  }

  expand(): void {
    this.els.sidebar.classList.remove('hidden');
    this.els.expandHandle.classList.add('hidden');
  }
}
