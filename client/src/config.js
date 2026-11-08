/**
 * config.js — runtime-resolved API base URL.
 *
 * Resolution order:
 *   1. window.__CONFIG__.VITE_API_URL  (set by public/config.js — editable post-build)
 *   2. import.meta.env.VITE_API_URL    (build-time fallback)
 *   3. 'http://localhost:4000/proxy'   (dev default)
 *
 * This lets a production deploy set the API URL in the served config.js without
 * rebuilding the bundle.
 */
export const API_URL =
  (typeof window !== 'undefined' && window.__CONFIG__?.VITE_API_URL) ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:4000/proxy';
