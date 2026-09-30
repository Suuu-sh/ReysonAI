// Product copy is localized at the presentation boundary. Strategy data, stored
// sessions, and their stable identifiers are deliberately never translated.
import { productLocale } from "./locale.ts";
export { LOCALE_KEY, productLocale, selectProductLocale, localized } from "./locale.ts";

// Longest phrases are applied first so a specific instruction is not damaged by
// a shorter navigation label. These are view-copy translations only, not data.
const COPY = {
  "ランク戦": "Ranked match", "ランキング": "Leaderboard", "週間": "Weekly", "通算": "All time", "順位": "Place", "プレイヤー": "Player", "試合": "Matches", "増減": "Change", "今週の増減": "This week", "日時": "Date", "自分の試合履歴": "Your match history", "今週はまだランク戦をプレイしていません。": "No ranked matches this week yet.", "まだランク戦をプレイしていません。": "No ranked matches yet.", "ランク戦に挑む": "Play ranked", "ランク": "Rank", "レート": "Rating", "最高": "Peak", "昇格": "Promoted", "降格": "Demoted", "また明日": "Come back tomorrow", "最高ランクです": "Top rank reached", "ブロンズ": "Bronze", "シルバー": "Silver", "ゴールド": "Gold", "プラチナ": "Platinum", "ダイヤモンド": "Diamond", "マスター": "Master",
  "はじめに、あなたのレベルを教えてください": "First, tell us your experience level",
  "レベルに合わせて、レンジ表の見せ方を変えます。あとからいつでも変更できます。": "We tailor the range display to your level. You can change it any time.",
  "設定はこの端末のブラウザに保存されます。アカウント登録は今後対応予定です。": "Settings are saved in this browser. Accounts are planned for later.",
  "レンジの基本を覚えたい": "Learn the range basics",
  "よく出る局面で、どのハンドで参加するかを一目で覚えたい。混合頻度は単純化して表示します。": "Learn which hands to play in common spots. Mixed frequencies are simplified.",
  "混合頻度も理解したい": "Understand mixed frequencies",
  "レイズとコールを混ぜる理由や、ポジションによる違いを理解したい。": "Understand why raises and calls are mixed and how position changes decisions.",
  "数値と根拠を細かく見たい": "Explore the numbers and reasoning",
  "勝率・必要勝率・ブロッカーなどの数値から、配分の妥当性を自分で判断したい。": "Assess frequencies yourself using equity, required equity, blockers, and other figures.",
  "練習セッション": "Practice sessions",
  "途中の練習も完了した練習も、回答したハンドごとに振り返れます。": "Review every answered hand in both ongoing and completed sessions.",
  "各問題で選んだアクションと、そのときの判定を表示します。": "See your action and result for each question.",
  "この過去のセッションは回答ごとの履歴を保存していません。正答率と回答数のみ確認できます。": "This older session has no per-hand history. Only its accuracy and answer count are available.",
  "まだ回答がありません。練習を再開すると、回答したハンドがここに記録されます。": "No answers yet. Resume practice to record hands here.",
  "ドリルで練習を始めると、ここに記録が並びます。": "Practice a drill to see sessions here.",
  "この状態のセッションはありません。": "No sessions match this status.",
  "設定を保存したドリルを繰り返し解いて、正答率の伸びを記録します。": "Repeat saved drills and track how your accuracy improves.",
  "トレーナーで問題を解くと、局面ごと・ハンドの種類ごとの正答率と、復習すべきハンドがここに並びます。": "Answer trainer questions to see accuracy by spot and hand type, plus hands to review.",
  "オープン・コール・3bet・フォールドの選び方を記録し、推定方針との差からプレースタイルを見つけます。": "Track your open, call, 3-bet, and fold choices to compare your practice style with the estimated policy.",
  "出題された問題ごとの推定頻度を平均して、あなたの選択率と比べます。混合・境界ハンドを多めに出すため、実戦のVPIP・PFRとは一致しません。差分 = あなた − 推定方針。": "We average the estimated frequencies for your questions and compare them with your choices. Because mixed and borderline hands appear more often, this is not your real-game VPIP or PFR. Difference = you minus estimated policy.",
  "各回答を同じ局面・ハンドの推定頻度と比べ、「選んだ行動の頻度 ÷ 最頻行動の頻度」で採点します。線は直近10回答の移動平均です（復習の再回答も含む）。推定方針が更新されると過去分も再計算されます。": "Each answer is scored as the chosen action's estimated frequency divided by the most frequent action's frequency for that spot and hand. The line is a moving average of the last ten answers, including reviews. Past scores are recalculated if the estimated policy changes.",
  "中心は「今回出た問題の平均方針」です。横軸はフォールド頻度の差（右ほど参加が多い）、縦軸は対オープンでの3bet頻度の差（上ほど多い）。NITはタイト側に付く追加ラベルです。": "The center represents the average policy for the questions you saw. The horizontal axis shows the difference in fold frequency (more participation to the right); the vertical axis shows the difference in 3-bet frequency versus opens (more upward). NIT is an extra label on the tight side.",
  "点は重複を除いた10問以上（オープン3問・対オープン5問以上）で表示し、30問に届くまでは暫定です。実戦の絶対的なプレイスタイルではありません。": "Your point appears after at least ten distinct questions (three opens and five responses). It stays provisional until 30 questions. It is not an absolute measure of your real-game style.",
  "練習問題での選択傾向です（強み・弱点は5問以上で80%以上／60%以下、3〜4問は暫定）。回答はこのブラウザ内だけに保存されます。": "These are tendencies from practice questions. Strengths and weaknesses require at least five answers and 80%+ or 60%- accuracy; three to four answers are provisional. Answers are stored only in this browser.",
  "相手の傾向に合わせてオープンレンジを調整します（実験的な近似計算）。変更したハンドは表の枠で示します。": "Adjust the opening range to table tendencies using an experimental approximation. Changed hands are outlined in the grid.",
  "対戦環境の詳細を設定します。現在選べるレンジはアンティなしのみです。": "Configure table conditions. Currently only no-ante ranges are available.",
  "この局面のハンド別説明はありません。": "No hand-specific explanation is recorded for this spot.",
  "この履歴のレンジはまだ保存されていません。": "No range has been saved for this action history yet.",
  "保存済みレンジを読み込んでいます。": "Loading the saved range.",
  
  "レンジ未収録": "Range not recorded",
  "対象外（到達不能）": "Not applicable (unreachable)",
  "表示モード": "Display mode",
  "ゲーム設定を編集": "Edit game settings",
  "アクションをリセット": "Reset actions",
  "アクション履歴": "Action history",
  "サイドバーを展開": "Expand sidebar",
  "サイドバーを折りたたむ": "Collapse sidebar",
  "メインナビゲーション": "Main navigation",
  "フロップカードを変更": "Change flop cards",
  "フロップカードを選択": "Select flop cards",
  "ブロック全体をクリックしてこのアクションに戻る": "Click this block to return to this action",
  "クリックしてこのアクション前に戻る": "Click to return before this action",
  "このアクションに戻り、関連するレンジ表を表示": "Return to this action and show related ranges",
  "保存済みレンジとの一致度": "Agreement with saved ranges",
  "フロップへ進む": "Continue to flop",
  "フロップを選択してください": "Select a flop",
  "この局面のポストフロップ方針は未収録": "No postflop policy recorded for this spot",
  
  "元のプリフロップレンジに含まれないか、このボードで組み合わせがありません。": "This hand is absent from the preflop range or has no combinations on this board.",
  "ターン・リバーの公開用方針はまだありません。": "No public turn or river policy is available yet.",
  "レンジ分析": "Range analysis", "解析": "Analyze", "学習": "Learn", "トレーナー": "Trainer", "セッション": "Sessions", "プレー分析": "Player analysis", "弱点": "Weaknesses",
  "参加中のレンジ": "Active players' ranges", "のアクションに戻り、レンジ表を表示": " — return to this action and show its range", "のレンジ": "'s range", "上限": "cap ", "プロフィール": "Profile", "サイドバー": "sidebar", "言語": "Language", "日本語": "Japanese",
  "初級": "Beginner", "中級": "Intermediate", "上級": "Advanced", "レベル": "Level", "レベルを変更": "Change level", "ニックネーム（任意）": "Nickname (optional)", "例：たろう": "e.g. Alex", "ゲスト": "Guest", "キャンセル": "Cancel", "はじめる": "Get started", "保存する": "Save",
  "推定レンジ": "Estimated ranges", "推定レンジ準備中": "Estimated range pending", "レンジ表を準備中": "Range table pending", "データなし": "No data", "読み込み中…": "Loading…", "読み込み中": "Loading", "詳細を閉じる": "Close details", "詳細": "Details", "AIの考え方": "AI reasoning", "理由を読み込めませんでした。": "Could not load the explanation.",
  "勝率（対オールインレンジ）": "Equity versus all-in range", "コールに必要な勝率": "Required equity to call", "頻度合計": "Total frequency", "オープンサイズ（合計）": "Open size (total)", "受けるオールイン（合計）": "Facing all-in (total)", "受ける5betオールイン（合計）": "Facing 5-bet all-in (total)", "受ける4bet（合計）": "Facing 4-bet (total)", "受ける3bet（合計）": "Facing 3-bet (total)", "元の3bet（合計）": "Original 3-bet (total)", "直前の4bet（合計）": "Previous 4-bet (total)", "直前の3bet（合計）": "Previous 3-bet (total)", "自分の4bet（合計）": "Your 4-bet (total)", "相手の元の3bet（合計）": "Opponent's original 3-bet (total)", "レイズ先（合計）": "Raise to (total)", "受けるオープン（合計）": "Facing open (total)", "受けるスクイーズ（合計）": "Facing squeeze (total)", "受けるリンプ・リレイズ（合計）": "Facing limp-reraise (total)",
  "オープン": "Open", "フォールド": "Fold", "コール": "Call", "レイズ": "Raise", "リンプ": "Limp", "チェック": "Check", "オールイン": "All-in", "スクイーズ": "Squeeze", "アイソレイズ": "Iso-raise", "コールドコール": "Cold call", "コールド4bet": "Cold 4-bet", "終了": "End", "フロップ": "Flop", "ポット": "Pot", "ハンド": "Hand", "コンボ": "Combos", "レンジ": "Range", "頻度": "Frequency", "勝率": "Equity", "必要勝率": "Required equity", "計算情報": "Calculation details", "コールEV": "Call EV", "未計算": "Not calculated", "推定": "Estimate", "履歴": "History", "結果": "Result", "判定": "Grade", "正答率": "Accuracy", "回答数": "Answers", "回答": "Answers", "ハンド数": "Hands", "練習時間": "Practice time", "練習名": "Practice name", "状態": "Status", "形式": "Format", "ハンド履歴": "Hand history", "セッション一覧": "Session list", "途中保存": "In progress", "完了した練習": "Completed practice", "完了": "Completed", "続きから": "Resume", "最多アクション": "Most frequent action", "選択頻度": "Chosen frequency", "すべて": "All", "まだセッションがありません": "No sessions yet",
  "ドリル": "Drills", "ドリル一覧": "Drill library", "ドリル一覧へ": "Back to drills", "新しいドリルを作る": "Create a new drill", "新しいドリル": "New drill", "復習ドリル": "Review drill", "復習する": "Review", "復習": "Review", "保存して開始": "Save and start", "開始": "Start", "出題範囲": "Question scope", "問題数": "Questions", "難易度": "Difficulty", "判定の厳しさ": "Grading strictness", "やさしい": "Easy", "標準": "Standard", "むずかしい": "Hard", "ゆるめ": "Lenient", "厳しめ": "Strict", "無制限": "Unlimited", "全席": "All seats", "前の人が全員フォールド": "Everyone before you folded", "誰かのオープンに応答": "Respond to an open", "次へ": "Next", "結果へ": "Results", "終了して結果へ": "Finish and see results", "問題": "Question", "このセッションの成績": "Session performance", "直近10問の結果": "Last ten results", "連続正解": "Current streak", "最高連続": "Best streak", "直近の回答": "Recent answers", "まだ回答がありません。": "No answers yet.", "正解": "Correct", "混合で可": "Valid mix", "ミス": "Miss", "自己ベスト更新": "New personal best", "ベスト": "Best", "平均": "Average", "前回": "Previous", "挑戦": "Attempts", "ミスしたハンド": "Missed hands", "もう一度挑戦": "Try again", "苦手な局面": "Weak spots", "苦手なハンドの種類": "Weak hand types", "よく間違えるハンド": "Frequently missed hands", "復習待ちのハンドはありません。": "No hands to review.",
  "未挑戦": "Not attempted", "今日": "Today", "昨日": "Yesterday", "日前": "days ago", "局面": "spots", "席": "seats", "を編集": " — edit", "を削除": " — delete", "編集": "Edit", "削除": "Delete", "を選んで保存": " — choose and save", "ディフェンス": " defense", "の攻防": " blind battle", "混合ハンド集中": "Mixed-hand focus",
  "ドリル名": "Drill name", "例：BTNのオープン": "e.g. BTN open", "自分の席": "Your seat", "すべて選択": "Select all", "はっきり決まるハンドも出題": "Also includes clear-cut hands", "境界と混合のハンドが中心": "Focuses on borderline and mixed hands", "混合頻度のハンドだけ": "Only mixed-frequency hands", "15%以上の選択は混合で可": "Choices used at least 15% count as a valid mix", "20%以上の選択は混合で可": "Choices used at least 20% count as a valid mix", "いちばん多い選択だけ正解": "Only the most frequent choice is correct", "間違えたハンドを混ぜる": "Mix in missed hands", "4問に1問ほど、以前ミスしたハンドを再出題": "About one in four questions repeats a previously missed hand", "以前ミスしたハンド": "previously missed hands", "再出題": "ask again", "対象": "Scope", "この組み合わせでは出題できる局面がありません": "No spots are available for this combination", "保存": "Save", "この出題範囲では局面がありません": "No spots in this question scope",
  "一覧": "Library", "ここまでのアクション": "Actions so far", "あなたのハンド": "Your hand", "テーブル。": "Table. ",
  "プレイスタイルマップ": "Play-style map", "マップの見方": "How to read this map", "タイト・パッシブ": "Tight-passive", "ルース・パッシブ": "Loose-passive", "タイト": "Tight", "ルース": "Loose", "暫定": "Provisional", "判定中": "Assessing", "アクションの選び方": "Action choices", "比較の方法": "How this comparison works", "推定方針": "Estimated policy", "全局面": "All spots", "先に行動": "First to act", "フォールド差が大きい局面": "Spots with the largest fold gap", "スコアの計算方法": "How the score is calculated", "まずは練習から": "Start with practice", "練習する": "Practice", "ドリルを選ぶ": "Choose a drill", "プレイスタイル": "Play style", "出題の内訳": "Question breakdown", "強み": "Strengths", "弱点の詳細を見る": "View weakness details", "次の練習ポイント": "What to practice next", "判定できる弱点データはまだありません。": "Not enough data to identify weaknesses yet.",
  "EvionAI Score の推移": "EvionAI Score over time", "セッションの状態": "Session status", "のハンド履歴を見る": " — view hand history", "直近": "Last ", "の平均": " average", "目": "", "あなた": "You", "判定には各10問・3局面以上": "At least ten questions and three spots of each type are required", "10問以上で表示": "Shown after 10 questions", "3bet 多": "More 3-bets", "3bet 少": "Fewer 3-bets", "練習結果の強みと弱点": "Practice strengths and weaknesses", "5問以上で正答率80%以上の項目はまだありません。": "No category has at least five answers and 80%+ accuracy yet.", "復習待ち": "To review", "ハンド種類": "Hand type", "NIT寄り": "NIT-leaning", "TAG寄り": "TAG-leaning", "LAG寄り": "LAG-leaning", "コール過多寄り": "Call-heavy", "タイト寄り": "Tight-leaning", "攻撃的寄り": "Aggressive-leaning", "受動的寄り": "Passive-leaning", "基準に近い": "Close to baseline", "分析中": "Analyzing", "練習での傾向（暫定）": "Practice tendency (provisional)",
  "シンプル": "Simple", "スタンダード": "Standard", "ゲーム設定": "Game settings", "より詳細な設定": "Advanced settings", "ゲーム設定に戻る": "Back to game settings", "有効スタック": "Effective stack", "レーキ": "Rake", "レーキなし": "No rake", "アンティ": "Ante", "アンティなし": "No ante", "アンティあり": "With ante", "卓の傾向": "Table tendencies", "オープン位置": "Opening position", "対応位置": "Responding position", "適用する": "Apply", "閉じる": "Close", "変更": "Change", "選択位置": "Selected position", "前のポジション・履歴": "Previous position · history", "オープンレンジ": "Opening range", "オープンへの応答": "Response to open", "3betへの応答": "Response to 3-bet", "4betへの応答": "Response to 4-bet", "5betオールインへの応答": "Response to 5-bet all-in", "スクイーズへの応答": "Response to squeeze", "リンプ・リレイズへの応答": "Response to limp-reraise", "アイソレイズへの応答": "Response to iso-raise", "リンプへの応答": "Response to limp", "現在の応答": "Current response", "全局面ミックス": "All-spot mix", "このハンドのアクション内訳": "Actions for this hand", "戦略加重EV": "Policy-weighted EV", "平均EV（方針どおり）": "Average EV (following policy)",
  "ゲーム": "Game", "テーブル": "Table", "スタック": "Stack", "ヘッズアップ": "Heads-up", "オープンサイズ": "Open size", "準備中": "Coming soon", "はレンジ表を準備中の設定です。": " indicates a setting whose range table is still being prepared.", "は対応するレンジを準備中の設定です。": " indicates a setting whose matching range is still being prepared.", "コール頻度": "Call frequency", "3bet頻度": "3-bet frequency", "少ない": "Low", "多い": "High", "卓": "Table",
  "ドライボード": "Dry board", "ウェットボード": "Wet board", "モノトーン": "Monotone", "ペアボード": "Paired board", "トップペア以上": "Top pair or better", "弱いペア": "Weak pair", "役なし": "Air", "ドロー": "Draw", "強い役": "Strong hand", "チェックレイズ": "Check-raise", "ベット": "Bet", "最初の判断（先にベットできる）": "First decision (can bet first)", "チェックへの応答": "Response to check", "ベットへの応答": "Response to bet", "レイズへの応答": "Response to raise",
  "ポストフロップ試作": "Postflop trial", "上のアクション列にあるフロップカードを押して、3枚を選んでください。": "Click the flop-card block in the action path above and choose three cards.", "フロップを選択": "Select flop", "選択": "Select",
  "卓に合わせてオープンに追加": "Added to opening range for this table", "卓に合わせてオープンから除外": "Removed from opening range for this table", "既存3bet頻度0%、推奨なし": "Prior 3-bet frequency is zero; no recommendation", "の戦略": "'s strategy", "終端": "Terminal",
  "SBのリンプ頻度が0%のため、この応答経路の推奨頻度はありません。保存上のfold=100は形式上の値です。": "SB's recorded limp frequency is zero, so this response path has no recommendation. The saved 100% fold is only a placeholder.",
  "頻度が0%のため、この経路の推奨頻度はありません。保存上のfold=100は形式上の値です。": "The preceding action has zero recorded frequency, so this path has no recommendation. The saved 100% fold is only a placeholder.",
  "オープン頻度が0%のため、この経路の推奨頻度はありません。保存上のfold=100は形式上の値です。": "The opening frequency is zero, so this path has no recommendation. The saved 100% fold is only a placeholder.",
  "オープンへのコール頻度が0%のため、この経路の推奨頻度はありません。保存上のfold=100は形式上の値です。": "The call frequency versus the open is zero, so this path has no recommendation. The saved 100% fold is only a placeholder.",
  "BBのアイソレイズ頻度が0%のため、この経路の推奨頻度はありません。保存上のfold=100は形式上の値です。": "BB's iso-raise frequency is zero, so this path has no recommendation. The saved 100% fold is only a placeholder.",
  "オールイン = 5bet（合計100BB）": "All-in = 5-bet (100 BB total)", "—（オープンなし）": "— (no open)", "—（5betなし）": "— (no 5-bet)", "—（4betなし）": "— (no 4-bet)", "—（3betなし）": "— (no 3-bet)", "—（スクイーズなし）": "— (no squeeze)", "5betオールイン（合計）": "5-bet all-in (total)", "4betサイズ（合計）": "4-bet size (total)", "3betサイズ（合計）": "3-bet size (total)", "スクイーズサイズ（合計）": "Squeeze size (total)",
  "保存状態を確認中…": "Checking saved status…", "Codexで生成中…": "Generating with Codex…", "保存済みレンジを表示中": "Showing saved range", "Codexでレンジを生成": "Generate range with Codex", "保存状態を確認できません。": "Could not check saved status.", "ローカル生成に接続できません。画面を再読み込みしてください。": "Could not connect to local generation. Reload the page.", "レンジを読み込めません": "Could not load the range", "この局面の推定レンジはまだ生成・保存されていません。": "No estimated range has been generated and saved for this spot yet.", "スクイーズ後の4betへの応答データはまだ保存されていません。": "No response range after a 4-bet following a squeeze has been saved yet.", "スクイーズ後の応答データはまだ保存されていません。": "No response range after the squeeze has been saved yet.", "3bet後の応答データはまだ保存されていません。": "No response range after the 3-bet has been saved yet.", "このマルチウェイ局面の応答データはまだ保存されていません。": "No response range for this multiway spot has been saved yet.", "5betオールイン後の応答データはまだ保存されていません。": "No response range after the 5-bet all-in has been saved yet.", "BBの4bet後のSBの応答レンジはまだありません。": "No SB response range after BB's 4-bet is available yet.", "マルチウェイレンジを生成します。保存済みデータは変更しません。": "Generate a multiway range. Saved data will not be changed.", "この分岐のレンジを生成します。": "Generate a range for this branch.", "オープン＋コールへの応答": "Response to open and call", "コールド応答": "Cold response", "（履歴）": " (history)", "（3bet前）": " (before 3-bet)", "（4bet前）": " (before 4-bet)", "（5bet選択）": " (5-bet choice)", "（リンプ選択）": " (limp choice)", "（卓に合わせて調整）": " (adjusted for table)", "後）": "after)",
  "3倍チェックレイズ": "Check-raise 3×", "3倍レイズ": "Raise 3×", "バリュー": "Value", "こちらが勝率で上回る手がコール": "Weaker hands call", "降ろせる格上": "Stronger hands that fold", "勝率で上回られている手が降りる": "Better hands fold", "続けてくる格上": "Stronger hands that continue", "勝率で上回られたまま続行される": "Better hands keep playing", "有利な相手": "Hands we beat", "不利な相手": "Hands that beat us", "勝率50%以上": "50%+ equity", "勝率50%未満": "Below 50% equity", "スートの組み合わせ": "Suit combinations", "ボードのカードと重なるため存在しません": "Unavailable because the cards overlap the board", "ボードと重複": "Overlaps the board", "ポストフロップ候補を読み込めませんでした。": "Could not load the postflop candidate.", "候補の局面・盤面または形式が一致しません。": "The candidate's spot, board, or format does not match.", "現在選べるのは、標準設定の2人のポットのうち、シングルレイズポット（オープン→1人がコール）、3betポット、4betポット、SBのリンプから始まるポットだけです。プリフロップの行動ブロックから戻れます。": "Currently available spots are heads-up single-raised, 3-bet, 4-bet, and SB-limp pots at default settings. Return using the preflop action blocks.", "ローカル候補を読み込み中": "Loading local candidate", "ローカル候補を表示できません": "Cannot show local candidate", "フロップの判断終了": "Flop decision complete", "元のプリフロップ頻度0%またはボードで到達不能、推奨なし": "Zero preflop frequency or unreachable on this board; no recommendation", "レンジ全体": "Entire range", "到達可能な": "Reachable", "コンボの加重平均です。": "weighted average by combinations.", "到達不能": "Unreachable",
  "EVを読み込めません。": "Could not load EV.", "EVはハンド平均で表示します（「平均」を選ぶと出ます）。": "EV is shown for the hand class average (choose Average).", "EVを読み込み中…": "Loading EV…", "このハンドはこの場面に来ません（前の行動の頻度が0%）。": "This hand does not reach this decision (the previous action has zero frequency).", "EVが最大のアクション": "Action with the highest EV", "EQR（仮定）": "EQR (assumed)", "コールEV（推定）": "Estimated call EV",
  "よくできました": "Well done", "もう一歩": "Almost there", "復習しましょう": "Time to review", "おつかれさまでした": "Practice complete", "今回": "This time", "このドリルの正答率の推移": "Accuracy trend for this drill", "最多は": "Most frequent: ", "最多": "Most frequent", "まだ回答がありません": "No answers yet", "トレーナーを始める": "Start trainer", "間違えたハンドを復習": "Review missed hands", "履歴を消す": "Clear history", "回答履歴をすべて消しますか？": "Clear all answer history?", "正答率の推移：": "Accuracy trend: ", "以前ミスしたハンドだけ": "Only previously missed hands", "問を回答済み": "questions answered", "ハンドが復習待ち": "hands to review", "途中保存されています": "Saved in progress", "正解すると復習待ちから外れます": "A correct answer removes a hand from the review queue",
  "ハイペア（TT+）": "High pairs (TT+)", "ミドル・ローペア": "Middle and low pairs", "スーテッドA": "Suited aces", "スーテッド・ブロードウェイ": "Suited broadway", "スーテッドコネクター": "Suited connectors", "その他のスーテッド": "Other suited hands", "オフスート・ブロードウェイ": "Offsuit broadway", "オフスートA": "Offsuit aces", "その他のオフスート": "Other offsuit hands",
};

