/**
 * SENKIRO Atlas v2 — Verified Japanese Rolling Stock Specifications & Credibility Records
 *
 * All dimensions, gauge, door counts, electrification, and consist compositions are verified
 * against official operator rolling stock guides and manufacturer technical sheets.
 * All 3D meshes and PBR textures are 100% original procedural creations by SENKIRO Lab (MIT / CC BY 4.0)
 * and omit copyrighted operator logos/trademarks in compliance with Shared Contract v0.1 Section 6 & 7.
 */

import type { SkId, SourceRecord } from '../types.js';
import type {
  ConsistCarSlot,
  RollingStockCarRole,
  RollingStockCatalogDataset,
  RollingStockSeriesId,
  RollingStockSpec,
} from './types.js';

export const ROLLING_STOCK_SOURCES: readonly SourceRecord[] = [
  {
    id: 'src-jreast-e235-official',
    title: 'JR東日本 車両図鑑：E235系（在来線・山手線）主要諸元および外観仕様',
    publisher: '東日本旅客鉄道株式会社（JR東日本） / 総合車両製作所（J-TREC）',
    url: 'https://www.jreast.co.jp/train/local/e235.html',
    retrievedAt: '2026-11-22T09:30:00Z',
    license: '公式公開諸元参照（事実・寸法数値のみ参照、公式画像・商標ロゴは非使用）',
    licenseUrl: 'https://www.jreast.co.jp/siteinfo/',
    commercialUse: 'conditional',
    redistribution: 'yes',
    shareAlike: false,
    attributionText: '諸元参照：JR東日本 車両図鑑 E235系（3Dモデル・PBRテクスチャはSENKIRO Lab独自生成）',
    notes:
      '車体長19,500mm（先頭車19,570mm、連結面間20,000mm）、車体幅2,950mm（拡幅車体）、屋根高3,620mm、軌間1,067mm、片側4扉、DT80/TR264台車、PS33Hシングルアームパンタグラフ、11両編成（6M5T）、縦方向ウグイス色グラデーション扉帯の事実検証に使用。',
  },
  {
    id: 'src-tokyometro-1000-official',
    title: '東京メトロ 銀座線1000系 車両紹介・主要諸元',
    publisher: '東京地下鉄株式会社（東京メトロ） / 日本車輌製造株式会社',
    url: 'https://www.tokyometro.jp/corporate/enterprise/passenger_rail/cars/working/ginza_1000/index.html',
    retrievedAt: '2026-11-22T09:30:00Z',
    license: '公式公開諸元参照（事実・寸法数値のみ参照、公式画像・商標ロゴは非使用）',
    licenseUrl: 'https://www.tokyometro.jp/sitepolicy/index.html',
    commercialUse: 'conditional',
    redistribution: 'yes',
    shareAlike: false,
    attributionText: '諸元参照：東京メトロ 銀座線1000系 車両諸元（3Dモデル・PBRテクスチャはSENKIRO Lab独自生成）',
    notes:
      '連結面間長16,000mm、車体幅2,550mm、屋根高3,465mm、軌間1,435mm（標準軌）、直流600V第三軌条集電方式（屋根上パンタグラフ無し・台車集電靴装備）、片側3扉、6両編成、SC101操舵台車、1927年初代1000形モチーフのレモンイエロー車体＋茶褐色屋根デザインの事実検証に使用。',
  },
  {
    id: 'src-tokyometro-17000-official',
    title: '東京メトロ 有楽町線・副都心線17000系 車両紹介・主要諸元',
    publisher: '東京地下鉄株式会社（東京メトロ） / 日立製作所・近畿車輛',
    url: 'https://www.tokyometro.jp/corporate/enterprise/passenger_rail/cars/working/yurakucho_17000/index.html',
    retrievedAt: '2026-11-22T09:30:00Z',
    license: '公式公開諸元参照（事実・寸法数値のみ参照、公式画像・商標ロゴは非使用）',
    licenseUrl: 'https://www.tokyometro.jp/sitepolicy/index.html',
    commercialUse: 'conditional',
    redistribution: 'yes',
    shareAlike: false,
    attributionText: '諸元参照：東京メトロ 有楽町線・副都心線17000系 車両諸元（3Dモデル・PBRテクスチャはSENKIRO Lab独自生成）',
    notes:
      '連結面間長20,000mm（先頭車体19,630mm・中間19,500mm）、車体幅2,800mm、屋根高3,635mm、軌間1,067mm、直流1,500V架空電車線方式、片側4扉、10両編成（4M6T）および8両編成（4M4T）、7000系・10000系を継承する丸目LEDヘッドライトとゴールド＋ブラウン2色横帯の事実検証に使用。',
  },
  {
    id: 'src-senkiro-procedural-rolling-stock-v2',
    title: 'SENKIRO Lab 独自生成 日本鉄道車両3Dアセット＆PBRマテリアルライブラリ v2.0',
    publisher: 'SENKIRO Lab',
    url: 'https://github.com/SENKIRO-project/SENKIRO',
    retrievedAt: '2026-11-22T09:35:00Z',
    license: 'MIT / CC BY 4.0 Dual License',
    licenseUrl: 'https://opensource.org/licenses/MIT',
    commercialUse: 'yes',
    redistribution: 'yes',
    shareAlike: false,
    attributionText: 'SENKIRO Lab Original Procedural 3D Rolling Stock & glTF/GLB Assets (MIT / CC BY 4.0)',
    notes:
      '完全自社コードにより手続き生成された3段階LODメッシュ、glTF 2.0 (.glb) バイナリアセットおよびPBRテクスチャ。商用・第三者3Dモデルや写真テクスチャの流用は一切なく、鉄道事業者の登録商標ロゴも非掲載。',
  },
];

