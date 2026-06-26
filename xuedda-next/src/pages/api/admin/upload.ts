import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fail, ok } from '../../../lib/api';

const COVER_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const RESOURCE_EXTS = new Set(['.zip', '.rar', '.7z', '.skp', '.max', '.psd', '.psb', '.dwg', '.dxf', '.fbx', '.obj', '.pdf', '.txt', '.doc', '.docx']);

function cleanExt(name: string) {
  return path.extname(name || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
}

function monthKey() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
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
  const targetDir = path.join(process.cwd(), 'public', ...folder.split('/').filter(Boolean));
  await mkdir(targetDir, { recursive: true });

  const filename = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
  const targetPath = path.join(targetDir, filename);
  await writeFile(targetPath, Buffer.from(await file.arrayBuffer()));

  return ok({
    url: `${folder}/${filename}`,
    name: file.name,
    size: file.size,
    kind,
  });
};
