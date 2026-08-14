'use client';

import { useEffect, useState } from 'react';
import { withBasePath } from '@/lib/base-path';
import {
  DEFAULT_PALETTE,
  getMemberPaletteStorageKey,
  isPaletteId,
  PALETTE_STORAGE_KEY,
  type PaletteId
} from '@/lib/palettes';
import { useSession } from '@/lib/use-session';

const palettes: Array<{
  id: PaletteId;
  name: string;
  description: string;
  colors: string[];
}> = [
  {
    id: 'vibrant-fiesta',
    name: 'Vibrant Color Fiesta',
    description: 'Bright, energetic jewel tones.',
    colors: ['#FFBE0B', '#FB5607', '#FF006E', '#8338EC', '#3A86FF']
  },
  {
    id: 'golden-meadow',
    name: 'Golden Meadow',
    description: 'Warm sunshine and fresh greens.',
    colors: ['#FB6107', '#F3DE2C', '#7CB518', '#5C8001', '#FBB02D']
  },
  {
    id: 'pastel-daydream',
    name: 'Pastel Daydream',
    description: 'Soft candy pastels with airy blues.',
    colors: ['#FF99C8', '#FCF6BD', '#D0F4DE', '#A9DEF9', '#E4C1F9']
  },
  {
    id: 'vintage-garden',
    name: 'Vintage Garden',
    description: 'Earthy olive, linen, and dusty rose.',
    colors: ['#A3A380', '#D6CE93', '#EFEBCE', '#D8A48F', '#BB8588']
  },
  {
    id: 'soft-bloom',
    name: 'Soft Bloom',
    description: 'Blush florals with calm green and blue.',
    colors: ['#E27396', '#EA9AB2', '#EFCFE3', '#EAF2D7', '#B3DEE2']
  }
];

export function PaletteSelector() {
  const { loading, member } = useSession();
  const [selectedPalette, setSelectedPalette] = useState<PaletteId>(DEFAULT_PALETTE);
  const [hasLoadedPreference, setHasLoadedPreference] = useState(false);

  useEffect(() => {
    if (loading) return;

    const memberStorageKey = member ? getMemberPaletteStorageKey(member._id) : null;
    const savedMemberPalette = memberStorageKey ? window.localStorage.getItem(memberStorageKey) : null;
    const savedDevicePalette = window.localStorage.getItem(PALETTE_STORAGE_KEY);
    const activePalette = isPaletteId(savedMemberPalette)
      ? savedMemberPalette
      : isPaletteId(member?.palette)
        ? member.palette
        : isPaletteId(savedDevicePalette)
          ? savedDevicePalette
          : DEFAULT_PALETTE;

    setSelectedPalette(activePalette);
    setHasLoadedPreference(true);
  }, [loading, member]);

  useEffect(() => {
    if (!hasLoadedPreference) return;

    document.documentElement.dataset.palette = selectedPalette;
    window.localStorage.setItem(PALETTE_STORAGE_KEY, selectedPalette);
    if (member) {
      window.localStorage.setItem(getMemberPaletteStorageKey(member._id), selectedPalette);
    }
  }, [hasLoadedPreference, member, selectedPalette]);

  function choosePalette(palette: PaletteId) {
    setSelectedPalette(palette);

    if (!member) return;
    void fetch(withBasePath('/api/auth/palette'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ palette })
    }).catch(() => undefined);
  }

  return (
    <section className="more-menu-section appearance-section" aria-labelledby="appearance-title">
      <p className="section-kicker">Appearance</p>
      <div className="appearance-heading">
        <div>
          <h3 id="appearance-title">Color theme</h3>
          <p>Choose how Podcast Club looks on this device.</p>
        </div>
      </div>
      <div className="palette-options" role="group" aria-label="Color theme">
        {palettes.map((palette) => {
          const selected = selectedPalette === palette.id;

          return (
            <button
              key={palette.id}
              type="button"
              className={selected ? 'palette-option selected' : 'palette-option'}
              aria-pressed={selected}
              onClick={() => choosePalette(palette.id)}
            >
              <span className="palette-swatch-row" aria-hidden="true">
                {palette.colors.map((color) => (
                  <span key={color} className="palette-swatch" style={{ backgroundColor: color }} />
                ))}
              </span>
              <span className="palette-option-copy">
                <strong>{palette.name}</strong>
                <small>{palette.description}</small>
              </span>
              <span className="palette-selection-mark" aria-hidden="true">
                {selected ? '✓' : ''}
              </span>
            </button>
          );
        })}
      </div>
      <a className="palette-attribution" href="https://coolors.co/" target="_blank" rel="noreferrer">
        Palettes provided by Coolors.co.
      </a>
    </section>
  );
}
