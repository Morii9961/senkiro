/**
 * First-class trilingual shell copy (decision D-05). Every locale must satisfy `Messages`,
 * so a missing key is a type error. Brand and module names follow docs/brand-v1.0.md:
 * "SENKIRO" plus the English module name in every locale.
 *
 * This file holds UI copy only. Entity names (stations, hubs, lines) come from data via
 * `resolveLocalizedName`; unknown facts are rendered with `<UnknownValue />`.
 */
import type {
  AppModule,
  AppRegion,
  AppTheme,
  CoverageStatus,
  InterchangeGateType,
  LineClass,
  Locale,
} from '@senkiro/contracts';

export interface ModuleCopy {
  /** Brand module name, e.g. "SENKIRO Atlas". */
  title: string;
  /** Short nav label (module name only). */
  short: string;
  /** Localised functional subtitle. */
  subtitle: string;
  /** One-line panel description. */
  description: string;
}

export interface Messages {
  brand: { kana: string; tagline: string; positioning: string; notOfficial: string };
  shell: {
    dockLabel: string;
    moduleNavLabel: string;
    preferences: string;
    regionLabel: string;
    languageLabel: string;
    themeLabel: string;
    mapLabel: string;
    phaseNotice: string;
  };
  modules: Record<AppModule, ModuleCopy>;
  regions: Record<AppRegion, { name: string; description: string }>;
  themes: Record<AppTheme, string>;
  search: {
    entryLabel: string;
    from: string;
    to: string;
    fromPlaceholder: string;
    toPlaceholder: string;
    swap: string;
    submit: string;
    stepFree: string;
    results: string;
    engineNotice: string;
  };
  map: {
    engineStatus: string;
    engineDetail: string;
    viewCenter: string;
    presetNote: string;
    /** Atlas map engine states; `{region}`, `{error}` placeholders. */
    states: {
      unconnected: string;
      unavailable: string;
      loading: string;
      ready: string;
      noWebgl: string;
      error: string;
    };
    sourcePmtiles: string;
    sourceInline: string;
    preview: string;
  };
  hubs: {
    sectionTitle: string;
    open: string;
    panelDescription: string;
    status: { slotPending: string; connected: string; phase1: string };
    slotPendingBody: string;
    phase1Body: string;
    slotError: string;
    loading: string;
  };
  honesty: { title: string; rules: readonly string[] };
  atlas: {
    dataStatus: string;
    lines: string;
    stations: string;
    complexes: string;
    throughServices: string;
    dataSource: string;
    notConnected: string;
    unavailable: string;
    loading: string;
    loadError: string;
    previewNotice: string;
    search: {
      label: string;
      placeholder: string;
      hint: string;
      empty: string;
      groups: { complex: string; station: string; line: string };
      kinds: { complex: string; station: string; line: string };
      /** `{stations}` and `{operators}` placeholders. */
      complexMeta: string;
      memberOf: string;
      standalone: string;
      hiddenByFilter: string;
      matchedBy: string;
    };
    filter: {
      title: string;
      showAll: string;
      hiddenCount: string;
      toggle: string;
    };
    entry: {
      back: string;
      kinds: { line: string; station: string; complex: string };
      notFound: string;
      operator: string;
      lineClass: string;
      lineClasses: Record<LineClass, string>;
      coverage: string;
      coverageStatus: Record<CoverageStatus, string>;
      stationSequence: string;
      sequenceNote: string;
      jumpStation: string;
      operatingKm: string;
      operatingKmTotal: string;
      operationalStatus: string;
      operationalUnavailable: string;
      provenance: string;
      stationCode: string;
      lines: string;
      complex: string;
      standalone: string;
      members: string;
      interchanges: string;
      gate: Record<InterchangeGateType, string>;
      walking: string;
      minutes: string;
      stepFree: string;
      stepFreeValues: { yes: string; no: string };
      excluded: string;
      excludedLead: string;
      enterHub: string;
      hubPending: string;
      through: string;
      boundary: string;
      throughLines: string;
      throughOperators: string;
      unknownEntity: string;
    };
  };
  route: { heading: string };
  tickets: { fare: string; fareNotice: string; keepsake: string; keepsakeNotice: string };
  journey: { rides: string; visited: string; coverage: string; notice: string };
  profile: {
    appearance: string;
    dataSovereignty: string;
    dataSovereigntyBody: string;
    localDb: string;
  };
  slots: { localDbPending: string; localDbLoading: string; localDbError: string };
  /** `@senkiro/local-db` status probe (Profile / Journey). */
  probe: {
    opening: string;
    failed: string;
    /** Operation-level error; the probe stays usable. `{error}` placeholder. */
    actionFailed: string;
    mode: string;
    modes: Record<'opfs-sahpool' | 'memory-fallback', string>;
    /** Note for the persistent mode. */
    persistentNote: string;
    /**
     * Why the Worker fell back to memory (spec §5.3 `persistenceFallbackReason`).
     * `unreported` covers drivers that predate the field: the cause is then not claimed.
     */
    fallbackNotes: Record<'unsupported' | 'pool-busy' | 'unknown' | 'unreported', string>;
    fallbackReason: string;
    isolation: string;
    yes: string;
    no: string;
    tables: string;
    probeRows: string;
    write: string;
    clear: string;
    exportJson: string;
    exported: string;
    download: string;
    note: string;
  };
  notFound: { title: string; back: string };
}

