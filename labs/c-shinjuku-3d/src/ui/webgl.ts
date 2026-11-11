/**
 * three.js needs WebGL 2. When the browser cannot provide it (blocked GPU,
 * remote desktop, very old device) the app falls back to the 2D plans, which
 * read the same model, instead of showing an empty box.
 */
export function webgl2Available(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null;
  } catch {
    return false;
  }
}
