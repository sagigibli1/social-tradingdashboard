FROM node:20-slim

# Build tools needed to compile better-sqlite3 native module on Linux
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (layer-cached until package.json changes)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Create db directories (empty DB is created at runtime by the app)
RUN mkdir -p db/cache

ENV PORT=8080
EXPOSE 8080

# Cloud Run sets PORT env var; Next.js respects it via -p
CMD ["sh", "-c", "node_modules/.bin/next start -H 0.0.0.0 -p ${PORT}"]