const zhCN: Messages = {
  brand: {
    kana: 'センキロ',
    tagline: 'Every line, a story.',
    positioning: '探索日本铁路，记录每一段旅程。',
    notOfficial: 'SENKIRO 为独立项目，非任何铁路公司官方产品。',
  },
  shell: {
    dockLabel: 'SENKIRO 导航中枢',
    moduleNavLabel: '一级模块',
    preferences: '显示设置',
    regionLabel: '区域',
    languageLabel: '语言',
    themeLabel: '主题',
    mapLabel: '铁道地图底板',
    phaseNotice: 'Phase 1 预览：票价、时刻与运行情报尚未接入；线网数据以各条目标注的数据来源为准。',
  },
  modules: {
    atlas: {
      title: 'SENKIRO Atlas',
      short: 'Atlas',
      subtitle: '地图与铁道百科',
      description: '区域概览、枢纽入口与数据状态。',
    },
    route: {
      title: 'SENKIRO Route',
      short: 'Route',
      subtitle: '换乘规划',
      description: '输入出发与到达，比较多社换乘方案。',
    },
    tickets: {
      title: 'SENKIRO Tickets',
      short: 'Tickets',
      subtitle: '票价与纪念车票',
      description: '可核验的票价拆解与非有效纪念车票收藏。',
    },
    journey: {
      title: 'SENKIRO Journey',
      short: 'Journey',
      subtitle: '足迹与制霸',
      description: '乘车记录、到访车站与线路完成度。',
    },
    profile: {
      title: 'SENKIRO Profile',
      short: 'Profile',
      subtitle: '数据与设置',
      description: '语言、主题与本地数据主权。',
    },
  },
  regions: {
    kansai: { name: '京阪神核心圈', description: '大阪／梅田—京都—难波／神户首发区域。' },
    kanto: { name: '关东预览区', description: '东京 23 区与新宿枢纽的预览区域。' },
  },
  themes: { light: '浅色', dark: '深色' },
  search: {
    entryLabel: '路线搜索：出发与到达',
    from: '出发',
    to: '到达',
    fromPlaceholder: '出发站或地点',
    toPlaceholder: '到达站或地点',
    swap: '交换出发与到达',
    submit: '搜索路线',
    stepFree: '无台阶（电梯优先）',
    results: '路线方案',
    engineNotice: '路线引擎将在 Phase 2 接入；在此之前不显示任何路线方案，绝不编造车次或时刻。',
  },
  map: {
    engineStatus: '地图引擎挂载就绪',
    engineDetail:
      'MapLibre GL JS 将于 Phase 1 加载 PMTiles 铁道图层；当前仅显示经纬网格，无线路数据。',
    viewCenter: '视图中心',
    presetNote: '视图范围为近似相机预设，仅用于定位，不是车站坐标数据。',
    states: {
      unconnected: 'Atlas 线网数据源尚未接入（Wave 2 接线），当前仅显示经纬网格。',
      unavailable: '{region}暂无已发布的线网数据，仅显示经纬网格。',
      loading: '正在加载{region}线网数据…',
      ready: 'MapLibre 矢量线网已加载',
      noWebgl: '此浏览器无法使用 WebGL，矢量地图未启动；仍可在 Atlas 面板检索线路与车站。',
      error: '线网地图加载失败：{error}。未显示任何替代数据。',
    },
    sourcePmtiles: 'PMTiles 矢量瓦片',
    sourceInline: '数据包内联几何',
    preview: '预览夹具（合成数据，仅供测试，不是铁路数据）',
  },
  hubs: {
    sectionTitle: '枢纽快速入口',
    open: '打开枢纽预览：{hub}',
    panelDescription: '站内 3D/2D 枢纽预览',
    status: { slotPending: '待连接枢纽槽位', connected: '站内示意模型', phase1: 'Phase 1 建设中' },
    slotPendingBody: '待连接 @senkiro/station-3d 枢纽槽位。接线完成后在此显示站内 3D/2D 视图。',
    phase1Body: 'Phase 1 建设中（诚实占位）：京都站复合体的站内数据尚未录入，不显示任何推测结构。',
    slotError: '枢纽视图加载失败，未显示任何替代数据。',
    loading: '正在加载枢纽视图…',
  },
  honesty: {
    title: '诚实性原则',
    rules: [
      '不编造站点、线路、票价或时刻；未知值一律显示为「未知」。',
      '每条数据标明数据性质与来源，可点击溯源。',
      '合成或推算数据会醒目标注。',
      '纪念车票仅为收藏卡，不能用于乘车。',
    ],
  },
  atlas: {
    dataStatus: '数据状态',
    lines: '线路',
    stations: '车站',
    complexes: '车站复合体',
    throughServices: '直通运营',
    dataSource: '数据来源',
    notConnected: 'Atlas 线网数据源尚未接入：线路、车站与复合体将在 Wave 2 接线后显示。',
    unavailable: '此区域暂无已发布的线网数据包。',
    loading: '正在加载线网数据…',
    loadError: '线网数据加载失败：{error}。未显示任何替代数据。',
    previewNotice: '当前显示的是预览夹具（合成数据），仅用于测试界面，不代表真实铁路数据。',
    search: {
      label: '检索车站、复合体与线路',
      placeholder: '站名 · 假名 · English · 站号',
      hint: '支持简体中文、日文、假名、英文与站号（如 HK-86、K11）。',
      empty: '没有匹配「{query}」的车站、复合体或线路。',
      groups: { complex: '车站复合体', station: '独立车站', line: '线路' },
      kinds: { complex: '复合体', station: '车站', line: '线路' },
      complexMeta: '{stations} 站 · {operators} 社',
      memberOf: '属于 {complex}',
      standalone: '不属于任何复合体',
      hiddenByFilter: '另有 {count} 条结果被运营商筛选隐藏。',
      matchedBy: '匹配 {text}',
    },
    filter: {
      title: '运营商',
      showAll: '全部显示',
      hiddenCount: '已隐藏 {count} 社',
      toggle: '显示或隐藏 {operator}',
    },
    entry: {
      back: '返回检索',
      kinds: { line: '线路', station: '车站', complex: '车站复合体' },
      notFound: '当前数据包中没有 {id}，未显示任何推测内容。',
      operator: '运营商',
      lineClass: '线路类别',
      lineClasses: {
        shinkansen: '新干线',
        trunk: '干线',
        local_line: '地方交通线',
        metro: '地铁',
        private: '私铁',
        unknown: '未分类',
      },
      coverage: '收录范围',
      coverageStatus: { full: '完整', partial: '部分', none: '未收录' },
      stationSequence: '站序',
      sequenceNote: '仅列出本数据包收录的 {count} 站。',
      jumpStation: '查看车站：{station}',
      operatingKm: '营业里程（営業キロ）',
      operatingKmTotal: '{km} km（{count} 个区间合计）',
      operationalStatus: '运行情报',
      operationalUnavailable:
        '无实时授权运行数据：SENKIRO 未接入任何获授权的实时运行信息源，因此不显示正常、延误或停运状态。',
      provenance: '数据溯源',
      stationCode: '站号',
      lines: '所属线路',
      complex: '所属复合体',
      standalone: '独立车站，不属于任何车站复合体。',
      members: '纳入车站（{count}）',
      interchanges: '换乘',
      gate: { in_gate: '闸内换乘', out_of_gate: '出闸换乘', unknown: '闸机类型未核实' },
      walking: '步行',
      minutes: '{minutes} 分钟',
      stepFree: '无台阶',
      stepFreeValues: { yes: '是', no: '否' },
      excluded: '不含（防误并）',
      excludedLead: '以下车站不属于{complex}，请勿混同：',
      enterHub: '进入站内 3D/2D 导览',
      hubPending: '站内模型建设中，打开后显示诚实占位。',
      through: '直通运营',
      boundary: '边界站',
      throughLines: '直通线路',
      throughOperators: '参与运营商',
      unknownEntity: '未收录：{id}',
    },
  },
  route: { heading: '出发与到达' },
  tickets: {
    fare: '票价',
    fareNotice: '关西多社运价规则将在 Phase 2 接入；未支持的区间不显示金额。',
    keepsake: '纪念车票',
    keepsakeNotice:
      '纪念车票为非有效收藏卡，强制印有「SAMPLE · 記念用 · 乗車不可」水印，不含任何条码。',
  },
  journey: {
    rides: '乘车记录',
    visited: '到访车站',
    coverage: '线路完成度',
    notice: '足迹记录将在 Phase 3 基于本地 SQLite 上线；途经站不计入到访。',
  },
  profile: {
    appearance: '外观与语言',
    dataSovereignty: '数据主权',
    dataSovereigntyBody: '你的记录优先保存在本设备，可随时完整导出；无需注册即可使用。',
    localDb: '本地数据库',
  },
  slots: {
    localDbPending: '待连接 @senkiro/local-db 本地数据库状态探针。',
    localDbLoading: '正在加载本地数据库模块…',
    localDbError: '本地数据库模块加载失败，未显示任何替代数据。',
  },
  probe: {
    opening: '正在打开本地数据库…',
    failed: '本地数据库无法打开：{error}',
    actionFailed: '操作未完成：{error}。数据库仍处于打开状态，可以重试。',
    mode: '存储模式',
    modes: { 'opfs-sahpool': 'OPFS sahpool', 'memory-fallback': '内存回退' },
    persistentNote: '数据保存在本浏览器的源私有文件系统中，刷新后仍在。',
    fallbackNotes: {
      unsupported:
        '此浏览器不支持 OPFS 同步访问句柄，当前标签页改用内存临时库，数据只保留到页面关闭。',
      'pool-busy':
        'OPFS 存储已被同源的其他标签页占用，当前标签页回退至内存临时库，数据只保留到页面关闭。关闭其他 SENKIRO 标签页后刷新即可恢复持久存储。',
      unknown: 'OPFS 存储初始化失败（原因未明），当前标签页改用内存临时库，数据只保留到页面关闭。',
      unreported: '当前标签页使用内存临时库，数据只保留到页面关闭；存储层未报告回退原因。',
    },
    fallbackReason: '回退原因',
    isolation: '跨源隔离',
    yes: '是',
    no: '否',
    tables: '数据表就绪',
    probeRows: '自检记录',
    write: '写入一条自检记录',
    clear: '清空自检记录',
    exportJson: '导出 JSON',
    exported: '已导出 {bytes} 字节 JSON',
    download: '下载 JSON 文件',
    note: '自检记录是合成测试行（ID 前缀 sk:ride:local:probe-），不含车站或区间，只用来验证本地读写；可随时清空。数据只在本机，不会上传。',
  },
  notFound: { title: '页面不存在', back: '返回地图' },
};

