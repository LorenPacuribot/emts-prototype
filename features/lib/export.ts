/** Client-side exports. CSV downloads and print-to-PDF via the browser. */
import { suppressSuccessToast, toast } from "./toast";

declare const __HOSTED_DEMO__: boolean | undefined;
/** True in the single-file hosted demo, where the sandbox blocks downloads and printing. */
export const IS_HOSTED_DEMO = typeof __HOSTED_DEMO__ !== "undefined" && !!__HOSTED_DEMO__;

function hostedNotice(what: string) {
  suppressSuccessToast();
  toast.info(`${what} isn't available in the hosted preview`, "The hosted link blocks downloads and printing. Run the prototype locally (npm run dev) to use it.");
}

export function downloadCsv(filename: string, rows: (string | number | undefined)[][]) {
  if (IS_HOSTED_DEMO) return hostedNotice("CSV download");
  const csv = rows
    .map((r) => r.map((v) => {
      const s = v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Print one element as a document ("Save as PDF" in the print dialog).
 * Copies the element into a clean window so the app chrome is not printed.
 */
export function printElement(el: HTMLElement | null, title: string) {
  if (!el) return;
  if (IS_HOSTED_DEMO) return hostedNotice("Printing");
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    window.print();
    return;
  }
  const styles = Array.from(document.querySelectorAll("style, link[rel=stylesheet]")).map((n) => n.outerHTML).join("");
  w.document.write(`<!doctype html><html><head><title>${title}</title>${styles}</head><body style="background:white;padding:32px">${el.outerHTML}</body></html>`);
  w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();
  }, 400);
}

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Excel download (BK-M8). SpreadsheetML (Excel 2003 XML), which Excel and
 * Numbers open directly; numbers stay numbers.
 */
export function downloadExcel(filename: string, sheetName: string, rows: (string | number | undefined)[][]) {
  if (IS_HOSTED_DEMO) return hostedNotice("Excel download");
  const cell = (v: string | number | undefined) =>
    typeof v === "number" ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>` : `<Cell><Data ss:Type="String">${xmlEscape(v ?? "")}</Data></Cell>`;
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${xmlEscape(sheetName.slice(0, 31))}"><Table>
${rows.map((r) => `<Row>${r.map(cell).join("")}</Row>`).join("\n")}
</Table></Worksheet></Workbook>`;
  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
