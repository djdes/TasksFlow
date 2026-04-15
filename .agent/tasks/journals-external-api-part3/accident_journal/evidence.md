# accident_journal — end-to-end verification

Document: `cmnyp94j2003w08ts6pjlptf0` in test org `cmnm40ikt00002ktseet6fd5y`.
Prod URL: https://wesetup.ru/journals/accident_journal/documents/cmnyp94j2003w08ts6pjlptf0

## Criteria

- **POST**: PASS (HTTP 200, entriesWritten=1, documentId=cmnyp94j2003w08ts6pjlptf0)
- **UI**: PASS (full-page screenshot ui-screenshot.png)
- **PDF**: PASS (HTTP 200, application/pdf, 452498 bytes)
- **Residual doc**: PASS (single active JournalDocument for this code in test org)

## Verdict

**PASS** — external POST persists, UI renders the document, PDF generates with data.

## Artefacts
- `request.sh` — real curl with `$EXTERNAL_API_TOKEN` masked
- `response.json` — verbatim server response to POST
- `ui-screenshot.png` — full-page screenshot of the document page as admin
- PDF bytes verified in-browser via `fetch('/api/journal-documents/<id>/pdf', {credentials:'include'})`; see `_summary/pdf-probe.json` for the 35-row probe.
