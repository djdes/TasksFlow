import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TASK_ID = process.argv[2] || "13";
const KEY = "tfk_xNIBi3uxmcYbwsBK_K4rCIJmyKN_l1kr1Jf5ecKCkho";
const BASE = "https://tasksflow.ru";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tinyPath = path.join(__dirname, "_tiny.png");

// Smallest valid PNG (1x1 transparent).
const png = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex"
);
fs.writeFileSync(tinyPath, png);

const fd = new FormData();
fd.append("photo", new Blob([png], { type: "image/png" }), "tiny.png");

const upload = await fetch(`${BASE}/api/tasks/${TASK_ID}/photo`, {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}` },
  body: fd,
});
console.log("upload:", upload.status, await upload.text());

const done = await fetch(`${BASE}/api/tasks/${TASK_ID}/complete`, {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}` },
});
console.log("complete:", done.status, await done.text());

fs.unlinkSync(tinyPath);
