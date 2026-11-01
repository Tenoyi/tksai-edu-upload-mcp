import os
import zipfile

ROOT = os.path.dirname(__file__)

# 单一统一连接器：本地进程（stdio）+ OAuth 2.1 鉴权
# (子目录, 输出 zip 名, 文件清单)
#   文件清单项为文件名（位于子目录内）或 (源路径, 目标路径) 元组
CONNECTORS = [
    ('connector', 'tksai-edu-upload-connector.zip', [
        'connector-meta.json',
        'mcp.json',
        'icon.svg',
        ('skills/tks-ai-edu-upload/SKILL.md', 'skills/tks-ai-edu-upload/SKILL.md'),
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
