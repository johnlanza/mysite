import type { MetadataRoute } from 'next';
import { withBasePath } from '@/lib/base-path';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: withBasePath('/'),
    name: 'Royal Podcast Society',
    short_name: 'Podcast Society',
    description: 'The private home for Royal Podcast Society listening, voting, and meetings.',
    start_url: withBasePath('/'),
    scope: withBasePath('/'),
    display: 'standalone',
    background_color: '#071a36',
    theme_color: '#071a36',
    categories: ['entertainment', 'social'],
    icons: [
      {
        src: withBasePath('/icons/rps-192.png'),
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: withBasePath('/icons/rps-512.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: withBasePath('/icons/rps-maskable-512.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ]
  };
}
