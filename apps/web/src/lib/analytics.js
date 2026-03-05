let clientPromise;

function loadClient() {
  if (!clientPromise) {
    clientPromise = import('posthog-js').then((mod) => mod.default);
  }
  return clientPromise;
}

export async function initAnalytics(config) {
  const key = config?.key;
  if (!key) return;

  const posthog = await loadClient();
  posthog.init(key, {
    api_host: config.apiHost || 'https://us.i.posthog.com',
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '.ProseMirror',
    },
    respect_dnt: true,
  });
}

export function track(eventName, properties = {}) {
  loadClient().then((posthog) => {
    posthog.capture(eventName, properties);
  }).catch(() => {});
}

export function identify(userId, properties = {}) {
  loadClient().then((posthog) => {
    posthog.identify(userId, properties);
  }).catch(() => {});
}

export function reset() {
  loadClient().then((posthog) => {
    posthog.reset();
  }).catch(() => {});
}
