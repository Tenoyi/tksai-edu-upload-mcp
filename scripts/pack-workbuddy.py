"""
打包脚本：把 WorkBuddy 连接器目录（workbuddy/connector）压缩为 zip 包，
供上传到 WorkBuddy 开放平台连接器市场（OAuth 版）。

用法：
    python3 scripts/pack-workbuddy.py

也可通过 package.json 快捷命令调用：
    npm run pack:workbuddy

产物：
    workbuddy/tksai-edu-upload-connector.zip

说明：
    - 包内结构与文件齐全、无 `._` 冗余条目；
    - mcp.json 指向 https://edu.tksai.com/app-api/mcp（HTTPS、各仅一个 server）；
    - 打包前请先把 workbuddy/connector/connector-meta.json 的 version 改为本次版本号，
      使市场版本与 npm 对齐。

依赖：仅使用 Python 标准库（zipfile / os），无需额外安装。
"""

import os
import zipfile

# 本脚本位于 <root>/scripts/，连接器源目录在项目根的 workbuddy/ 下
ROOT = os.path.join(os.path.dirname(__file__), '..', 'workbuddy')

# (子目录, 输出 zip 名, 文件清单)
#   文件清单项为文件名（位于子目录内）或 (源路径, 目标路径) 元组
CONNECTORS = [
    ('connector', 'tksai-edu-upload-connector.zip', [
        'connector-meta.json',
        'mcp.json',
        'icon.svg',
        ('skills/tksai-edu-upload/SKILL.md', 'skills/tksai-edu-upload/SKILL.md'),
    ]),
]


def build(sub: str, zip_name: str, files) -> None:
    sub_dir = os.path.join(ROOT, sub)
    out = os.path.join(ROOT, zip_name)
    if os.path.exists(out):
        os.remove(out)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in files:
            if isinstance(f, tuple):
                src, dst = f
            else:
                src = dst = f
            p = os.path.join(sub_dir, src)
            assert os.path.exists(p), f'missing {p}'
            z.write(p, dst)
    print(f'built {out}')


if __name__ == '__main__':
    for sub, zname, files in CONNECTORS:
        build(sub, zname, files)
