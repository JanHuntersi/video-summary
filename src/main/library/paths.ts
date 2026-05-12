import { randomBytes } from 'crypto';

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function generateId(): string {
  return randomBytes(4).toString('hex').slice(0, 6);
}

export function folderName(date: Date, slug: string, id: string): string {
  const d = date.toISOString().slice(0, 10);
  return `${d}_${slug}_${id}`;
}
