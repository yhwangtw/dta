export interface QueuedFollowUpImage {
  data: string;
  mimeType: string;
}

export interface QueuedFollowUp {
  id: string;
  message: string;
  images?: QueuedFollowUpImage[];
}

export function moveQueuedFollowUp(
  items: QueuedFollowUp[],
  id: string,
  direction: -1 | 1,
): QueuedFollowUp[] {
  const index = items.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function updateQueuedFollowUp(
  items: QueuedFollowUp[],
  id: string,
  message: string,
): QueuedFollowUp[] {
  return items.map((item) => item.id === id ? { ...item, message } : item);
}
