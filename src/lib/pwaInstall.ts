// Capture the browser's install prompt (Android/desktop Chrome/Edge) so we can offer
// an in-app "Install" button. iOS Safari has no such API — there we show instructions.
type BIPEvent = Event & { prompt: () => void; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: BIPEvent | null = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BIPEvent;
  window.dispatchEvent(new Event('pwa-installable'));
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  window.dispatchEvent(new Event('pwa-installed'));
});

export const getInstallPrompt = () => deferred;

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  if (outcome === 'accepted') deferred = null;
  return outcome === 'accepted';
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone === true);

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
