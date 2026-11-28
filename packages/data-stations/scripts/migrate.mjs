import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { migrateUmeda } from './lab-b.mjs';
import { migrateShinjuku } from './lab-c.mjs';
import { SHINJUKU, UMEDA } from './manifest.mjs';

const root = new URL('../../../', import.meta.url);
const showJson = (lab, path) =>
  JSON.parse(
    execFileSync('git', ['show', `lab/${lab}:labs/${lab}/${path}`], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }),
  );

const b = (path) => showJson('b-umeda-3d', path);
const c = (path) => showJson('c-shinjuku-3d', path);

const umeda = migrateUmeda(
  b('data/processed/station.json'),
  b('data/processed/services.json'),
  b('data/processed/exits.json'),
  b('data/processed/line-styles.json'),
  b('data/sources.json'),
);
const shinjuku = migrateShinjuku(c('data/processed/station.json'), c('data/sources.json'));
const header = `// Converted from the Lab processed data with pnpm migrate:labs.
import type { StationHubDataset } from '@senkiro/contracts';
`;
const print = (data) => JSON.stringify(data, null, 2);
const write = (name, text) =>
  writeFileSync(new URL(`../src/${name}.ts`, import.meta.url), text, 'utf8');

write(
  'umeda',
  `${header}
export const umedaHubDataset: StationHubDataset = ${print(umeda)};

export const umedaHub = { dataset: umedaHubDataset, planNorth: '${UMEDA.north}' } as const;
`,
);

// Separate Shinjuku's indoor arrays so each generated module fits the workspace file limit.
const { places, links, ...metadata } = shinjuku;
write(
  'shinjuku-places',
  `${header}
export const shinjukuPlaces: StationHubDataset['places'] = ${print(places)};
`,
);
write(
  'shinjuku-links',
  `${header}
export const shinjukuLinks: StationHubDataset['links'] = ${print(links)};
`,
);
write(
  'shinjuku',
  `${header}
import { shinjukuLinks } from './shinjuku-links.ts';
import { shinjukuPlaces } from './shinjuku-places.ts';

export const shinjukuHubDataset: StationHubDataset = {
${print(metadata).slice(2, -2)},
  places: shinjukuPlaces,
  links: shinjukuLinks,
};

export const shinjukuHub = { dataset: shinjukuHubDataset, planNorth: '${SHINJUKU.north}' } as const;
`,
);
