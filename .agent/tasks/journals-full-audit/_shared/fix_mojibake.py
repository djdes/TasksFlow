import re, sys

def fix_file(path: str):
    with open(path, 'rb') as f:
        raw = f.read()
    text = raw.decode('utf-8')

    def try_fix(chunk: str) -> str:
        try:
            b = chunk.encode('cp1251')
            dec = b.decode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            return chunk
        return dec if dec != chunk else chunk

    def ok(s: str) -> bool:
        for c in s:
            o = ord(c)
            if o < 128:
                continue
            if 0x0400 <= o <= 0x04FF:
                continue
            if c in '\u00a0\u2014\u2013\u2026\u201c\u201d\u00ab\u00bb':
                continue
            return False
        return True

    def repl(m):
        orig = m.group(0)
        fixed = try_fix(orig)
        if fixed == orig:
            return orig
        if not ok(fixed):
            return orig
        return fixed

    pattern = re.compile(r"[^\x00-\x7f]+(?:[\s&\-,.\"'\u00ab\u00bb\u2014\u2013\u2018\u2019\u201c\u201d\u00a0\u00b0\u2116:;!?()/\\%=@#]+[^\x00-\x7f]+)*")
    out = pattern.sub(repl, text)
    changes = sum(1 for a, b in zip(text, out) if a != b)
    with open(path, 'wb') as f:
        f.write(out.encode('utf-8'))
    return changes, len(text), len(out)


if __name__ == '__main__':
    for p in sys.argv[1:]:
        c, a, b = fix_file(p)
        print(f'{p} diff={c} {a}->{b}')
