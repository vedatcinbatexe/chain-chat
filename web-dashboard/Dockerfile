# ---- Build ----
FROM node:24-alpine AS build
WORKDIR /app

# Install dependencies first, so this layer is cached between code changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# "false" removes the "local dev account" sign-in button from the build.
ARG VITE_ENABLE_DEV_LOGIN=true
ENV VITE_ENABLE_DEV_LOGIN=$VITE_ENABLE_DEV_LOGIN
RUN npm run build

# ---- Runtime: static files + reverse proxy to the API ----
FROM nginx:1.29-alpine AS runtime
# The nginx image fills in ${API_UPSTREAM} when the container starts.
ENV API_UPSTREAM=http://api:8080
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
