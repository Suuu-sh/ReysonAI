import type { SiteLocale } from "./content.ts";

export type LegalDocument = "terms" | "privacy";
type Section = { title: string; paragraphs: string[] };
type Document = { title: string; lead: string; sections: Section[] };
type LegalCopy = { back: string; updated: string; status: string; notice: string; terms: Document; privacy: Document };

// Content follows current auth/storage behavior. Do not add retention deadlines
// or provider-location guarantees without confirming operations.
export const LEGAL_COPY: Record<SiteLocale, LegalCopy> = {
  en: {
    back: "Back to home", updated: "Last updated: October 4, 2026", status: "Current service information",
    notice: "ReysonAI is operated by Suu. For service questions or personal-data requests, contact yisshiki39@gmail.com. These pages explain the current service and its limits.",
    terms: {
      title: "Terms of Use", lead: "Learning tools. Estimated strategies. Clear limits.",
      sections: [
        { title: "1. Purpose and scope", paragraphs: ["ReysonAI is a poker strategy learning service, including this website and web app. It provides range analysis, explanations and practice. It does not accept wagers or provide a real-money gaming service."] },
        { title: "2. AI estimates and practice metrics", paragraphs: ["Ranges, action frequencies and explanations are estimates based on AI-generated policies and model assumptions. They are not guaranteed solver output, GTO strategies, mathematically optimal or mathematically correct. Incomplete or unsupported situations are not recommendations.", "Practice scores, accuracy, ratings and leaderboards measure performance against the service's training policies. They are not EV, real-play win rates, proof of poker skill or a promise of profit. Any model-based figures depend on their stated assumptions and do not guarantee real outcomes."] },
        { title: "3. Responsible use", paragraphs: ["Use the service for learning and follow applicable laws and the rules of poker sites, venues and tournaments. Do not use it for real-time assistance where prohibited. Decisions made outside the service are your own; no result or financial return is promised."] },
        { title: "4. Accounts and records", paragraphs: ["Range browsing and guest settings can work locally. Learning features require a verified Google account when account authentication is enabled. Protect access to your Google account. Signed-in learning records are saved separately from guest browser records; uploading guest records requires explicit consent.", "Ranked matches use server-side grading and ratings. Attempts, results and leaderboard entries are managed by the service, not by editing local records. See the Privacy Policy for the data stored and displayed."] },
        { title: "5. Prohibited conduct and content", paragraphs: ["Do not impersonate others, manipulate ranked results, circumvent access controls, overload or attack the service, or unlawfully collect or disclose other users' information. Do not bulk scrape, resell or redistribute service content without permission, except where permitted by law. Respect the rights of the service and third-party rights holders."] },
        { title: "6. Availability, billing and liability", paragraphs: ["Features and estimated policies may change, and availability is not guaranteed. Plus and its billing are currently planned; displayed pricing is not an active subscription or purchase contract. If billing launches, applicable price, renewal and cancellation conditions must be presented separately before purchase.", "The service does not guarantee that its information is accurate, complete or suitable for a particular purpose. Nothing in these terms excludes liability or consumer rights that cannot lawfully be excluded."] },
        { title: "7. Operator, contact and changes", paragraphs: ["Suu operates ReysonAI. Contact yisshiki39@gmail.com for questions about these terms. Changes will be announced appropriately with their content and effective date where applicable. These terms do not override mandatory local law."] },
      ],
    },
    privacy: {
      title: "Privacy Policy", lead: "What is stored, what is public, and how to contact us.",
      sections: [
        { title: "1. Information processed", paragraphs: ["Google sign-in requests OpenID and email access. ReysonAI stores the Google account identifier, verified email address, internal user ID and account creation time. It does not receive your Google password or request access to Gmail messages or contacts.", "Signed-in data includes your chosen nickname and experience level, language/display/appearance settings, drills, drafts, practice answers, session history and review records. Ranked data includes issued questions and policy snapshots, selected actions, grading, ratings/peak rating, attempts and timestamps."] },
        { title: "2. Purposes", paragraphs: ["This data is used to authenticate accounts, save and synchronize settings and learning records, grade practice, enforce ranked attempt limits, calculate ratings and display leaderboards. Session/OAuth records and rate-limit identifiers are used to keep sign-in and requests secure. Account request limiting uses a keyed hash derived from the requesting IP address."] },
        { title: "3. Public leaderboard", paragraphs: ["Ranked leaderboards display a generated player pseudonym, placement, tier/rating and practice statistics such as match count, accuracy and rating gain. Email addresses and Google identifiers are not displayed. Detailed match history is available to the signed-in account, not through the public leaderboard. Practice statistics are not real-play win rates or EV."] },
        { title: "4. Browser storage and cookies", paragraphs: ["Guest records and browser preferences use localStorage; onboarding temporarily uses sessionStorage. Signed-in synchronized records are held in app memory and stored on the server, separately from guest records. Importing guest records requires explicit replacement consent and does not import authoritative ranked results.", "The web sign-in uses HttpOnly session and OAuth-state cookies. The browser session currently expires after seven days and the OAuth state after ten minutes. These expiration times are not a retention period for account or practice data. Blocking browser storage or cookies can prevent saving or sign-in."] },
        { title: "5. Providers and security", paragraphs: ["Google handles account authentication. Cloudflare hosts the website/API and D1 database and may process network information, including IP addresses and request metadata, in providing its infrastructure. The providers' own privacy policies also apply to their services.", "Current safeguards include HTTPS production authentication, signed Google-token verification, HttpOnly cookies, hashed session identifiers and account-scoped access. These providers operate international infrastructure, so processing may occur outside your country. No Japan-only storage guarantee is made. See their policies for their processing practices."] },
        { title: "6. Retention, export and deletion", paragraphs: ["You can export settings and practice records from the app. Clearing this site's browser storage removes local guest records; it does not delete server account data. Signing out or revoking Google access does not delete stored account, practice or ranked records.", "Self-service account deletion is not currently implemented, and account, practice and ranked data have no automatic deletion deadline in the current application. To request access, correction, deletion or a stop to processing, email yisshiki39@gmail.com. Requests require identity verification and manual handling; submitting a request does not itself immediately erase server records."] },
        { title: "7. Operator, contact and updates", paragraphs: ["The operator is Suu. Contact yisshiki39@gmail.com for privacy questions and personal-data requests. Do not send passwords or session tokens by email. Material changes to processing will be described here and notified appropriately."] },
      ],
    },
  },
  ja: {
    back: "ホームに戻る", updated: "最終更新日：2026年10月4日", status: "現在のサービスについて",
    notice: "ReysonAIの運営者はSuuです。サービスに関するお問い合わせや個人情報に関する請求は、yisshiki39@gmail.comまでご連絡ください。現在のサービスとその限界を説明します。",
    terms: {
      title: "利用規約", lead: "学習のためのツール。推定の戦略。明確な限界。",
      sections: [
        { title: "1. 目的と適用範囲", paragraphs: ["ReysonAIは、このウェブサイトとウェブアプリを含むポーカー戦略学習サービスです。レンジ分析、説明、練習を提供します。金銭の賭けを受け付けるサービスではありません。"] },
        { title: "2. AIの推定と練習指標", paragraphs: ["レンジ、アクション頻度、説明は、AIが作成した方針やモデルの前提に基づく推定です。ソルバーの計算結果、GTO、数学的な最適性・正確性、またはそれらとの同等性を保証しません。未対応・不完全な局面の表示は推奨ではありません。", "練習スコア、正答率、レーティング、ランキングは、本サービスの練習方針に対する成績です。EV、実際の勝率、実力の証明、利益の保証ではありません。モデルに基づく数値も、明示された前提に依存し、実際の結果を保証しません。"] },
        { title: "3. 適切な利用", paragraphs: ["学習目的で利用し、適用される法令、ポーカーサイト・施設・大会の規則を守ってください。禁止されている場面でリアルタイム・アシスタンスに使用しないでください。サービス外での判断は利用者自身が行うもので、成果や金銭的利益は保証されません。"] },
        { title: "4. アカウントと記録", paragraphs: ["レンジの閲覧やゲスト設定はブラウザ内でも利用できます。認証が有効な環境では、学習機能に確認済みGoogleアカウントが必要です。Googleアカウントへのアクセスを適切に管理してください。ログイン後の学習記録はゲストのブラウザ記録と分離され、ゲスト記録のアップロードには明示的な同意が必要です。", "ランク戦の採点・レーティングはサーバーが管理します。ローカル記録の編集でランク結果は変更できません。保存情報とランキングの公開範囲はプライバシーポリシーをご覧ください。"] },
        { title: "5. 禁止事項とコンテンツ", paragraphs: ["なりすまし、ランク結果の不正操作、アクセス制御の回避、過度な負荷・攻撃、他の利用者の情報の不正取得・公開は禁止します。法令により認められる場合を除き、許可なくコンテンツを大量取得・再販売・再配布しないでください。本サービスと第三者の権利を尊重してください。"] },
        { title: "6. 提供状況・課金・責任", paragraphs: ["機能や推定方針は変更されることがあり、継続的な利用可能性は保証されません。Plusと課金は現在予定段階で、表示価格は契約や購入受付を意味しません。課金開始時には、価格・更新・解約条件を購入前に別途提示する必要があります。", "情報の正確性、完全性、特定目的への適合性は保証されません。本規約は、法令上免除できない責任や消費者の権利を排除するものではありません。"] },
        { title: "7. 運営者・連絡先・変更", paragraphs: ["運営者はSuuです。本規約に関するお問い合わせはyisshiki39@gmail.comまでご連絡ください。変更時には、必要に応じて変更内容と発効日を適切に周知します。本規約は、適用される強行法規を排除するものではありません。"] },
      ],
    },
    privacy: {
      title: "プライバシーポリシー", lead: "保存する情報、公開する情報、お問い合わせ方法。",
      sections: [
        { title: "1. 取り扱う情報", paragraphs: ["GoogleログインではOpenIDとメールアドレスの権限を要求し、Googleアカウント識別子、確認済みメールアドレス、内部ユーザーID、アカウント作成時刻を保存します。Googleのパスワードは受け取らず、Gmailの本文や連絡先へのアクセスは要求しません。", "ログイン後は、ニックネーム、経験レベル、言語・表示・外観設定、ドリル、下書き、練習回答、セッション履歴、復習記録を保存します。ランク戦では、出題内容と方針のスナップショット、選択したアクション、採点、レーティング・最高値、挑戦回数、各種時刻を保存します。"] },
        { title: "2. 利用目的", paragraphs: ["認証、設定・学習記録の保存と同期、練習の採点、ランク戦の挑戦回数制限、レーティング計算、ランキング表示に利用します。セッション・OAuth情報とレート制限用識別子は認証やリクエストの安全性維持に利用します。アカウントのリクエスト制限では、送信元IPアドレスから鍵付きハッシュを生成します。"] },
        { title: "3. ランキングの公開範囲", paragraphs: ["生成されたプレーヤーの仮名、順位、ティア・レーティング、対戦数・正答率・レーティング増減などの練習指標をランキングに表示します。メールアドレスとGoogle識別子は公開しません。詳細な対戦履歴は本人のログインしたアカウントで利用し、公開ランキングには含めません。練習指標は実際の勝率やEVではありません。"] },
        { title: "4. ブラウザ保存とCookie", paragraphs: ["ゲスト記録やブラウザ設定はlocalStorage、オンボーディングの一時情報はsessionStorageを使用します。ログイン後の同期対象記録はアプリのメモリとサーバーで管理し、ゲスト記録と分離します。ゲスト記録の取り込みには明示的な置換同意が必要で、正式なランク結果は取り込みません。", "ウェブ認証はHttpOnlyのセッションCookieとOAuth状態Cookieを使用します。現在のブラウザセッションは7日、OAuth状態は10分で失効します。これはアカウントや練習記録の保存期間ではありません。保存やCookieを禁止すると、記録保存やログインができない場合があります。"] },
        { title: "5. 外部サービスと安全管理", paragraphs: ["Googleはアカウント認証を担当します。Cloudflareはウェブサイト・API・D1データベースの基盤で、基盤提供にあたりIPアドレスやリクエスト情報などを取り扱う場合があります。各社のサービスには各社のプライバシーポリシーも適用されます。", "現在の実装には、本番認証のHTTPS、Googleトークンの署名検証、HttpOnly Cookie、セッション識別子のハッシュ化、アカウントごとのアクセス制御があります。各社は国際的な基盤を運用しているため、利用者の所在国以外で処理される場合があります。日本国内のみの保存は保証しません。各社の取り扱いは各社のポリシーをご確認ください。"] },
        { title: "6. 保存・出力・削除", paragraphs: ["アプリから設定と練習記録を出力できます。このサイトのブラウザ保存を消去するとゲストのローカル記録は消えますが、サーバーのアカウント情報は削除されません。ログアウトやGoogle側のアクセス解除でも、保存済みのアカウント・練習・ランク記録は削除されません。", "現在、アカウントのセルフサービス削除機能はなく、アカウント・練習・ランク記録には自動削除の期限が設定されていません。開示・訂正・削除・利用停止等を希望する場合は、yisshiki39@gmail.comまでご連絡ください。本人確認のうえ手動で対応するため、請求を送信した時点でサーバーの記録が消えるわけではありません。"] },
        { title: "7. 運営者・連絡先・変更", paragraphs: ["運営者はSuuです。プライバシーに関するお問い合わせや個人情報に関する請求は、yisshiki39@gmail.comまでご連絡ください。パスワードやセッショントークンはメールで送信しないでください。重要な取り扱い変更は本ページに記載し、適切に周知します。"] },
      ],
    },
  },
  "zh-CN": {
    back: "返回首页", updated: "最后更新：2026年10月4日", status: "当前服务说明",
    notice: "ReysonAI由Suu运营。服务问题及个人数据请求请联系yisshiki39@gmail.com。这些页面说明当前服务及其限制。",
    terms: {
      title: "使用条款", lead: "学习工具。估算策略。明确的限制。",
      sections: [
        { title: "1. 目的与范围", paragraphs: ["ReysonAI是扑克策略学习服务，包括本网站与网页应用，提供范围分析、解释和练习，不接受投注，也不提供真钱游戏服务。"] },
        { title: "2. AI估算与练习指标", paragraphs: ["范围、行动频率和解释是根据AI生成的策略和模型假设得到的估算，不保证是求解器结果、GTO策略，也不保证数学最优、数学正确或与其等同。未支持或不完整的局面不构成建议。", "练习分数、准确率、评级和排行榜衡量的是本服务训练策略下的表现，不是EV、真实游戏胜率、扑克能力证明或盈利保证。模型数值取决于所述假设，不保证实际结果。"] },
        { title: "3. 合理使用", paragraphs: ["请用于学习，并遵守适用法律及扑克网站、场所和赛事规则。禁止实时辅助的场合不得使用本服务进行实时辅助。服务外的决策由您自行作出，不保证任何结果或财务回报。"] },
        { title: "4. 账户与记录", paragraphs: ["范围浏览和访客设置可在本地使用。开启认证时，学习功能需要经过验证的Google账户。请保护您的Google账户。登录后的学习记录与浏览器访客记录分开，上传访客记录需要明确同意。", "排名对局由服务器评分并管理评级。修改本地记录不能改变正式排名结果。保存数据与公开范围见隐私政策。"] },
        { title: "5. 禁止行为与内容", paragraphs: ["不得冒充他人、操纵排名、绕过访问控制、攻击或过度加载服务、非法获取或披露其他用户的信息。除法律允许外，未经许可不得批量抓取、转售或重新分发服务内容。请尊重本服务和第三方的权利。"] },
        { title: "6. 可用性、付费与责任", paragraphs: ["功能和估算策略可能变更，不保证持续可用。Plus与付费尚在计划中，显示价格不代表已生效的订阅或购买合同。推出付费时，应在购买前另行说明价格、续订和取消条件。", "不保证信息准确、完整或适合特定目的。这些条款不排除法律不得排除的责任或消费者权利。"] },
        { title: "7. 运营者、联系与变更", paragraphs: ["运营者为Suu。条款问题请联系yisshiki39@gmail.com。变更时将适当通知内容和适用的生效日期。这些条款不排除适用的强制性法律。"] },
      ],
    },
    privacy: {
      title: "隐私政策", lead: "保存什么、公开什么，以及如何联系我们。",
      sections: [
        { title: "1. 处理的信息", paragraphs: ["Google登录请求OpenID和邮箱权限，保存Google账户标识符、已验证邮箱、内部用户ID和账户创建时间。不接收Google密码，也不请求读取Gmail邮件或联系人。", "登录数据包括昵称、经验水平、语言及显示与外观设置、训练、草稿、练习答案、会话和复习记录。排名数据包括题目及策略快照、所选行动、评分、评级及最高评级、尝试次数和时间。"] },
        { title: "2. 用途", paragraphs: ["用于账户认证、保存和同步设置与学习记录、练习评分、限制排名尝试次数、计算评级及展示排行榜。会话、OAuth和限流信息用于安全。账户请求限流使用从请求IP地址生成的带密钥哈希。"] },
        { title: "3. 公开排行榜", paragraphs: ["排行榜显示生成的玩家化名、名次、段位及评级，以及对局数、准确率和评级变化等练习统计。不显示邮箱或Google标识符。详细对局历史仅供已登录的本人账户使用，不在公开排行榜中展示。练习统计不是真实胜率或EV。"] },
        { title: "4. 浏览器存储与Cookie", paragraphs: ["访客记录与浏览器偏好使用localStorage，引导流程临时使用sessionStorage。登录后的同步记录保存在应用内存及服务器，与访客记录分开。导入访客记录需要明确同意替换，且不导入正式排名结果。", "网页登录使用HttpOnly会话和OAuth状态Cookie。当前浏览器会话七天后到期，OAuth状态十分钟后到期；这不是账户或练习数据的保存期限。阻止存储或Cookie可能导致无法保存或登录。"] },
        { title: "5. 服务商与安全", paragraphs: ["Google提供账户认证。Cloudflare托管网站、API和D1数据库，提供基础设施时可能处理IP地址及请求元数据。服务商自己的隐私政策也适用于其服务。", "当前措施包括生产认证HTTPS、Google令牌签名验证、HttpOnly Cookie、会话标识符哈希及按账户控制访问。服务商运营国际基础设施，可能在您所在国家以外处理数据，不保证仅在日本存储。有关其处理方式，请参阅各自政策。"] },
        { title: "6. 保存、导出与删除", paragraphs: ["您可在应用中导出设置与练习记录。清除本网站浏览器存储会删除本地访客记录，但不删除服务器账户数据。退出登录或撤销Google访问也不会删除已保存的账户、练习或排名记录。", "目前尚无自助删除账户功能，账户、练习和排名数据尚未设置自动删除期限。如需访问、更正、删除或停止处理，请联系yisshiki39@gmail.com。请求需验证身份并手动处理；发送请求不会立即删除服务器记录。"] },
        { title: "7. 运营者、联系与更新", paragraphs: ["运营者为Suu。隐私问题和个人数据请求请联系yisshiki39@gmail.com。请勿通过邮件发送密码或会话令牌。重要处理变更将说明并适当通知。"] },
      ],
    },
  },
  es: {
    back: "Volver al inicio", updated: "Última actualización: 4 de octubre de 2026", status: "Información actual del servicio",
    notice: "Suu opera ReysonAI. Para preguntas o solicitudes sobre datos personales, contacte con yisshiki39@gmail.com. Estas páginas explican el servicio actual y sus límites.",
    terms: {
      title: "Condiciones de uso", lead: "Herramientas de aprendizaje. Estrategias estimadas. Límites claros.",
      sections: [
        { title: "1. Finalidad y alcance", paragraphs: ["ReysonAI es un servicio educativo de estrategia de póquer, incluido este sitio y la aplicación web. Ofrece análisis de rangos, explicaciones y práctica. No acepta apuestas ni ofrece juego con dinero real."] },
        { title: "2. Estimaciones e indicadores", paragraphs: ["Los rangos, frecuencias y explicaciones son estimaciones basadas en políticas generadas por IA y supuestos del modelo. No se garantiza que sean resultados de un solver, GTO, matemáticamente óptimos, correctos o equivalentes. Las situaciones incompletas o no admitidas no son recomendaciones.", "Las puntuaciones, precisión, valoraciones y clasificaciones miden resultados frente a las políticas de práctica del servicio. No son EV, tasas de victoria reales, pruebas de habilidad ni garantías de beneficio. Las cifras del modelo dependen de sus supuestos y no garantizan resultados reales."] },
        { title: "3. Uso responsable", paragraphs: ["Use el servicio para aprender y cumpla la legislación y las reglas de sitios, locales y torneos. No lo use como asistencia en tiempo real donde esté prohibida. Las decisiones fuera del servicio son suyas; no se promete resultado ni retorno financiero."] },
        { title: "4. Cuentas y registros", paragraphs: ["La consulta de rangos y las preferencias de invitado pueden funcionar localmente. Con la autenticación habilitada, las funciones de aprendizaje requieren una cuenta de Google verificada. Proteja su cuenta. Los registros autenticados se guardan separados de los registros locales; subir estos requiere consentimiento explícito.", "Las partidas clasificatorias se califican en el servidor. Editar registros locales no modifica los resultados oficiales. Consulte la Política de privacidad para conocer los datos almacenados y públicos."] },
        { title: "5. Conductas prohibidas y contenido", paragraphs: ["No suplante identidades, manipule resultados, eluda controles de acceso, sobrecargue o ataque el servicio ni obtenga o divulgue ilegalmente información ajena. Salvo lo permitido por ley, no extraiga masivamente, revenda ni redistribuya contenido sin permiso. Respete los derechos del servicio y de terceros."] },
        { title: "6. Disponibilidad, pagos y responsabilidad", paragraphs: ["Las funciones y políticas estimadas pueden cambiar y no se garantiza disponibilidad continua. Plus y sus pagos están previstos, no activos; el precio mostrado no constituye una suscripción ni contrato de compra. Antes de activar pagos deberán presentarse precio, renovación y cancelación.", "No se garantiza exactitud, integridad ni idoneidad para un fin particular. Estas condiciones no excluyen responsabilidades ni derechos del consumidor que no puedan excluirse legalmente."] },
        { title: "7. Operador, contacto y cambios", paragraphs: ["El operador es Suu. Para preguntas sobre estas condiciones, contacte con yisshiki39@gmail.com. Los cambios se notificarán adecuadamente con su contenido y fecha aplicable. Las condiciones no prevalecen sobre normas legales imperativas."] },
      ],
    },
    privacy: {
      title: "Política de privacidad", lead: "Qué se guarda, qué es público y cómo contactar.",
      sections: [
        { title: "1. Información tratada", paragraphs: ["El acceso con Google solicita OpenID y correo electrónico. ReysonAI guarda el identificador de Google, correo verificado, ID interno y fecha de creación de la cuenta. No recibe la contraseña de Google ni solicita mensajes de Gmail o contactos.", "Los registros autenticados incluyen apodo, nivel de experiencia, idioma y preferencias visuales, ejercicios, borradores, respuestas, sesiones y repasos. Los datos clasificatorios incluyen preguntas y políticas emitidas, acciones elegidas, calificación, valoración y máximo, intentos y fechas."] },
        { title: "2. Finalidades", paragraphs: ["Se usan para autenticar, guardar y sincronizar preferencias y aprendizaje, calificar práctica, limitar intentos clasificatorios, calcular valoraciones y mostrar clasificaciones. Los registros de sesión, OAuth y límites protegen el acceso. El límite de solicitudes de cuenta usa un hash con clave derivado de la IP solicitante."] },
        { title: "3. Clasificación pública", paragraphs: ["Muestra un seudónimo generado, posición, nivel y valoración, y estadísticas como partidas, precisión y variación de valoración. No muestra correos ni identificadores de Google. El historial detallado está disponible para la propia cuenta autenticada, no en la clasificación pública. Las estadísticas no son tasas de victoria reales ni EV."] },
        { title: "4. Almacenamiento y cookies", paragraphs: ["Los registros de invitado y preferencias usan localStorage; la introducción usa temporalmente sessionStorage. Los registros sincronizados se guardan en memoria de la aplicación y en el servidor, separados de los locales. Importar registros locales requiere consentimiento explícito de sustitución y no importa resultados oficiales clasificatorios.", "El acceso web usa cookies HttpOnly de sesión y estado OAuth. La sesión actual caduca a los siete días y el estado OAuth a los diez minutos. No son plazos de conservación de cuentas o práctica. Bloquear cookies o almacenamiento puede impedir guardar o acceder."] },
        { title: "5. Proveedores y seguridad", paragraphs: ["Google gestiona la autenticación. Cloudflare aloja el sitio, API y base D1 y puede tratar IP y metadatos de solicitudes al prestar su infraestructura. También se aplican las políticas propias de los proveedores a sus servicios.", "Las medidas actuales incluyen HTTPS en autenticación de producción, verificación de firma de tokens de Google, cookies HttpOnly, identificadores de sesión con hash y acceso por cuenta. Los proveedores operan infraestructura internacional y pueden tratar datos fuera de su país. No se garantiza almacenamiento exclusivo en Japón. Consulte sus políticas para conocer sus prácticas."] },
        { title: "6. Conservación, exportación y eliminación", paragraphs: ["Puede exportar preferencias y práctica en la aplicación. Borrar el almacenamiento del sitio elimina registros locales, no datos de cuenta en el servidor. Cerrar sesión o revocar el acceso de Google no elimina cuentas, práctica ni registros clasificatorios guardados.", "No existe aún eliminación de cuenta de autoservicio, ni un plazo de eliminación automática de datos de cuenta, práctica y clasificación. Para solicitar acceso, rectificación, eliminación o cese del tratamiento, escriba a yisshiki39@gmail.com. Las solicitudes requieren verificación de identidad y gestión manual; enviarlas no borra inmediatamente los registros del servidor."] },
        { title: "7. Operador, contacto y actualizaciones", paragraphs: ["El operador es Suu. Para consultas de privacidad y solicitudes de datos personales, escriba a yisshiki39@gmail.com. No envíe contraseñas ni tokens de sesión por correo. Los cambios importantes se explicarán y notificarán adecuadamente."] },
      ],
    },
  },
};
