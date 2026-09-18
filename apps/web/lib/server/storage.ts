import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

export async function storeCsv(key: string, contentType: string, content: ArrayBuffer) {
  const storageRoot = resolve(process.cwd(), '.local-storage');
  const filePath = resolve(storageRoot, key);
  if (!filePath.startsWith(storageRoot + sep)) throw new Error('Invalid local storage path.');
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(content));
  return { url: 'local://' + key, contentType };
}

export async function deleteStoredCsv(key: string) {
  const storageRoot = resolve(process.cwd(), '.local-storage');
  const filePath = resolve(storageRoot, key);
  if (!filePath.startsWith(storageRoot + sep)) throw new Error('Invalid local storage path.');
  await rm(filePath, { force: true });
}
