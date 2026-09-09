FROM node:20-alpine AS base
WORKDIR /app


RUN apk add --no-cache --virtual .build-deps openssl

COPY package*.json ./
RUN npm ci
COPY . .


RUN npx prisma generate && npm run build

EXPOSE 3002
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
