import { Buffer, copy, ensureDir, path, Tar, Untar } from "../deps.ts";
import type { compressInterface, uncompressInterface } from "./interface.ts";

export async function uncompress(
  src: string,
  dest: string,
  options?: uncompressInterface
): Promise<void> {
  const reader = await Deno.open(src, { read: true });
  const untar = new Untar(reader);
  for await (const entry of untar) {
    const filePath = path.resolve(dest, entry.fileName);
    if (options?.debug) console.log(filePath);
    if (entry.type === "directory") {
      await ensureDir(filePath);
      continue;
    }
    await ensureDir(path.dirname(filePath));
    const file = await Deno.open(filePath, { write: true, create: true });
    await copy(entry, file);
    await file.close();
  }
  reader.close();
}
export async function compress(
  src: string,
  dest: string,
  options?: compressInterface
): Promise<void> {
  const tar = new Tar();
  const stat = await Deno.lstat(src);
  if (stat.isFile) {
    await tar.append(path.basename(src), {
      filePath: src,
      contentSize: stat.size,
      mtime: (stat?.mtime ?? new Date()).valueOf() / 1000,
    });
    if (options?.debug) console.log(path.resolve(src));
  } else {
    const appendFolder = async (folder: string, prefix?: string) => {
      let nowLoopList: string[][] = [[folder, prefix || ""]];
      let nextLoopList: string[][] = [];

      while (nowLoopList.length > 0) {
        for (const [folder, prefix] of nowLoopList) {
          for await (const entry of Deno.readDir(folder)) {
            if (options && shouldExclude(entry.name, options?.exclude || [])) {
              continue;
            }

            const { isDirectory, name } = entry;
            const fileName = prefix ? `${prefix}/${name}` : name;
            const filePath = path.resolve(folder, name);
            if (options?.debug) console.log(path.resolve(filePath));
            const stat = await Deno.stat(filePath);
            if (isDirectory) {
              await tar.append(`${fileName}/`, {
                reader: new Buffer(),
                contentSize: 0,
                type: "directory",
                mtime: (stat?.mtime ?? new Date()).valueOf() / 1000,
              });
              nextLoopList.push([filePath, fileName]);
            } else {
              await tar.append(fileName, {
                filePath,
                mtime: (stat?.mtime ?? new Date()).valueOf() / 1000,
                contentSize: stat.size,
              });
            }
          }
        }
        nowLoopList = nextLoopList;
        nextLoopList = [];
      }
    };
    if (options?.excludeSrc) {
      await appendFolder(src);
    } else {
      const folderName = path.basename(src);
      await tar.append(`${folderName}/`, {
        filePath: src,
        // type: "directory",
        // mtime: (stat?.mtime ?? new Date()).valueOf() / 1000,
        // contentSize: 0,
        // reader: new Deno.Buffer(),
      });
      if (options?.debug) console.log(path.resolve(src));
      await appendFolder(src, folderName);
    }
  }
  const writer = await Deno.open(dest, { write: true, create: true });
  await copy(tar.getReader(), writer);
  writer.close();
}

function shouldExclude(entry: string, exclude: string[]): boolean {
  return exclude.some((excludedDir) => entry.startsWith(excludedDir));
}
