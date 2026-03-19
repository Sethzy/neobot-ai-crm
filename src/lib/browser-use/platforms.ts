/**
 * Shared platform metadata for authenticated browser flows.
 * @module lib/browser-use/platforms
 */

export interface BrowserPlatformConfig {
  slug: string;
  label: string;
  startUrl?: string;
}

const platformConfigs: Record<string, BrowserPlatformConfig> = {
  propnex: {
    slug: "propnex",
    label: "PropNex ProMap",
    startUrl: "https://promap.propnex.com/login",
  },
  propertyguru: {
    slug: "propertyguru",
    label: "PropertyGuru",
    startUrl: "https://www.agentofferings.propertyguru.com.sg/login/",
  },
  era: {
    slug: "era",
    label: "ERA",
    startUrl: "https://vip.era.com.sg/agent/login",
  },
  ura: {
    slug: "ura",
    label: "URA REALIS",
    startUrl: "https://www.ura.gov.sg/realis/login",
  },
  hdb: {
    slug: "hdb",
    label: "HDB",
    startUrl: "https://homes.hdb.gov.sg/home/login",
  },
  srx: {
    slug: "srx",
    label: "SRX",
    startUrl: "https://www.srx.com.sg/login",
  },
};

/**
 * Resolves normalized platform metadata for auth flows.
 */
export function getBrowserPlatformConfig(platform: string): BrowserPlatformConfig {
  const slug = platform.trim().toLowerCase();
  return platformConfigs[slug] ?? {
    slug,
    label: slug,
  };
}
