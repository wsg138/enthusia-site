/* Community video rotation; native DOM and text APIs only. */
(function () {
  "use strict";
  var doc = document;
  function selectOne(selector, scope) { return (scope || doc).querySelector(selector); }
  function selectAll(selector, scope) { return Array.prototype.slice.call((scope || doc).querySelectorAll(selector)); }
  function el(tag, className, content) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined && content !== null) node.textContent = String(content);
    return node;
  }
  /* ------------------------------------------------------------------ video of the week
   * One video from the community playlist takes the spot each week, changing on Monday.
   * The list lives in assets/video-rotation.js. Nothing loads from YouTube until Play is pressed,
   * apart from the preview picture.
   */
  function initVideoOfTheWeek() {
    var rotation = window.ENTHUSIA_VIDEOS;
    var frame = selectOne('[data-vid="frame"]');
    if (!frame || !rotation || !Array.isArray(rotation.videos) || !rotation.videos.length) return;

    var videos = rotation.videos;
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var start = rotation.weekZero || [2026, 8, 28];
    var offset = 0;

    function weekStart(week) { return new Date(start[0], start[1], start[2] + week * 7); }
    function dayLabel(date) { return date.getDate() + " " + months[date.getMonth()]; }
    function pick(week) { return ((week % videos.length) + videos.length) % videos.length; }
    function set(name, value) { selectAll('[data-vid="' + name + '"]').forEach(function (node) { node.textContent = value; }); }
    var WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    function nowWeek() { return Math.floor((Date.now() - weekStart(0).getTime()) / WEEK_MS); }

    function stop() {
      var player = selectOne("iframe", frame);
      if (player) player.remove();
      frame.classList.remove("is-playing");
    }

    function render() {
      stop();
      var week = nowWeek() + offset;
      var index = pick(week);
      var video = videos[index];
      var end = new Date(start[0], start[1], start[2] + week * 7 + 6);
      var poster = selectOne('[data-vid="poster"]', frame);
      if (poster) {
        poster.onerror = function () {
          poster.onerror = null;
          poster.src = "https://i.ytimg.com/vi/" + encodeURIComponent(video.id) + "/hqdefault.jpg";
        };
        poster.src = "https://i.ytimg.com/vi/" + encodeURIComponent(video.id) + "/maxresdefault.jpg";
      }
      set("kicker", offset === 0 ? "VIDEO OF THE WEEK" : offset < 0 ? "AN EARLIER WEEK" : "A COMING WEEK");
      set("title", video.title);
      set("by", video.by);
      set("length", video.length);
      set("week", "Week of " + dayLabel(weekStart(week)) + " to " + dayLabel(end) + " " + end.getFullYear());
      set("position", "Video " + (index + 1) + " of " + videos.length + " in the rotation.");
      selectAll('[data-vid="link"]').forEach(function (link) {
        link.href = "https://www.youtube.com/watch?v=" + encodeURIComponent(video.id) + (rotation.playlistId ? "&list=" + encodeURIComponent(rotation.playlistId) : "");
      });
      selectAll('[data-vid-action="now"]').forEach(function (button) { button.setAttribute("aria-pressed", offset === 0 ? "true" : "false"); });
      for (var i = 0; i < 3; i += 1) {
        var next = videos[pick(week + 1 + i)];
        set("next" + i + "-date", "From " + dayLabel(weekStart(week + 1 + i)));
        set("next" + i + "-title", next.title);
        set("next" + i + "-by", next.by);
      }
      frame.setAttribute("data-video-id", video.id);
    }

    function play() {
      var id = frame.getAttribute("data-video-id");
      if (!id || selectOne("iframe", frame)) return;
      var player = el("iframe", "vid-player");
      player.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) + "?autoplay=1&rel=0";
      player.title = "YouTube video player";
      player.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      player.setAttribute("allowfullscreen", "");
      player.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      frame.appendChild(player);
      frame.classList.add("is-playing");
    }

    doc.addEventListener("click", function (event) {
      var button = event.target.closest("[data-vid-action]");
      if (!button) return;
      var action = button.getAttribute("data-vid-action");
      if (action === "play") { play(); return; }
      if (action === "stop") { stop(); return; }
      if (action === "prev") offset -= 1;
      if (action === "next") offset += 1;
      if (action === "now") offset = 0;
      render();
    });

    render();
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", initVideoOfTheWeek); else initVideoOfTheWeek();
})();
