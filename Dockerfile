FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev
COPY server ./server
COPY shared ./shared
COPY public/fonts ./public/fonts
RUN chmod -R a+rX /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATA_DIR=/data FFMPEG_PATH=/usr/bin/ffmpeg FFPROBE_PATH=/usr/bin/ffprobe
EXPOSE 3001
CMD ["npm","run","server"]
