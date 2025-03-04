import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export const BrowserCompatibilityAlert = () => {
  const [browser, setBrowser] = useState<string>('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Detect browser
    if (navigator.userAgent.includes("Safari") && !navigator.userAgent.includes("Chrome")) {
      setBrowser('safari');
    }
  }, []);

  if (browser !== 'safari' || dismissed) return null;

  return (
    <div className="fixed top-4 right-4 max-w-md bg-yellow-50 border border-yellow-200 rounded-lg p-4 shadow-lg animate-in fade-in slide-in-from-top-4 z-50">
      <div className="flex gap-3">
        <AlertTriangle className="h-5 w-5 text-yellow-700 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-medium text-yellow-800">Browser Compatibility Notice</h3>
          <p className="text-sm text-yellow-700 mt-1">
            For the best experience, including full Bitcoin wallet support, we recommend using Chrome or Firefox. Some features may be limited in Safari.
          </p>
          <div className="mt-3 flex gap-3">
            <button
              onClick={() => setDismissed(true)}
              className="text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-3 py-1.5 rounded-md transition-colors"
            >
              Dismiss
            </button>
            <a
              href="https://www.google.com/chrome"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-yellow-700 hover:bg-yellow-800 text-white px-3 py-1.5 rounded-md transition-colors"
            >
              Download Chrome
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};