/**
 * How the 3D model is lit and rendered — kept apart from the interface theme.
 *
 * The interface theme (CSS custom properties in styles.css) colours panels,
 * text and controls. It does not reach into the model: a dark interface gets
 * a model with the same materials on a darker table, under light of its own.
 * Nothing here multiplies, veils or dims the model as a whole.
 */
import { PALETTES, type Palette, type ThemeName } from './theme';

export interface SceneLight {
  color: string;
  intensity: number;
  position: [number, number, number];
}

export interface SceneTheme {
  /** Material colours of the model and the table it stands on. */
  palette: Palette;
  /** Sky/ground fill: the ambient term that keeps side faces readable. */
  ambient: { sky: string; ground: string; intensity: number };
  /** Main light — gives every box a lit top, a mid side and a shaded side. */
  key: SceneLight;
  /** Opposite, weak: lifts the shaded sides without flattening them. */
  fill: SceneLight;
  /**
   * 'none' draws the authored colours as they are. 'neutral' (Khronos PBR
   * Neutral) keeps hue and saturation and only rolls off the brightest
   * surfaces, which lets the key light be stronger without burning out walls.
   */
  toneMapping: 'none' | 'neutral';
  exposure: number;
}

export const SCENE_THEMES: Record<ThemeName, SceneTheme> = {
  light: {
    palette: PALETTES.light,
    ambient: { sky: '#ffffff', ground: '#a8a296', intensity: 0.66 },
    key: { color: '#ffffff', intensity: 0.74, position: [-45, 90, 60] },
    fill: { color: '#ffffff', intensity: 0.14, position: [60, 40, -70] },
    toneMapping: 'none',
    exposure: 1,
  },
  dark: {
    palette: PALETTES.dark,
    ambient: { sky: '#ffffff', ground: '#8f959e', intensity: 0.56 },
    key: { color: '#fff7ec', intensity: 0.92, position: [-45, 90, 60] },
    fill: { color: '#dce6f5', intensity: 0.2, position: [60, 40, -70] },
    toneMapping: 'neutral',
    exposure: 1.06,
  },
};
