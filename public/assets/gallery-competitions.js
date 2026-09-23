(() => {
  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function loadStyles() {
    if (document.querySelector('link[data-competition-gallery-style]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "assets/gallery-competitions.css?v=1";
    link.dataset.competitionGalleryStyle = "true";
    document.head.append(link);
  }

  function promotionCard(item) {
    const card = el("article", "competition-gallery-card card");
    const imageLink = document.createElement("a");
    imageLink.href = item.competitionUrl;
    imageLink.className = "competition-gallery-image-link";
    const image = document.createElement("img");
    image.src = item.imageUrl;
    image.alt = `${item.submissionTitle || item.title} competition entry`;
    image.loading = "lazy";
    image.decoding = "async";
    imageLink.append(image);

    const copy = el("div", "competition-gallery-copy");
    copy.append(
      el("p", "eyebrow", item.competitionTitle || "Competition"),
      el("h3", "", item.title || item.submissionTitle || "Competition entry")
    );
    if (item.caption) copy.append(el("p", "competition-gallery-caption", item.caption));
    const meta = el("p", "competition-gallery-meta", `By ${item.credit || "Enthusia player"}`);
    const link = document.createElement("a");
    link.href = item.competitionUrl;
    link.textContent = "View competition";
    link.className = "competition-gallery-link";
    copy.append(meta, link);
    card.append(imageLink, copy);
    return card;
  }

  async function init() {
    const slideshow = document.querySelector("#screenshotSlideshow");
    if (!slideshow) return;
    let payload;
    try {
      const response = await fetch("/api/gallery/competition-promotions", {
        headers: { accept: "application/json" },
        credentials: "same-origin"
      });
      if (!response.ok) return;
      payload = await response.json();
    } catch {
      return;
    }
    const promotions = Array.isArray(payload?.promotions) ? payload.promotions : [];
    if (!promotions.length) return;

    loadStyles();
    const section = el("section", "page-section compact competition-gallery-section");
    section.setAttribute("aria-labelledby", "competition-gallery-title");
    const container = el("div", "container stack-lg");
    const heading = el("div", "competition-gallery-heading");
    heading.append(
      el("p", "eyebrow", "Competition highlights"),
      el("h2", "", "Featured community entries"),
      el("p", "page-lead", "Selected entries promoted from completed Enthusia competitions.")
    );
    heading.querySelector("h2").id = "competition-gallery-title";
    const grid = el("div", "competition-gallery-grid");
    promotions.forEach((promotion) => grid.append(promotionCard(promotion)));
    container.append(heading, grid);
    section.append(container);
    slideshow.closest("section")?.after(section);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
