import { useEffect, useState } from "react";
import { BrandIcon } from "../components/BrandIcon.tsx";
import { useAccount } from "../account/AuthPanel.tsx";
import { refreshAccount, revalidateAccountSession, startGoogleSignIn } from "../account/session.ts";
import { localized } from "../locale.ts";
import { Aiv2OnDemandWorkspace } from "./Aiv2OnDemandWorkspace.tsx";
import "../account/account.css";

// This standalone entry deliberately does not load ProductApp or preflop datasets.
export default function Aiv2OnDemandApp(){
 const account=useAccount();
 const user=["session","verification"].includes(account.error)?null:account.user;
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{
  void refreshAccount();
  const recheck=()=>{void revalidateAccountSession();};
  window.addEventListener("focus",recheck);
  return()=>window.removeEventListener("focus",recheck);
 },[]);
 const signIn=async()=>{
  if(busy)return;setBusy(true);setError("");
  try{await startGoogleSignIn();}catch{setError(localized("Google sign-in could not start. Check the connection and try again when ready.","Googleログインを開始できませんでした。接続を確認してから再試行してください。"));}finally{setBusy(false);}
 };
 return <>
  <header className="shell aiv2-ondemand-header">
   <div className="aiv2-ondemand-brand"><BrandIcon/><strong>ReysonAI</strong><a href="/analyze/ranges">{localized("Back to range analysis","レンジ分析に戻る")}</a></div>
   <section className="account-card account-auth" aria-label={localized("Google account","Googleアカウント")}>
    {account.ready?user?<p>{localized("Signed in with Google","Googleでログイン中")} · <span translate="no">{user.email}</span></p>:<>
     <p>{localized("On-demand generation requires your Google account. After signing in, open the On-demand postflop link in range analysis to return here. No guest data is uploaded by this page.","オンデマンド生成にはGoogleアカウントが必要です。ログイン後はレンジ分析の「オンデマンド・ポストフロップ」リンクから戻れます。このページからゲストデータをアップロードすることはありません。")}</p>
     <button className="account-primary" disabled={busy||!account.available} onClick={()=>void signIn()}>{localized("Sign in with Google","Googleでログイン")}</button>
    </>:<p role="status">{localized("Checking Google account…","Googleアカウントを確認中…")}</p>}
    {account.ready&&!account.available&&<p role="status">{localized("Google sign-in is unavailable or offline in this environment.","この環境ではGoogleログインが利用できないか、オフラインです。")}</p>}
    {account.error&&<p role="alert">{localized("The account connection could not be verified. Generation remains protected by the server session.","アカウント接続を確認できませんでした。生成には引き続きサーバー側のログイン確認が必要です。")}</p>}
    {error&&<p role="alert">{error}</p>}
    <button className="account-secondary" disabled={busy||!account.ready} onClick={()=>void refreshAccount()}>{localized("Refresh account connection","アカウント接続を再確認")}</button>
   </section>
  </header>
  <Aiv2OnDemandWorkspace/>
 </>;
}
