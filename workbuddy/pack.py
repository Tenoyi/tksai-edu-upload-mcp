import zipfile, os

BASE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(BASE)

# 两个独立连接器（不同 source），分别打包为两个 zip 提交官方审核
connectors = [
    # (子目录, 输出 zip 名, 该目录内需归档的文件)
    ('oauth', 'tksai-edu-upload-connector.zip', [
        'connector-meta.json',
        'mcp.json',
        'icon.svg',
        ('skills/tks-ai-edu-upload/SKILL.md', 'skills/tks-ai-edu-upload/SKILL.md'),
    ]),
    ('token', 'tksai-edu-upload-token-connector.zip', [
        'connector-meta.json',
        'mcp.json',
        'token-schema.json',
        'icon.svg',
        ('skills/tks-ai-edu-upload-token/SKILL.md', 'skills/tks-ai-edu-upload-token/SKILL.md'),
    ]),
]

for sub, out_name, files in connectors:
    out = os.path.join(BASE, out_name)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        # README 取自仓库根，作为连接器说明
        z.write(os.path.join(REPO, 'README.md'), 'README.md')
        for f in files:
            src, arc = f if isinstance(f, tuple) else (f, f)
            p = os.path.join(BASE, sub, src)
            assert os.path.exists(p), f'missing: {p}'
            z.write(p, arc)
    print('written', out, os.path.getsize(out), 'bytes')
