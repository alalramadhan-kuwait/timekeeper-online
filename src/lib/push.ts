import { supabase } from './supabase';

// VAPID public key (safe to ship). Private key lives only in Supabase (push_config).
const VAPID_PUBLIC = 'BCuMWlRm0tjzqkOHVmvMA_4o4OOlurmpkRjIi8qsaSZeoNkRy2aLny3SXSjbghmfMMUsSnQngGXWObpRCvOstAI';

export const pushSupported = () =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** iPhone/iPad Safari can only push when the app is installed to the home screen. */
export const isIosNotInstalled = () => {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = ('standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone) ||
    window.matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
};

function urlB64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`); } catch { return null; }
}

export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: 'This browser does not support notifications.' };
  if (isIosNotInstalled()) return { ok: false, error: 'On iPhone: open Share → Add to Home Screen, then open the app from your home screen and enable notifications there.' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, error: 'Notification permission was not granted.' };
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerSW());
  if (!reg) return { ok: false, error: 'Could not register the service worker.' };
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC) });
  const j = sub.toJSON();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: user.id, endpoint: sub.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth, ua: navigator.userAgent },
    { onConflict: 'endpoint' },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function pushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return !!sub;
}

/** Fire-and-forget: ask the edge function to push a notification for an event. */
export async function notify(type: 'task_assigned' | 'approval_request', payload: Record<string, unknown> = {}) {
  try { await supabase.functions.invoke('push-notify', { body: { type, ...payload } }); } catch { /* non-blocking */ }
}
