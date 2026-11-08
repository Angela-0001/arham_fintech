# ---- client image (build + nginx) ----
FROM node:20-alpine AS build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM nginx:alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
# Point the dashboard at the same-origin BFF (nginx proxies /proxy -> server).
RUN echo "window.__CONFIG__ = { VITE_API_URL: '/proxy' };" > /usr/share/nginx/html/config.js
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
