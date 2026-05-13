/**
 * Shared app-level navigation used above page-specific builders/sheets.
 * Keep global destinations here so page chrome does not drift over time.
 */

function enableFloatingTopNav(topbar) {
  if (!topbar || topbar.dataset.appFloatingNav === "true") return;
  topbar.dataset.appFloatingNav = "true";

  let lastY = window.scrollY || 0;
  let downDistance = 0;
  let upDistance = 0;
  let isPointerInside = false;
  let suppressUntil = 0;
  let frameRequested = false;

  const setCollapsed = (collapsed) => {
    const shouldCollapse = !!collapsed;
    if (topbar.classList.contains("app-topbar--collapsed") === shouldCollapse) return;
    topbar.classList.toggle("app-topbar--collapsed", shouldCollapse);
    suppressUntil = window.performance.now() + 220;
  };

  const setExpandedIntent = (expanded) => {
    topbar.classList.toggle("app-topbar--expanded", !!expanded);
    if (expanded) setCollapsed(false);
  };

  const updateFromScroll = () => {
    const currentY = Math.max(0, window.scrollY || 0);
    const delta = currentY - lastY;

    if (window.performance.now() < suppressUntil) {
      lastY = currentY;
      return;
    }

    if (currentY < 48 || isPointerInside || topbar.matches(":focus-within")) {
      setCollapsed(false);
      downDistance = 0;
      upDistance = 0;
    } else if (Math.abs(delta) >= 3) {
      if (delta > 0) {
        downDistance += delta;
        upDistance = 0;
        if (downDistance >= 28 && currentY > 140) {
          setCollapsed(true);
          downDistance = 0;
        }
      } else {
        upDistance += Math.abs(delta);
        downDistance = 0;
        if (upDistance >= 56) {
          setCollapsed(false);
          upDistance = 0;
        }
      }
    }

    lastY = currentY;
  };

  const requestScrollUpdate = () => {
    if (frameRequested) return;
    frameRequested = true;
    window.requestAnimationFrame(() => {
      frameRequested = false;
      updateFromScroll();
    });
  };

  topbar.addEventListener("mouseenter", () => {
    isPointerInside = true;
    setExpandedIntent(true);
  });
  topbar.addEventListener("mouseleave", () => {
    isPointerInside = false;
    setExpandedIntent(false);
    updateFromScroll();
  });
  topbar.addEventListener("focusin", () => setExpandedIntent(true));
  topbar.addEventListener("focusout", () => {
    window.setTimeout(() => {
      setExpandedIntent(topbar.matches(":focus-within"));
      updateFromScroll();
    }, 0);
  });
  window.addEventListener("scroll", requestScrollUpdate, { passive: true });
}

export function ensureAppTopNav({
  mount,
  active = "",
  requestedUid = null,
  isGM = false,
  onSignOut = null,
} = {}) {
  const topbar = mount || document.querySelector(".topbar");
  if (!topbar) return {};

  topbar.classList.add("app-topbar");
  enableFloatingTopNav(topbar);
  topbar.innerHTML = "";

  const mainRow = document.createElement("div");
  mainRow.className = "app-topbar-main";

  const brand = document.createElement("a");
  brand.className = "app-brand";
  brand.href = "/characters.html";
  brand.textContent = "Game X";
  mainRow.append(brand);

  const nav = document.createElement("nav");
  nav.className = "app-nav";
  nav.setAttribute("aria-label", "Main navigation");

  const charactersHref = requestedUid && isGM
    ? `/characters.html?uid=${encodeURIComponent(requestedUid)}`
    : "/characters.html";

  const addLink = ({ key, label, href }) => {
    const link = document.createElement("a");
    link.className = "app-nav-item";
    link.href = href;
    link.textContent = label;
    if (active === key) link.setAttribute("aria-current", "page");
    nav.append(link);
    return link;
  };

  const charactersLink = addLink({ key: "characters", label: "Characters", href: charactersHref });
  const profileLink = addLink({ key: "profile", label: "Profile", href: "/characters.html#profileCard" });

  const campaigns = document.createElement("button");
  campaigns.className = "app-nav-item";
  campaigns.type = "button";
  campaigns.disabled = true;
  campaigns.title = "Campaigns are not available yet.";
  campaigns.textContent = "Campaigns";
  nav.append(campaigns);

  let gmUsersLink = null;
  if (isGM) {
    gmUsersLink = addLink({ key: "gm-users", label: "GM Users", href: "/gm_users.html" });
  }

  const signOut = document.createElement("button");
  signOut.id = "signOutBtn";
  signOut.className = "app-nav-item";
  signOut.type = "button";
  signOut.textContent = "Sign out";
  signOut.style.display = "none";
  if (typeof onSignOut === "function") {
    signOut.addEventListener("click", onSignOut);
  }
  nav.append(signOut);

  mainRow.append(nav);

  const builderNavSlot = document.createElement("div");
  builderNavSlot.className = "app-builder-nav-slot";
  builderNavSlot.id = "appBuilderNavSlot";

  topbar.append(mainRow, builderNavSlot);
  return { topbar, mainRow, nav, builderNavSlot, charactersLink, profileLink, gmUsersLink, signOut };
}
