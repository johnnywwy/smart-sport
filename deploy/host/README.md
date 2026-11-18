# ARM64物理机部署（T-181子部分）

本次用户确认的目标：`sport.johnnywwy.com` → 已有Cloudflare Tunnel → `127.0.0.1:18082`。使用服务器独立共享的PostgreSQL 18.6，新建独立库`smart_sport_m1`和用户`smart_sport_m1_app`；只新增Redis/MinIO容器。Node24.22.2与Nginx由物理机systemd运行。不修改已有数据库、Tunnel入口或80/443服务。

这是当前已实现M1功能的试运行发布，不标记T-181完整容器编排、T-140完整初始化或T-182异地备份完成。T-062等业务依赖未完成，尚未支持的业务仍以页面实际开放范围为准。

## 目录与凭据

- `/mnt/data/smart-sport-m1/releases/<版本>`：不可变发布目录；`current`为当前版本软链接。
- `runtime/node`：官方ARM64 Node压缩包，使用官方SHASUMS256核验；`runtime/nginx`：Debian仓库包解包，避免启动或替换系统80/443服务。
- `shared/app.env`：服务器生成的生产连接及密钥，0600，不上传Git；不要在日志或聊天中粘贴。
- `shared/initial-admin.txt`：首次随机管理员凭据，0600；首次登录必须改密。重复引导不会重置已有账号密码。
- `backups/`：本项目数据库的本机备份；异地备份和完整恢复演练仍待后续配置。

## 发布准备

根目录运行`pnpm build`，再分别执行`pnpm --filter @smart-sport/server deploy --prod --legacy <发布目录>/server`与worker同名命令。复制`apps/web/dist`到`<发布目录>/web`、`deploy`到`<发布目录>/deploy`。运行包保留server迁移及共享包dist；不复制开发`.env`、`.npmrc`或Git元数据。macOS打包使用`tar --no-xattrs`避免向Linux复制扩展属性。ARM64上先验证argon2预编译模块加载。

`configure.mjs`仅首次在服务器生成随机凭据和专用库引导SQL；以现有PostgreSQL管理员身份执行该SQL后立即删除SQL文件，凭据不输出。已有同名数据库或用户须先核对归属，不自动改密码或覆盖旧库。

## 初始化与启动

以下命令在服务器运行；`node`使用`runtime/node/bin/node`，并为应用命令传入`--env-file=/mnt/data/smart-sport-m1/shared/app.env`：

1. 执行server的`dist/database/migrate-cli.js`。
2. 执行`dist/modules/platform/catalog/sync-cli.js`。
3. 执行`dist/modules/platform/regions/import-cli.js ../deploy/seed/regions.csv`。
4. 执行`../deploy/host/bootstrap.mjs`：仅允许本项目专用库，创建平台组织、随机密码管理员与当前学年学期；已有数据跳过。预置部门、字典、编号和参数由后端启动同步。运动项目和评分标准随后续完整初始化任务接入。
5. `docker compose --env-file /mnt/data/smart-sport-m1/shared/app.env -f /mnt/data/smart-sport-m1/current/deploy/host/compose.yaml up -d --no-build --pull never --wait`。固定版本镜像须已准备；如服务器代理失效，在构建机准备ARM64镜像后通过`docker save/load`导入，不擅自修改共享Docker代理。
6. 运行`node deploy/host/prepare-csp.mjs web/index.html deploy/host/nginx.conf`，按本次构建更新浏览器检测脚本的CSP哈希。安装本目录三个service到`/etc/systemd/system/`，执行`systemctl daemon-reload`与`systemctl enable --now smart-sport-m1-server smart-sport-m1-worker smart-sport-m1-web`。
7. 执行`check.mjs`创建/检查私有桶，并验证HTTPS登录、Cookie属性、刷新、恢复会话、退出、静态路由及健康状态。检查脚本不输出密码或令牌，不修改初始密码。管理员已自行改密后，该脚本的初始凭据登录不再适用。默认检查公网域名；服务器出站网络不稳定时，可附加参数`http://127.0.0.1:18082`验证本机网关的完整接口链路，再单独检查公网HTTPS；本机脚本手动传Cookie不代表浏览器可通过HTTP登录。

## CasaOS 单应用管理

首次命令行部署后，CasaOS 会因无法解析外部环境文件显示“Managed elsewhere”。在服务器执行`sudo python3 /mnt/data/smart-sport-m1/current/deploy/host/casaos-register.py`，将解析后的配置保存到`/var/lib/casaos/apps/smart-sport-m1/docker-compose.yml`（root专属0600，含服务凭据，禁止复制到本机或提交）。脚本保留原项目名和两个数据卷，添加“智慧体育云”应用信息；已有配置时拒绝覆盖。

随后短暂停止本项目server/worker，用`sudo docker compose -p smart-sport-m1 -f /var/lib/casaos/apps/smart-sport-m1/docker-compose.yml up -d --no-build --pull never --force-recreate --wait`重建容器，使Docker记录的配置来源指向CasaOS目录，再重启本项目三个systemd服务。不能执行`down -v`。刷新CasaOS后通过同一应用管理两个容器；前后端仍由systemd管理；安装下方联动定时器后，CasaOS停止该应用也会关停本项目应用服务。

接管后，上述CasaOS目录文件是容器运维入口，不再交替从原`deploy/host/compose.yaml`启动。原文件作为可审核的发布模板保留。容器配置或镜像更新需先备份，在CasaOS配置中维护并保留现有数据卷名，不盲目重跑注册脚本。

## 服务器通用 PostgreSQL 18.6

