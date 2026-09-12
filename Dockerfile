# Build stage: instala tudo e gera o bundle do frontend
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Runtime stage: só o necessário pra rodar o servidor Express
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY server ./server
COPY --from=build /app/dist ./dist

EXPOSE 8090
CMD ["node", "server/index.js"]
