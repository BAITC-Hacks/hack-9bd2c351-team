// Runs untrusted document parsing in a disposable worker, with a parent deadline.
import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
const require = createRequire(import.meta.url);
const data = Buffer.from(workerData.data);
const ext = workerData.extension;

async function validateArchive() {
  const yauzl = require('yauzl');
  await new Promise((resolve, reject) => {
    yauzl.fromBuffer(data, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      let total = 0, entries = 0;
      zip.on('error', reject);
      zip.on('end', resolve);
      zip.on('entry', (entry) => {
        total += entry.uncompressedSize;
        entries++;
        if (total > 32 * 1024 * 1024 || entries > 2000 || entry.generalPurposeBitFlag & 1) {
          zip.close(); reject(new Error('Archive limit')); return;
        }
        zip.readEntry();
      });
      zip.readEntry();
    });
  });
}
async function extract() {
  if (ext === 'xlsx' || ext === 'docx') await validateArchive();
  if (ext === 'xlsx') {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data);
    const lines = [];
    let cells = 0;
    workbook.eachSheet((sheet) => sheet.eachRow((row) => {
      if (++cells > 2000 || row.cellCount > 50) throw new Error('Sheet limit');
      lines.push(row.values.filter(Boolean).map((value) => {
        if (typeof value === 'string' || typeof value === 'number') return String(value);
        if (value && typeof value === 'object' && value.richText) return value.richText.map((t) => t.text).join('');
        return ''; // Do not evaluate formulas or follow hyperlinks.
      }).join(' '));
    }));
    return lines.join('\n');
  }
  if (ext === 'docx') return (await require('mammoth').extractRawText({ buffer: data })).value;
  if (ext === 'pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(data), isEvalSupported: false, useSystemFonts: false });
    try {
      const info = await parser.getInfo();
      if (info.total > 20) throw new Error('Page limit');
      return (await parser.getText()).text;
    } finally { await parser.destroy(); }
  }
  const sharp = require('sharp');
  const image = await sharp(data, { limitInputPixels: 12_000_000 }).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  const folder = await mkdtemp(join(tmpdir(), 'ekt-ocr-'));
  let worker;
  try {
    for (const lang of ['eng', 'rus']) {
      const root = dirname(require.resolve(`@tesseract.js-data/${lang}`));
      await copyFile(join(root, '4.0.0_best_int', `${lang}.traineddata.gz`), join(folder, `${lang}.traineddata.gz`));
    }
    worker = await require('tesseract.js').createWorker('eng+rus', 1, { langPath: folder, cacheMethod: 'none', logger: () => {} });
    return (await worker.recognize(image)).data.text;
  } finally {
    if (worker) await worker.terminate();
    await rm(folder, { recursive: true, force: true });
  }
}
try {
  const text = (await extract()).slice(0, 20000);
  parentPort.postMessage({ text });
} catch { parentPort.postMessage({ error: 'Не удалось прочитать файл. Проверьте формат, отсутствие пароля и ограничения размера.' }); }
