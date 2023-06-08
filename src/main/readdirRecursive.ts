import { join } from 'path';
import { readdir, stat } from 'fs/promises';
import { FileStatInfo } from 'sharedTypes';

const BLACKLIST = new Set(['MISC']);
const BLACKLISTExt = new Set(['html', 'log', 'txt', 'DS_Store']);

export async function readdirRecursive(dir: string) {
  const allFiles: FileStatInfo[] = [];
  const folders = [dir];

  while (folders.length) {
    const folder = folders.pop()!;
    const files = await readdir(folder).catch(() => []);

    for (const filename of files) {
      if (filename.startsWith('.')) continue;

      const fullPath = join(folder, filename);
      const stats = await stat(fullPath);

      if (stats.isFile() && !BLACKLISTExt.has(filename.split('.').pop()!)) {
        allFiles.push({
          path: fullPath,
          createdTime: stats.birthtimeMs || stats.ctimeMs,
          size: stats.size,
        });
      } else if (stats.isDirectory() && !BLACKLIST.has(filename)) {
        folders.push(fullPath);
      }
    }
  }

  const ONE_DAY = 1000 * 60 * 60 * 24;
  const minimumTime = new Date(Date.now() - ONE_DAY * 100).getTime();
  const minimumTimeReplacement = new Date();
  minimumTimeReplacement.setHours(0, 0, 0, 0);

  for (const file of allFiles) {
    if (file.createdTime < minimumTime) {
      file.createdTime = minimumTimeReplacement.getTime();
    }
  }

  allFiles.sort(
    (a, b) => a.createdTime - b.createdTime || a.path.localeCompare(b.path)
  );

  return allFiles;
}
