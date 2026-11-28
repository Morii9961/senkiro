/**
 * `@senkiro/ui-kit` — SENKIRO original Japanese-wayfinding design system.
 *
 * Import the tokens and the global base once at the app root, in this order:
 *   import '@senkiro/ui-kit/tokens.css';
 *   import '@senkiro/ui-kit/base.css';
 * then use the components below. The side-effect imports below only help dev mode and
 * library tests: with CSS-only `sideEffects` in package.json a production (rolldown) build treats
 * this entry as side-effect free and drops them, so apps must import both subpaths.
 * Every component that renders words takes a `lang` prop (`zh-CN` / `ja` / `en`) or
 * receives already-localised text.
 */

import './styles/tokens.css';
import './styles/base.css';

export { DrawerPanel, type DrawerPanelProps } from './components/DrawerPanel.tsx';
export { FloatingCard, type FloatingCardProps } from './components/FloatingCard.tsx';
export { LineBadge, type LineBadgeProps, safeLineColor } from './components/LineBadge.tsx';
export { ProvenanceTag, type ProvenanceTagProps } from './components/ProvenanceTag.tsx';
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedOption,
} from './components/SegmentedControl.tsx';
export { SignCode, type SignCodeProps } from './components/SignCode.tsx';
export { UnknownValue, type UnknownValueProps } from './components/UnknownValue.tsx';
export { VisuallyHidden } from './components/VisuallyHidden.tsx';
export {
  formatTemplate,
  UI_KIT_STRINGS,
  type UiKitStrings,
  type UnknownKind,
} from './strings.ts';