用户确认数据库应为服务器共享基础服务。最终CasaOS应用与容器均名为`postgresql18`，卡片为`PostgreSQL 18.6`，独立于Smart Sport。配置在`/var/lib/casaos/apps/postgresql18/docker-compose.yml`，root专属0600。镜像`local/postgresql:18.6`与原来已通过验收的18.6镜像内容相同，仅重新命名，不能当作Docker Hub官方镜像自动拉取。后续升级须单独审核扩展和数据兼容性。

迁移沿用`/DATA/AppData/postgresql/data18`→`/var/lib/postgresql`绑定目录与`192.168.2.16:5432`端口；Smart Sport继续用`smart_sport_m1`和其专用账号，其他项目可使用自己的数据库。原`casaos`、`postgres`、`smart_sports`均保留。切换前已在服务器保存全库逻辑备份，旧容器和旧项目网络已清理。旧17.4是另一套独立实例，数据目录为`/DATA/AppData/postgresql/data`，没有自动删除。

首次从旧容器迁出时可用`separate-postgres.py`生成新配置。必须先停止原容器，再启动新容器；禁止两个PostgreSQL进程同时写同一目录。数据库已切换后不要重跑该脚本。

## CasaOS 开关联动

将`smart-sport-m1-sync.service`及`smart-sport-m1-sync.timer`安装至`/etc/systemd/system/`，`daemon-reload`后启用timer。三个应用service保留供调用，但不再独立enable，由timer统一启动。

`sync-casaos.sh`每约3秒检查Redis、MinIO及通用PostgreSQL容器：任一停止则关停本项目API/Worker/网关；三个均健康后启动应用。它不会启动、停止或重启通用PostgreSQL本身，也不控制其他项目。已有应用在容器运行但暂时不健康时交由自身健康检测处理，不因一次探针失败反复重启。

停止Redis后Worker可能等待正在关闭的队列连接，由systemd既有40秒上限兜底，因此整组关停可能需要几十秒。CasaOS卡片状态反映容器，不能作为API全部业务正常的证明；应用可用性仍查`/health/ready`。维护时先停止timer，完成后恢复。

## 本地图标与统计历史

`assets/`提供Smart Sport跑道、Gann分析两款SVG图标及长桥官方PNG标识。服务器已安装PyYAML，运行`sudo python3 deploy/host/install-casaos-icons.py`可备份并更新三项目图标配置，资源保存在CasaOS本机`/var/lib/casaos/www/img/`，不依赖应用是否启动或外部图床。CasaOS升级若替换静态目录，应重新安装这些图标。长桥标识取自其官方网站`https://longbridge.com`声明的图标`https://assets.wbrks.com/assets/logo/logo1.png`，保持官方原图。

Statistics保存`/var/lib/casaos/stats/app_management/*.ring`历史，容器删除后仍可展示。2026-11-18已在停用统计采集服务期间，精准归档不存在容器和退役数据库项目对应的记录，保留现有容器和主机统计、告警配置，再恢复管理服务。不能清空整个CasaOS数据库或Docker数据目录。

## 运维与回滚

- 状态：`systemctl status smart-sport-m1-server smart-sport-m1-worker smart-sport-m1-web`。
- 后端日志：`journalctl -u smart-sport-m1-server -f`；Worker同理。Nginx错误进journal，后端记录API请求。
- 容器：CasaOS接管后使用`sudo docker compose -p smart-sport-m1 -f /var/lib/casaos/apps/smart-sport-m1/docker-compose.yml ps`或`logs`；Redis16379、MinIO19000/19001均只监听回环地址。
- 备份：`sh /mnt/data/smart-sport-m1/current/deploy/host/backup.sh`，生成自定义格式备份并运行`pg_restore --list`。该步骤不等于完整恢复演练。恢复还需要保存原`FIELD_ENCRYPTION_KEY`与`STUDENT_HMAC_KEY`，不能重新生成替代。
- 更新前先备份，然后上传独立版本目录、执行新增迁移，原子切换`current`并重启三个service。数据库只允许向前兼容迁移；回滚代码不执行数据库降级，不删除卷或旧库。
- 生产环境关闭OpenAPI；前端同域`/api`反向代理，Secure Cookie通过Cloudflare提供的HTTPS使用。HTTP局域网直连不作为生产登录验收入口。

## 本次实际验收（2026-11-18）

发布应用源码版本`0ba6529`，32次数据库迁移执行成功。PostgreSQL18.6兼容性经独立测试库31文件285项集成测试通过；没有变更既有项目的数据库。正式构建、全仓类型、lint与依赖方向检查通过（保留原设计稿体积和构建体积提示）。

三个systemd服务已启用自启动并经过重启验证；Redis/MinIO健康、原数据卷沿用。通过本机网关实际完成登录、Cookie属性、刷新、会话恢复、退出、SPA直达与ready检查，未改初始管理员密码。公网HTTPS登录页与ready返回200，生产OpenAPI返回404，浏览器渲染与控制台无错误。服务器直接出站到Cloudflare偶有连接超时，因此未声称公网完整认证脚本一次跑通；公网登录、刷新和退出曾单独成功，本机完整链路已验证。

已生成本项目数据库首份备份并通过`pg_restore --list`，保留受限密钥恢复副本；尚未配置定时、异地备份或完整恢复演练。初始密码只保留服务器受限文件，用户自行在SSH中读取并首次改密。

2026-11-18补验：PostgreSQL已独立为服务器共享服务，生产库用户数1、区划3223及其他库均保留，迁移后ready和新备份通过。管理员已改初始密码（must_change_password=false），旧初始凭据验收脚本返回401，未重置用户密码或把本次认证复测报告为通过。CasaOS停止应用后应用进程关停，恢复基础容器后API/Worker/网关重新启动；Worker在Redis先停止时存在上述退出等待。Weibo容器运行且健康，卡片主服务与配置来源已核对，未重启该业务容器。
