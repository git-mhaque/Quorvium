FROM node:20-bookworm-slim AS base

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json

RUN npm ci

COPY . .

RUN npm run build --workspace=server \
  && npm prune --omit=dev

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000

COPY --from=base /app/package.json /app/package-lock.json ./
COPY --from=base /app/server/package.json /app/server/package.json
COPY --from=base /app/node_modules /app/node_modules
COPY --from=base /app/server/node_modules /app/server/node_modules
COPY --from=base /app/server/dist /app/server/dist

EXPOSE 4000

CMD ["node", "server/dist/index.js"]
