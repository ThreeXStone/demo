import * as fs from 'node:fs';

export async function parseText(filePath: string): Promise<string> {
  return fs.readFileSync(filePath, 'utf-8');
}
