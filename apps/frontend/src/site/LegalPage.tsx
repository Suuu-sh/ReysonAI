import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { BrandIcon } from "../components/BrandIcon.tsx";
import { LOCALES } from "../locale-metadata.ts";
import { appEntryHref } from "../route.ts";
import type { SiteLocale } from "./content.ts";
import { LEGAL_COPY, type LegalDocument } from "./legal-content.ts";
import { SITE_COPY } from "./locales.ts";
import "./legal.css";

export function LegalPage({ document, locale, onLocaleChange }: { document: LegalDocument; locale: SiteLocale; onLocaleChange: (locale: SiteLocale) => void }) {
  const c = LEGAL_COPY[locale];
  const page = c[document];
  const site = SITE_COPY[locale];
  const appHref = appEntryHref(typeof window === "undefined" ? "" : window.location.hostname);
  return <div className={`site site-${locale} site-legal`}>
    <a className="site-skip" href="#site-main">{site.common.skip}</a>
    <header className="site-header"><div className="site-header-inner">
      <a className="site-brand" href="/" aria-label={site.common.home}><BrandIcon size={24} /><span>Reyson<b>AI</b></span></a>
      <div className="site-header-actions">
        <select className="site-lang" value={locale} onChange={event => onLocaleChange(event.target.value as SiteLocale)} aria-label={site.common.languageLabel}>
          {LOCALES.map(option => <option key={option.value} value={option.value} lang={option.value}>{option.label}</option>)}
        </select>
        <a className="site-button is-small" href={appHref}>{site.common.open}<ArrowRight size={15} aria-hidden="true" /></a>
      </div>
    </div></header>
    <main id="site-main" className="site-legal-main">
      <a className="site-legal-back" href="/"><ArrowLeft size={16} aria-hidden="true" />{c.back}</a>
      <div className="site-legal-heading"><span>{site.footer.legal}</span><h1>{page.title}</h1><p>{page.lead}</p><small>{c.updated}</small></div>
      <aside className="site-legal-notice" aria-label={c.status}><strong>{c.status}</strong><p>{c.notice}</p></aside>
      <nav className="site-legal-toc" aria-label={page.title}>{page.sections.map((section, index) => <a key={section.title} href={`#legal-${index + 1}`}>{section.title}</a>)}</nav>
      <article className="site-legal-document" aria-label={page.title}>{page.sections.map((section, index) => <section key={section.title} id={`legal-${index + 1}`}><h2>{section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>)}</article>
      {document === "privacy" && <div className="site-legal-providers"><a href="https://policies.google.com/privacy">Google · {site.footer.privacy}</a><a href="https://www.cloudflare.com/privacypolicy/">Cloudflare · {site.footer.privacy}</a></div>}
    </main>
    <footer className="site-legal-footer"><a href="mailto:yisshiki39@gmail.com">yisshiki39@gmail.com</a><a href="/terms" aria-current={document === "terms" ? "page" : undefined}>{site.footer.terms}</a><a href="/privacy" aria-current={document === "privacy" ? "page" : undefined}>{site.footer.privacy}</a><span>© {new Date().getFullYear()} ReysonAI</span></footer>
  </div>;
}
