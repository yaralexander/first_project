FROM node:20-bookworm-slim

WORKDIR /app

# better-sqlite3 is a native module. These build tools are needed when a
# prebuilt binary is unavailable for the deployment platform.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "start"]
