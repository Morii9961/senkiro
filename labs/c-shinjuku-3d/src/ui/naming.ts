/**
 * Display names. Japanese names come straight from the sources; where an
 * element has no printed name (most stairs, some corridors) a descriptive
 * label is composed from what it joins, and never stored back into the data.
 *
 * Floors are named by their position in the station ("B1F"), not by operator:
 * see domain/floors.ts.
 */
import { floorLabel } from '../domain/floors';
import type { Names, Platform, RailLine, StationModel, VerticalFacility } from '../domain/types';
import type { Lang, T } from './i18n';
import { trackRange } from './scene/labels';

export function pickName(names: Names, lang: Lang): string | null {
  if (lang === 'ja') return names.ja ?? names.en ?? null;
  if (lang === 'zh') return names.zh ?? names.ja ?? names.en ?? null;
  return names.en ?? names.ja ?? null;
}

export interface Namer {
  name(id: string): string;
  short(id: string): string;
  /** Floor label of a level, e.g. "B1F". */
  level(id: string): string;
  kind(id: string): string;
  /** Lines stopping at a platform, in the order of its tracks. */
  linesOf(platform: Platform): RailLine[];
  lineName(railLineId: string): string;
}

const CIRCLED: Record<string, string> = {
  A: 'Ⓐ', B: 'Ⓑ', C: 'Ⓒ', D: 'Ⓓ', E: 'Ⓔ', F: 'Ⓕ', G: 'Ⓖ', H: 'Ⓗ', I: 'Ⓘ', J: 'Ⓙ', K: 'Ⓚ', L: 'Ⓛ', M: 'Ⓜ', N: 'Ⓝ', O: 'Ⓞ',
};

export function makeNamer(model: StationModel, lang: Lang, t: T): Namer {
  const areas = new Map(model.areas.map((a) => [a.id, a]));
  const gates = new Map(model.gates.map((g) => [g.id, g]));
  const entrances = new Map(model.entrances.map((e) => [e.id, e]));
  const verticals = new Map(model.verticals.map((v) => [v.id, v]));
  const passages = new Map(model.passages.map((p) => [p.id, p]));
  const blocks = new Map(model.unverifiedBlocks.map((b) => [b.id, b]));
  const levels = new Map(model.levels.map((l) => [l.id, l]));
  const lines = new Map(model.railLines.map((l) => [l.id, l]));

  const verticalKind = (v: VerticalFacility) =>
    v.verticalKind === 'stairs' ? t('kindStairs') : v.verticalKind === 'escalator' ? t('kindEscalator') : t('kindElevator');

  const lineName = (id: string): string => {
    const l = lines.get(id);
    return l ? (pickName(l.names, lang) ?? id) : id;
  };

  const linesOf = (platform: Platform): RailLine[] => {
    const out: RailLine[] = [];
    for (const tr of platform.tracks) {
      for (const s of tr.services) {
        const l = lines.get(s.railLineId);
        if (l && !out.includes(l)) out.push(l);
      }
    }
    return out;
  };

  const platformNumbers = (a: Platform): string => {
    const range = trackRange(a.tracks.map((x) => x.number));
    return lang === 'en' ? `Tracks ${range}` : lang === 'zh' ? `${range} 号站台` : `${range}番線`;
  };

  const areaShort = (id: string): string => {
    const a = areas.get(id);
    if (!a) return id;
    if (a.kind === 'platform') return platformNumbers(a);
    return pickName(a.names, lang) ?? id;
  };

  const name = (id: string): string => {
    const a = areas.get(id);
    if (a) {
      if (a.kind === 'platform') {
        // track numbers repeat between operators, so a platform is always named with its lines
        const ls = linesOf(a).map((l) => lineName(l.id));
        const shown = ls.length > 2 ? `${ls.slice(0, 2).join(lang === 'en' ? ', ' : '・')}${lang === 'en' ? ' …' : ' ほか'}` : ls.join(lang === 'en' ? ', ' : '・');
        const more = lang === 'zh' ? shown.replace(' ほか', ' 等') : shown;
        return more ? `${more} ${platformNumbers(a)}` : platformNumbers(a);
      }
      return pickName(a.names, lang) ?? areaShort(id);
    }
    const g = gates.get(id);
    if (g) return pickName(g.names, lang) ?? id;
    const e = entrances.get(id);
    if (e) {
      // an English working title must not stand in for a missing Japanese name
      const own = lang === 'en' ? (e.names.en ?? e.names.ja) : lang === 'zh' ? (e.names.zh ?? e.names.ja) : e.names.ja;
      if (own) return own;
      const lead = lang === 'en' ? (e.leadsToEn ?? e.leadsToJa) : e.leadsToJa;
      return lead ? `${t('kindEntrance')}（${lead}）` : t('kindEntrance');
    }
    const v = verticals.get(id);
    if (v) {
      if (v.operatorLabel) return `${t('kindElevator')} ${CIRCLED[v.operatorLabel] ?? v.operatorLabel}`;
      return verticalKind(v);
    }
    const p = passages.get(id);
    if (p) return `${areaShort(p.fromAreaId)} ⇄ ${areaShort(p.toAreaId)}`;
    const b = blocks.get(id);
    if (b) return pickName(b.names, lang) ?? id;
    const l = levels.get(id);
    if (l) return floorLabel(l.ordinal);
    return id;
  };

  const short = (id: string): string => {
    const a = areas.get(id);
    if (a) return a.kind === 'platform' ? name(id) : areaShort(id);
    const v = verticals.get(id);
    if (v) {
      if (v.operatorLabel) return `${t('kindElevator')} ${CIRCLED[v.operatorLabel] ?? v.operatorLabel}`;
      return verticalKind(v);
    }
    return name(id);
  };

  const level = (id: string): string => {
    const l = levels.get(id);
    return l ? floorLabel(l.ordinal) : id;
  };

  const kind = (id: string): string => {
    const a = areas.get(id);
    if (a) return a.kind === 'platform' ? t('kindPlatform') : a.kind === 'passage' ? t('kindPassage') : t('kindConcourse');
    const g = gates.get(id);
    if (g) return g.gateKind === 'transfer' ? t('kindTransferGate') : t('kindGate');
    if (entrances.has(id)) return t('kindEntrance');
    const v = verticals.get(id);
    if (v) return verticalKind(v);
    if (passages.has(id)) return t('kindLink');
    if (blocks.has(id)) return t('kindBlock');
    if (levels.has(id)) return t('kindLevel');
    return '';
  };

  return { name, short, level, kind, linesOf, lineName };
}

export function circled(letter: string): string {
  return CIRCLED[letter] ?? letter;
}
