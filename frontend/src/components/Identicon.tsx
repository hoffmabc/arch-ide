import React, { useMemo } from 'react';

// Lightweight blockies-like identicon using canvas-generated data URI
function hashToInts(input: string, count: number): number[] {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    h1 ^= h1 >>> 13;
    h1 = Math.imul(h1, 0x5bd1e995);
    h1 ^= h1 >>> 15;
    result.push(Math.abs(h1));
  }
  return result;
}

interface IdenticonProps {
  value: string;
  size?: number; // CSS size
  squares?: number; // grid squares (odd)
  className?: string;
}

export const Identicon: React.FC<IdenticonProps> = ({ value, size = 16, squares = 5, className }) => {
  const dataUrl = useMemo(() => {
    const cell = 20;
    const dim = squares * cell;
    const canvas = document.createElement('canvas');
    canvas.width = dim;
    canvas.height = dim;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Colors from hash
    const [h1, h2, h3] = hashToInts(value, 3);
    const hue = h1 % 360;
    const color = `hsl(${hue}, 60%, 55%)`;
    const bg = 'hsl(220, 16%, 20%)';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, dim, dim);

    // Symmetric pattern
    const pattern = hashToInts(value, (squares * Math.ceil(squares / 2)));
    let p = 0;
    for (let y = 0; y < squares; y++) {
      for (let x = 0; x < Math.ceil(squares / 2); x++) {
        const v = pattern[p++] % 2 === 0;
        if (v) {
          ctx.fillStyle = color;
          ctx.fillRect(x * cell, y * cell, cell, cell);
          ctx.fillRect((squares - 1 - x) * cell, y * cell, cell, cell);
        }
      }
    }

    return canvas.toDataURL();
  }, [value, squares]);

  return (
    <img src={dataUrl} width={size} height={size} className={className} alt="identicon" />
  );
};

export default Identicon;
