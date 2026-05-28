import { parseText } from './text.parser';
import { parsePdf } from './pdf.parser';
import * as path from 'node:path';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

export async function parseFile(
  relativePath: string,
  mimeType: string,
): Promise<string> {
  const filePath = path.join(UPLOAD_DIR, relativePath);

  switch (mimeType) {
    case 'application/pdf':
      return parsePdf(filePath);
    case 'text/plain':
    case 'text/markdown':
    case 'text/x-markdown':
      return parseText(filePath);
    default:
      return parseText(filePath);
  }
}