export const JR_EAST_E235_0_SPEC: RollingStockSpec = {
  id: 'sk:rolling-stock:jr-east-e235-0',
  seriesId: 'jr-east-e235-0',
  operatorId: 'sk:operator:jr-east',
  applicableLineIds: ['sk:line:jr-east-yamanote'],
  names: {
    ja: 'JR東日本 E235系0番台（山手線）',
    ja_kana: 'じぇいあーるひがしにほん E235けい 0ばんだい やまのてせん',
    en: 'JR East E235-0 Series (Yamanote Line)',
    zh: 'JR东日本 E235系0番台（山手线）',
  },
  introducedYear: 2015,
  maxOperatingSpeedKmh: 90,
  designSpeedKmh: 120,
  electrification: 'overhead_1500v_dc',
  bodyProfile: 'wide_body_barrel',
  frontArchetype: 'flat_digital_frame',
  bogieModel: 'DT80 (電動台車) / TR264 (付随台車)',
  pantographModel: 'PS33H シングルアーム式',
  dimensions: {
    couplerLengthM: 20.0,
    leadBodyLengthM: 19.57,
    intermediateBodyLengthM: 19.5,
    bodyWidthM: 2.95,
    roofHeightM: 3.62,
    pantographHeightM: 3.98,
    floorHeightM: 1.13,
    trackGaugeM: 1.067,
    bogieCenterDistanceM: 13.8,
    bogieWheelbaseM: 2.1,
    wheelDiameterM: 0.86,
    doorsPerSide: 4,
    doorWidthM: 1.3,
    doorHeightM: 1.85,
    interCarGapM: 0.46,
  },
  palette: {
    bodyPrimaryHex: '#D5DAE0', // Sustina laser-welded hairline stainless steel
    bodySecondaryHex: '#E8ECEF', // Front crash skirt silver-white
    roofHex: '#A6AFB9', // Beadless matte stainless roof
    primaryStripeHex: '#80C241', // JR East Yamanote Line Uguisu Green
    secondaryStripeHex: '#15191F', // Front black glass bezel contrast
    frontMaskHex: '#12161C', // Flat smartphone-style black glass front mask
    underfloorHex: '#282D35', // Dark charcoal DT80 bogies & VVVF equipment
    glassHex: '#1A2B36', // Green-tinted UV-cut commuter window glass
    liveryPattern: 'e235_vertical_door_bands',
  },
  standardConsists: [
    {
      id: 'e235-yamanote-11car-full',
      labelJa: '山手線 11両フル編成（6M5T・トウ編成）',
      labelEn: 'Yamanote Line 11-Car Full Consist (6M5T)',
      carCount: 11,
      isOfficialFullLength: true,
      cars: [
        { carNumber: 1, designationJa: 'クハE234-0', role: 'lead_front', hasPantograph: false, pantographCount: 0 },
        { carNumber: 2, designationJa: 'モハE234-0', role: 'intermediate_m', hasPantograph: false, pantographCount: 0 },
        { carNumber: 3, designationJa: 'モハE235-0', role: 'intermediate_m', hasPantograph: true, pantographCount: 2 },
        { carNumber: 4, designationJa: 'サハE235-0', role: 'intermediate_t', hasPantograph: false, pantographCount: 0 },
        { carNumber: 5, designationJa: 'モハE234-0', role: 'intermediate_m', hasPantograph: false, pantographCount: 0 },
        { carNumber: 6, designationJa: 'モハE235-0', role: 'intermediate_m', hasPantograph: true, pantographCount: 1 },
        { carNumber: 7, designationJa: 'サハE234-0', role: 'intermediate_t', hasPantograph: false, pantographCount: 0 },
        { carNumber: 8, designationJa: 'モハE234-0', role: 'intermediate_m', hasPantograph: false, pantographCount: 0 },
        { carNumber: 9, designationJa: 'モハE235-0', role: 'intermediate_m', hasPantograph: true, pantographCount: 1 },
        { carNumber: 10, designationJa: 'サハE235-4600', role: 'intermediate_t', hasPantograph: false, pantographCount: 0 },
        { carNumber: 11, designationJa: 'クハE235-0', role: 'lead_rear', hasPantograph: false, pantographCount: 0 },
      ],
    },
    {
      id: 'e235-yamanote-4car-demo',
      labelJa: '山手線 4両プレビュー編成（先頭＋パンタ中間＋付随＋後尾）',
      labelEn: 'Yamanote Line 4-Car Preview Consist',
      carCount: 4,
      isOfficialFullLength: false,
      cars: [
        { carNumber: 1, designationJa: 'クハE234-0', role: 'lead_front', hasPantograph: false, pantographCount: 0 },
        { carNumber: 2, designationJa: 'モハE235-0', role: 'intermediate_m', hasPantograph: true, pantographCount: 1 },
        { carNumber: 3, designationJa: 'サハE235-0', role: 'intermediate_t', hasPantograph: false, pantographCount: 0 },
        { carNumber: 4, designationJa: 'クハE235-0', role: 'lead_rear', hasPantograph: false, pantographCount: 0 },
      ],
    },
  ],
  lodBudgets: {
    high: {
      level: 'high',
      maxDistanceM: 260,
      maxTrianglesPerCar: 3600,
      maxDrawCallsPerCar: 12,
      featuresIncluded: [
        '拡幅車体鼓形断面（2.95m幅）',
        'ウグイス色外枠＋平面ブラックマスク前面＋上部角形LED前照灯・尾灯・行先表示器',
        '独立可動片側4扉（左右計8枚×2葉＝16枚のスライドドア＋縦グラデーションドット帯）',
        'DT80/TR264ボルスタレス台車（輪軸・空気ばね・軸箱梁）',
        'PS33Hシングルアームパンタグラフ・AU737集中式冷房装置2基・床下VVVF機器箱・車端幌・排障器',
      ],
    },
    medium: {
      level: 'medium',
      maxDistanceM: 950,
      maxTrianglesPerCar: 1800,
      maxDrawCallsPerCar: 8,
      featuresIncluded: [
        '拡幅車体断面および前面ウグイス色ベゼル＋ブラックマスク形状',
        '縦方向ウグイス色扉帯PBRテクスチャ＋前照灯・尾灯発光ノード',
        '簡略化台車・冷房キセ・折りたたみパンタグラフシルエット',
      ],
    },
    low: {
      level: 'low',
      maxDistanceM: 15000,
      maxTrianglesPerCar: 450,
      maxDrawCallsPerCar: 4,
      featuresIncluded: [
        '遠景識別用の拡幅ステンレス車体プリズム＋ウグイス色前面枠＋4箇所の縦方向グリーン帯',
        '前後ライト発光プレーン',
      ],
    },
  },
  glbAssetPaths: {
    leadCar: '/assets/rolling-stock/jr-east-e235-0-lead.glb',
    intermediateCar: '/assets/rolling-stock/jr-east-e235-0-mid.glb',
    previewConsist: '/assets/rolling-stock/jr-east-e235-0-consist.glb',
  },
  credibility: {
    sourceIds: ['src-jreast-e235-official', 'src-senkiro-procedural-rolling-stock-v2'],
    dataNature: 'manual-verified',
    lastVerifiedAt: '2026-11-22T09:35:00Z',
    officialReferenceUrls: ['https://www.jreast.co.jp/train/local/e235.html'],
    manufacturerAndDesigner: '総合車両製作所（J-TREC Sustina S24） / KEN OKUYAMA DESIGN',
    assetLicense: 'MIT / CC BY 4.0（SENKIRO Lab 独自手続き生成メッシュ＆PBRテクスチャ）',
    copyrightComplianceNotes:
      'JR東日本のコーポレートマーク（JRロゴ）および編成番号フォントの商標はモデル上に描画せず、公開車体寸法・色彩構成・扉配置のみを忠実に再現。',
    accuracyHighlights: [
      '20.0m連結面間・2.95m拡幅車体（裾絞り断面）と1,067mm狭軌台車の正確なプロポーション',
      '従来の横帯ではなく各客用扉部分に縦方向のウグイス色（#80C241）グラデーションドット帯を配するE235系固有の側面意匠',
      'フラットな大画面ブラックガラス前面と四隅を丸めたウグイス色フレーム、窓上左右の角形LEDヘッドライト＆上部フルカラーLED表示器',
      'sustinaレーザー溶接フラットステンレス屋根上のAU737クーラー2基とPS33Hシングルアームパンタグラフ',
    ],
    knownSimplifications: [
      '客室内座席・吊革はリアルタイム描画負荷軽減のため省略し、窓ガラス内側の暗色インテリアシルエットで表現',
      '床下VVVFインバータ・SIV・CP機器は機能別の代表直方体ブロック群として統合',
      '10号車（サハE235-4600番台）の変則窓割りは標準中間車（サハE235-0）と共通化',
    ],
  },
  provenance: {
    sourceIds: ['src-jreast-e235-official', 'src-senkiro-procedural-rolling-stock-v2'],
    dataNature: 'manual-verified',
    lastVerifiedAt: '2026-11-22T09:35:00Z',
  },
};

