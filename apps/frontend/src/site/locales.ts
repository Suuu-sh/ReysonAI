import { en, type SiteCopy, type SiteLocale } from "./content";
import { ja } from "./content-ja";
import { zh } from "./content-zh";
import { es } from "./content-es";

export const SITE_COPY: Record<SiteLocale, SiteCopy> = { en, ja, "zh-CN": zh, es };
