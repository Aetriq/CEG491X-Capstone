# CEG491X-Capstone/echolog-webapp/Dockerfile
# STAGE 1: Build backend
FROM node:18-alpine AS backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --only=production
COPY backend/src ./src
COPY backend/scripts ./scripts
# Create uploads directory
RUN mkdir -p uploads/filtered
EXPOSE 3001
CMD ["node", "src/server.js"]

# STAGE 2: Build frontend
FROM node:18-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# STAGE 3: Serve with nginx
FROM nginx:alpine
# Copy frontend build
COPY --from=frontend /app/frontend/build /usr/share/nginx/html
# Copy backend (needed for API)
COPY --from=backend /app /app
# Copy a custom nginx config to proxy API requests
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
# The backend must be started separately – we'll use docker-compose