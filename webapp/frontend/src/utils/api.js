// webapp/Frontend/src/utils/api.js

export const getApiUrl = (path) => {
  // This looks at Render's environment variables
  const baseUrl = import.meta.env.VITE_API_URL || '';
  
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const cleanPath = path.startsWith('/api') ? path : `/api${path}`;
  
  return `${cleanBase}${cleanPath}`;
};