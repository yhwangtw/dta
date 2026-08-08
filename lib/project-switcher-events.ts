const OPEN_PROJECT_SWITCHER_EVENT = "pi:open-project-switcher";

export function requestOpenProjectSwitcher(): void {
  window.dispatchEvent(new Event(OPEN_PROJECT_SWITCHER_EVENT));
}

export function onOpenProjectSwitcher(listener: () => void): () => void {
  window.addEventListener(OPEN_PROJECT_SWITCHER_EVENT, listener);
  return () => window.removeEventListener(OPEN_PROJECT_SWITCHER_EVENT, listener);
}
