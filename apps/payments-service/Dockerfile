FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3002
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
