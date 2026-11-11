/**
 * Display names. Japanese names come straight from the sources; where an
 * element has no printed name (most stairs, some corridors) a descriptive
 * label is composed from what it joins, and never stored back into the data.
 */
import type { Names, StationModel, VerticalFacility } from '../domain/types';
import type { Lang, T } from './i18n';

export function pickName(names: Names, lang: Lang): string | null {
  if (lang === 'ja') return names.ja ?? names.en ?? null;
  if (lang === 'zh') return names.zh ?? names.ja ?? names.en ?? null;
  return names.en ?? names.ja ?? null;
}

export interface Namer {
  name(id: string): string;
  short(id: string): string;
  level(id: string): string;
  kind(id: string): string;
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

  const verticalKind = (v: VerticalFacility) =>
    v.verticalKind === 'stairs' ? t('kindStairs') : v.verticalKind === 'escalator' ? t('kindEscalator') : t('kindElevator');

  const areaShort = (id: string): string => {
    const a = areas.get(id);
    if (!a) return id;
    if (a.kind === 'platform') {
      const nums = a.tracks.map((x) => x.number);
      const range = nums.length > 2 ? `${nums[0]}–${nums.at(-1)}` : nums.join('·');
      const op = a.stationId?.includes('keio') ? (lang === 'en' ? 'Keio ' : '京王 ') : '';
      return lang === 'en' ? `${op}Platforms ${range}` : lang === 'zh' ? `${op}${range} 号站台` : `${op}${range}番線`;
    }
    return pickName(a.names, lang) ?? id;
  };

  const name = (id: string): string => {
    const a = areas.get(id);
    if (a) return pickName(a.names, lang) ?? areaShort(id);
    const g = gates.get(id);
    if (g) return pickName(g.names, lang) ?? id;
    const e = entrances.get(id);
    if (e) {
      const own = pickName(e.names, lang);
      if (own) return own;
      const lead = lang === 'ja' ? e.leadsToJa : (e.leadsToEn ?? e.leadsToJa);
      return lead ? `${t('kindEntrance')} → ${lead}` : t('kindEntrance');
    }
    const v = verticals.get(id);
    if (v) {
      if (v.operatorLabel) return `${t('kindElevator')} ${CIRCLED[v.operatorLabel] ?? v.operatorLabel}`;
      const own = pickName(v.names, lang);
      if (own) return own;
      const ends = [v.stops[0], v.stops.at(-1)].map((s) => (s ? areaShort(s.areaId) : '?'));
      return `${verticalKind(v)}（${ends[0]} ⇄ ${ends[1]}）`;
    }
    const p = passages.get(id);
    if (p) return `${areaShort(p.fromAreaId)} ⇄ ${areaShort(p.toAreaId)}`;
    const b = blocks.get(id);
    if (b) return pickName(b.names, lang) ?? id;
    const l = levels.get(id);
    if (l) return pickName(l.names, lang) ?? l.label;
    return id;
  };

  const short = (id: string): string => {
    if (areas.has(id)) return areaShort(id);
    const v = verticals.get(id);
    if (v) {
      if (v.operatorLabel) return `${t('kindElevator')} ${CIRCLED[v.operatorLabel] ?? v.operatorLabel}`;
      return verticalKind(v);
    }
    return name(id);
  };

  const level = (id: string): string => {
    const l = levels.get(id);
    return l ? (pickName(l.names, lang) ?? l.label) : id;
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

  return { name, short, level, kind };
}

export function circled(letter: string): string {
  return CIRCLED[letter] ?? letter;
}
