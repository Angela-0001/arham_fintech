# ---- server image (Node API) ----
FROM node:20-alpine AS deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app/server
ENV NODE_ENV=production
COPY --from=deps /app/server/node_modules ./node_modules
COPY server/ ./
# drop test artifacts from the production image
RUN rm -rf test vitest.config.js
EXPOSE 4000
# Required at runtime (set via env / compose): MONGO_URI, API_KEY, ALLOWED_ORIGINS
CMD ["node", "index.js"]
