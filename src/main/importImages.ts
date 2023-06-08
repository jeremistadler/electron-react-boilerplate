import { join } from 'path';
import { mkdir, cp, stat } from 'fs/promises';
import { FileStatInfo } from 'sharedTypes';
import { pMap } from './pMap';
import { createHash } from 'node:crypto';
import { createReadStream } from 'fs';

const LATE_NIGHT_TIME_OFFSET = 1000 * 60 * 60 * 2;
const BaoBaoDir = '/Users/Shared/baobao/source';

export async function importImages(
  files: FileStatInfo[],
  reportProgress: (progress: number, message: string) => void
) {
  const targetFilenames = new Set<string>();

  const mappedFiles = files.map((file) => {
    const dateWithOffset = new Date(file.createdTime - LATE_NIGHT_TIME_OFFSET);
    const date = new Date(file.createdTime);
    const folderName =
      dateWithOffset.toLocaleDateString('sv-SE', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        timeZone: 'Europe/Stockholm',
      }) +
      ' ' +
      dateWithOffset.toLocaleDateString('sv-SE', {
        month: 'short',
        timeZone: 'Europe/Stockholm',
      });

    const time = date
      .toLocaleTimeString('sv-SE', {
        minute: 'numeric',
        second: 'numeric',
        hour: 'numeric',
        timeZone: 'Europe/Stockholm',
      })
      .replaceAll(':', '_')
      .replaceAll(' ', '_')
      .replaceAll('/', '_');

    let targetPath = join(
      BaoBaoDir,
      folderName + '/',
      time + '.' + file.path.split('.').pop()!.toLowerCase()
    );

    const generateNextTargetPath = (index: number) =>
      join(
        BaoBaoDir,
        folderName + '/',
        time + '-' + index + '.' + file.path.split('.').pop()!.toLowerCase()
      );

    for (let index = 1; targetFilenames.has(targetPath); index++) {
      targetPath = generateNextTargetPath(index);
    }

    targetFilenames.add(targetPath);

    return {
      source: file,
      targetPath,
      targetFolder: join(BaoBaoDir, folderName),
      generateNextTargetPath,
    };
  });

  const createdPaths = new Set<string>();

  reportProgress(1, 'Skapar mappar...');
  let lastProgressReport = performance.now();

  for await (const file of mappedFiles) {
    if (createdPaths.has(file.targetPath)) continue;
    createdPaths.add(file.targetFolder);

    await mkdir(file.targetFolder, { recursive: true });
  }

  await pMap(mappedFiles, async (file, i) => {
    const now = performance.now();
    if (lastProgressReport + 100 < now) {
      lastProgressReport = now;
      reportProgress((i / files.length) * 100, file.targetPath);
    }

    for (let index = 0; ; index++) {
      try {
        await cp(file.source.path, file.targetPath, {
          preserveTimestamps: true,
          force: false,
          errorOnExist: true,
        });
      } catch (error: any) {
        if (error.code === 'EEXIST' || error.code === 'ERR_FS_CP_EEXIST') {
          const isSame = await isFileEqual(file.source, file.targetPath);

          if (isSame) {
            break;
          } else {
            file.targetPath = file.generateNextTargetPath(index);
            continue;
          }
        }

        throw error;
      }
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  reportProgress(100, 'Klar!');
}

async function isFileEqual(pathA: FileStatInfo, pathB: string) {
  const pathBStat = await stat(pathB);
  if (pathA.size !== pathBStat.size) return false;

  const [checksumA, checksumB] = await Promise.all([
    checksumFile(pathA.path),
    checksumFile(pathB),
  ]);

  return checksumA.equals(checksumB);
}

function checksumFile(path: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const hash = createHash('sha1');
    const stream = createReadStream(path, { end: 1024 * 1024 * 10 });
    stream.on('error', (err) => reject(err));
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest()));
  });
}