const replacements = Object.entries(COPY).sort((a, b) => b[0].length - a[0].length);
const japanese = /[\u3040-\u30ff\u3400-\u9fff]/;

export function translateProductCopy(value) {
  if (productLocale() === "ja" || !japanese.test(value)) return value;
  if (COPY[value]) return COPY[value];
  let translated = value
    .replace(/(\d+)回答/g, (_, n) => `${n} ${Number(n) === 1 ? "answer" : "answers"}`)
    .replace(/(\d+)問/g, (_, n) => `${n} ${Number(n) === 1 ? "question" : "questions"}`)
    .replace(/(\d+)局面/g, (_, n) => `${n} ${Number(n) === 1 ? "spot" : "spots"}`)
    .replace(/(\d+)ハンド/g, (_, n) => `${n} ${Number(n) === 1 ? "hand" : "hands"}`)
    .replace(/(\d+)回/g, (_, n) => `${n} ${Number(n) === 1 ? "time" : "times"}`);
  for (const [original, english] of replacements) translated = translated.replaceAll(original, english);
  translated = translated.replaceAll("・", " · ").replaceAll("＋", " + ").replaceAll("（", " (").replaceAll("）", ")").replaceAll("。", ".").replaceAll("、", ", ").replaceAll("問", " questions").replaceAll("回", " times").replaceAll("秒", " sec").replaceAll("分", " min").replaceAll("人", " players");
  translated = translated.replace(/(\d)(spots|questions|times|Hand|Hands)/g, "$1 $2");
  return translated;
}

