import * as fs from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function parsePdf(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const data = new Uint8Array(buffer);
  const doc = await getDocument({ data }).promise;

  const texts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str)
      .join(' ');
    texts.push(pageText);
  }

  return texts.join('\n');
}