export const TOKYO_METRO_1000_SPEC: RollingStockSpec = {
  id: 'sk:rolling-stock:tokyo-metro-1000',
  seriesId: 'tokyo-metro-1000',
  operatorId: 'sk:operator:tokyo-metro',
  applicableLineIds: ['sk:line:metro-ginza'],
  names: {
    ja: '東京メトロ 1000系（銀座線）',
    ja_kana: 'とうきょうめとろ 1000けい ぎんざせん',
    en: 'Tokyo Metro 1000 Series (Ginza Line)',
    zh: '东京Metro 1000系（银座线）',
  },
  introducedYear: 2012,
  maxOperatingSpeedKmh: 80,
  designSpeedKmh: 90,
  electrification: 'third_rail_600v_dc',
  bodyProfile: 'compact_subway_flat',
  frontArchetype: 'retro_box_center_door',
  bogieModel: 'SC101 操舵台車（第三軌条集電靴付）',
  pantographModel: null,
  dimensions: {
    couplerLengthM: 16.0,
    leadBodyLengthM: 15.52,
    intermediateBodyLengthM: 15.4,
    bodyWidthM: 2.55,
    roofHeightM: 3.465,
    pantographHeightM: null,
    floorHeightM: 1.125,
    trackGaugeM: 1.435,
    bogieCenterDistanceM: 10.6,
    bogieWheelbaseM: 1.9,
    wheelDiameterM: 0.86,
    doorsPerSide: 3,
    doorWidthM: 1.3,
    doorHeightM: 1.83,
    interCarGapM: 0.54,
  },
  palette: {
    bodyPrimaryHex: '#F5B100', // Vivid retro Lemon Yellow full-body wrap
    bodySecondaryHex: '#6E3428', // Classic 1927 Type 1000 Maroon / Reddish-Brown roof & upper cantrail
    roofHex: '#683024', // Classic maroon-brown roof
    primaryStripeHex: '#FF8C00', // Ginza Line Orange belt
    secondaryStripeHex: '#FFFFFF', // Crisp white & dark brown pin-stripe trim along waist
    frontMaskHex: '#F5B100', // Yellow retro front with central emergency door trim
    underfloorHex: '#2B2E34', // SC101 steerable bogies with orange/yellow collector shoe beam
    glassHex: '#1D2935', // Deep tinted window glass
    liveryPattern: 'ginza1000_full_yellow_maroon_roof',
  },
  standardConsists: [
    {
      id: 'metro1000-ginza-6car-full',
      labelJa: '銀座線 6両フル編成（全電動車・第三軌条集電）',
      labelEn: 'Ginza Line 6-Car Full Consist (6M Third-Rail)',
      carCount: 6,
      isOfficialFullLength: true,
      cars: [
        { carNumber: 1, designationJa: '1100形 (CM1)', role: 'lead_front', hasPantograph: false, pantographCount: 0 },
        { carNumber: 2, designationJa: '1200形 (M1)', role: 'intermediate_m', hasPantograph: false, pantographCount: 0 },
        { carNumber: 3, designationJa: '1300形 (M2)', role: 'intermediate_m', hasPantograph: false, pantographCount: 0 },
        { carNumber: 4, designationJa: '1400形 (M1)', role: 'intermediate_m', hasPantograph: false, pantographCount: 0 },
        { carNumber: 5, designationJa: '1500形 (M2)', role: 'intermediate_m', hasPantograph: false, pantographCount: 0 },
        { carNumber: 6, designationJa: '1000形 (CM2)', role: 'lead_rear', hasPantograph: false, pantographCount: 0 },
      ],
    },
    {
      id: 'metro1000-ginza-3car-demo',
      labelJa: '銀座線 3両プレビュー編成',
      labelEn: 'Ginza Line 3-Car Preview Consist',
      carCount: 3,
      isOfficialFullLength: false,
      cars: [
        { carNumber: 1, designationJa: '1100形 (CM1)', role: 'lead_front', hasPantograph: false, pantographCount: 0 },
        { carNumber: 2, designationJa: '1200形 (M1)', role: 'intermediate_m', hasPantograph: false, pantographCount: 0 },
        { carNumber: 6, designationJa: '1000形 (CM2)', role: 'lead_rear', hasPantograph: false, pantographCount: 0 },
      ],
    },
  ],
  lodBudgets: {
    high: {
      level: 'high',
      maxDistanceM: 260,
      maxTrianglesPerCar: 3400,
      maxDrawCallsPerCar: 12,
      featuresIncluded: [
        '16.0m長×2.55m幅のコンパクトな標準軌（1,435mm）フラット断面車体',
        '1927年初代1000形を継承する中央貫通扉＋縦飾り帯＋下部左右縦2連LEDヘッドライト・テールライト＋深い茶褐色屋根ひさし',
        '独立可動片側3扉（20m級の4扉車と一目で区別できる3扉配置）',
        '屋根上パンタグラフ無し＋薄型冷房キセ2基＋茶褐色屋根塗装',
        'SC101操舵台車（1,435mm標準軌輪軸＋側面第三軌条集電靴ビーム）',
      ],
    },
    medium: {
      level: 'medium',
      maxDistanceM: 950,
      maxTrianglesPerCar: 1800,
      maxDrawCallsPerCar: 8,
      featuresIncluded: [
        '16mコンパクトレモンイエロー車体＋茶褐色アーチ屋根＋銀座オレンジ＆白帯',
        '前面中央貫通扉モールドと下部縦2連ライト発光ノード',
        'パンタグラフ無しの屋根＆標準軌台車ブロック',
      ],
    },
    low: {
      level: 'low',
      maxDistanceM: 15000,
      maxTrianglesPerCar: 450,
      maxDrawCallsPerCar: 4,
      featuresIncluded: [
        '遠景でも一目で識別できるレモンイエロー全面塗装＋茶褐色屋根＋16m短車体プリズム',
        '前後ライト発光プレーン',
      ],
    },
  },
  glbAssetPaths: {
    leadCar: '/assets/rolling-stock/tokyo-metro-1000-lead.glb',
    intermediateCar: '/assets/rolling-stock/tokyo-metro-1000-mid.glb',
    previewConsist: '/assets/rolling-stock/tokyo-metro-1000-consist.glb',
  },
  credibility: {
    sourceIds: ['src-tokyometro-1000-official', 'src-senkiro-procedural-rolling-stock-v2'],
    dataNature: 'manual-verified',
    lastVerifiedAt: '2026-11-22T09:35:00Z',
    officialReferenceUrls: [
      'https://www.tokyometro.jp/corporate/enterprise/passenger_rail/cars/working/ginza_1000/index.html',
    ],
    manufacturerAndDesigner: '日本車輌製造株式会社',
    assetLicense: 'MIT / CC BY 4.0（SENKIRO Lab 独自手続き生成メッシュ＆PBRテクスチャ）',
    copyrightComplianceNotes:
      '東京メトロのハートMロゴマークは描画せず、1927年東洋初の地下鉄車両をモチーフとした公開外観色彩（レモンイエロー車体・茶褐色屋根・オレンジ帯）と16m・3扉・第三軌条仕様を正確に再現。',
    accuracyHighlights: [
      'JR山手線E235系（20.0m×2.95m・4扉）より明確に小ぶりな16.0m×2.55m・片側3扉の銀座線建築限界サイズ',
      '全面レモンイエロー（#F5B100）車体と茶褐色（#6E3428）屋根、銀座線オレンジ＋白＋濃茶の腰帯コントラスト',
      '第三軌条集電方式（600V DC）のため屋根上にパンタグラフが一切無く、標準軌（1,435mm）SC101台車側面に集電靴を装備',
      'レトロモダンな前面中央貫通扉フレームと左右下部の縦並び丸形2連LED前照灯・標識灯',
    ],
    knownSimplifications: [
      '特別仕様車（1139F・1140Fのリベット再現や室内木目調壁面）ではなく量産標準編成（1101F〜1138F）を基準に造形',
      'SC101操舵台車のリンク機構は外側フレーム＋空気ばね＋第三軌条集電靴ビームに簡略化',
    ],
  },
  provenance: {
    sourceIds: ['src-tokyometro-1000-official', 'src-senkiro-procedural-rolling-stock-v2'],
    dataNature: 'manual-verified',
    lastVerifiedAt: '2026-11-22T09:35:00Z',
  },
};

