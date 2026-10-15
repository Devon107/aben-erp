import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { message, isError } | null
  const timeoutRef = useRef(null);

  const showToast = useCallback((message, isError = false) => {
    clearTimeout(timeoutRef.current);
    setToast({ message, isError });
    timeoutRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className={`toast ${toast ? '' : 'hidden'} ${toast?.isError ? 'error' : ''}`}>
        {toast?.message ?? ''}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}
