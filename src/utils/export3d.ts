export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface RawPartGeometry {
  name: string;
  colorHex: string; // e.g. "#d97706"
  opacity?: number; // 0..1
  vertices: Vec3[]; // world-space Y-up vertices
  triangles: [number, number, number][];
  flipWinding?: boolean;
}

export interface NormalizedPartGeometry {
  name: string;
  displayColorRgba: string; // #RRGGBBAA
  vertices: Vec3[]; // Z-up millimeter vertices
  triangles: [number, number, number][];
}

export function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function toRgbaHex(colorHex: string, opacity = 1): string {
  const clean = colorHex.replace(/^#/, '').trim();
  const rgb = /^[0-9a-fA-F]{6}$/.test(clean) ? clean.toUpperCase() : 'CCCCCC';
  const clampedOpacity = Math.max(0, Math.min(1, Number.isFinite(opacity) ? opacity : 1));
  const alphaByte = Math.round(clampedOpacity * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  return `#${rgb}${alphaByte}`;
}

export function normalizePartsToZUpMm(
  parts: RawPartGeometry[],
  targetHeightMm: number
): NormalizedPartGeometry[] {
  if (!parts.length) {
    throw new Error('Nenhuma peça encontrada para exportar.');
  }
  if (!Number.isFinite(targetHeightMm) || targetHeightMm <= 0) {
    throw new Error('Altura em milímetros inválida.');
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const part of parts) {
    for (const v of part.vertices) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.z > maxZ) maxZ = v.z;
    }
  }

  const height = maxY - minY;
  if (!Number.isFinite(height) || height <= 1e-6) {
    throw new Error('Modelo com altura nula não pode ser normalizado.');
  }

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const scale = targetHeightMm / height;

  return parts.map((part) => {
    const vertices: Vec3[] = part.vertices.map((v) => {
      const nx = (v.x - centerX) * scale;
      const ny = (v.y - minY) * scale;
      const nz = (v.z - centerZ) * scale;
      // Y-Up to Z-Up: (x, -z, y) preserves determinant +1 (CCW winding)
      return {
        x: nx,
        y: -nz,
        z: ny,
      };
    });

    const triangles: [number, number, number][] = [];
    for (const [a, b, c] of part.triangles) {
      if (a === b || b === c || a === c) continue;
      triangles.push(part.flipWinding ? [a, c, b] : [a, b, c]);
    }

    return {
      name: part.name || 'Peca',
      displayColorRgba: toRgbaHex(part.colorHex, part.opacity ?? 1),
      vertices,
      triangles,
    };
  });
}

export function build3mfPackageXml(parts: NormalizedPartGeometry[]): {
  contentTypes: string;
  rels: string;
  model: string;
} {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;

  const baseMaterialsXml = parts
    .map(
      (p) =>
        `      <base name="${escapeXml(p.name)}" displaycolor="${p.displayColorRgba}" />`
    )
    .join('\n');

  const objectsXml = parts
    .map((p, idx) => {
      const objectId = idx + 2;
      const vertsXml = p.vertices
        .map(
          (v) =>
            `          <vertex x="${v.x.toFixed(4)}" y="${v.y.toFixed(4)}" z="${v.z.toFixed(4)}" />`
        )
        .join('\n');
      const trisXml = p.triangles
        .map(
          ([v1, v2, v3]) =>
            `          <triangle v1="${v1}" v2="${v2}" v3="${v3}" pid="1" p1="${idx}" />`
        )
        .join('\n');
      return `    <object id="${objectId}" name="${escapeXml(p.name)}" type="model" pid="1" pindex="${idx}">
      <mesh>
        <vertices>
${vertsXml}
        </vertices>
        <triangles>
${trisXml}
        </triangles>
      </mesh>
    </object>`;
    })
    .join('\n');

  const buildItemsXml = parts
    .map((_, idx) => `    <item objectid="${idx + 2}" />`)
    .join('\n');

  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="pt-BR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Title">Modelo Estúdio 3D IA</metadata>
  <resources>
    <basematerials id="1">
${baseMaterialsXml}
    </basematerials>
${objectsXml}
  </resources>
  <build>
${buildItemsXml}
  </build>
</model>`;

  return { contentTypes, rels, model };
}

export function extractJsCodeBlock(text: string): string | null {
  if (!text) return null;
  const fenced = text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/i);
  if (fenced && fenced[1].trim()) {
    return fenced[1].trim();
  }
  return null;
}

export interface GeminiModelEntry {
  name: string;
  supportedGenerationMethods?: string[];
}

export function filterGenerateContentModels(models: GeminiModelEntry[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of models || []) {
    if (!m || !m.name) continue;
    const methods = m.supportedGenerationMethods || [];
    if (!methods.includes('generateContent')) continue;
    const shortName = m.name.replace(/^models\//, '');
    if (!seen.has(shortName)) {
      seen.add(shortName);
      result.push(shortName);
    }
  }
  return result;
}
