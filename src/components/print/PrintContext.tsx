import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { renderToString } from 'react-dom/server';

interface PrintContextType {
  printReport: (content: React.ReactElement) => void;
  printHtmlString: (html: string) => void;
  isPrinting: boolean;
}

const PrintContext = createContext<PrintContextType>({
  printReport: () => {},
  printHtmlString: () => {},
  isPrinting: false,
});

export const usePrint = () => useContext(PrintContext);

/**
 * Clears any residual print markup from #print-root.
 */
export function clearPrintRoot(): void {
  if (typeof document === 'undefined') return;
  const printRoot = document.getElementById('print-root');
  if (printRoot) {
    printRoot.innerHTML = '';
  }
}

/**
 * Injects rendered HTML into #print-root, triggers the native print dialog,
 * and clears #print-root automatically once printing completes.
 */
export function printHtml(htmlString: string, onComplete?: () => void): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    onComplete?.();
    return;
  }

  const printRoot = document.getElementById('print-root');
  if (!printRoot) {
    console.error('#print-root element not found in DOM');
    onComplete?.();
    return;
  }

  printRoot.className = 'print-area bg-white text-black';
  printRoot.innerHTML = htmlString;

  let cleaned = false;
  let fallbackTimer: number | undefined;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (fallbackTimer !== undefined) {
      window.clearTimeout(fallbackTimer);
    }
    window.removeEventListener('afterprint', cleanup);
    clearPrintRoot();
    onComplete?.();
  };

  window.addEventListener('afterprint', cleanup, { once: true });
  fallbackTimer = window.setTimeout(cleanup, 60000);

  window.setTimeout(() => {
    try {
      window.print();
    } catch (err) {
      console.error('[Print Engine] window.print() failed:', err);
      cleanup();
    }
  }, 100);
}

export const PrintProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    return () => {
      clearPrintRoot();
    };
  }, []);

  const printHtmlString = useCallback((html: string) => {
    setIsPrinting(true);
    printHtml(html, () => setIsPrinting(false));
  }, []);

  const printReport = useCallback((content: React.ReactElement) => {
    try {
      setIsPrinting(true);
      const htmlString = renderToString(content);
      printHtml(htmlString, () => setIsPrinting(false));
    } catch (err) {
      console.error('[Print Engine] Error rendering print template:', err);
      clearPrintRoot();
      setIsPrinting(false);
    }
  }, []);

  return (
    <PrintContext.Provider value={{ printReport, printHtmlString, isPrinting }}>
      {children}
    </PrintContext.Provider>
  );
};
