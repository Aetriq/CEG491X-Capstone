# Dockerfile
FROM node:18-alpine AS backend
WORKDIR CEG491X-Capstone/webapp/Backend/Dockerfile
COPY backend/package*.json ./
RUN npm ci --only=production
COPY backend/src ./src
COPY backend/scripts ./scripts
EXPOSE 3001
CMD ["node", "src/server.js"]

FROM node:18-alpine AS frontend
WORKDIR CEG491X-Capstone/webapp/frontend/Dockerfile
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:alpine
COPY --from=frontend /app/frontend/build /usr/share/nginx/html
COPY --from=backend /app /app
# You may need to run backend separately – consider using docker-compose