const ja: Messages = {
  brand: {
    kana: 'センキロ',
    tagline: 'Every line, a story.',
    positioning: '日本の鉄道を、もっと深く。',
    notOfficial: 'SENKIRO は独立したプロジェクトであり、鉄道事業者の公式サービスではありません。',
  },
  shell: {
    dockLabel: 'SENKIRO ナビゲーション',
    moduleNavLabel: 'メインモジュール',
    preferences: '表示設定',
    regionLabel: 'エリア',
    languageLabel: '言語',
    themeLabel: 'テーマ',
    mapLabel: '鉄道マップ',
    phaseNotice:
      'Phase 1 プレビュー：運賃・時刻・運行情報はまだ接続されていません。路線データは各項目に示した出典に基づきます。',
  },
  modules: {
    atlas: {
      title: 'SENKIRO Atlas',
      short: 'Atlas',
      subtitle: '地図と鉄道図鑑',
      description: 'エリア概要、ハブへの入口、データの状態。',
    },
    route: {
      title: 'SENKIRO Route',
      short: 'Route',
      subtitle: '乗換案内',
      description: '出発地と目的地を入力し、各社の乗換を比較します。',
    },
    tickets: {
      title: 'SENKIRO Tickets',
      short: 'Tickets',
      subtitle: '運賃と記念きっぷ',
      description: '検証できる運賃の内訳と、乗車には使えない記念きっぷのコレクション。',
    },
    journey: {
      title: 'SENKIRO Journey',
      short: 'Journey',
      subtitle: '乗車記録と制覇',
      description: '乗車記録、訪れた駅、路線の完乗率。',
    },
    profile: {
      title: 'SENKIRO Profile',
      short: 'Profile',
      subtitle: 'データと設定',
      description: '言語、テーマ、ローカルデータの管理。',
    },
  },
  regions: {
    kansai: { name: '京阪神コアエリア', description: '大阪・梅田〜京都〜難波・神戸の先行エリア。' },
    kanto: { name: '関東プレビューエリア', description: '東京23区と新宿ハブのプレビュー。' },
  },
  themes: { light: 'ライト', dark: 'ダーク' },
  search: {
    entryLabel: '経路検索：出発地と目的地',
    from: '出発',
    to: '到着',
    fromPlaceholder: '出発駅・地点',
    toPlaceholder: '到着駅・地点',
    swap: '出発と到着を入れ替え',
    submit: '経路を検索',
    stepFree: '段差なし（エレベーター優先）',
    results: '経路の候補',
    engineNotice:
      '経路エンジンは Phase 2 で接続します。それまでは経路を表示せず、列車や時刻を作り出すこともありません。',
  },
  map: {
    engineStatus: '地図エンジンの準備完了',
    engineDetail:
      'MapLibre GL JS は Phase 1 で PMTiles の鉄道レイヤーを読み込みます。現在は経緯度グリッドのみで、路線データはありません。',
    viewCenter: '表示の中心',
    presetNote: '表示範囲はおおよそのカメラ設定で、駅の座標データではありません。',
    states: {
      unconnected:
        'Atlas の路線データソースは未接続です（Wave 2 で接続）。現在は経緯度グリッドのみです。',
      unavailable:
        '{region}の路線データはまだ公開されていません。経緯度グリッドのみ表示しています。',
      loading: '{region}の路線データを読み込み中…',
      ready: 'MapLibre ベクター路線図を読み込みました',
      noWebgl:
        'このブラウザでは WebGL が使えないため、ベクター地図は起動していません。Atlas パネルから路線や駅は検索できます。',
      error: '路線図を読み込めませんでした：{error}。代わりのデータは表示していません。',
    },
    sourcePmtiles: 'PMTiles ベクタータイル',
    sourceInline: 'データパッケージ内のジオメトリ',
    preview: 'プレビュー用フィクスチャ（合成データ・テスト専用、鉄道データではありません）',
  },
  hubs: {
    sectionTitle: 'ハブへの入口',
    open: 'ハブのプレビューを開く：{hub}',
    panelDescription: '駅構内 3D/2D ハブのプレビュー',
    status: {
      slotPending: 'ハブ枠の接続待ち',
      connected: '駅構内の模式図',
      phase1: 'Phase 1 で整備中',
    },
    slotPendingBody:
      '@senkiro/station-3d のハブ枠への接続待ちです。接続後、ここに構内の 3D/2D 表示が入ります。',
    phase1Body:
      'Phase 1 で整備中（仮表示）：京都駅の構内データは未登録のため、推測した構造は表示しません。',
    slotError: 'ハブ表示の読み込みに失敗しました。代わりのデータは表示していません。',
    loading: 'ハブ表示を読み込み中…',
  },
  honesty: {
    title: 'データの誠実さ',
    rules: [
      '駅・路線・運賃・時刻を作り出しません。不明な値は「不明」と表示します。',
      'すべてのデータにデータの性質と出典を示し、クリックで確認できます。',
      '合成・推計データははっきり区別して表示します。',
      '記念きっぷはコレクション用で、乗車には使えません。',
    ],
  },
  atlas: {
    dataStatus: 'データの状態',
    lines: '路線',
    stations: '駅',
    complexes: '駅複合体',
    throughServices: '直通運転',
    dataSource: 'データの出所',
    notConnected:
      'Atlas の路線データソースは未接続です。路線・駅・駅複合体は Wave 2 の接続後に表示されます。',
    unavailable: 'このエリアの路線データパッケージはまだ公開されていません。',
    loading: '路線データを読み込み中…',
    loadError: '路線データを読み込めませんでした：{error}。代わりのデータは表示していません。',
    previewNotice:
      '表示中のデータはプレビュー用フィクスチャ（合成データ）で、画面のテスト専用です。実際の鉄道データではありません。',
    search: {
      label: '駅・駅複合体・路線を検索',
      placeholder: '駅名・かな・English・駅ナンバー',
      hint: '日本語・かな・簡体字中国語・英語・駅ナンバー（例：HK-86、K11）で検索できます。',
      empty: '「{query}」に一致する駅・駅複合体・路線はありません。',
      groups: { complex: '駅複合体', station: '個別の駅', line: '路線' },
      kinds: { complex: '複合体', station: '駅', line: '路線' },
      complexMeta: '{stations}駅・{operators}社',
      memberOf: '{complex}に含まれる',
      standalone: 'どの駅複合体にも含まれない',
      hiddenByFilter: 'ほかに {count} 件が事業者フィルターで非表示です。',
      matchedBy: '一致：{text}',
    },
    filter: {
      title: '事業者',
      showAll: 'すべて表示',
      hiddenCount: '{count}社を非表示',
      toggle: '{operator}の表示・非表示',
    },
    entry: {
      back: '検索に戻る',
      kinds: { line: '路線', station: '駅', complex: '駅複合体' },
      notFound: '現在のデータパッケージに {id} はありません。推測した内容は表示しません。',
      operator: '事業者',
      lineClass: '路線の種別',
      lineClasses: {
        shinkansen: '新幹線',
        trunk: '幹線',
        local_line: '地方交通線',
        metro: '地下鉄',
        private: '私鉄',
        unknown: '未分類',
      },
      coverage: '収録範囲',
      coverageStatus: { full: '全区間', partial: '一部', none: '未収録' },
      stationSequence: '駅の順序',
      sequenceNote: 'このデータパッケージに収録された {count} 駅のみを表示しています。',
      jumpStation: '駅を表示：{station}',
      operatingKm: '営業キロ',
      operatingKmTotal: '{km} km（{count}区間の合計）',
      operationalStatus: '運行情報',
      operationalUnavailable:
        '許諾を得たリアルタイム運行情報はありません：SENKIRO は許諾済みの運行情報源に接続していないため、平常・遅延・運転見合わせを表示しません。',
      provenance: 'データの出典',
      stationCode: '駅ナンバー',
      lines: '路線',
      complex: '駅複合体',
      standalone: 'どの駅複合体にも含まれない単独の駅です。',
      members: '含まれる駅（{count}）',
      interchanges: '乗り換え',
      gate: {
        in_gate: '改札内乗り換え',
        out_of_gate: '改札外乗り換え',
        unknown: '改札の種別は未確認',
      },
      walking: '徒歩',
      minutes: '{minutes}分',
      stepFree: '段差なし',
      stepFreeValues: { yes: 'はい', no: 'いいえ' },
      excluded: '含まない駅（誤統合防止）',
      excludedLead: '次の駅は{complex}に含まれません。混同しないでください：',
      enterHub: '駅構内 3D/2D ガイドを開く',
      hubPending: '構内モデルは整備中です。開くと仮表示になります。',
      through: '直通運転',
      boundary: '境界駅',
      throughLines: '直通する路線',
      throughOperators: '参加事業者',
      unknownEntity: '未収録：{id}',
    },
  },
  route: { heading: '出発地と目的地' },
  tickets: {
    fare: '運賃',
    fareNotice: '関西各社の運賃規則は Phase 2 で接続します。未対応の区間は金額を表示しません。',
    keepsake: '記念きっぷ',
    keepsakeNotice:
      '記念きっぷは乗車に使えないコレクションカードで、「SAMPLE · 記念用 · 乗車不可」の透かしが必ず入り、バーコードは一切含みません。',
  },
  journey: {
    rides: '乗車記録',
    visited: '訪れた駅',
    coverage: '路線の完乗率',
    notice:
      '乗車記録は Phase 3 でローカル SQLite を使って公開します。通過しただけの駅は訪問に数えません。',
  },
  profile: {
    appearance: '表示と言語',
    dataSovereignty: 'データの管理',
    dataSovereigntyBody:
      '記録はまずこの端末に保存され、いつでもすべて書き出せます。登録は不要です。',
    localDb: 'ローカルデータベース',
  },
  slots: {
    localDbPending: '@senkiro/local-db の状態プローブへの接続待ちです。',
    localDbLoading: 'ローカルデータベースのモジュールを読み込み中…',
    localDbError:
      'ローカルデータベースのモジュールを読み込めませんでした。代わりのデータは表示していません。',
  },
  probe: {
    opening: 'ローカルデータベースを開いています…',
    failed: 'ローカルデータベースを開けません：{error}',
    actionFailed:
      '操作を完了できませんでした：{error}。データベースは開いたままなので、もう一度試せます。',
    mode: '保存方式',
    modes: { 'opfs-sahpool': 'OPFS sahpool', 'memory-fallback': 'メモリ（代替）' },
    persistentNote:
      'このブラウザのオリジン専用ファイルシステムに保存され、再読み込み後も残ります。',
    fallbackNotes: {
      unsupported:
        'このブラウザは OPFS の同期アクセスハンドルに対応していないため、このタブはメモリ上の一時データベースを使います。ページを閉じるまでの保存です。',
      'pool-busy':
        'OPFS の保存領域を同じオリジンの別のタブが使用中のため、このタブはメモリ上の一時データベースに切り替えました。ページを閉じるまでの保存です。ほかの SENKIRO タブを閉じて再読み込みすると、永続保存に戻ります。',
      unknown:
        'OPFS の初期化に失敗しました（原因不明）。このタブはメモリ上の一時データベースを使い、ページを閉じるまでの保存です。',
      unreported:
        'このタブはメモリ上の一時データベースを使い、ページを閉じるまでの保存です。保存層は切り替えの理由を報告していません。',
    },
    fallbackReason: '切り替えの理由',
    isolation: 'クロスオリジン分離',
    yes: 'はい',
    no: 'いいえ',
    tables: '準備済みのテーブル',
    probeRows: '自己診断レコード',
    write: '自己診断レコードを書き込む',
    clear: '自己診断レコードを消去',
    exportJson: 'JSON を書き出す',
    exported: 'JSON を {bytes} バイト書き出しました',
    download: 'JSON ファイルを保存',
    note: '自己診断レコードは合成のテスト行（ID 接頭辞 sk:ride:local:probe-）で、駅や区間を含まず、ローカルの読み書き確認だけに使います。いつでも消去できます。データは端末内にとどまり、送信されません。',
  },
  notFound: { title: 'ページが見つかりません', back: '地図に戻る' },
};

