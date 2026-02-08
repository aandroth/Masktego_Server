ARG MY_NODE_REPO=""
FROM ${MY_NODE_REPO}
RUN echo ${MY_NODE_REPO}
WORKDIR /
COPY package*.json server.js

EXPOSE 5000
CMD ["node", "server.js"]