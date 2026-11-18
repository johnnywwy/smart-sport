"""在目标物理机运行；仅生成本项目的 CasaOS 配置，不启动或删除容器。"""
import json
import os
import pathlib
import subprocess

ROOT = pathlib.Path('/mnt/data/smart-sport-m1')
TARGET = pathlib.Path('/var/lib/casaos/apps/smart-sport-m1/docker-compose.yml')
if os.geteuid() != 0:
    raise SystemExit('请使用 sudo 运行；配置包含服务凭据，必须仅 root 可读。')
if TARGET.exists():
    raise SystemExit('CasaOS 配置已存在，请核对后通过 CasaOS 管理，避免覆盖修改。')
result = subprocess.run([
    'docker', 'compose', '--env-file', str(ROOT / 'shared/app.env'),
    '-f', str(ROOT / 'current/deploy/host/compose.yaml'), 'config', '--format', 'json',
], check=True, capture_output=True, text=True)
config = json.loads(result.stdout)
if config.get('name') != 'smart-sport-m1' or set(config['services']) != {'redis', 'minio'}:
    raise SystemExit('配置不属于本项目，已拒绝写入。')
for name in ('redis-data', 'minio-data'):
    if config['volumes'][name]['name'] != f'smart-sport-m1_{name}':
        raise SystemExit('数据卷名称不符，已拒绝写入。')
for service in config['services'].values():
    service.pop('build', None)
config['x-casaos'] = {
    'title': {'en_US': 'Smart Sport', 'zh_CN': '智慧体育云'},
    'description': {'en_US': 'Redis and private MinIO for Smart Sport M1.',
                    'zh_CN': '智慧体育云的 Redis 与私有 MinIO。前后端通过物理机 systemd 管理。'},
    'tagline': {'en_US': 'Smart Sport infrastructure', 'zh_CN': '智慧体育云基础服务'},
    'icon': '/img/smart-sport.svg',
    'author': 'johnny', 'category': 'Developer', 'main': 'minio',
    'scheme': 'https', 'hostname': 'sport.johnnywwy.com', 'port_map': '443',
    'index': '/', 'is_uncontrolled': False,
}
TARGET.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
with open(TARGET, 'x', opener=lambda p, f: os.open(p, f, 0o600)) as output:
    json.dump(config, output, ensure_ascii=False, indent=2)
    output.write('\n')
print('CasaOS 专用配置已生成（0600），沿用原项目名与数据卷。')
