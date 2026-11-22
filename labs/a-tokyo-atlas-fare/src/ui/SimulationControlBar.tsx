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
import type { TrainSimulationSnapshot } from '../three/uxContracts.js';
import type { Locale } from './i18n.js';

interface SimulationControlBarProps {
  locale: Locale;
  snapshot: TrainSimulationSnapshot;
  selectedTrainId: string | null;
  isFollowing: boolean;
  onTogglePlaying: () => void;
  onChangeSpeed: (speed: number) => void;
  onChangeVisibleCount: (count: number) => void;
  onToggleTrainsVisible: () => void;
  onSelectTrain: (trainId: string) => void;
  onFollowTrain: (trainId: string) => void;
  onResetSimulation: () => void;
  onExitFollow: () => void;
}

export const SimulationControlBar: React.FC<SimulationControlBarProps> = ({
  locale,
  snapshot,
  selectedTrainId,
  isFollowing,
  onTogglePlaying,
  onChangeSpeed,
  onChangeVisibleCount,
  onToggleTrainsVisible,
  onSelectTrain,
  onFollowTrain,
  onResetSimulation,
  onExitFollow,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const activeTrainId =
    selectedTrainId && snapshot.trains.some((t) => t.id === selectedTrainId)
      ? selectedTrainId
      : snapshot.trains[0]?.id ?? '';

  if (collapsed) {
    return (
      <div className="sim-dock sim-dock-collapsed" data-testid="simulation-control-bar">
        <span className="sim-badge" data-testid="sim-synthetic-badge">
          {locale === 'ja' ? '模擬運行 · SYNTHETIC' : 'SIMULATED · SYNTHETIC'}
        </span>
        <button
          type="button"
          className="sim-btn"
          data-testid="sim-play-pause"
          onClick={onTogglePlaying}
          title={snapshot.playing ? 'Pause' : 'Play'}
        >
          {snapshot.playing ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <button
          type="button"
          className="sim-btn"
          data-testid="sim-collapse-btn"
          onClick={() => setCollapsed(false)}
          title={locale === 'ja' ? '操作バーを展開' : 'Expand Simulation Bar'}
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
      aria-label={locale === 'ja' ? '仮想列車シミュレーション制御' : 'Virtual Train Simulation Controls'}
    >
      <span className="sim-badge" data-testid="sim-synthetic-badge">
        {locale === 'ja' ? '模擬運行 · 非実時' : 'SIMULATED · SYNTHETIC'}
      </span>

      <button
        type="button"
        className={`sim-btn ${snapshot.playing ? 'active' : ''}`}
        data-testid="sim-play-pause"
        onClick={onTogglePlaying}
        aria-label={snapshot.playing ? 'Pause simulation' : 'Play simulation'}
      >
        {snapshot.playing ? <Pause size={12} /> : <Play size={12} />}
        <span>{snapshot.playing ? (locale === 'ja' ? '一時停止' : 'Pause') : locale === 'ja' ? '再生' : 'Play'}</span>
      </button>

      <label className="sim-field" title={locale === 'ja' ? '模擬速度' : 'Simulation Speed'}>
        <span className="sim-label">{locale === 'ja' ? '速度' : 'Speed'}</span>
        <select
          className="sim-select"
          data-testid="sim-speed-select"
          value={snapshot.speedMultiplier}
          onChange={(e) => onChangeSpeed(Number(e.target.value))}
        >
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={4}>4×</option>
        </select>
      </label>

      <label className="sim-field" title={locale === 'ja' ? '表示列車数' : 'Visible Trains'}>
        <span className="sim-label">{locale === 'ja' ? '表示数' : 'Count'}</span>
        <select
          className="sim-select"
          data-testid="sim-count-select"
          value={snapshot.visibleCount}
          onChange={(e) => onChangeVisibleCount(Number(e.target.value))}
        >
          {[4, 8, 12, snapshot.totalAvailable]
            .filter((v, i, a) => v > 0 && a.indexOf(v) === i)
            .map((cnt) => (
              <option key={cnt} value={cnt}>
                {cnt}/{snapshot.totalAvailable}
              </option>
            ))}
        </select>
      </label>

      <select
        className="sim-select sim-train-picker"
        data-testid="sim-train-select"
        aria-label={locale === 'ja' ? '模擬列車を選択' : 'Select Simulated Train'}
        value={activeTrainId}
        onChange={(e) => {
          const tid = e.target.value;
          onSelectTrain(tid);
        }}
      >
        {snapshot.trains.map((tr) => (
          <option key={tr.id} value={tr.id}>
            {tr.label} ({tr.tier})
          </option>
        ))}
      </select>

      <button
        type="button"
        className={`sim-btn ${snapshot.trainsVisible ? '' : 'muted-btn'}`}
        data-testid="sim-toggle-visible"
        onClick={onToggleTrainsVisible}
        title={locale === 'ja' ? '模擬列車の表示/非表示' : 'Show / Hide Simulated Trains'}
      >
        {snapshot.trainsVisible ? <Eye size={12} /> : <EyeOff size={12} />}
        <span>{snapshot.trainsVisible ? (locale === 'ja' ? '表示中' : 'Shown') : locale === 'ja' ? '非表示' : 'Hidden'}</span>
      </button>

      {activeTrainId && snapshot.trainsVisible && (
        <button
          type="button"
          className={`sim-btn ${isFollowing ? 'primary' : ''}`}
          data-testid="sim-follow-btn"
          onClick={() => onFollowTrain(activeTrainId)}
        >
          <Video size={12} />
          <span>{locale === 'ja' ? '列車追従' : 'Follow'}</span>
        </button>
      )}

      <button
        type="button"
        className="sim-btn"
        data-testid="sim-reset-btn"
        onClick={onResetSimulation}
        title={locale === 'ja' ? 'シミュレーションをリセット' : 'Reset Simulation'}
      >
        <RotateCcw size={12} />
        <span>{locale === 'ja' ? 'リセット' : 'Reset'}</span>
      </button>

      {isFollowing && (
        <button
          type="button"
          className="sim-btn danger-btn"
          data-testid="sim-exit-follow-btn"
          onClick={onExitFollow}
        >
          <LogOut size={12} />
          <span>{locale === 'ja' ? '追従終了' : 'Exit'}</span>
        </button>
      )}

      <button
        type="button"
        className="sim-btn"
        data-testid="sim-collapse-btn"
        onClick={() => setCollapsed(true)}
        aria-label={locale === 'ja' ? '操作バーを折りたたむ' : 'Collapse Simulation Bar'}
      >
        <ChevronDown size={12} />
      </button>
    </div>
  );
};
