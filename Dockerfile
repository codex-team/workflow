FROM node:15

WORKDIR /app
COPY . .
RUN yarn install
ENTRYPOINT ["node", "src/index.js"]
