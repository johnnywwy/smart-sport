# 固定官方源码校验和，限制并行度以适配 ARM64 小内存主机。
FROM golang:1.24.8-alpine3.22 AS build
WORKDIR /src
ADD --checksum=sha256:be6d0bd3696c3a13a35f02d3a0280b64319c67918b4501c5c3d87f96d000085c https://codeload.github.com/minio/minio/tar.gz/refs/tags/RELEASE.2025-10-15T17-29-55Z /tmp/minio.tar.gz
RUN tar -xzf /tmp/minio.tar.gz --strip-components=1 -C /src
RUN go mod download
RUN GOMAXPROCS=2 CGO_ENABLED=0 go build -p 2 -trimpath -o /out/minio .

FROM alpine:3.22.2
RUN apk add --no-cache ca-certificates curl && adduser -D -u 10001 minio
COPY --from=build /out/minio /usr/local/bin/minio
COPY --from=build /src/LICENSE /usr/share/licenses/minio/LICENSE
RUN mkdir /data && chown minio:minio /data
USER minio
EXPOSE 9000 9001
ENTRYPOINT ["/usr/local/bin/minio"]
CMD ["server", "/data", "--console-address", ":9001"]
