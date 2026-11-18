import { describe, expect, it } from 'vitest';
import { metroRecords, parseMetroText } from '../../scripts/metro-text';

// Text written for this test in the shape of a Tokyo Metro station timetable copied as text. It is not a copy of
// any page (whose content may not be reproduced); the times and the order of the trains are made up.

const FUKUTOSHIN = `東京メトロ テスト（F13）渋谷方面 平日時刻表
URL: https://transfer.tokyometro.jp/website/timetable?numbering=F13&direction=0&schedule=weekday

5時
05:01 各駅停車 当駅始発 元町・中華街 行き
05:30 急行 大和（神奈川県） 行き
10:10 S-TRAIN2号 元町・中華街 行き

0時
00:20 各駅停車 渋谷 行き
`;

const MARUNOUCHI = `URL: https://transfer.tokyometro.jp/website/timetable?numbering=M08&direction=0&schedule=holiday
05:00 当駅始発 池袋 行き
05:10 新宿三丁目 行き
`;

describe('Tokyo Metro station timetable text', () => {
  it('reads type, destination and the 当駅始発 mark of each train', () => {
    const t = parseMetroText(FUKUTOSHIN)!;
    expect(t).toMatchObject({ numbering: 'F13', direction: '0', day: 'weekday' });
    expect(t.entries).toEqual([
      { time: '05:01', type: '各駅停車', destination: '元町・中華街', startsHere: true },
      { time: '05:30', type: '急行', destination: '大和(神奈川県)', startsHere: false },
      { time: '10:10', type: 'S-TRAIN2号', destination: '元町・中華街', startsHere: false },
      { time: '00:20', type: '各駅停車', destination: '渋谷', startsHere: false },
    ]);
    const rs = metroRecords(t);
    expect(rs.map((r) => r.platform_id)).toEqual(Array(4).fill('tokyo-metro:shinjuku-sanchome:F13:3'));
    expect(rs[0]!.remarks).toBe('当駅始発');
    expect(rs[3]!.departure_time_local).toBe('24:20');
  });

  it('a page without types: 当駅始発 is a mark, not a type', () => {
    const t = parseMetroText(MARUNOUCHI)!;
    expect(t.day).toBe('saturday-holiday');
    expect(t.entries[0]).toEqual({ time: '05:00', type: null, destination: '池袋', startsHere: true });
    const [first, second] = metroRecords(t);
    expect(first).toMatchObject({ platform_id: 'tokyo-metro:shinjuku:M08:2', service_class: '各駅停車', destination_text: '池袋' });
    expect(first!.remarks).toMatch(/^当駅始発 · Type not printed/);
    expect(second!.remarks).toMatch(/^Type not printed/);
  });

  it('a text without the timetable URL is not read', () => {
    expect(parseMetroText('05:00 池袋 行き')).toBeNull();
  });
});
