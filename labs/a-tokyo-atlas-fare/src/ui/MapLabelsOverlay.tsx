import React from 'react';
import type { PlacedMapLabel } from '../domain/labelLayout.js';

interface MapLabelsOverlayProps {
  labels: PlacedMapLabel[];
  onLabelClick: (label: PlacedMapLabel) => void;
}

export const MapLabelsOverlay: React.FC<MapLabelsOverlayProps> = ({
  labels,
  onLabelClick,
}) => {
  if (labels.length === 0) return null;

  return (
    <div
      className="map-labels-layer"
      data-testid="map-labels-overlay"
      aria-label="3D Map Spatial Labels"
    >
      {labels.map((lbl) => {
        const clickable = Boolean(
          lbl.entityKind === 'station' ||
            lbl.entityKind === 'line' ||
            lbl.entityKind === 'train',
        );
        return (
          <button
            key={lbl.id}
            type="button"
            data-testid={`map-label-${lbl.id}`}
            data-label-kind={lbl.kind}
            disabled={!clickable}
            onClick={() => clickable && onLabelClick(lbl)}
            className={`map-label-pill kind-${lbl.kind} ${lbl.highlighted ? 'highlighted' : ''}`}
            style={{
              transform: `translate3d(${lbl.boxX}px, ${lbl.boxY}px, 0)`,
              width: lbl.width,
              opacity: lbl.opacity,
              borderLeftColor: lbl.color ?? undefined,
            }}
            title={
              lbl.textSecondary
                ? `${lbl.textPrimary} (${lbl.textSecondary})`
                : lbl.textPrimary
            }
          >
            <div className="map-label-row">
              {lbl.color && (
                <span className="map-label-dot" style={{ background: lbl.color }} />
              )}
              <span className="map-label-primary">{lbl.textPrimary}</span>
              {lbl.badge && <span className="map-label-badge">{lbl.badge}</span>}
            </div>
            {lbl.textSecondary && (
              <div className="map-label-secondary">{lbl.textSecondary}</div>
            )}
          </button>
        );
      })}
    </div>
  );
};
