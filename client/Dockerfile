# Build Stage
FROM node:20-slim as builder

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
# Ensure we build for production
RUN npm run build

# Runtime Stage
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
