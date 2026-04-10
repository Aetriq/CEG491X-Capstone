// webapp/frontend/src/utils/api.js
//
// Dev: Vite proxies /api -> backend (vite.config.js). Leave VITE_API_URL unset.
// Production: set VITE_API_URL to backend origin only (no trailing slash, no /api).

export const getApiUrl = (path) => {
  let baseUrl = (import.meta.env.VITE_API_URL || '').trim();
  if (baseUrl.endsWith('/api')) {
    baseUrl = baseUrl.slice(0, -4);
  }

  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const cleanPath = path.startsWith('/api') ? path : `/api${path}`;

  if (import.meta.env.PROD && !cleanBase) {
    console.error(
      '[EchoLog] VITE_API_URL is not set. API calls are targeting this site instead of the backend.'
    );
  }

  return `${cleanBase}${cleanPath}`;
};
