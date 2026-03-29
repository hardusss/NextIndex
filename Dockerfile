# Create Bun
FROM oven/bun:1

# Select work directory in container
WORKDIR /app

# Copy packeges
COPY package.json ./
COPY bun.lock ./

# Install 
RUN bun install

# Copy project
COPY . .

# Open port for API
EXPOSE 3000

# Push schema and start server
CMD ["sh", "-c", "bunx drizzle-kit push && bun run src/index.ts"]