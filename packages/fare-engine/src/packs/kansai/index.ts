import type { FareEngineRulePack } from '../../pack.ts';

/** Phase 2 supplies the regional rules and tariff data. */
export function createKansaiPlaceholderPack(): FareEngineRulePack {
  const status = 'UNSUPPORTED';
  const reason = 'Kansai fare rules and tariffs are unavailable until Phase 2.';
  return {
    id: 'kansai-placeholder',
    region: 'kansai',
    operatorScopes: [
      'jr-west',
      'hankyu',
      'hanshin',
      'keihan',
      'kintetsu',
      'nankai',
      'osaka-metro',
      'kansai-private',
    ],
    ruleVersion: 'phase-2-placeholder',
    validFrom: null,
    validTo: null,
    rules: [],
    fareZoneTags: [],
    tariffProviders: [],
    precheck: () => ({ status, reason }),
    appliesTo: () => true,
    evaluate: () => ({ status, statusReason: reason, billedPath: null, steps: [] }),
  };
}
