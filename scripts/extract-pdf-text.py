import sys
from pathlib import Path

try:
    from pypdf import PdfReader
except Exception as exc:  # pragma: no cover
    print(f"ERROR: pypdf import failed: {exc}", file=sys.stderr)
    sys.exit(2)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: extract-pdf-text.py <pdf-path>", file=sys.stderr)
        return 1

    pdf_path = Path(sys.argv[1])
    if not pdf_path.exists():
        print(f"ERROR: file not found: {pdf_path}", file=sys.stderr)
        return 1

    reader = PdfReader(str(pdf_path))
    parts: list[str] = []
    for page in reader.pages:
      try:
        parts.append(page.extract_text() or "")
      except Exception:
        parts.append("")

    sys.stdout.write("\n".join(parts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