export const TOKYO_METRO_17000_SPEC: RollingStockSpec = {
  id: 'sk:rolling-stock:tokyo-metro-17000',
  seriesId: 'tokyo-metro-17000',
  operatorId: 'sk:operator:tokyo-metro',
  applicableLineIds: ['sk:line:metro-yurakucho', 'sk:line:metro-fukutoshin'],
  names: {
    ja: '東京メトロ 17000系（有楽町線・副都心線）',
    ja_kana: 'とうきょうめとろ 17000けい ゆうらくちょうせん・ふくとしんせん',
    en: 'Tokyo Metro 17000 Series (Yurakucho & Fukutoshin Lines)',
    zh: '东京Metro 17000系（有乐町线・副都心线）',
  },
  introducedYear: 2021,
  maxOperatingSpeedKmh: 110,
  designSpeedKmh: 120,
  electrification: 'overhead_1500v_dc',
  bodyProfile: 'atrain_tapered',
  frontArchetype: 'aero_sloped_round_eyes',
  bogieModel: 'FS779 ボルスタ付台車',
  pantographModel: 'PT71 シングルアーム式',
  dimensions: {
    couplerLengthM: 20.0,
    leadBodyLengthM: 19.63,
    intermediateBodyLengthM: 19.5,
    bodyWidthM: 2.8,
    roofHeightM: 3.635,
    pantographHeightM: 4.02,
    floorHeightM: 1.14,
    trackGaugeM: 1.067,
    bogieCenterDistanceM: 13.8,
    bogieWheelbaseM: 2.1,
    wheelDiameterM: 0.86,
    doorsPerSide: 4,
    doorWidthM: 1.3,
    doorHeightM: 1.85,
    interCarGapM: 0.48,
  },
  palette: {
    bodyPrimaryHex: '#D8DCE3', // Brushed double-skin A-train aluminum alloy
    bodySecondaryHex: '#C5A467', // Champagne Gold metallic lower nose accent
    roofHex: '#9FA7B2', // Ribbed aluminum roof grey
    primaryStripeHex: '#C1A470', // Yurakucho Line Gold horizontal stripe
    secondaryStripeHex: '#9C5E31', // Fukutoshin Line Brown horizontal stripe
    frontMaskHex: '#10141A', // Deep curved black glass aerodynamic dome
    underfloorHex: '#2A2F37', // FS779 bogies & PMSM inverter boxes
    glassHex: '#17232E', // Smoked dark commuter glass
    liveryPattern: 'metro17000_dual_gold_brown_belts',
  },
  standardConsists: [
    {
      id: 'metro17000-10car-full',
      labelJa: '有楽町線・副都心線 10両フル編成（4M6T・17101F〜17106F）',
      labelEn: 'Yurakucho/Fukutoshin 10-Car Full Consist (4M6T)',
      carCount: 10,
      isOfficialFullLength: true,
      cars: [
        { carNumber: 1, designationJa: '17100形 (CT1)', role: 'lead_front', hasPantograph: false, pantographCount: 0 },
        { carNumber: 2, designationJa: '17200形 (M1)', role: 'intermediate_m', hasPantograph: true, pantographCount: 2 },
        { carNumber: 3, designationJa: '17300形 (T1)', role: 'intermediate_t', hasPantograph: false, pantographCount: 0 },
        { carNumber: 4, designationJa: '17400形 (M2)', role: 'intermediate_m', hasPantograph: true, pantographCount: 1 },
        { carNumber: 5, designationJa: '17500形 (Tc1)', role: 'intermediate_t', hasPantograph: false, pantographCount: 0 },
        { carNumber: 6, designationJa: '17600形 (Tc2)', role: 'intermediate_t', hasPantograph: false, pantographCount: 0 },
        { carNumber: 7, designationJa: '17700形 (M3)', role: 'intermediate_m', hasPantograph: true, pantographCount: 1 },
        { carNumber: 8, designationJa: '17800形 (T2)', role: 'intermediate_t', hasPantograph: false, pantographCount: 0 },
        { carNumber: 9, designationJa: '17900形 (M4)', role: 'intermediate_m', hasPantograph: true, pantographCount: 2 },
        { carNumber: 10, designationJa: '17000形 (CT2)', role: 'lead_rear', hasPantograph: false, pantographCount: 0 },
      ],
    },
    {
      id: 'metro17000-8car-full',
      labelJa: '副都心線・東急直通 8両フル編成（4M4T・17181F〜17195F）',
      labelEn: 'Fukutoshin Through-Service 8-Car Full Consist (4M4T)',
      carCount: 8,
      isOfficialFullLength: true,
      cars: [
        { carNumber: 1, designationJa: '17180形 (CT1)', role: 'lead_front', hasPantograph: false, pantographCount: 0 },
        { carNumber: 2, designationJa: '17280形 (M1)', role: 'intermediate_m', hasPantograph: true, pantographCount: 2 },
        { carNumber: 3, designationJa: '17380形 (M2)', role: 'intermediate_m', hasPantograph: false, pantographCount: 0 },
        { carNumber: 4, designationJa: '17480形 (Tc1)', role: 'intermediate_t', hasPantograph: false, pantographCount: 0 },
        { carNumber: 5, designationJa: '17580形 (Tc2)', role: 'intermediate_t', hasPantograph: false, pantographCount: 0 },
        { carNumber: 6, designationJa: '17680形 (M3)', role: 'intermediate_m', hasPantograph: false, pantographCount: 0 },
        { carNumber: 7, designationJa: '17780形 (M4)', role: 'intermediate_m', hasPantograph: true, pantographCount: 2 },
        { carNumber: 8, designationJa: '17080形 (CT2)', role: 'lead_rear', hasPantograph: false, pantographCount: 0 },
      ],
    },
    {
      id: 'metro17000-4car-demo',
      labelJa: '有楽町・副都心線 4両プレビュー編成',
      labelEn: 'Yurakucho/Fukutoshin 4-Car Preview Consist',
      carCount: 4,
      isOfficialFullLength: false,
      cars: [
        { carNumber: 1, designationJa: '17100形 (CT1)', role: 'lead_front', hasPantograph: false, pantographCount: 0 },
        { carNumber: 2, designationJa: '17200形 (M1)', role: 'intermediate_m', hasPantograph: true, pantographCount: 1 },
        { carNumber: 3, designationJa: '17300形 (T1)', role: 'intermediate_t', hasPantograph: false, pantographCount: 0 },
        { carNumber: 10, designationJa: '17000形 (CT2)', role: 'lead_rear', hasPantograph: false, pantographCount: 0 },
      ],
    },
  ],
  lodBudgets: {
    high: {
      level: 'high',
      maxDistanceM: 260,
      maxTrianglesPerCar: 3600,
      maxDrawCallsPerCar: 12,
      featuresIncluded: [
        '20.0m長×2.80m幅の日立A-trainアルミダブルスキン断面（上部わずかに絞ったテーパー形状）',
        '後退角のある流線型3D曲面ブラックガラス前面＋助士席側オフセット非常貫通扉（円形モチーフ窓）',
        '7000系・10000系を継承する象徴的な左右丸目リングLEDヘッドライト＆赤色リングテールライト＋シャンパンゴールド／ブラウン前面スカート',
        '独立可動片側4扉＋有楽町線ゴールド（#C1A470）＆副都心線ブラウン（#9C5E31）の2色水平連続腰帯・幕板帯＋車端円形アクセント窓',
        'FS779台車（1,067mm狭軌）＋屋根上空調キセ＋PT71シングルアームパンタグラフ',
      ],
    },
    medium: {
      level: 'medium',
      maxDistanceM: 950,
      maxTrianglesPerCar: 1800,
      maxDrawCallsPerCar: 8,
      featuresIncluded: [
        '流線型傾斜ブラックフロントドーム＋丸目リングライト発光ノード＋金・茶2色水平帯',
        '簡略化台車・空調キセ・パンタグラフ',
      ],
    },
    low: {
      level: 'low',
      maxDistanceM: 15000,
      maxTrianglesPerCar: 520,
      maxDrawCallsPerCar: 4,
      featuresIncluded: [
        '遠景識別用の傾斜ノーズアルミ車体プリズム＋全長にわたるゴールド＆ブラウン2色水平ベルト',
        '丸目フロントライト／リアライト発光プレーン',
      ],
    },
  },
  glbAssetPaths: {
    leadCar: '/assets/rolling-stock/tokyo-metro-17000-lead.glb',
    intermediateCar: '/assets/rolling-stock/tokyo-metro-17000-mid.glb',
    previewConsist: '/assets/rolling-stock/tokyo-metro-17000-consist.glb',
  },
  credibility: {
    sourceIds: ['src-tokyometro-17000-official', 'src-senkiro-procedural-rolling-stock-v2'],
    dataNature: 'manual-verified',
    lastVerifiedAt: '2026-11-22T09:35:00Z',
    officialReferenceUrls: [
      'https://www.tokyometro.jp/corporate/enterprise/passenger_rail/cars/working/yurakucho_17000/index.html',
    ],
    manufacturerAndDesigner: '日立製作所（10両編成・A-train） / 近畿車輛（8両編成）',
    assetLicense: 'MIT / CC BY 4.0（SENKIRO Lab 独自手続き生成メッシュ＆PBRテクスチャ）',
    copyrightComplianceNotes:
      '東京メトロのハートMロゴは描画せず、公開諸元に基づく20m×2.80m車体寸法、傾斜ブラックマスク、丸目ヘッドライト、ゴールド＆ブラウン2色帯を忠実に再現。',
    accuracyHighlights: [
      'E235系（2.95m幅・垂直平面顔・縦グリーン扉帯）と明確に異なる2.80m幅・流線型傾斜ブラックドーム前面・丸形リングLEDヘッドライト',
      '有楽町線（ゴールド #C1A470）と副都心線（ブラウン #9C5E31）の共通運用を象徴する水平2色ベルトと車端部の丸窓モチーフ',
      '助士席側へオフセットされた非常用貫通扉と下部シャンパンゴールド／エスプレッソブラウンの立体スカート',
      '10両編成（4M6T）および8両編成（4M4T）の双方の公式編成プリセットを収録',
    ],
    knownSimplifications: [
      '10両編成（日立製）と8両編成（近畿車輛製）の床下機器メーカー差異（日立PMSM vs 三菱SiC-VVVF）は共通の床下機器ブロック形状で表現',
      '車内座席・貫通路ガラス扉はリアルタイム性能のため外装シェルの裏打ち表現に簡略化',
    ],
  },
  provenance: {
    sourceIds: ['src-tokyometro-17000-official', 'src-senkiro-procedural-rolling-stock-v2'],
    dataNature: 'manual-verified',
    lastVerifiedAt: '2026-11-22T09:35:00Z',
  },
};

