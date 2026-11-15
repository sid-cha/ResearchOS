FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8000 HOST=0.0.0.0
COPY --chown=node:node . /app
RUN mkdir -p /app/.local-data && chown -R node:node /app/.local-data
USER node
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.mjs"]
