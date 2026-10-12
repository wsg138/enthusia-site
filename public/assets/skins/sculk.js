/*
 * Enthusia SMP - sculk skin for the home page.
 *
 * Off by default. enthusia.js loads this file (and sculk.css) only when the page address ends in
 * ?skin=sculk, or when the <html> tag carries data-skin="sculk". To run the skin for everyone during
 * the Halloween season, add that attribute to index.html; remove it to turn the skin off again.
 *
 * The script only adds decoration: growth pictures in page corners, one announcement strip under the
 * hero, the Halloween hero screenshots, and a cyan tint on the last letters of the title.
 */
(function () {
  "use strict";

  var doc = document;
  var hero = doc.querySelector(".hero-vars[data-slide-auto]");
  if (!hero || doc.documentElement.classList.contains("skin-sculk")) return;
  doc.documentElement.classList.add("skin-sculk");

  function growth(kind, position, flip, delay) {
    var node = doc.createElement("span");
    node.className = "sk sk-" + kind + (flip ? " " + flip : "");
    node.setAttribute("aria-hidden", "true");
    node.style.cssText = position + "; --d: -" + (delay || 0) + "s";
    return node;
  }

  /* Growth behind the content of a card or band. */
  function behind(selector, pieces) {
    Array.prototype.forEach.call(doc.querySelectorAll(selector), function (host) {
      host.classList.add("sk-on");
      pieces.forEach(function (piece) { host.prepend(growth.apply(null, piece)); });
    });
  }

  /* Growth on top of a picture or a card corner that holds no text. */
  function onTop(selector, piece, before) {
    Array.prototype.forEach.call(doc.querySelectorAll(selector), function (host) {
      host.classList.add("sk-host");
      var node = growth.apply(null, piece);
      var anchor = before ? host.querySelector(before) : null;
      if (anchor) host.insertBefore(node, anchor); else host.append(node);
    });
  }

  /* Hero: Halloween screenshots, sculk hanging from the header, growth in both lower corners, rising pixels. */
  var slides = [
    ["assets/screenshots/slide-06.webp", "Open Beta Halloween spawn"],
    ["assets/screenshots/slide-05.webp", "Open Beta KOTH arena"],
    ["assets/screenshots/slide-03.webp", "Open Beta end fight"]
  ];
  Array.prototype.forEach.call(hero.querySelectorAll('[data-slide="hero"]'), function (image, index) {
    if (!slides[index]) return;
    image.src = slides[index][0];
    image.setAttribute("data-label", slides[index][1]);
    if (image.classList.contains("show")) {
      Array.prototype.forEach.call(doc.querySelectorAll('[data-slide-label="hero"]'), function (label) { label.textContent = slides[index][1]; });
    }
  });
  Array.prototype.forEach.call(hero.querySelectorAll('[data-slide-to="hero"]'), function (dot, index) {
    if (slides[index]) dot.setAttribute("aria-label", "Show " + slides[index][1]);
  });
  hero.append(growth("drip", "top: 0", "", 0.5), growth("corner", "left: 0; bottom: 0", "", 1.2), growth("corner-b", "right: 0; bottom: 0", "fx", 2.6));
  [[5, 150, 0], [13, 220, 3.1], [22, 70, 5.2], [80, 60, 2.2], [89, 170, 6.1], [95, 110, 3.8]].forEach(function (soul) {
    var pixel = doc.createElement("span");
    pixel.className = "soul";
    pixel.setAttribute("aria-hidden", "true");
    pixel.style.cssText = "left: " + soul[0] + "%; bottom: " + soul[1] + "px; animation-delay: -" + soul[2] + "s";
    hero.append(pixel);
  });

  var title = doc.querySelector("#hero-title .t-hero");
  if (title && title.textContent === "ENTHUSIA") {
    var tail = doc.createElement("span");
    tail.className = "sk-txt";
    tail.textContent = "IA";
    title.textContent = "ENTHUS";
    title.append(tail);
  }
  var splash = doc.querySelector(".splash");
  if (splash) splash.textContent = "Sculk or treat!";

  /* Announcement strip under the hero, fully overgrown. */
  var strip = doc.createElement("section");
  strip.className = "s-cream sk-on sk-strip";
  strip.setAttribute("aria-label", "The sculk has reached spawn");
  var wrap = doc.createElement("div");
  wrap.className = "wrap";
  var card = doc.createElement("div");
  card.className = "tip sculked sk-on";
  var icon = doc.createElement("span");
  icon.className = "sk-icon";
  icon.setAttribute("aria-hidden", "true");
  var words = doc.createElement("div");
  words.className = "sk-strip-text";
  var kicker = doc.createElement("p");
  kicker.textContent = "THE SCULK HAS REACHED SPAWN";
  var line = doc.createElement("p");
  line.textContent = "Sculk has overgrown the Chapter 2 spawn. The Halloween Build Competition opens soon.";
  words.append(kicker, line);
  var button = doc.createElement("a");
  button.className = "btn btn-gold";
  button.href = (window.ENTHUSIA && window.ENTHUSIA.discordInvite) || "https://discord.gg/5ccgDCmNSc";
  button.target = "_blank";
  button.rel = "noopener";
  button.textContent = "Ask in Discord";
  card.append(icon, words, button);
  wrap.append(card);
  strip.append(growth("drip", "top: 0", "", 2), wrap);
  hero.insertAdjacentElement("afterend", strip);

  /* The rest of the page. */
  behind("#video .tip", [["corner-s", "right: 0; top: 0", "fxy", 3]]);
  onTop('[aria-labelledby="identity-title"] .frame:not(.tile)', ["corner-m", "left: 0; bottom: 0", "", 2]);
  behind('[aria-labelledby="identity-title"] .tip', [["corner-s", "right: 0; top: 0", "fxy", 4]]);
  behind("#join", [["corner", "right: 0; bottom: 0", "fx", 1.5]]);
  onTop("#join article.panel:first-of-type", ["corner-s", "right: 0; top: 0", "fxy", 2.2]);
  onTop("#gallery .frame", ["corner-m", "right: 0; bottom: 0", "fx", 3.3], "button");
  behind("#leaderboards .tip.fret", [["corner-s", "right: 0; top: 0", "fxy", 2.4], ["corner-s", "left: 0; bottom: 0", "", 0.4]]);
  behind('[aria-labelledby="staff-title"]', [["corner", "left: 0; bottom: 0", "", 3]]);
  behind('[aria-labelledby="faq-title"]', [["creep", "bottom: 0", "", 1.8]]);
  behind(".site-foot", [["drip", "top: 6px", "", 0.2]]);
})();
