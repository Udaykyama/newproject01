# Runtime image for ci-ledger.
#
# Milestone 2 is "hosted", and hosting starts with a reproducible image and an
# honest answer to where the database lives. SQLite is a file: it must sit on a
# volume that outlives the container, or every deploy silently resets the
# ledger and the cost history the product exists to accumulate.

FROM node:22-bookworm-slim AS build

WORKDIR /app

# better-sqlite3 ships prebuilt binaries for common platforms but falls back to
# compiling, which needs a toolchain. Installed only in this stage so it never
# reaches the runtime image.
RUN apt-get update \
    && apt-get install --no-install-recommends --assume-yes python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build

# Drop devDependencies now that the TypeScript is compiled.
RUN npm prune --omit=dev


FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/ci-ledger.db

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

# The database must be on a mounted volume. Declared so an operator who forgets
# gets an anonymous volume rather than a container-lifetime file they will not
# notice losing until the first redeploy.
VOLUME ["/data"]

# Owned by the unprivileged user the base image already provides, so the
# process can write its database without running as root.
RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/src/index.js"]
