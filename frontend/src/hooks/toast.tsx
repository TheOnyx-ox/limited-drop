import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Kind = 'info' | 'success' | 'error';
interface Item {
  id: number;
  kind: Kind;
  text: string;
}
type Push = (kind: Kind, text: string) => void;

const ToastContext = createContext<Push>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const nextId = useRef(1);

  const dismiss = (id: number) => setItems((cur) => cur.filter((t) => t.id !== id));

  const push = useCallback<Push>((kind, text) => {
    const id = nextId.current++;
    setItems((cur) => [...cur.slice(-2), { id, kind, text }]); 
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 4500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span>{t.text}</span>
            <button type="button" onClick={() => dismiss(t.id)}>
              Close
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}