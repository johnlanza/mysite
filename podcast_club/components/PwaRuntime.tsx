'use client';

import { useEffect, useRef, useState } from 'react';
import { withBasePath } from '@/lib/base-path';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export type PwaWindow = Window & {
  __rpsInstallPrompt?: InstallPromptEvent;
};

export const PWA_INSTALL_READY_EVENT = 'rps-install-ready';
export const PWA_INSTALLED_EVENT = 'rps-installed';

export function PwaRuntime() {
  const [updateReady, setUpdateReady] = useState(false);
  const reloadForUpdate = useRef(false);

  useEffect(() => {
    const pwaWindow = window as PwaWindow;

    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      pwaWindow.__rpsInstallPrompt = event as InstallPromptEvent;
      window.dispatchEvent(new Event(PWA_INSTALL_READY_EVENT));
    };
    const markInstalled = () => {
      delete pwaWindow.__rpsInstallPrompt;
      window.dispatchEvent(new Event(PWA_INSTALLED_EVENT));
    };

    window.addEventListener('beforeinstallprompt', captureInstallPrompt);
    window.addEventListener('appinstalled', markInstalled);

    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) {
      return () => {
        window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
        window.removeEventListener('appinstalled', markInstalled);
      };
    }

    let disposed = false;
    const onControllerChange = () => {
      if (reloadForUpdate.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const registerWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register(withBasePath('/sw.js'), {
          scope: withBasePath('/')
        });
        if (disposed) return;
        if (registration.waiting && navigator.serviceWorker.controller) setUpdateReady(true);

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateReady(true);
            }
          });
        });

        const checkForUpdate = () => {
          if (document.visibilityState === 'visible') void registration.update();
        };
        document.addEventListener('visibilitychange', checkForUpdate);
        return () => document.removeEventListener('visibilitychange', checkForUpdate);
      } catch (error) {
        console.warn('[pwa] Service worker registration failed', error);
      }
      return undefined;
    };

    let removeVisibilityListener: (() => void) | undefined;
    void registerWorker().then((cleanup) => {
      if (disposed) cleanup?.();
      else removeVisibilityListener = cleanup;
    });

    return () => {
      disposed = true;
      removeVisibilityListener?.();
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
      window.removeEventListener('appinstalled', markInstalled);
    };
  }, []);

  const applyUpdate = async () => {
    const registration = await navigator.serviceWorker.getRegistration(withBasePath('/'));
    if (!registration?.waiting) {
      window.location.reload();
      return;
    }
    reloadForUpdate.current = true;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  return updateReady ? (
    <div className="pwa-update-toast" role="status">
      <span>
        <strong>A fresh Society update is ready.</strong>
        <small>Reload when you are ready to see it.</small>
      </span>
      <button type="button" onClick={() => void applyUpdate()}>
        Reload
      </button>
    </div>
  ) : null;
}
