const DEV_SESSION_SECRET = 'dev-session-secret-change-me';

export function sessionSecret() {
  const value = String(import.meta.env.SESSION_SECRET || '').trim();
  if (import.meta.env.PROD && (!value || value === DEV_SESSION_SECRET || value.length < 32)) {
    throw new Error('SESSION_SECRET must be set to a strong value in production.');
  }
  return value || DEV_SESSION_SECRET;
}

export function secureCookieSuffix() {
  return import.meta.env.PROD ? '; Secure' : '';
}

export function publicRegistrationEnabled() {
  const value = String(import.meta.env.PUBLIC_REGISTRATION_ENABLED || '').trim().toLowerCase();
  if (import.meta.env.PROD) return ['1', 'true', 'yes', 'on'].includes(value);
  return value !== 'false';
}

export function requestOriginAllowed(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;

  const requestUrl = new URL(request.url);
  if (origin === requestUrl.origin) return true;

  const allowed = String(import.meta.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return allowed.includes(origin);
}

const ALLOWED_DOWNLOAD_HOST_SUFFIXES = [
  'pan.baidu.com',
  'yun.baidu.com',
  'aliyundrive.com',
  'alipan.com',
  'quark.cn',
  'uc.cn',
  '123pan.com',
  '123684.com',
  'lanzou.com',
  'lanzoui.com',
  'lanzoux.com',
  'lanzoub.com',
  'lanzouj.com',
  'lanzout.com',
  'weiyun.com',
  'ctfile.com',
];

function allowedHost(hostname: string) {
  const host = hostname.toLowerCase();
  return ALLOWED_DOWNLOAD_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function safeDownloadUrl(raw: unknown) {
  const text = String(raw || '').trim();
  if (/^\/uploads\/admin\/[A-Za-z0-9][A-Za-z0-9/_\-.]*$/i.test(text) && !text.includes('..')) {
    return text;
  }
  const match = text.match(/https:\/\/[^\s"'<>]+/i);
  if (!match) return '';
  try {
    const url = new URL(match[0]);
    if (url.protocol !== 'https:') return '';
    if (!allowedHost(url.hostname)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

export function sanitizeDownloadFiles(files: any[]) {
  return files
    .map((file) => {
      const url = safeDownloadUrl(file?.url);
      if (!url) return null;
      return {
        name: String(file?.name || ''),
        provider: String(file?.provider || ''),
        url,
        pass: String(file?.pass || ''),
        fileSize: String(file?.fileSize || ''),
      };
    })
    .filter(Boolean);
}
