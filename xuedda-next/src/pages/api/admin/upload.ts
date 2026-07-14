import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fail, ok } from '../../../lib/api';
import { encodeWebp } from '../../../lib/webp';

const COVER_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const RESOURCE_EXTS = new Set(['.zip', '.rar', '.7z', '.skp', '.max', '.psd', '.psb', '.dwg', '.dxf', '.fbx', '.obj', '.pdf', '.txt', '.doc', '.docx']);

function cleanExt(name: string) {
  return path.extname(name || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
}

function monthKey() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function pathExists(target: string) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function uploadTargetDirs(folder: string) {
  const parts = folder.split('/').filter(Boolean);
  const dirs = new Set<string>();
  const explicitRoot = String(process.env.UPLOADS_ROOT || '').trim();
  if (explicitRoot) {
    dirs.add(path.join(explicitRoot, ...parts.slice(1)));
  }
  // 本地 dev 读取 public；线上静态资源一般由 dist/client 提供。
  dirs.add(path.join(process.cwd(), 'public', ...parts));

  const clientRoot = path.join(process.cwd(), 'dist', 'client');
  if (await pathExists(clientRoot)) {
    dirs.add(path.join(clientRoot, ...parts));
  }

  return Array.from(dirs);
}

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const kind = String(form.get('kind') || 'cover') === 'resource' ? 'resource' : 'cover';
  const file = form.get('file');
  if (!(file instanceof File)) return fail('请选择要上传的文件', 400);

  const ext = cleanExt(file.name);
  const allowed = kind === 'cover' ? COVER_EXTS : RESOURCE_EXTS;
  if (!allowed.has(ext)) return fail(kind === 'cover' ? '封面只支持 JPG/PNG/WebP/GIF' : '资源文件类型暂不支持', 400);

  const maxSize = kind === 'cover' ? 8 * 1024 * 1024 : 80 * 1024 * 1024;
  if (file.size > maxSize) return fail(kind === 'cover' ? '封面不能超过 8MB' : '测试附件不能超过 80MB', 413);

  const folder = `/uploads/admin/${kind}/${monthKey()}`;
  const filename = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const targetDirs = await uploadTargetDirs(folder);

  await Promise.all(targetDirs.map(async (targetDir) => {
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(targetDir, filename), buffer);
  }));

  // Best-effort: generate a WebP sibling (x.jpg -> x.jpg.webp) so nginx can serve
  // the smaller WebP to browsers that accept it. Never blocks the upload — if the
  // encoder fails the original image is still served.
  if (kind === 'cover') {
    const webp = await encodeWebp(buffer, ext);
    if (webp) {
      await Promise.all(targetDirs.map((targetDir) =>
        writeFile(path.join(targetDir, `${filename}.webp`), webp).catch(() => undefined),
      ));
    }
  }

  return ok({
    url: `${folder}/${filename}`,
    name: file.name,
    size: file.size,
    kind,
  });
};
