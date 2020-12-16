FROM node:alpine

WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn

COPY . .

CMD ["node", "src/index.js"]