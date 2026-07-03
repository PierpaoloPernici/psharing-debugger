FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:css

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libxkbcommon0 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app
COPY --from=builder /app ./
RUN npm ci --omit=dev
EXPOSE 3333
ENV NODE_ENV=production
CMD ["node", "server.mjs"]
