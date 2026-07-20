# Development image for the Vite + React frontend.
# Source is bind-mounted via docker-compose and Vite's dev server provides HMR,
# so host edits reflect live. node_modules lives in an anonymous volume (see
# compose) so the container's Linux install isn't shadowed by the host's.
FROM node:22-bookworm-slim

WORKDIR /app

# Install dependencies first for layer caching. Uses the committed lockfile.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# --host binds 0.0.0.0 so the dev server is reachable from outside the container.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
