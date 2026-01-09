import crypto from 'crypto';

export function computeFileHash(buffer: ArrayBuffer | Uint8Array): string {
  const hash = crypto.createHash('sha256');
  if (buffer instanceof Uint8Array) {
    hash.update(buffer);
  } else {
    hash.update(new Uint8Array(buffer));
  }
  return hash.digest('hex');
}
