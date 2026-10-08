const KEY = 'drop.userId';
let memoryId: string | undefined; 

const create = () => `u_${crypto.randomUUID().replace(/-/g, '')}`;

export function getUserId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const id = create();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return (memoryId ??= create());
  }
}