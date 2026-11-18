#!/bin/sh
set -eu
umask 077
backup_dir=/mnt/data/smart-sport-m1/backups
mkdir -p "$backup_dir"
backup_file="$backup_dir/smart_sport_m1-$(date -u +%Y%m%dT%H%M%SZ).dump"
trap 'rm -f "$backup_file.part"' EXIT HUP INT TERM
docker exec smart-sports-v10-postgres sh -c 'pg_dump -U "$POSTGRES_USER" --format=custom --dbname=smart_sport_m1' > "$backup_file.part"
docker exec -i smart-sports-v10-postgres pg_restore --list < "$backup_file.part" > /dev/null
mv "$backup_file.part" "$backup_file"
printf '数据库备份及目录校验完成：%s\n' "$backup_file"
# 保留恢复所需的加密密钥；该副本同样只允许本机管理员读取。
cp /mnt/data/smart-sport-m1/shared/app.env "$backup_dir/app.env.recovery"
chmod 600 "$backup_dir/app.env.recovery"
