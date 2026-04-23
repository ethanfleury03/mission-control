import { afterEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/prisma';
import { createManual, getManualFile, getManuals, isAcceptedManualFile } from '../service';

describe('manuals service', () => {
  afterEach(async () => {
    await prisma.manual.deleteMany();
  });

  it('creates and lists manual metadata without bytes', async () => {
    const created = await createManual({
      name: 'Operator Guide',
      fileName: 'operator-guide.pdf',
      mimeType: 'application/pdf',
      byteSize: 7,
      bytes: new TextEncoder().encode('manual!'),
    });

    const manuals = await getManuals();

    expect(manuals).toHaveLength(1);
    expect(manuals[0]).toMatchObject({
      id: created.id,
      name: 'Operator Guide',
      fileName: 'operator-guide.pdf',
      mimeType: 'application/pdf',
      byteSize: 7,
    });
    expect(manuals[0]).not.toHaveProperty('fileBytes');
  });

  it('retrieves uploaded manual bytes', async () => {
    const bytes = new TextEncoder().encode('# Manual');
    const created = await createManual({
      name: 'Markdown Manual',
      fileName: 'manual.md',
      mimeType: 'text/markdown',
      byteSize: bytes.byteLength,
      bytes,
    });

    const file = await getManualFile(created.id);

    expect(file?.fileName).toBe('manual.md');
    expect(file?.mimeType).toBe('text/markdown');
    expect(new TextDecoder().decode(file?.bytes)).toBe('# Manual');
  });

  it('rejects unsupported file types', async () => {
    await expect(
      createManual({
        name: 'Image',
        fileName: 'image.png',
        mimeType: 'image/png',
        byteSize: 3,
        bytes: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toThrow('PDF, DOC, DOCX, TXT, or MD');
  });

  it('accepts common manual extensions even with generic mime types', () => {
    expect(isAcceptedManualFile('guide.docx', 'application/octet-stream')).toBe(true);
  });
});
