import { apiRequest } from "./api-client";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerPushServiceWorker() {
  if (!isPushSupported()) return null;
  return navigator.serviceWorker.register("/sw.js");
}

export async function enableBrowserPush(): Promise<{ ok: boolean; message: string }> {
  if (!isPushSupported()) {
    return { ok: false, message: "This browser does not support push notifications." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: "Notification permission was denied." };
  }

  const keyResult = await apiRequest<{ publicKey: string }>("GET", "/api/account/push/vapid-public-key");
  if (keyResult.error || !keyResult.data?.publicKey) {
    return {
      ok: false,
      message: keyResult.error || "Push is not configured on the server yet.",
    };
  }

  const registration = await registerPushServiceWorker();
  if (!registration) {
    return { ok: false, message: "Could not register the service worker." };
  }
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyResult.data.publicKey),
    }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, message: "Browser returned an incomplete push subscription." };
  }

  const save = await apiRequest("POST", "/api/account/push/subscribe", {
    body: {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    },
  });

  if (save.error) {
    return { ok: false, message: save.error };
  }

  return { ok: true, message: "Browser notifications enabled." };
}

export async function disableBrowserPush(): Promise<{ ok: boolean; message: string }> {
  if (!isPushSupported()) {
    return { ok: false, message: "Push is not supported." };
  }
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) {
    return { ok: true, message: "No active push subscription." };
  }
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await apiRequest("DELETE", "/api/account/push/subscribe", { body: { endpoint } });
  return { ok: true, message: "Browser notifications disabled." };
}
