// Live tuning: the explainer's sliders write straight into PARAMS.
import { PARAMS } from './params.ts';

const DEFAULTS = structuredClone(PARAMS);

export function getParam(path: string): unknown {
  return path.split('.').reduce<any>((o, k) => (o == null ? o : o[k]), PARAMS);
}
export function setParam(path: string, value: unknown) {
  const keys = path.split('.');
  const last = keys.pop()!;
  const target = keys.reduce<any>((o, k) => o[k], PARAMS);
  target[last] = value;
}
export function resetParams() {
  const restore = (dst: any, src: any) => {
    for (const k of Object.keys(src)) {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) restore(dst[k], src[k]);
      else dst[k] = structuredClone(src[k]);
    }
  };
  restore(PARAMS, DEFAULTS);
}
export const defaultParam = (path: string) =>
  path.split('.').reduce<any>((o, k) => (o == null ? o : o[k]), DEFAULTS);
