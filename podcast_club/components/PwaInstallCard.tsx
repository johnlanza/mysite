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
  const [instructionsOpen, setInstructionsOpen] = useState(false);
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

  const handleInstallAction = async () => {
    if (installReady) {
      await install();
      return;
    }
    setInstructionsOpen((current) => !current);
  };

  const overviewContent = (
    <>
      <span className="pwa-install-art" aria-hidden="true">
        <span>RPS</span>
      </span>
      <span className="pwa-install-copy">
        <span className="pwa-install-heading">
          <span className="section-kicker">NEW!</span>
          <span className="pwa-install-title" id="pwa-install-title">Put the Society on your Home Screen</span>
        </span>
        <span className="pwa-install-description">Open it like an app, with the same private club account and the full current site.</span>
        {!installed ? (
          <span className="pwa-install-card-cta">
            {installing
              ? 'Opening install…'
              : installReady
                ? 'Install Society App'
                : instructionsOpen
                  ? 'Hide instructions'
                  : 'Show me how'}
            <span aria-hidden="true">{instructionsOpen && !installReady ? '−' : '›'}</span>
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <section className="pwa-install-card" aria-labelledby="pwa-install-title">
      {installed ? (
        <div className="pwa-install-overview is-installed">{overviewContent}</div>
      ) : (
        <button
          className="pwa-install-overview"
          type="button"
          onClick={() => void handleInstallAction()}
          disabled={installing}
          aria-expanded={installReady ? undefined : instructionsOpen}
          aria-controls={installReady ? undefined : 'pwa-install-guide'}
        >
          {overviewContent}
        </button>
      )}

      {installed ? (
        <p className="pwa-installed-status"><span aria-hidden="true">✓</span> Installed on this device</p>
      ) : instructionsOpen && !installReady ? (
        <div className="pwa-install-guide" id="pwa-install-guide" role="region" aria-label="Installation instructions">
          <strong>
            {platform === 'ios'
              ? 'Install on iPhone or iPad'
              : platform === 'android'
                ? 'Install on Android'
                : 'Install on this computer'}
          </strong>
          {platform === 'ios' ? (
          <ol className="pwa-install-steps">
            <li>Open this preview in <strong>Safari</strong>.</li>
            <li>Tap the <strong>Share</strong> button.</li>
            <li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
          </ol>
        ) : platform === 'android' ? (
          <ol className="pwa-install-steps">
            <li>Open this preview in <strong>Chrome</strong>.</li>
            <li>Open the browser menu.</li>
            <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
          </ol>
        ) : (
          <p className="pwa-install-instruction">Use Chrome or Edge, open the browser’s install icon or menu, and choose <strong>Install Royal Podcast Society</strong>.</p>
        )}
        </div>
      ) : null}

      <p className="pwa-install-note">Best done while signed in. Installing adds an icon; membership still controls access.</p>
    </section>
  );
}
