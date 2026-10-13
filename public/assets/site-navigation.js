function trimTrailingSlashes(value) {
  const path = String(value || "");
  let end = path.length;
  while (end > 0 && path.charAt(end - 1) === "/") end -= 1;
  return path.slice(0, end) || "/";
}

function localPath(link) {
  try {
    const target = new URL(link.href, window.location.href);
    return target.origin === window.location.origin ? trimTrailingSlashes(target.pathname) : null;
  } catch {
    return null;
  }
}

function internalLink(nav, path, label) {
  const matches = [...nav.querySelectorAll("a[href]")].filter((link) => localPath(link) === path);
  const link = matches.shift() ?? document.createElement("a");
  matches.forEach((duplicate) => duplicate.remove());
  link.href = path;
  link.textContent = label;
  return link;
}

function communityMenu(nav) {
  let dropdown = nav.querySelector(".nav-dropdown");
  if (!dropdown) {
    dropdown = document.createElement("div");
    dropdown.className = "nav-dropdown";
    const account = nav.querySelector("[data-site-account]");
    nav.insertBefore(dropdown, account ?? null);
  }

  let trigger = dropdown.querySelector(".nav-drop-trigger");
  if (!trigger) {
    trigger = document.createElement("button");
    trigger.className = "nav-drop-trigger";
    trigger.type = "button";
    trigger.textContent = "Community";
    dropdown.prepend(trigger);
  }

  let menu = dropdown.querySelector(".nav-menu");
  if (!menu) {
    menu = document.createElement("div");
    menu.className = "nav-menu";
    menu.setAttribute("aria-label", "Community links");
    dropdown.append(menu);
  }
  return { dropdown, menu, trigger };
}

function markUnifiedNavigation(nav) {
  const links = [...nav.querySelectorAll("a[href]")];
  const current = trimTrailingSlashes(window.location.pathname);
  for (const link of links) {
    const target = localPath(link);
    const active = target === current || (target?.endsWith("/competitions/index.html") && current.includes("/competitions/") && !current.includes("/admin/"));
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function markLegacyNavigation(nav,menu,trigger){
  const currentPath = trimTrailingSlashes(window.location.pathname);
  const currentSection = currentPath === "/index.html" ? "/" : currentPath;
  let activeLink = null;
  nav.querySelectorAll("a.active, a[aria-current='page']").forEach((link) => {
    link.classList.remove("active");
    link.removeAttribute("aria-current");
  });
  nav.querySelectorAll("a[href]").forEach((link) => {
    const targetPath = localPath(link);
    if (targetPath === null) return;
    const targetSection = targetPath === "/index.html" ? "/" : targetPath;
    if (targetSection === currentSection || (currentSection.startsWith("/competitions") && targetSection === "/competitions")) {
      activeLink = link;
    }
  });
  if (activeLink) {
    activeLink.classList.add("active");
    activeLink.setAttribute("aria-current", "page");
  }
  const hasActiveCommunityLink = Boolean(menu.querySelector("a.active"));
  trigger.classList.toggle("active", hasActiveCommunityLink);
  if (hasActiveCommunityLink) trigger.setAttribute("aria-current", "page");
  else trigger.removeAttribute("aria-current");
}

export function normalizeSiteNavigation() {
  const nav = document.querySelector(".site-header .nav");
  if (!nav) return;
  if (nav.closest(".site-head")) {
    markUnifiedNavigation(nav);
    return;
  }
  const { dropdown, menu, trigger } = communityMenu(nav);
  const appeal = internalLink(nav, "/appeal.html", "Appeals");
  const punishments = internalLink(nav, "/punishments.html", "Punishments");
  const market = internalLink(nav, "/market.html", "Market");
  const competition = internalLink(nav, "/competitions", "Competitions");
  const wiki = menu.querySelector("a[data-link-target='wiki']");

  nav.insertBefore(appeal, dropdown);
  menu.insertBefore(punishments, wiki ?? null);
  menu.insertBefore(market, wiki ?? null);
  menu.insertBefore(competition, wiki ?? null);

  markLegacyNavigation(nav,menu,trigger);
}

normalizeSiteNavigation();