export const LIST_ROLLING_STOCK_SPECS: readonly RollingStockSpec[] = [
  JR_EAST_E235_0_SPEC,
  TOKYO_METRO_1000_SPEC,
  TOKYO_METRO_17000_SPEC,
];

const SPEC_BY_SERIES_ID = new Map<RollingStockSeriesId, RollingStockSpec>(
  LIST_ROLLING_STOCK_SPECS.map((s) => [s.seriesId, s]),
);

const LINE_TO_SERIES_MAP = new Map<SkId<'line'>, RollingStockSeriesId>();
for (const spec of LIST_ROLLING_STOCK_SPECS) {
  for (const lid of spec.applicableLineIds) {
    LINE_TO_SERIES_MAP.set(lid, spec.seriesId);
  }
}

export function getRollingStockSpec(seriesId: RollingStockSeriesId): RollingStockSpec {
  const spec = SPEC_BY_SERIES_ID.get(seriesId);
  if (!spec) {
    throw new Error(`Unknown RollingStockSeriesId: ${seriesId}`);
  }
  return spec;
}

export function getRollingStockForLine(lineId: SkId<'line'>): RollingStockSpec | null {
  const sid = LINE_TO_SERIES_MAP.get(lineId);
  return sid ? (SPEC_BY_SERIES_ID.get(sid) ?? null) : null;
}

