import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePartsToZUpMm,
  build3mfPackageXml,
  toRgbaHex,
  extractJsCodeBlock,
  filterGenerateContentModels,
} from './export3d';

test('normalizePartsToZUpMm centers X/Z, rests base at Z=0, scales to exact height, and converts Y-up to Z-up', () => {
  const parts = [
    {
      name: 'Base',
      colorHex: '#334455',
      vertices: [
        { x: 10, y: 2, z: -4 },
        { x: 12, y: 2, z: -4 },
        { x: 11, y: 6, z: -2 },
      ],
      triangles: [[0, 1, 2]] as [number, number, number][],
    },
  ];

  const normalized = normalizePartsToZUpMm(parts, 100);
  assert.equal(normalized.length, 1);
  const verts = normalized[0].vertices;

  const xs = verts.map((v) => v.x);
  const ys = verts.map((v) => v.y);
  const zs = verts.map((v) => v.z);

  // Height along Z must be exactly 100mm starting at 0
  assert.ok(Math.abs(Math.min(...zs) - 0) < 1e-6);
  assert.ok(Math.abs(Math.max(...zs) - 100) < 1e-6);

  // X and Y centered at 0
  assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2) < 1e-6);
  assert.ok(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2) < 1e-6);

  // Check (x, -z, y) mapping: original z=-4 had smaller z than z=-2, so -nz for z=-4 should be positive
  assert.ok(verts[0].y > verts[2].y);
});

test('normalizePartsToZUpMm flips triangle winding when flipWinding is true', () => {
  const normalized = normalizePartsToZUpMm(
    [
      {
        name: 'Espelhada',
        colorHex: '#ff0000',
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 2, z: 0 },
        ],
        triangles: [[0, 1, 2]],
        flipWinding: true,
      },
    ],
    50
  );
  assert.deepEqual(normalized[0].triangles, [[0, 2, 1]]);
});

test('toRgbaHex formats opaque and translucent hex colors cleanly', () => {
  assert.equal(toRgbaHex('#3b82f6', 1), '#3B82F6FF');
  assert.equal(toRgbaHex('ff8800', 0.5), '#FF880080');
});

test('build3mfPackageXml generates valid 3MF XML with millimeter unit, basematerials, pid/p1, and build items', () => {
  const normalized = normalizePartsToZUpMm(
    [
      {
        name: 'Base & Suporte',
        colorHex: '#1f2937',
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
        ],
        triangles: [[0, 1, 2]],
      },
      {
        name: 'Cabeca',
        colorHex: '#eab308',
        vertices: [
          { x: 0, y: 1, z: 0 },
          { x: 1, y: 1, z: 0 },
          { x: 0, y: 2, z: 0 },
        ],
        triangles: [[0, 1, 2]],
      },
    ],
    100
  );

  const pkg = build3mfPackageXml(normalized);
  assert.match(pkg.contentTypes, /3dmanufacturing-3dmodel\+xml/);
  assert.match(pkg.rels, /Target="\/3D\/3dmodel\.model"/);
  assert.match(pkg.model, /unit="millimeter"/);
  assert.match(pkg.model, /<basematerials id="1">/);
  assert.match(pkg.model, /name="Base &amp; Suporte" displaycolor="#1F2937FF"/);
  assert.match(pkg.model, /name="Cabeca" displaycolor="#EAB308FF"/);
  assert.match(pkg.model, /<triangle v1="0" v2="1" v3="2" pid="1" p1="0" \/>/);
  assert.match(pkg.model, /<triangle v1="0" v2="1" v3="2" pid="1" p1="1" \/>/);
  assert.match(pkg.model, /<item objectid="2" \/>/);
  assert.match(pkg.model, /<item objectid="3" \/>/);
});

test('extractJsCodeBlock extracts fenced JS code from AI markdown response', () => {
  const reply = 'Criei o modelo 3D.\n```javascript\nconst m = new THREE.Mesh();\ngroup.add(m);\n```\nPronto!';
  assert.equal(extractJsCodeBlock(reply), 'const m = new THREE.Mesh();\ngroup.add(m);');
  assert.equal(extractJsCodeBlock('Sem bloco de codigo'), null);
});

test('filterGenerateContentModels filters only compatible models and strips prefix', () => {
  const filtered = filterGenerateContentModels([
    { name: 'models/gemini-4-neon', supportedGenerationMethods: ['generateContent', 'countTokens'] },
    { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
    { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
  ]);
  assert.deepEqual(filtered, ['gemini-4-neon', 'gemini-2.5-pro']);
});
