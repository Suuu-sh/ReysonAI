import type { SiteCopy } from "./content";

export const ja: SiteCopy = {
  title: "EvionAI — 実戦で使えるポーカー戦略",
  description: "AIが推定したプリフロップレンジを読みやすい13×13の表で確認し、ハンドごとの理由を知り、ドリルで身につける。学習のための推定であり、GTOソルバーではありません。",
  common: { home: "EvionAI ホーム", open: "アプリを開く", menuOpen: "メニューを開く", menuClose: "メニューを閉じる", menuLabel: "メインメニュー", skip: "本文へスキップ", language: "EN", languageLabel: "Switch to English", raise: "レイズ", threeBet: "3ベット", call: "コール", fold: "フォールド", available: "提供中", planned: "予定", experimental: "試験運用" },
  nav: [
    { label: "使い方", href: "#how" },
    { label: "ドリルを試す", href: "#drill" },
    { label: "考え方", href: "#approach" },
    { label: "料金", href: "#pricing" },
    { label: "よくある質問", href: "#faq" },
  ],
  hero: { title1: "複雑な戦略を、", title2: "使える判断に。", lead: "EvionAIは、AIが推定したポーカーのレンジを一目で読める表にし、ハンドごとの理由をやさしい言葉で説明します。テーブルに座ったときにも思い出せる形で。", primary: "アプリを開く", secondary: "使い方を見る", note: "無料プレビュー · アカウント不要 · 6-maxキャッシュ 100BB" },
  preview: { spotLabel: "プレビューする局面", open: "BTN オープン", response: "BB vs BTN", displayLabel: "表示モード", simpleMode: "シンプル", standardMode: "スタンダード", matrixLabel: "13×13 スターティングハンド表", scrollLabel: "の表。狭い画面では横にスクロールできます", selectedHand: "選択中のハンド", suited: "スーテッド", offsuit: "オフスート", pair: "ペア", frequencyLabel: "アクション頻度", why: "理由", k7s: "K7s はスーテッドで、フロップ以降も戦いやすいハンドです。このBTNオープンの推定では、常にレイズします。", simpleOther: (spot: string, hand: string, action: string) => `保存済みの${spot}レンジでは、${hand} の主なアクションは${action}です。ハンドごとの詳しい説明はアプリで確認できます。`, other: (spot: string, hand: string, action: string, value: number) => `保存済みの${spot}レンジでは、${hand} を ${value}% の頻度で${action}します。ハンドごとの詳しい説明はアプリで確認できます。`, explore: "アプリでこのレンジを見る", saved: "保存済みのAI推定", notGto: "GTOソリューションではありません", spotOpening: "BTNオープン", spotResponse: "BBの応答", actionPast: { raise: "レイズ", threeBet: "3ベット", call: "コール", fold: "フォールド" }, touring: "自動でハンドを紹介中。セルをクリックすると操作できます。", manual: "ハンドをクリックして確認できます。" },
  facts: { items: ["どの表にも並ぶハンド数", "BTNからオープンするハンドの割合", "そのオープンにBBが参加するハンドの割合", "6-maxキャッシュのスタック（BB）"], source: "上の保存済み推定から、コンボ数で重み付けして数えています。" },
  how: {
    title1: "局面から理由まで、", title2: "3ステップで。",
    steps: [
      { title: "局面を決める。", body: "席ごとにアクションをたどります。BTNまでフォールド、2.5BBのオープン、BBの番。EvionAIはその流れにぴったり合う保存済みレンジを探し、なければ「未収録」と示します。" },
      { title: "色で読む。", body: "169ハンドそれぞれの主なアクションを、一色で表示します。まずはそこから。混ざる判断を見たくなったら、スタンダード表示へ切り替えます。" },
      { title: "理由を知る。", body: "ハンドをタップすると、正確なアクション頻度と、その裏付けとなる事実を言葉で確認できます。数字の壁ではなく。" },
    ],
    toAct: "アクション待ち", openSize: "レイズ 2.5BB", pot: "ポット 4BB", combos: "のハンド",
    whyHand: "A5s · BB vs BTN", whyNote: "アプリのハンド詳細では、その頻度になる理由も記録された形で確認できます。",
  },
  drill: { title1: "10秒で、", title2: "ひとつの判断を。", description: "BTNまでフォールドで回ってきました。オープンしますか？ 答えたあと、保存済みの推定が同じハンドをどう打つかを確認できます。", question: "BTNのアクション", tableFold: "Fold", stakes: "キャッシュ · 6-max · 100BB", pot: "ポット", raise: "レイズ 2.5BB", fold: "フォールド", next: "次へ", match: "推定と同じ判断", differ: "推定とは異なる判断", mixed: "混合のハンド", frequency: (value: number) => `推定でのこの選択の頻度 ${value}%`, score: (matched: number, played: number) => `${played}ハンド中 ${matched} 一致`, tableLabel: (hand: string) => `テーブル。BTNまでフォールドで、あなたのハンドは ${hand} です。`, note: "練習の判定は保存済みのAI推定との比較です。GTOソリューションや実戦の結果との比較ではありません。" },
  approach: {
    title1: "推定は、", title2: "推定として示す。",
    description: "EvionAIのレンジは、学習のためのAI推定です。どの表にもそう明記し、保存データのない局面は推測で埋めずに空けておきます。",
    isTitle: "EvionAI とは", is: ["6-maxキャッシュ・100BB・アンティなしの、AIが推定したプリフロップレンジ", "構造の一貫性を確認し、やさしい言葉で説明したもの", "推定との違いが分かる練習ツール"],
    isntTitle: "EvionAI ではないもの", isnt: ["GTOソルバー、またはソルバーの出力", "勝率や利益の保証", "収録していない局面に、作った答えを出すもの"],
    processTitle: "レンジができるまで",
    process: [{ title: "推定", detail: "AIによる戦略の推定" }, { title: "確認", detail: "構造のチェック" }, { title: "説明", detail: "学べる理由に変える" }, { title: "一緒に見直す", detail: "予定" }],
  },
  roadmap: {
    title1: "今できること。", title2: "これからのこと。",
    nowTitle: "提供中", nextTitle: "予定",
    now: [
      { title: "レンジ分析", detail: "オープン、応答、3ベット、4ベット、リンプ、一部の複数人の流れの保存済みプリフロップレンジ。", tag: "" },
      { title: "プリフロップのトレーナー", detail: "保存済みのオープン／対オープンのレンジによるドリル。採点、解説、復習つき。", tag: "" },
      { title: "セッションの振り返り", detail: "練習履歴、傾向、苦手な局面。このブラウザーに保存されます。", tag: "" },
      { title: "ポストフロップの試作", detail: "対応するヘッズアップの流れで、任意の有効なボードのフロップからリバーまでの頻度。", tag: "試験運用" },
    ],
    next: [
      { title: "卓に合わせたコーチング", detail: "同卓のプレイヤーの特徴を伝えると、調整の考え方を説明。", tag: "" },
      { title: "より深いトレーニング", detail: "段階的な学習の道筋と、上級者向けのドリル。", tag: "" },
      { title: "アカウントと同期", detail: "練習の記録を複数の端末で引き継ぐ。", tag: "" },
      { title: "Plus プラン", detail: "有料機能。価格はまだ仮案です。", tag: "" },
    ],
  },
  pricing: { title1: "まずは無料で。", title2: "準備ができたら、その先へ。", description: "現在のプレビューは無料です。有料プランは初期の提案で、まだ提供していません。", note: "Plus の ¥680 という価格と有料機能はすべて仮案です。課金やアカウントの仕組みはまだありません。", plans: [{ name: "Free", price: "¥0", cadence: "ずっと無料", description: "現在のプレビューのすべて。", features: ["保存済みのプリフロップレンジとハンド詳細", "シンプル／スタンダード表示", "プリフロップのトレーナーと振り返り"], action: "アプリを開く", href: "/app" as string | null, status: "提供中" }, { name: "Plus", price: "¥680", cadence: "/ 月 · 提案中", description: "準備ができたら、より深い練習の場を。", features: ["学習ツールの拡充", "ガイドつきトレーニングの追加", "卓に合わせた今後の機能"], action: "今後提供予定", href: null as string | null, status: "予定 · 価格は変わる可能性があります" }] },
  faq: {
    title: "よくある質問に、率直に。",
    items: [
      { question: "これはGTOですか？", answer: "いいえ。EvionAIが表示するのは、学習のためのAI推定レンジです。ソルバーの出力ではなく、数学的な最適性も保証しません。" },
      { question: "どのゲームに対応していますか？", answer: "6-maxキャッシュゲーム、100BB、アンティなしです。オープンは2.5BB（SBは3.5BB）。保存データのない局面は「未収録」と表示し、推測では埋めません。" },
      { question: "アカウントは必要ですか？", answer: "不要です。プロフィールと練習履歴はこのブラウザーに保存されます。アカウント機能は予定しています。" },
      { question: "ポストフロップにも対応していますか？", answer: "対応するヘッズアップの流れで、フロップからリバーまでを試験的に提供しています。アプリ内でも試験運用と明示しています。" },
      { question: "料金はかかりますか？", answer: "現在のプレビューは無料です。Plus プランを提案していますが、まだ提供しておらず、価格も変わる可能性があります。" },
    ],
  },
  final: { title1: "次のセッションは、", title2: "ひとつのハンドから。", description: "アプリを開いて、局面を選び、ハンドをタップするだけ。", action: "EvionAI を開く", note: "無料プレビュー · アカウント不要" },
  footer: { tagline: "ポーカー戦略を、使える形に。", product: "プロダクト", open: "アプリを開く", how: "使い方", drill: "ドリルを試す", pricing: "料金", faq: "よくある質問", legal: "規約", privacy: "プライバシー · 準備中", terms: "利用規約 · 準備中", disclaimer: "EvionAIはポーカーの戦略と学習のための情報を提供します。AIソリューションは推定であり、数学的な最適性やGTOソリューションとの同等性は保証されません。節度をもってお楽しみください。" },
};
