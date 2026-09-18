FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
RUN npm ci
COPY apps/web apps/web
RUN npm run build -w @loop/web
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache chromium && chromium-browser --version
ENV CHROME_PATH=/usr/bin/chromium-browser
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/workers ./apps/web/workers
COPY --from=build /app/apps/web/lib ./apps/web/lib
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
