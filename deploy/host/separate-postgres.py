"""在服务器生成独立 PostgreSQL 18.6 的 CasaOS 配置，不复制或删除数据。"""
import json
import os
import pathlib
import subprocess

SOURCE = 'smart-sports-v10-postgres'
TARGET = pathlib.Path('/var/lib/casaos/apps/postgresql18/docker-compose.yml')
if os.geteuid() != 0:
    raise SystemExit('请使用 sudo 运行，配置仅允许 root 读取。')
if TARGET.exists():
    raise SystemExit('独立数据库配置已存在，拒绝覆盖。')
source = json.loads(subprocess.check_output(['docker', 'inspect', SOURCE], text=True))[0]
if source['Config']['Image'] != 'smart-sports-v10/postgres:18.6':
    raise SystemExit('原数据库镜像与本次已验收版本不符。')
mounts = source['Mounts']
if len(mounts) != 1 or mounts[0]['Source'] != '/DATA/AppData/postgresql/data18':
    raise SystemExit('数据挂载与本次验收不符，拒绝继续。')
if mounts[0]['Destination'] != '/var/lib/postgresql':
    raise SystemExit('数据库目录不符。')
service = {
    'image': 'local/postgresql:18.6',
    'container_name': 'postgresql18',
    'restart': source['HostConfig']['RestartPolicy']['Name'],
    'environment': source['Config']['Env'],
    'command': source['Config']['Cmd'],
    'volumes': [{'type': 'bind', 'source': mounts[0]['Source'], 'target': mounts[0]['Destination']}],
    'shm_size': source['HostConfig']['ShmSize'],
    'ports': [],
}
for target, bindings in source['HostConfig']['PortBindings'].items():
    for binding in bindings:
        service['ports'].append({
            'target': int(target.split('/')[0]),
            'published': binding['HostPort'],
            'host_ip': binding['HostIp'],
            'protocol': target.split('/')[1],
        })
health = source['Config'].get('Healthcheck')
if health:
    service['healthcheck'] = {'test': health['Test']}
    for key in ('Interval', 'Timeout', 'StartPeriod'):
        if health.get(key):
            service['healthcheck'][{'Interval':'interval','Timeout':'timeout','StartPeriod':'start_period'}[key]] = str(health[key]) + 'ns'
    if health.get('Retries'):
        service['healthcheck']['retries'] = health['Retries']
config = {
    'name': 'postgresql18',
    'services': {'postgres': service},
    'x-casaos': {
        'title': {'en_US': 'PostgreSQL 18.6', 'zh_CN': 'PostgreSQL 18.6'},
        'description': {'en_US': 'Independent shared PostgreSQL database server.', 'zh_CN': '服务器独立数据库服务，供各项目分别创建数据库使用。'},
        'icon': 'https://cdn.jsdelivr.net/gh/IceWhaleTech/CasaOS-AppStore@main/Apps/PostgreSQL/icon.svg',
        'main': 'postgres', 'category': 'Developer', 'author': 'johnny', 'is_uncontrolled': False,
    },
}
subprocess.run(['docker', 'tag', source['Config']['Image'], 'local/postgresql:18.6'], check=True)
TARGET.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
with open(TARGET, 'x', opener=lambda p, f: os.open(p, f, 0o600)) as output:
    json.dump(config, output, ensure_ascii=False, indent=2)
    output.write('\n')
print('独立 PostgreSQL CasaOS 配置已生成，原数据目录、镜像与连接设置保持不变。')