/**
 * Builds a valid multi-car consist slot array for any desired carCount >= 1.
 * If carCount matches one of the series' official presets (e.g. 11 for E235, 6 for 1000, 10 or 8 for 17000),
 * returns the exact official formation; otherwise synthesizes a realistic lead + intermediate (M/T) + tail formation.
 */
export function buildConsistFormation(
  seriesId: RollingStockSeriesId,
  carCount?: number,
): readonly ConsistCarSlot[] {
  const spec = getRollingStockSpec(seriesId);
  if (carCount === undefined) {
    return spec.standardConsists[0]!.cars;
  }
  const exactPreset = spec.standardConsists.find((c) => c.carCount === carCount);
  if (exactPreset) {
    return exactPreset.cars;
  }

  const count = Math.max(1, Math.min(16, Math.round(carCount)));
  const usesOverheadPanto = spec.electrification === 'overhead_1500v_dc';
  const slots: ConsistCarSlot[] = [];

  for (let i = 0; i < count; i++) {
    const carNumber = i + 1;
    let role: RollingStockCarRole;
    let hasPantograph = false;
    let pantographCount: 0 | 1 | 2 = 0;

    if (i === 0) {
      role = 'lead_front';
    } else if (i === count - 1) {
      role = 'lead_rear';
    } else if (i % 2 === 1) {
      role = 'intermediate_m';
      hasPantograph = usesOverheadPanto;
      pantographCount = usesOverheadPanto ? 1 : 0;
    } else {
      role = 'intermediate_t';
    }

    slots.push({
      carNumber,
      designationJa: `${spec.names.ja?.split(' ')[1] ?? seriesId}-${carNumber}号車`,
      role,
      hasPantograph,
      pantographCount,
    });
  }

  return slots;
}

export function buildRollingStockCatalogDataset(): RollingStockCatalogDataset {
  return {
    generatedAt: '2026-11-22T09:35:00Z',
    schemaVersion: '2.0.0',
    spatialUnit: '1_unit_equals_1_meter',
    sources: ROLLING_STOCK_SOURCES,
    rollingStock: LIST_ROLLING_STOCK_SPECS,
  };
}
