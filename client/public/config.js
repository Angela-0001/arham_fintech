// Runtime config — served as-is in dev and copied to dist/ on build.
// Edit this file (or dist/config.js in a deployed build) to point the
// dashboard at a different API without rebuilding the bundle.
window.__CONFIG__ = {
  VITE_API_URL: 'http://localhost:4000/proxy',
};
