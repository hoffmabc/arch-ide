import React, { useMemo, useState } from 'react';
import { Button } from './ui/button';
import { ClipboardIcon, ExternalLink } from 'lucide-react';
import { hexToBase58 } from '../utils/base58';

interface FormatToggleInputProps {
  label?: string;
  hex: string; // 32-byte pubkey hex
  explorerHref?: string;
  className?: string;
}

export const FormatToggleInput: React.FC<FormatToggleInputProps> = ({
  label,
  hex,
  explorerHref,
  className,
}) => {
  const [format, setFormat] = useState<'base58' | 'hex'>('base58');
  const base58Value = useMemo(() => hexToBase58(hex), [hex]);
  const displayValue = format === 'base58' ? base58Value : hex;

  const copy = () => navigator.clipboard.writeText(displayValue);

  return (
    <div className={`space-y-2 ${className || ''}`}>
      {label && <div className="text-xs text-gray-400">{label}</div>}

      <div className="flex items-center gap-2">
        {/* Segmented toggle */}
        <div className="flex rounded-md overflow-hidden border border-gray-700">
          <button
            type="button"
            className={`px-2 py-1 text-xs ${format === 'base58' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-300'}`}
            onClick={() => setFormat('base58')}
          >
            Base58
          </button>
          <button
            type="button"
            className={`px-2 py-1 text-xs border-l border-gray-700 ${format === 'hex' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-300'}`}
            onClick={() => setFormat('hex')}
          >
            Hex
          </button>
        </div>

        <input
          readOnly
          value={displayValue}
          className="flex-1 text-xs font-mono bg-gray-900 border border-gray-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-500"
          onFocus={(e) => e.currentTarget.select()}
        />

        <Button variant="ghost" size="sm" onClick={copy} className="h-7 px-2">
          <ClipboardIcon className="h-3 w-3 mr-1" />
          <span className="text-xs">Copy</span>
        </Button>

        {explorerHref && (
          <a href={explorerHref} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm" className="h-7 px-2">
              <ExternalLink className="h-3 w-3 mr-1" />
              <span className="text-xs">Explorer</span>
            </Button>
          </a>
        )}
      </div>
    </div>
  );
};

export default FormatToggleInput;
