"""更新三个项目的 CasaOS 本地图标；在目标服务器用 sudo 执行。"""
import datetime
import os
import pathlib
import shutil
import yaml

if os.geteuid() != 0:
    raise SystemExit('请使用 sudo 执行，以保护原应用配置。')
assets = pathlib.Path(__file__).resolve().parent / 'assets'
edits = {
    '/var/lib/casaos/apps/smart-sport-m1/docker-compose.yml': 'smart-sport.svg',
    '/mnt/data/appdata/stacks/gann-v2/compose.yaml': 'gann-v2.svg',
    '/mnt/data/appdata/stacks/longbridge/compose.yaml': 'longbridge.png',
}
backup = pathlib.Path('/mnt/data/smart-sport-m1/backups') / ('casaos-icons-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
configs = [(pathlib.Path(p), yaml.safe_load(pathlib.Path(p).read_text()), icon) for p, icon in edits.items()]
for _, _, icon in configs:
    if not (assets / icon).is_file():
        raise SystemExit('图标文件缺失，尚未修改配置。')
backup.mkdir(mode=0o700)
for path, config, icon in configs:
    saved = backup / (path.parent.name + '.yaml')
    shutil.copy2(path, saved)
    saved.chmod(0o600)
    shutil.copyfile(assets / icon, '/var/lib/casaos/www/img/' + icon)
    os.chmod('/var/lib/casaos/www/img/' + icon, 0o644)
    config.setdefault('x-casaos', {})['icon'] = '/img/' + icon
    path.write_text(yaml.safe_dump(config, allow_unicode=True, sort_keys=False))
print('三个项目的本地图标已更新，原配置仅在服务器受限目录备份。')
