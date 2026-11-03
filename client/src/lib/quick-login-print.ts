export type QuickLoginPrintFormat = "a4" | "label";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]!);

/** Отдельный документ: тема кабинета и меню не попадают в печать. */
export function quickLoginPrintHtml(company: string, url: string, qr: string, format: QuickLoginPrintFormat): string {
  const label = format === "label";
  const longName = company.length > 100;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="referrer" content="no-referrer"><title>Вход в ${escapeHtml(company)}</title>
<style>
@page { size: ${label ? "58mm 40mm" : "A4 portrait"}; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: white; color: black; font-family: Arial, sans-serif; }
body { container-type: inline-size; }
.sheet { width: 100%; height: 100%; padding: ${label ? "3%" : "9%"}; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
h1 { font-size: ${label ? "4.4cqw" : longName ? "3.4cqw" : "6cqw"}; line-height: 1.15; margin: 0 0 4%; max-width: 100%; overflow-wrap: anywhere; }
h2 { font-size: 7cqw; margin: 0 0 5%; }
img { display: block; width: ${label ? "51%" : longName ? "70%" : "85%"}; height: auto; flex: none; }
p { font-size: ${label ? "3.4cqw" : "4cqw"}; margin: 3% 0 0; line-height: 1.45; }
.brand { font-size: ${label ? "3cqw" : "3.5cqw"}; margin-top: ${label ? "1%" : "7%"}; }
${label ? `
.sheet { padding: 3.4cqw; gap: 1.7cqw; }
h1 { flex: none; font-size: 4cqw; line-height: 1.1; margin: 0; max-height: 8.8cqw; overflow: hidden; }
.label-row { display: flex; align-items: center; gap: 3.4cqw; width: 100%; flex: none; }
img { width: 48.3cqw; height: 48.3cqw; flex: none; }
.label-copy { flex: 1; min-width: 0; }
p { margin: 0; font-size: 3.4cqw; overflow-wrap: anywhere; }
.brand { margin-top: 3.4cqw; font-size: 3cqw; }
` : ""}
@media print {
  html, body { width: ${label ? "58mm" : "210mm"}; height: ${label ? "40mm" : "297mm"}; }
  .sheet { break-inside: avoid; }
}
</style></head><body><main class="sheet">
<h1>${escapeHtml(company)}</h1>
${label ? '<div class="label-row">' : "<h2>Ваши задачи на сегодня</h2>"}
<img src="${escapeHtml(qr)}" alt="QR-код входа в организацию">
${label ? '<div class="label-copy">' : ""}
<p>${label ? "Наведите камеру<br>Выберите себя<br>Введите PIN" : "Наведите камеру телефона на QR-код.<br>Выберите себя и введите свой PIN."}</p>
<p class="brand">TasksFlow · ${escapeHtml(new URL(url).host)}</p>
${label ? "</div></div>" : ""}
</main></body></html>`;
}

export async function printQuickLogin(html: string): Promise<void> {
  const frame = document.createElement("iframe");
  frame.title = "Печать QR-кода";
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:800px;height:1100px;border:0";
  try {
    await new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve();
      frame.onerror = () => reject(new Error("Не удалось подготовить печать"));
      frame.srcdoc = html;
      document.body.append(frame);
    });
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) throw new Error("Не удалось открыть печать");
    await Promise.all(Array.from(doc.images, (img) => img.decode()));
    await doc.fonts.ready;
    win.addEventListener("afterprint", () => frame.remove(), { once: true });
    win.focus();
    win.print();
    window.setTimeout(() => frame.remove(), 60_000);
  } catch (error) {
    frame.remove();
    throw error;
  }
}
