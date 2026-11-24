import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  LogOut,
  Pause,
  Play,
  RotateCcw,
  Video,
} from 'lucide-react';
import type {
  SimulatedTrainState,
  SimulationControlState,
  SimTimeScale,
  SimTrainDensity,
} from '../contracts/atlasV2.js';
import type { AtlasDataset, SkId } from '../domain/types.js';
import { pickLocale, type Locale } from './i18n.js';

interface SimulationPanelProps {
  dataset: AtlasDataset;
  locale: Locale;
  control: SimulationControlState;
  trains: readonly SimulatedTrainState[];
  trainsVisible: boolean;
  selectedTrainId: string | null;
  isFollowing: boolean;
  visibleLimit: number | 'all';
  onTogglePlaying: () => void;
  onChangeTimeScale: (scale: SimTimeScale) => void;
  onChangeDensity: (density: SimTrainDensity) => void;
  onChangeVisibleLimit: (limit: number | 'all') => void;
  onToggleTrainsVisible: () => void;
  onSelectTrain: (trainId: string) => void;
  onFollowTrain: (trainId: string) => void;
  onResetSimulation: () => void;
  onExitFollow: () => void;
}

const TIME_SCALES: SimTimeScale[] = [0.5, 1, 2, 5, 10];

export const SimulationPanel: React.FC<SimulationPanelProps> = ({
  dataset,
  locale,
  control,
  trains,
  trainsVisible,
  selectedTrainId,
  isFollowing,
  visibleLimit,
  onTogglePlaying,
  onChangeTimeScale,
  onChangeDensity,
  onChangeVisibleLimit,
  onToggleTrainsVisible,
  onSelectTrain,
  onFollowTrain,
  onResetSimulation,
  onExitFollow,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const lineNameMap = React.useMemo(() => {
    const m = new Map<SkId<'line'>, { ja: string; zh: string; en: string }>();
    for (const l of dataset.railLines) {
      m.set(l.id, {
        ja: l.names.ja?.split('（')[0] ?? l.id,
        zh: l.names.zh?.split('（')[0] ?? l.names.ja?.split('（')[0] ?? l.id,
        en: l.names.en?.split(' (')[0] ?? l.names.ja ?? l.id,
      });
    }
    return m;
  }, [dataset.railLines]);

  const activeTrainId =
    selectedTrainId && trains.some((t) => t.trainId === selectedTrainId)
      ? selectedTrainId
      : trains[0]?.trainId ?? '';

  const shownCount =
    visibleLimit === 'all' ? trains.length : Math.min(visibleLimit, trains.length);

  if (collapsed) {
    return (
      <div className="sim-dock sim-dock-collapsed" data-testid="simulation-control-bar">
        <span className="sim-badge" data-testid="sim-synthetic-badge">
          {pickLocale(locale, '模擬運行 · SYNTHETIC', '模拟运行 · 合成数据', 'SIMULATED · SYNTHETIC')}
        </span>
        <button
          type="button"
          className="sim-btn"
          data-testid="sim-play-pause"
          onClick={onTogglePlaying}
          title={
            control.running
              ? pickLocale(locale, 'Pause', '暂停', 'Pause')
              : pickLocale(locale, 'Play', '播放', 'Play')
          }
        >
          {control.running ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <button
          type="button"
          className="sim-btn"
          data-testid="sim-collapse-btn"
          onClick={() => setCollapsed(false)}
          title={pickLocale(locale, '操作バーを展開', '展开控制栏', 'Expand Simulation Bar')}
        >
          <ChevronUp size={12} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="sim-dock"
      data-testid="simulation-control-bar"
      role="region"
      aria-label={pickLocale(
        locale,
        '仮想列車シミュレーション制御',
        '虚拟列车仿真控制',
        'Virtual Train Simulation Controls',
      )}
    >
      <span
        className="sim-badge"
        data-testid="sim-synthetic-badge"
        title={pickLocale(
          locale,
          '決定論的仮想運行デモ（実時間・時刻表データではありません）',
          '确定性虚拟运行演示（非实时运行状态或官方时刻表数据）',
          'Deterministic virtual simulation — NOT real-time operations or official timetable',
        )}
      >
        {pickLocale(locale, '模擬運行 · 非実時', '模拟运行 · 非实时', 'SIMULATED · SYNTHETIC')}
      </span>

      <button
        type="button"
        className={`sim-btn ${control.running ? 'active' : ''}`}
        data-testid="sim-play-pause"
        onClick={onTogglePlaying}
        aria-label={
          control.running
            ? pickLocale(locale, 'Pause simulation', '暂停仿真', 'Pause simulation')
            : pickLocale(locale, 'Play simulation', '播放仿真', 'Play simulation')
        }
      >
        {control.running ? <Pause size={12} /> : <Play size={12} />}
        <span>
          {control.running
            ? pickLocale(locale, '一時停止', '暂停', 'Pause')
            : pickLocale(locale, '再生', '播放', 'Play')}
        </span>
      </button>

      <label
        className="sim-field"
        title={pickLocale(locale, '模擬速度', '模拟倍速', 'Simulation Speed')}
      >
        <span className="sim-label">{pickLocale(locale, '倍速', '倍速', 'Speed')}</span>
        <select
          className="sim-select"
          data-testid="sim-speed-select"
          value={control.timeScale}
          onChange={(e) => onChangeTimeScale(Number(e.target.value) as SimTimeScale)}
        >
          {TIME_SCALES.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>

      <label
        className="sim-field"
        title={pickLocale(locale, '運行密度', '发车密度', 'Fleet Density')}
      >
        <span className="sim-label">{pickLocale(locale, '密度', '密度', 'Fleet')}</span>
        <select
          className="sim-select"
          data-testid="sim-density-select"
          value={control.density}
          onChange={(e) => onChangeDensity(e.target.value as SimTrainDensity)}
        >
          <option value="low">{pickLocale(locale, '閑散', '低密', 'Low')}</option>
          <option value="normal">{pickLocale(locale, '標準', '标准', 'Normal')}</option>
          <option value="rush">{pickLocale(locale, '高密', '高峰', 'Rush')}</option>
        </select>
      </label>

      <label
        className="sim-field"
        title={pickLocale(locale, '表示本数', '显示列车数', 'Visible Train Limit')}
      >
        <span className="sim-label">{pickLocale(locale, '本数', '数量', 'Shown')}</span>
        <select
          className="sim-select"
          data-testid="sim-count-select"
          value={String(visibleLimit)}
          onChange={(e) =>
            onChangeVisibleLimit(e.target.value === 'all' ? 'all' : Number(e.target.value))
          }
        >
          {[4, 8, 12, 20]
            .filter((n) => n < trains.length)
            .map((n) => (
              <option key={n} value={String(n)}>
                {n}/{trains.length}
              </option>
            ))}
          <option value="all">
            {pickLocale(locale, `全 ${trains.length}本`, `全部 ${trains.length} 列`, `All ${trains.length}`)}
          </option>
        </select>
      </label>

      <select
        className="sim-select sim-train-picker"
        data-testid="sim-train-select"
        aria-label={pickLocale(locale, '模擬列車を選択', '选择模拟列车', 'Select Simulated Train')}
        value={activeTrainId}
        onChange={(e) => {
          if (e.target.value) onSelectTrain(e.target.value);
        }}
      >
        {trains.slice(0, shownCount).map((tr) => {
          const ln = lineNameMap.get(tr.lineId);
          const lTxt = pickLocale(locale, ln?.ja ?? tr.lineId, ln?.zh ?? tr.lineId, ln?.en ?? tr.lineId);
          return (
            <option key={tr.trainId} value={tr.trainId}>
              {lTxt} {tr.runNumber} ({tr.tier} · {Math.round(tr.speedKmh)}km/h)
            </option>
          );
        })}
      </select>

      <button
        type="button"
        className={`sim-btn ${trainsVisible ? '' : 'muted-btn'}`}
        data-testid="sim-toggle-visible"
        onClick={onToggleTrainsVisible}
        title={pickLocale(locale, '模擬列車の表示/非表示', '显示/隐藏模拟列车', 'Show / Hide Simulated Trains')}
      >
        {trainsVisible ? <Eye size={12} /> : <EyeOff size={12} />}
        <span>
          {trainsVisible
            ? pickLocale(locale, '表示', '显示', 'Show')
            : pickLocale(locale, '非表示', '隐藏', 'Hide')}
        </span>
      </button>

      {activeTrainId && trainsVisible && (
        <button
          type="button"
          className={`sim-btn ${isFollowing ? 'primary' : ''}`}
          data-testid="sim-follow-btn"
          onClick={() => onFollowTrain(activeTrainId)}
        >
          <Video size={12} />
          <span>{pickLocale(locale, '追従', '跟随', 'Follow')}</span>
        </button>
      )}

      <button
        type="button"
        className="sim-btn"
        data-testid="sim-reset-btn"
        onClick={onResetSimulation}
        title={pickLocale(locale, 'シミュレーションを初期化', '重置仿真', 'Reset Simulation')}
      >
        <RotateCcw size={12} />
      </button>

      {isFollowing && (
        <button
          type="button"
          className="sim-btn danger-btn"
          data-testid="sim-exit-follow-btn"
          onClick={onExitFollow}
        >
          <LogOut size={12} />
          <span>{pickLocale(locale, '終了', '退出', 'Exit')}</span>
        </button>
      )}

      <button
        type="button"
        className="sim-btn"
        data-testid="sim-collapse-btn"
        onClick={() => setCollapsed(true)}
        aria-label={pickLocale(locale, '操作バーを折りたたむ', '收起控制栏', 'Collapse Simulation Bar')}
      >
        <ChevronDown size={12} />
      </button>
    </div>
  );
};
