#!/bin/sh
# CasaOS 控制基础容器，物理机服务跟随本项目依赖的开关状态。
set -eu
services='smart-sport-m1-server smart-sport-m1-worker smart-sport-m1-web'
state=$(timeout 4 docker inspect smart-sport-m1-redis-1 smart-sport-m1-minio-1 postgresql18 --format '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' 2>/dev/null) || state=''
running=$(printf '%s\n' "$state" | awk '$1 == "true" {n++} END {print n+0}')
healthy=$(printf '%s\n' "$state" | awk '$1 == "true" && $2 == "healthy" {n++} END {print n+0}')
if [ "$running" != 3 ]; then
  for service in $services; do
    if systemctl is-active --quiet "$service"; then
      logger -t smart-sport-m1 'CasaOS基础容器已停止或不可用，停止本项目应用服务。'
      systemctl stop $services
      break
    fi
  done
elif [ "$healthy" = 3 ]; then
  for service in $services; do
    if ! systemctl is-active --quiet "$service"; then
      logger -t smart-sport-m1 'CasaOS基础容器已就绪，启动本项目应用服务。'
      systemctl start $services
      break
    fi
  done
fi
