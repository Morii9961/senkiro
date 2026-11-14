# Fable 5.2 · V3 接入说明

本数据包不修改任何三维建模代码。适配器是一个没有依赖的纯 TypeScript 文件，前端直接 import 即可。

## 1. 读什么

| 用途 | 文件 |
| --- | --- |
| 正式数据（仓库内，可公开） | `labs/c-shinjuku-3d/data/shinjuku/senkiro_timetable.json`（约 7.6 MB，gzip 后小得多） |
| 本地完整视图（可选，gitignored） | `labs/c-shinjuku-3d/data/shinjuku/local/senkiro_timetable.full.json`：加上 JR、小田急、京王、M08、西武的旧数据，全部标 `legacy_unverified` |
| 类型与查询 | `labs/c-shinjuku-3d/timetable/adapter/senkiroTimetable.ts` |
| JSON Schema | `labs/c-shinjuku-3d/timetable/adapter/senkiro_timetable.schema.json` |

本地文件不存在时，前端必须能正常运行，此时只有四个都营站点有数据。

## 2. 契约站点 ID（不得改写）

| station_id | 运营商 | 线路 | 显示名 | 站点编码 | 3D 模型 |
| --- | --- | --- | --- | --- | --- |
| `jr-east:shinjuku` | JR 东日本 | 山手・中央快速・中央总武・埼京川越・湘南新宿 | 新宿 | JY17/JC05/JB10/JA11/JS20（未核实） | `sk:station:jr-east-shinjuku` |
| `odakyu:shinjuku` | 小田急 | 小田原线 | 新宿 | OH01（未核实） | `sk:station:odakyu-shinjuku` |
| `keio:shinjuku` | 京王 | 京王线 | 新宿 | KO01（未核实） | `sk:station:keio-shinjuku` |
| `keio:shinjuku-newline` | 京王 | 京王新线 | 新线新宿 | KO01（未核实） | `sk:station:keio-new-line-shinjuku` |
| `tokyo-metro:shinjuku:M08` | 东京 Metro | 丸之内线 | 新宿 | M08 | `sk:station:tokyo-metro-shinjuku` |
| `toei:shinjuku:S01` | 都营 | 新宿线 | 新宿 | S01（ODPT） | 与京王新线共用 4・5 番线 |
| `toei:shinjuku:E27` | 都营 | 大江户线 | 新宿 | E27（ODPT） | `sk:station:toei-oedo-shinjuku` |
| `seibu:seibu-shinjuku` | 西武 | 新宿线 | 西武新宿 | SS01（未核实） | `sk:station:seibu-shinjuku` |
| `tokyo-metro:shinjuku-sanchome:M09` | 东京 Metro | 丸之内线 | 新宿三丁目 | M09 | — |
| `tokyo-metro:shinjuku-sanchome:F13` | 东京 Metro | 副都心线 | 新宿三丁目 | F13 | — |
| `toei:shinjuku-sanchome:S02` | 都营 | 新宿线 | 新宿三丁目 | S02（ODPT） | — |
| `toei:shinjuku-nishiguchi:E01` | 都营 | 大江户线 | 新宿西口 | E01（ODPT） | — |

把站台放进三维场景时，用 `platforms.csv` 或 JSON `platforms[]` 的 `model_platform_ref`，它对应 V2 模型的 `sk:platform:*` 岛式站台。`platform_id` 为 null 时**不要**默认放到任何轨道上。

## 3. 读取与过滤示例

```ts
import {
  indexTimetable, mergeLayers, getStationDepartures, getPlatformEvents, getTrainByTripId,
  getVehicleAssignment, getEventsAroundTime, resolveServiceDateType, vehicleLabel,
  type SenkiroTimetable,
} from '../timetable/adapter/senkiroTimetable';

const base: SenkiroTimetable = await (await fetch('/data/shinjuku/senkiro_timetable.json')).json();
const local = await fetch('/data/shinjuku/local/senkiro_timetable.full.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
const tt = indexTimetable(local ? mergeLayers(base, local) : base);

// 1) 某站某营业日的出发（营业日：00:20 的列车属于前一天）
const deps = getStationDepartures(tt, 'toei:shinjuku-sanchome:S02', '2026-11-14', { directionId: 'toei:shinjuku:eastbound' });

// 2) 某站台的时间窗口（秒，从营业日 00:00 起算，可以超过 86400）
const p = getPlatformEvents(tt, 'jr-east:shinjuku', 'jr-east:shinjuku:track-14', { serviceDate: '2026-11-14', fromSeconds: 8 * 3600, toSeconds: 8 * 3600 + 900 });

// 3) 班次与跨站连接
const trip = getTrainByTripId(tt, 'odpt.TrainTimetable:Toei.Shinjuku.1061K.SaturdayHoliday');

// 4) 车辆：只有 verified 才算「本班次实际车辆」
const v = getVehicleAssignment(tt, trip!.trip.trip_id);
const badge = vehicleLabel(trip!.events[0]); // 例：「10両（代表例・本列車の実車両ではない）」

// 5) 指定时刻前后（自动处理跨午夜和两天的日类型）
const now = getEventsAroundTime(tt, '2026-11-15T00:20:00+09:00', ['toei:shinjuku:E27', 'toei:shinjuku-nishiguchi:E01'], { beforeMinutes: 5, afterMinutes: 15 });

// 只要正式数据：
const officialOnly = getStationDepartures(tt, 'jr-east:shinjuku', '2026-11-14', { includeLegacy: false }); // → []
```

每个返回事件都带 `service_date`、`departure_instant` 和 `arrival_instant`（如 `2026-11-15T00:13:00+09:00`），动画直接用这些绝对时刻即可，不要用浏览器本地时区去解析 `HH:MM`。

## 4. 合法记录的形态（前端必须支持）

| 情况 | 字段表现 |
| --- | --- |
| 没有列车番号 | `train_number: null`（旧层全部如此） |
| 没有到达时刻 | `arrival_time_local: null`，`arrival_departure_type: 'departure_only'` |
| 没有出发时刻（终点，或直通京王出界） | `departure_time_local: null`，`'arrival_only'` |
| 站台未知 | `platform_id: null`，`platform_verification_status: 'unknown'` |
| 车型未知 | `vehicle_series: null`；只知编组时 `formation_length` 有值，状态为 `representative` |
| 始发与否未知或来源矛盾 | `is_origin_at_station: null` |
| 待核实记录 | `data_status: 'legacy_unverified'`，`trip_id_is_synthetic: true` |

**UI 规则：**
- `legacy_unverified` 记录须有醒目的「未核实」标识。
- `representative` 车辆不能显示为「本班次实际车型」。
- 不要用这些数据冒充实时位置或延误。

## 5. 动画建议（模拟参数层）

数据层只有计划时刻。三维动画需要的停站秒数、进站减速、编组长度对应的站台停车位置等，请放在 V3 自己的模拟参数里，**不要写回**这些字段。只有一侧时刻时，可以在模拟层用参数补出入站动画，但 UI 上显示的计划时刻必须是数据里的原值。

## 6. 署名

使用都营数据的页面须显示：「出典：東京都交通局・公共交通オープンデータ協議会 (CC BY 4.0) を加工して作成」（JSON `attribution[0]`）。
