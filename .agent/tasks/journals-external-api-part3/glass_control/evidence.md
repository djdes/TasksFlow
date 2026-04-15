# glass_control — end-to-end verification

Document: `cmnyodrp0008jootso4d26bvc` in test org `cmnm40ikt00002ktseet6fd5y`.
Prod URL: https://wesetup.ru/journals/glass_control/documents/cmnyodrp0008jootso4d26bvc

## Criteria

- **POST**: PASS (HTTP 200, entriesWritten=1, documentId=cmnyodrp0008jootso4d26bvc)
- **UI**: PASS (full-page screenshot ui-screenshot.png)
- **PDF**: PASS (HTTP 200, application/pdf, 453472 bytes)
- **Residual doc**: PASS (single active JournalDocument for this code in test org)

## Verdict

**PASS** — external POST persists, UI renders the document, PDF generates with data.

## Artefacts
- `request.sh` — real curl with `$EXTERNAL_API_TOKEN` masked
- `response.json` — verbatim server response to POST
- `ui-screenshot.png` — full-page screenshot of the document page as admin
- PDF bytes verified in-browser via `fetch('/api/journal-documents/<id>/pdf', {credentials:'include'})`; see `_summary/pdf-probe.json` for the 35-row probe.
