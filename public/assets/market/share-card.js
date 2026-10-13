export function loadMarketShareImage(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }
export function drawMarketShareCard(w, {gold,loadImage=loadMarketShareImage,range,sl,preview}) {
    var c = document.createElement("canvas"), W = 1200, H = 630;
    c.width = W; c.height = H;
    var x = c.getContext("2d");
    x.imageSmoothingEnabled = false;
    var font = function (px) { return px + 'px "Minecraft", "Courier New", monospace'; };
    var ready = document.fonts && document.fonts.load ? Promise.all([document.fonts.load(font(32)), document.fonts.load("bold " + font(32))]) : Promise.resolve();
    return ready.then(function () {
      return Promise.all([preview?loadImage("https://minotar.net/helm/" + encodeURIComponent(w.name) + "/128"):Promise.resolve(null), loadImage(new URL("../ui/logo-256.png",import.meta.url).href)]);
    }).then(function (imgs) {
      x.fillStyle = "#c0261d"; x.fillRect(0, 0, W, H);
      x.fillStyle = "#4a0b08"; x.fillRect(0, 0, W, 12); x.fillRect(0, H - 12, W, 12); x.fillRect(0, 0, 12, H); x.fillRect(W - 12, 0, 12, H);
      x.fillStyle = "#ffcf1f"; x.fillRect(24, 24, W - 48, 8); x.fillRect(24, H - 32, W - 48, 8); x.fillRect(24, 24, 8, H - 48); x.fillRect(W - 32, 24, 8, H - 48);
      // fretwork corners
      [[44, 44, 1, 1], [W - 44, 44, -1, 1], [44, H - 44, 1, -1], [W - 44, H - 44, -1, -1]].forEach(function (k) {
        x.fillStyle = "#ffcf1f";
        x.fillRect(k[0] + (k[2] < 0 ? -40 : 0), k[1] + (k[3] < 0 ? -8 : 0), 40, 8);
        x.fillRect(k[0] + (k[2] < 0 ? -8 : 0), k[1] + (k[3] < 0 ? -40 : 0), 8, 40);
        x.fillRect(k[0] + k[2] * 16 + (k[2] < 0 ? -8 : 0), k[1] + k[3] * 16 + (k[3] < 0 ? -8 : 0), 8, 8);
      });
      x.fillStyle = "#a51b16"; x.fillRect(80, 150, W - 160, 380);
      x.textBaseline = "top";
      function text(t, px, color, X, Y, shadow) {
        x.font = font(px);
        if (shadow) { x.fillStyle = shadow; x.fillText(t, X + px / 8, Y + px / 8); }
        x.fillStyle = color; x.fillText(t, X, Y);
      }
      if (imgs[1]) x.drawImage(imgs[1], 80, 56, 72, 72);
      text("STALL OF THE WEEK", 48, "#ffdb2e", 172, 62, "#6b0f0b");
      x.font = font(24);
      text(range(-1), 24, "#ffe9a8", W - 80 - x.measureText(range(-1)).width, 80);
      x.fillStyle = "#4a0b08"; x.fillRect(112, 190, 200, 200);
      if (imgs[0]) x.drawImage(imgs[0], 120, 198, 184, 184);
      text(w.name, 56, "#ffdb2e", 352, 196, "#6b0f0b");
      text(sl(w.name) + " at the Enthusia Market", 24, "#fff6e0", 352, 270);
      text(gold(w.gold) + " raw gold earned", 40, "#ffffff", 352, 318, "#6b0f0b");
      text(String(w.sales??"Unavailable") + " items sold to " + (w.buyers??"Unavailable") + " players", 24, "#ffdcc8", 352, 378);
      var best = "Best sellers: " + w.best.map(function (b) { return b[0]; }).join(", ");
      text(best, 24, "#ffe9a8", 112, 440);
      text("enthusia.info/market", 24, "#ffdb2e", 112, 560);
      text("PLAY.ENTHUSIA.NET", 24, "#fff6e0", W - 112 - 17 * 15, 560);
      return c;
    });
  }
