import { Worker } from "node:worker_threads";
import path from "node:path";
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
let activeParsers = 0;

export async function extractAttachment(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["xlsx", "docx", "pdf", "jpg", "jpeg", "png"].includes(extension)) {
    throw new Error("Поддерживаются XLSX, DOCX, PDF, JPEG и PNG. Сохраните старый XLS/DOC в современном формате.");
  }
  if (file.size < 8 || file.size > MAX_FILE_BYTES) throw new Error("Файл должен быть непустым и не больше 5 МБ.");
  const data = Buffer.from(await file.arrayBuffer());
  const valid = extension === "pdf" ? data.subarray(0, 5).toString() === "%PDF-"
    : ["docx", "xlsx"].includes(extension) ? data.readUInt32LE(0) === 0x04034b50
      : extension === "png" ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (!valid) throw new Error("Содержимое файла не соответствует его расширению.");
  if (activeParsers >= 2) throw new Error("Сервис чтения файлов занят. Повторите через несколько секунд.");
  activeParsers++;
  try {
    return await new Promise<string>((resolve, reject) => {
      const worker = new Worker(path.join(process.cwd(), "scripts/extract-file.mjs"), {
        workerData: { data, extension }, resourceLimits: { maxOldGenerationSizeMb: 256 },
      });
      const timer = setTimeout(() => { void worker.terminate(); reject(new Error("Чтение заняло слишком много времени. Попробуйте файл меньшего размера.")); }, 20000);
      worker.once("message", (result: { text?: string; error?: string }) => {
        clearTimeout(timer); void worker.terminate();
        if (result.error) reject(new Error(result.error)); else resolve(result.text ?? "");
      });
      worker.once("error", () => { clearTimeout(timer); void worker.terminate(); reject(new Error("Не удалось прочитать файл.")); });
      worker.once("exit", (code) => { if (code !== 0) { clearTimeout(timer); reject(new Error("Чтение файла прервано.")); } });
    });
  } finally { activeParsers--; }
}
