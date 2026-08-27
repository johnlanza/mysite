'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  PWA_INSTALLED_EVENT,
  PWA_INSTALL_READY_EVENT,
  type PwaWindow
} from '@/components/PwaRuntime';

function isStandalone() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
}

export function PwaInstallCard() {
  const [installed, setInstalled] = useState(false);
  const [installReady, setInstallReady] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');

  const refreshState = useCallback(() => {
    const userAgent = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setPlatform(ios ? 'ios' : /Android/i.test(userAgent) ? 'android' : 'desktop');
    setInstalled(isStandalone());
    setInstallReady(Boolean((window as PwaWindow).__rpsInstallPrompt));
  }, []);

  useEffect(() => {
    refreshState();
    window.addEventListener(PWA_INSTALL_READY_EVENT, refreshState);
    window.addEventListener(PWA_INSTALLED_EVENT, refreshState);
    const displayMode = window.matchMedia('(display-mode: standalone)');
    displayMode.addEventListener('change', refreshState);
    return () => {
      window.removeEventListener(PWA_INSTALL_READY_EVENT, refreshState);
      window.removeEventListener(PWA_INSTALLED_EVENT, refreshState);
      displayMode.removeEventListener('change', refreshState);
    };
  }, [refreshState]);

  const install = async () => {
    const pwaWindow = window as PwaWindow;
    const prompt = pwaWindow.__rpsInstallPrompt;
    if (!prompt) return;
    setInstalling(true);
    await prompt.prompt();
    await prompt.userChoice;
    delete pwaWindow.__rpsInstallPrompt;
    setInstalling(false);
    refreshState();
  };

  return (
    <section className="pwa-install-card" aria-labelledby="pwa-install-title">
      <div className="pwa-install-art" aria-hidden="true">
        <span>RPS</span>
      </div>
      <div className="pwa-install-copy">
        <div className="pwa-install-heading">
          <p className="section-kicker">NEW!</p>
          <h3 id="pwa-install-title">Put the Society on your Home Screen</h3>
        </div>
        <p>Open it like an app, with the same private club account and the full current site.</p>

        {installed ? (
          <p className="pwa-installed-status"><span aria-hidden="true">✓</span> Installed on this device</p>
        ) : installReady ? (
          <button className="pwa-install-button" type="button" onClick={() => void install()} disabled={installing}>
            {installing ? 'Opening install…' : 'Install Society App'}
          </button>
        ) : platform === 'ios' ? (
          <ol className="pwa-install-steps">
            <li>Tap the <strong>Share</strong> button in Safari.</li>
            <li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
          </ol>
        ) : platform === 'android' ? (
          <p className="pwa-install-instruction">In Chrome, open the menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>
        ) : (
          <p className="pwa-install-instruction">Use your browser’s install icon or menu and choose <strong>Install Royal Podcast Society</strong>.</p>
        )}

        <p className="pwa-install-note">Best done while signed in. Installing adds an icon; membership still controls access.</p>
      </div>
    </section>
  );
}
