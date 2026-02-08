
FROM --platform=linux/amd64 node:18-alpine

WORKDIR /
COPY package*.json server.js
RUN npm install
EXPOSE 5000
CMD ["node", "server.js"]