'use client';

import { useEffect } from 'react';
import {
  DEFAULT_PALETTE,
  getMemberPaletteStorageKey,
  isPaletteId,
  PALETTE_STORAGE_KEY
} from '@/lib/palettes';
import { useSession } from '@/lib/use-session';

export function PalettePreferenceSync() {
  const { loading, member } = useSession();

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

    document.documentElement.dataset.palette = activePalette;
    window.localStorage.setItem(PALETTE_STORAGE_KEY, activePalette);
    if (memberStorageKey) {
      window.localStorage.setItem(memberStorageKey, activePalette);
    }
  }, [loading, member]);

  return null;
}
