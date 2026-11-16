import { describe, expect, it } from 'vitest';
import { halfWidth, parseLineList, parseStationTimetable, parseTrainPage } from '../../scripts/jreast/parse';

// Minimal pages written for this test in the structure of the JR East timetable site. They are not
// copies of any page of the site (whose content may not be reproduced) and every time in them is made up.

const LIST = `<table><tr><td>線A</td><td>北方面 (下り)</td>
<td><a href="../2611/timetable/tt0001/0001010.html" class="fortimeLink">平日</a></td>
<td><a href="../2611/timetable/tt0001/0001011.html" class="fortimeLink">土曜・休日</a></td></tr>
<tr><td>見出し</td></tr></table>`;

const STATION = `<h2>テスト駅　線A 北方面</h2><table><tbody>
<tr id="time_5"><td>5時</td><td>
<div class="timetable_time" data-train="無印" data-dest="無印"><span class="txt_red"><span class="train">X</span>
<a href="../../train/001/000011.html" class="time_link_red"><span class="minute">07</span></a></span></div>
<div class="timetable_time" data-train="無印" data-dest="無印"><a href="../../train/001/000021.html"><span class="minute">41</span></a></div>
</td></tr>
<tr id="time_6"><td>6時</td><td>
<div class="timetable_time" data-train="無印,X" data-dest="甲" data-misc="◆"><span class="txt_red"><span class="train">X</span>
<a href="../../train/001/000031.html"><span class="minute"><span class="sp">03</span></span><span class="mark_etc">◆▲</span></a>
<span class="dest">甲</span></span></div>
</td></tr></tbody></table><p>列車種別・列車名 無印=普通 X=テスト</p>`;

const TRAIN = `<title>時刻表　停車駅一覧（特急テスト 1号（甲－乙－丙）／特急テスト 1号（乙－丙））：テスト</title><table id="tbl_train" class="num_train_2"><tbody>
<tr class="train"><th>列車種別</th><td colspan="2">特急</td><td colspan="2">特急</td></tr>
<tr class="train"><th>列車名</th><td colspan="2">テスト 1号</td><td colspan="2">テスト 1号</td></tr>
<tr class="train"><th>列車番号</th><td colspan="2">1A</td><td colspan="2">2A</td></tr>
<tr class="train"><th>併結運転</th><td colspan="2"><ul><li>乙－丙は2Aを併結</li></ul></td><td colspan="2"><ul><li>乙－丙は1Aに併結</li></ul></td></tr>
<tr class="train"><th>運転日</th><td colspan="2"><ul><li><li>１月１日は運休</li></ul></td><td colspan="2"><ul><li></ul></td></tr>
<tr class="label"><th class="eki">駅名</th><th class="jikoku">時刻</th><th class="bansen">番線</th><th class="jikoku">時刻</th><th class="bansen">番線</th></tr>
<tr class="time"><th class="time"><a href="../../../timetable/list0001.html">甲</a></th>
<td class="time"><ul><li></li><li><span>05:00 発</span></li></ul></td><td class="platform"><span>１２</span></td>
<td class="time"></td><td class="platform"></td></tr>
<tr class="time"><th class="time"><a href="../../../timetable/list0002.html">乙</a></th>
<td class="time"><ul><li><span>05:10 着</span></li><li><span>05:11 発</span></li></ul></td><td class="platform"></td>
<td class="time"><ul><li></li><li><span>05:12 発</span></li></ul></td><td class="platform">３</td></tr>
</tbody></table>`;

describe('JR East timetable page readers (local-only fetch script)', () => {
  it('reads the line list with its two timetable links', () => {
    expect(parseLineList(LIST)).toEqual([
      { line: '線A', direction: '北方面 (下り)', weekday: '../2611/timetable/tt0001/0001010.html', holiday: '../2611/timetable/tt0001/0001011.html' },
    ]);
  });

  it('reads hour, minute, mark and stop-list link of every departure', () => {
    const t = parseStationTimetable(STATION);
    expect(t.title).toBe('テスト駅 線A 北方面');
    expect(t.entries).toEqual([
      { hour: 5, minute: 7, mark: 'X', misc: '', dest: '', href: '../../train/001/000011.html' },
      { hour: 5, minute: 41, mark: '', misc: '', dest: '', href: '../../train/001/000021.html' },
      // a minute wrapped once more and followed by marks
      { hour: 6, minute: 3, mark: 'X', misc: '◆▲', dest: '甲', href: '../../train/001/000031.html' },
    ]);
    expect(t.legend).toMatch(/X=テスト/);
  });

  it('reads one column per train, with the times, track and station code of each call it makes', () => {
    const [a, b] = parseTrainPage(TRAIN);
    expect(a).toMatchObject({ type: '特急', name: 'テスト 1号', number: '1A', days: ['１月１日は運休'], route: ['甲', '乙', '丙'] });
    expect(b!.route).toEqual(['乙', '丙']);
    expect(b!.coupling).toEqual(['乙－丙は1Aに併結']);
    expect(a!.calls).toEqual([
      { station: '甲', code: '0001', arr: null, dep: '05:00', platform: '12' },
      { station: '乙', code: '0002', arr: '05:10', dep: '05:11', platform: null },
    ]);
    // the second train only calls at 乙: no call is made up for 甲
    expect(b!.calls).toEqual([{ station: '乙', code: '0002', arr: null, dep: '05:12', platform: '3' }]);
    expect(halfWidth('１６番線')).toBe('16番線');
  });
});
