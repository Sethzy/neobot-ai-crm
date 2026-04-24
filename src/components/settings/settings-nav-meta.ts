/**
 * Shared metadata helpers for settings navigation.
 * @module components/settings/settings-nav-meta
 */
export interface SettingsNavItem {
  label: string;
  href: string;
}

export interface SettingsNavSection {
  label: string;
  items: readonly SettingsNavItem[];
}

/**
 * Returns whether the current pathname matches a settings nav item or one of its descendants.
 */
export function isSettingsNavItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Resolves the page title shown in the mobile settings nav trigger.
 */
export function resolveSettingsCurrentTitle(
  pathname: string,
  sections: readonly SettingsNavSection[],
) {
  for (const section of sections) {
    for (const item of section.items) {
      if (isSettingsNavItemActive(pathname, item.href)) {
        return item.label;
      }
    }
  }

  return "Settings";
}
