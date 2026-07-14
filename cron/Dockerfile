FROM alpine:3.19
RUN apk add --no-cache curl postgresql16-client dcron tini bash tzdata
ENV TZ=America/Sao_Paulo
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
WORKDIR /app
COPY crontab /etc/crontabs/root
COPY trigger-sync.sh /app/trigger-sync.sh
COPY backup-db.sh /app/backup-db.sh
RUN chmod +x /app/trigger-sync.sh /app/backup-db.sh
RUN touch /var/log/cron.log
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["crond", "-f", "-l", "8"]
