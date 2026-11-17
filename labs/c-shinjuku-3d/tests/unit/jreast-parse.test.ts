import { describe, expect, it } from 'vitest';
import { dateLimited, halfWidth, parseDigitalTimetable, parseLineList, parseStationTimetable, parseTrainPage } from '../../scripts/jreast/parse';

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

  it('reads a line timetable: one column per train, times by station, and the track row of a station', () => {
    const DIGITAL = `<h2>線B 上り (甲－乙)</h2><h3 class="weekday">平日</h3><table class="paper_table">
<tr class="tableTr_trainNumber"><th class="table_th01">列車番号</th><th class="table_th02"></th><td>1M</td><td>3M</td></tr>
<tr class="tableTr_trainName"><th class="table_th01"><span>列車名</span></th><th class="table_th02"></th><td><span class="trainName">特急 テスト2号</td><td><span class="trainName">普通</td></tr>
<tr class="tableTr_operatingDay"><th class="table_th01">運転日</th><th class="table_th02"></th><td>平日</td><td>全日</td></tr>
<tr><th class="table_th01"><span class="v_scale">甲</span></th><th class="table_th02">発</th><td>0700</td><td>0705</td></tr>
<tr><th class="table_th01"><span class="v_scale">新宿</span></th><th class="table_th02">着</th><td>0759</td><td>レ</td></tr>
<tr><th class="table_th01"><span class="v_scale">新宿番線</span></th><th class="table_th02"></th><td>(７)</td><td></td></tr>
<tr class="tableTr_end"><th class="table_th01">終着</th><th class="table_th02"></th><td><span class="e_trainText">新宿</span> <span class="e_trainText_num">0759</span></td><td><span class="e_trainText">乙</span> <span class="e_trainText_num">0830</span></td></tr>
</table>`;
    const t = parseDigitalTimetable(DIGITAL);
    expect(t.title).toBe('線B 上り (甲－乙)');
    expect(t.day).toBe('weekday');
    expect(t.columns.map((c) => [c.number, c.name, c.operatingDay, c.end])).toEqual([['1M', '特急 テスト2号', '平日', '新宿'], ['3M', '普通', '全日', '乙']]);
    expect(t.columns[0]!.calls).toEqual([{ station: '甲', arr: null, dep: '07:00' }, { station: '新宿', arr: '07:59', dep: null }]);
    expect(t.columns[0]!.platforms).toEqual({ 新宿: '7' });
    // a train that passes (レ) gets no call and no track
    expect(t.columns[1]!.calls).toEqual([{ station: '甲', arr: null, dep: '07:05' }]);
    expect(t.columns[1]!.platforms).toEqual({});
  });

  it('leaves out only trains that run on listed dates', () => {
    for (const regular of ['平日', '全日', '土曜・休日運転', '平日運転 / １１月７日は運休', '◆ 11月7日は運休', '◆ 2月26日まで＜除く、土曜・休日と12月30日～1月3日＞運転', '◆ 2月28日までの土曜・休日と12月30日～1月3日運転']) {
      expect(dateLimited(regular), regular).toBe(false);
    }
    for (const limited of ['◆ 12月29日運転', '◆ 11月21・22日運転', '◆ 12月26日～1月3・10・11日・2月21・23・28日運転', '１月３１日運転']) {
      expect(dateLimited(limited), limited).toBe(true);
    }
  });
});
