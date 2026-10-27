import zipfile, os

BASE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(BASE)

# (源路径相对 BASE 或绝对路径, zip 内归档路径)
files = [
    ('connector-meta.json', 'connector-meta.json'),
    ('mcp.json', 'mcp.json'),
    ('token-schema.json', 'token-schema.json'),
    ('icon.svg', 'icon.svg'),
    ('skills/tks-ai-edu-upload/SKILL.md', 'skills/tks-ai-edu-upload/SKILL.md'),
    (os.path.join(REPO, 'README.md'), 'README.md'),
]

out = os.path.join(BASE, 'tksai-edu-upload-connector.zip')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for src, arc in files:
        p = src if os.path.isabs(src) else os.path.join(BASE, src)
        assert os.path.exists(p), f'missing: {p}'
        z.write(p, arc)
print('written', out, os.path.getsize(out), 'bytes')
