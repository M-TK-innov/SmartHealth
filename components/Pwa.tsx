'use client';

import { useEffect, useState } from 'react';

/**
 * Runtime PWA : enregistrement du service worker, invitation a installer
 * l'application, et bandeau d'etat reseau.
 *
 * Le bandeau hors-ligne n'est pas cosmetique : en consultation, le praticien
 * doit savoir immediatement que ce qu'il dicte n'est plus synchronise avec le
 * serveur, sans avoir a le decouvrir en cliquant sur « Analyser ».
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    smarthealth?: { platform: string };
  }
}

/** Coque Electron : detectee par le pont preload, ou a defaut par l'agent utilisateur. */
function isDesktopShell(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.smarthealth?.platform === 'desktop') return true;
  return / SmartHealthDesktop/.test(navigator.userAgent);
}

export function PwaRuntime() {
  const [offline, setOffline] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);

  // --- service worker (inutile dans la coque desktop, qui est deja locale)
  useEffect(() => {
    if (isDesktopShell()) return;
    if (!('serviceWorker' in navigator)) return;
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return;

    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  // --- etat reseau
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  // --- invitation a installer
  useEffect(() => {
    if (isDesktopShell()) return;
    try {
      setDismissed(localStorage.getItem('pd-install-dismissed') === '1');
    } catch {
      setDismissed(false);
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  function refuse() {
    setInstallEvent(null);
    setDismissed(true);
    try {
      localStorage.setItem('pd-install-dismissed', '1');
    } catch {
      /* mode navigation privee : on ne memorise simplement rien */
    }
  }

  return (
    <>
      {offline && (
        <div
          role="status"
          className="no-print sticky top-0 z-50 bg-warn px-4 py-1.5 text-center text-xs font-semibold text-white"
        >
          Hors ligne — la transcription continue et sera envoyée au rétablissement du réseau.
        </div>
      )}

      {installEvent && !dismissed && (
        <div className="no-print fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 rounded-xl border border-line bg-white p-3 shadow-lg md:inset-x-auto md:right-4 md:bottom-4 md:max-w-sm">
          <p className="text-sm font-semibold">Installer SmartHealth</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            Ajoutez l application à l écran d accueil : ouverture en plein écran, démarrage instantané et accès
            direct même sans réseau.
          </p>
          <div className="mt-2.5 flex gap-2">
            <button className="btn-primary btn-sm" onClick={install}>
              Installer
            </button>
            <button className="btn-ghost btn-sm" onClick={refuse}>
              Plus tard
            </button>
          </div>
        </div>
      )}
    </>
  );
}
