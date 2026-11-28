/**
 * Built-in trilingual copy for ui-kit components (decision D-05: zh-CN / ja / en).
 * Components take a `lang` prop and read from here, so honesty wording ("unknown",
 * "unverified", "synthetic") is identical everywhere in SENKIRO.
 */
import type { DataNature, Locale } from '@senkiro/contracts';

export type UnknownKind = 'unknown' | 'unverified' | 'pending';

export interface UiKitStrings {
  unknown: Record<UnknownKind, string>;
  /** `{label}` is replaced with what is unknown, e.g. "票价". */
  unknownAria: Record<UnknownKind, string>;
  dataNature: Record<DataNature, string>;
  provenance: {
    trigger: string;
    title: string;
    dataNature: string;
    lastVerified: string;
    sources: string;
    noSources: string;
    unresolvedSource: string;
    publisher: string;
    license: string;
    retrieved: string;
    openSource: string;
    syntheticWarning: string;
  };
  lineBadge: {
    /** `{line}` and `{code}` placeholders. */
    withCode: string;
    /** `{line}` placeholder. */
    withoutCode: string;
  };
  drawer: {
    close: string;
  };
}

export const UI_KIT_STRINGS: Readonly<Record<Locale, UiKitStrings>> = {
  'zh-CN': {
    unknown: { unknown: '未知', unverified: '未核实', pending: '待接入' },
    unknownAria: {
      unknown: '{label}：未知',
      unverified: '{label}：未核实',
      pending: '{label}：尚未接入数据',
    },
    dataNature: {
      official: '官方',
      'licensed-third-party': '授权第三方',
      derived: '推导',
      'manual-verified': '人工核实',
      synthetic: '合成数据',
      unknown: '来源未知',
    },
    provenance: {
      trigger: '数据性质：{nature}。查看溯源',
      title: '数据溯源',
      dataNature: '数据性质',
      lastVerified: '最后核实',
      sources: '来源',
      noSources: '无来源记录',
      unresolvedSource: '未在来源注册表中找到',
      publisher: '发布方',
      license: '许可',
      retrieved: '获取日期',
      openSource: '打开来源页面',
      syntheticWarning: '此数据为合成或推算数据，不代表官方实时或逐班精确信息。',
    },
    lineBadge: {
      withCode: '{line}，站号 {code}',
      withoutCode: '{line}，站号未核实',
    },
    drawer: { close: '关闭' },
  },
  ja: {
    unknown: { unknown: '不明', unverified: '未確認', pending: '準備中' },
    unknownAria: {
      unknown: '{label}：不明',
      unverified: '{label}：未確認',
      pending: '{label}：データ未接続',
    },
    dataNature: {
      official: '公式',
      'licensed-third-party': '許諾済み第三者',
      derived: '導出',
      'manual-verified': '手動確認済み',
      synthetic: '合成データ',
      unknown: '出典不明',
    },
    provenance: {
      trigger: 'データの性質：{nature}。出典を表示',
      title: 'データの出典',
      dataNature: 'データの性質',
      lastVerified: '最終確認',
      sources: '出典',
      noSources: '出典の記録なし',
      unresolvedSource: '出典レジストリに見つかりません',
      publisher: '発行者',
      license: 'ライセンス',
      retrieved: '取得日',
      openSource: '出典ページを開く',
      syntheticWarning:
        'これは合成・推計データであり、公式のリアルタイム情報や便ごとの正確な情報ではありません。',
    },
    lineBadge: {
      withCode: '{line}、駅ナンバー {code}',
      withoutCode: '{line}、駅ナンバー未確認',
    },
    drawer: { close: '閉じる' },
  },
  en: {
    unknown: { unknown: 'Unknown', unverified: 'Unverified', pending: 'Not yet available' },
    unknownAria: {
      unknown: '{label}: unknown',
      unverified: '{label}: unverified',
      pending: '{label}: no data connected yet',
    },
    dataNature: {
      official: 'Official',
      'licensed-third-party': 'Licensed third party',
      derived: 'Derived',
      'manual-verified': 'Manually verified',
      synthetic: 'Synthetic',
      unknown: 'Unknown source',
    },
    provenance: {
      trigger: 'Data nature: {nature}. Show provenance',
      title: 'Provenance',
      dataNature: 'Data nature',
      lastVerified: 'Last verified',
      sources: 'Sources',
      noSources: 'No source records',
      unresolvedSource: 'Not found in the source registry',
      publisher: 'Publisher',
      license: 'Licence',
      retrieved: 'Retrieved',
      openSource: 'Open source page',
      syntheticWarning:
        'Synthetic or estimated data. It is not official real-time or per-train information.',
    },
    lineBadge: {
      withCode: '{line}, station number {code}',
      withoutCode: '{line}, station number unverified',
    },
    drawer: { close: 'Close' },
  },
};

/** Replace `{name}` placeholders. Missing keys are left visible rather than guessed. */
export function formatTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