const en: Messages = {
  brand: {
    kana: 'センキロ',
    tagline: 'Every line, a story.',
    positioning: 'Japan Railway Exploration & Journey Platform',
    notOfficial:
      'SENKIRO is an independent project, not an official service of any railway operator.',
  },
  shell: {
    dockLabel: 'SENKIRO command dock',
    moduleNavLabel: 'Main modules',
    preferences: 'Display settings',
    regionLabel: 'Region',
    languageLabel: 'Language',
    themeLabel: 'Theme',
    mapLabel: 'Railway map canvas',
    phaseNotice:
      'Phase 1 preview: no fare, timetable or service-status data is connected yet; line data follows the source shown on each entry.',
  },
  modules: {
    atlas: {
      title: 'SENKIRO Atlas',
      short: 'Atlas',
      subtitle: 'Map & railway atlas',
      description: 'Region overview, hub entry points and data status.',
    },
    route: {
      title: 'SENKIRO Route',
      short: 'Route',
      subtitle: 'Route planning',
      description: 'Enter an origin and destination to compare routes across operators.',
    },
    tickets: {
      title: 'SENKIRO Tickets',
      short: 'Tickets',
      subtitle: 'Fares & keepsake tickets',
      description: 'Checkable fare breakdowns and a collection of non-valid keepsake tickets.',
    },
    journey: {
      title: 'SENKIRO Journey',
      short: 'Journey',
      subtitle: 'Footprints & completion',
      description: 'Ride records, visited stations and line completion.',
    },
    profile: {
      title: 'SENKIRO Profile',
      short: 'Profile',
      subtitle: 'Data & settings',
      description: 'Language, theme and control over your local data.',
    },
  },
  regions: {
    kansai: {
      name: 'Keihanshin core',
      description: 'Launch region: Osaka/Umeda – Kyoto – Namba/Kobe.',
    },
    kanto: {
      name: 'Kanto preview',
      description: 'Preview region: Tokyo 23 wards and the Shinjuku hub.',
    },
  },
  themes: { light: 'Light', dark: 'Dark' },
  search: {
    entryLabel: 'Route search: origin and destination',
    from: 'From',
    to: 'To',
    fromPlaceholder: 'Origin station or place',
    toPlaceholder: 'Destination station or place',
    swap: 'Swap origin and destination',
    submit: 'Search routes',
    stepFree: 'Step-free (elevators first)',
    results: 'Route options',
    engineNotice:
      'The route engine arrives in Phase 2. Until then no routes are shown, and no trains or times are ever made up.',
  },
  map: {
    engineStatus: 'Map engine mount ready',
    engineDetail:
      'MapLibre GL JS will load PMTiles railway layers in Phase 1. For now only a latitude/longitude grid is shown, with no line data.',
    viewCenter: 'View centre',
    presetNote:
      'The view extent is an approximate camera preset for orientation, not station coordinates.',
    states: {
      unconnected:
        'The Atlas line-network source is not connected yet (wired in Wave 2); only the latitude/longitude grid is shown.',
      unavailable: 'No line-network data is published for {region} yet; only the grid is shown.',
      loading: 'Loading the {region} line network…',
      ready: 'MapLibre vector line network loaded',
      noWebgl:
        'WebGL is not available in this browser, so the vector map did not start. Lines and stations can still be searched in the Atlas panel.',
      error: 'The line map failed to load: {error}. No substitute data is shown.',
    },
    sourcePmtiles: 'PMTiles vector tiles',
    sourceInline: 'geometry inside the data bundle',
    preview: 'Preview fixture (synthetic, for tests only — not railway data)',
  },
  hubs: {
    sectionTitle: 'Hub quick entry',
    open: 'Open hub preview: {hub}',
    panelDescription: 'In-station 3D/2D hub preview',
    status: {
      slotPending: 'Hub slot not connected',
      connected: 'Schematic in-station model',
      phase1: 'Building in Phase 1',
    },
    slotPendingBody:
      'Waiting for the @senkiro/station-3d hub slot. Once connected, the in-station 3D/2D view appears here.',
    phase1Body:
      'Building in Phase 1 (honest placeholder): Kyoto Station complex data is not entered yet, so no guessed structure is shown.',
    slotError: 'The hub view failed to load. No substitute data is shown.',
    loading: 'Loading hub view…',
  },
  honesty: {
    title: 'Honesty principles',
    rules: [
      'No made-up stations, lines, fares or times; unknown values are shown as "Unknown".',
      'Every record shows its data nature and source, one click away.',
      'Synthetic or estimated data is clearly marked.',
      'Keepsake tickets are collectibles and cannot be used for travel.',
    ],
  },
  atlas: {
    dataStatus: 'Data status',
    lines: 'Lines',
    stations: 'Stations',
    complexes: 'Station complexes',
    throughServices: 'Through services',
    dataSource: 'Data source',
    notConnected:
      'The Atlas line-network source is not connected yet: lines, stations and complexes appear once Wave 2 wires it.',
    unavailable: 'No line-network bundle is published for this region yet.',
    loading: 'Loading line-network data…',
    loadError: 'The line-network data failed to load: {error}. No substitute data is shown.',
    previewNotice:
      'You are looking at a preview fixture (synthetic data) for testing the interface. It is not real railway data.',
    search: {
      label: 'Search stations, complexes and lines',
      placeholder: 'Name · kana · 中文 · station number',
      hint: 'Search in English, Japanese, kana, Simplified Chinese or by station number (e.g. HK-86, K11).',
      empty: 'No station, complex or line matches “{query}”.',
      groups: { complex: 'Station complexes', station: 'Individual stations', line: 'Lines' },
      kinds: { complex: 'Complex', station: 'Station', line: 'Line' },
      complexMeta: '{stations} stations · {operators} operators',
      memberOf: 'Part of {complex}',
      standalone: 'Not part of any complex',
      hiddenByFilter: '{count} more results are hidden by the operator filter.',
      matchedBy: 'Matched {text}',
    },
    filter: {
      title: 'Operators',
      showAll: 'Show all',
      hiddenCount: '{count} hidden',
      toggle: 'Show or hide {operator}',
    },
    entry: {
      back: 'Back to search',
      kinds: { line: 'Line', station: 'Station', complex: 'Station complex' },
      notFound: '{id} is not in the current data bundle. Nothing guessed is shown.',
      operator: 'Operator',
      lineClass: 'Line class',
      lineClasses: {
        shinkansen: 'Shinkansen',
        trunk: 'Trunk line',
        local_line: 'Local line',
        metro: 'Metro',
        private: 'Private railway',
        unknown: 'Unclassified',
      },
      coverage: 'Coverage',
      coverageStatus: { full: 'Full', partial: 'Partial', none: 'Not covered' },
      stationSequence: 'Stations in order',
      sequenceNote: 'Only the {count} stations in this data bundle are listed.',
      jumpStation: 'Show station: {station}',
      operatingKm: 'Operating distance (eigyō kiro)',
      operatingKmTotal: '{km} km (sum of {count} sections)',
      operationalStatus: 'Service status',
      operationalUnavailable:
        'No licensed real-time service data: SENKIRO is not connected to any authorised real-time feed, so no normal, delayed or suspended status is shown.',
      provenance: 'Provenance',
      stationCode: 'Station number',
      lines: 'Lines',
      complex: 'Station complex',
      standalone: 'A standalone station, not part of any station complex.',
      members: 'Member stations ({count})',
      interchanges: 'Transfers',
      gate: {
        in_gate: 'Transfer inside the gates',
        out_of_gate: 'Transfer outside the gates',
        unknown: 'Gate type unverified',
      },
      walking: 'Walk',
      minutes: '{minutes} min',
      stepFree: 'Step-free',
      stepFreeValues: { yes: 'yes', no: 'no' },
      excluded: 'Not included (anti-merge)',
      excludedLead: 'These stations are not part of {complex} — do not mix them up:',
      enterHub: 'Open the in-station 3D/2D guide',
      hubPending: 'The in-station model is being built; it opens on an honest placeholder.',
      through: 'Through services',
      boundary: 'Boundary station',
      throughLines: 'Lines',
      throughOperators: 'Operators',
      unknownEntity: 'Not in this bundle: {id}',
    },
  },
  route: { heading: 'Origin and destination' },
  tickets: {
    fare: 'Fare',
    fareNotice:
      'Kansai multi-operator fare rules arrive in Phase 2; unsupported sections show no amount.',
    keepsake: 'Keepsake tickets',
    keepsakeNotice:
      'Keepsake tickets are non-valid collectibles. They always carry the "SAMPLE · 記念用 · 乗車不可" watermark and never contain a barcode.',
  },
  journey: {
    rides: 'Ride records',
    visited: 'Visited stations',
    coverage: 'Line completion',
    notice:
      'Ride records arrive in Phase 3 on local SQLite. Stations you only pass through never count as visited.',
  },
  profile: {
    appearance: 'Appearance & language',
    dataSovereignty: 'Your data',
    dataSovereigntyBody:
      'Records are stored on this device first and can be fully exported at any time. No sign-up needed.',
    localDb: 'Local database',
  },
  slots: {
    localDbPending: 'Waiting for the @senkiro/local-db status probe.',
    localDbLoading: 'Loading the local database module…',
    localDbError: 'The local database module failed to load. No substitute data is shown.',
  },
  probe: {
    opening: 'Opening the local database…',
    failed: 'The local database could not be opened: {error}',
    actionFailed:
      'The operation did not finish: {error}. The database is still open, so you can try again.',
    mode: 'Storage mode',
    modes: { 'opfs-sahpool': 'OPFS sahpool', 'memory-fallback': 'Memory fallback' },
    persistentNote: "Stored in this browser's origin private file system; it survives a reload.",
    fallbackNotes: {
      unsupported:
        'This browser lacks OPFS sync access handles, so this tab uses a temporary in-memory database; data lasts only until the page closes.',
      'pool-busy':
        'OPFS storage is held by another tab of this site, so this tab fell back to a temporary in-memory database; data lasts only until the page closes. Close the other SENKIRO tabs and reload to get persistent storage back.',
      unknown:
        'OPFS storage failed to initialise (cause unknown), so this tab uses a temporary in-memory database; data lasts only until the page closes.',
      unreported:
        'This tab uses a temporary in-memory database; data lasts only until the page closes. The storage layer did not report why it fell back.',
    },
    fallbackReason: 'Fallback reason',
    isolation: 'Cross-origin isolated',
    yes: 'yes',
    no: 'no',
    tables: 'Tables ready',
    probeRows: 'Self-check rows',
    write: 'Write a self-check row',
    clear: 'Clear self-check rows',
    exportJson: 'Export JSON',
    exported: 'Exported {bytes} bytes of JSON',
    download: 'Download the JSON file',
    note: 'Self-check rows are synthetic test rows (ID prefix sk:ride:local:probe-) with no stations or segments; they only prove local reads and writes and can be cleared at any time. Data stays on this device and is never uploaded.',
  },
  notFound: { title: 'Page not found', back: 'Back to the map' },
};

export const MESSAGES: Readonly<Record<Locale, Messages>> = { 'zh-CN': zhCN, ja, en };

/** Language names are always shown as endonyms so every user can find their own. */
export const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = {
  'zh-CN': '简体中文',
  ja: '日本語',
  en: 'English',
};

/** Compact segmented-control labels for the dock. */
export const LANGUAGE_SHORT: Readonly<Record<Locale, string>> = {
  'zh-CN': '中',
  ja: '日',
  en: 'EN',
};

export type HubStatusKey = keyof Messages['hubs']['status'];