export function localizeProductSurface(root) {
  if (!root || productLocale() === "ja") return () => {};
  const translatedNodes = new WeakMap();
  const translatedAttributes = new WeakMap();
  const convertText = node => {
    if (!japanese.test(node.nodeValue ?? "")) return;
    if (node.parentElement?.closest('[translate="no"]')) return; // e.g. native language names
    const translated = translateProductCopy(node.nodeValue);
    if (translated !== node.nodeValue) {
      translatedNodes.set(node, translated);
      node.nodeValue = translated;
    }
  };
  const convertElement = element => {
    if (!(element instanceof Element)) return;
    for (const name of ["aria-label", "title", "placeholder"]) {
      const value = element.getAttribute(name);
      if (!value || !japanese.test(value)) continue;
      const translated = translateProductCopy(value);
      if (translated !== value) {
        translatedAttributes.set(element, { ...(translatedAttributes.get(element) ?? {}), [name]: translated });
        element.setAttribute(name, translated);
      }
    }
  };
  const scan = start => {
    if (start.nodeType === Node.TEXT_NODE) return convertText(start);
    if (start.nodeType !== Node.ELEMENT_NODE) return;
    convertElement(start);
    const walker = document.createTreeWalker(start, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (walker.currentNode.nodeType === Node.TEXT_NODE) convertText(walker.currentNode);
      else convertElement(walker.currentNode);
    }
  };
  scan(root);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "characterData") {
        if (record.target.nodeValue !== translatedNodes.get(record.target)) convertText(record.target);
      } else if (record.type === "attributes") {
        const value = record.target.getAttribute(record.attributeName);
        if (value !== translatedAttributes.get(record.target)?.[record.attributeName]) convertElement(record.target);
      } else for (const node of record.addedNodes) scan(node);
    }
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-label", "title", "placeholder"] });
  return () => observer.disconnect();
}
