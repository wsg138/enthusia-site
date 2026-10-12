/* Preview only: logic of the "News" mockup, run by preview/mock.js. */
class Component extends DCLogic {
  renderVals() {
    var self = this;
    var st = Object.assign({ menu: '', post: 0, cat: 'All' }, this.state || {});
    var on = function (c) { return c ? 'true' : 'false'; };
    var show = function (c) { return c ? '' : 'hide'; };
    var v = {};
    var i;
    var menus = ['Play', 'World', 'Comm', 'News'];
    v.mobOpen = on(!!st.mob);
    v.mobCls = st.mob ? 'open' : '';
    v.togMob = function () { self.setState({ mob: !st.mob }); };
    for (i = 0; i < menus.length; i++) {
      (function (name) {
        v['m' + name + 'Open'] = on(st.menu === name);
        v['m' + name + 'Show'] = show(st.menu === name);
        v['tog' + name] = function () { self.setState({ menu: st.menu === name ? '' : name }); };
      })(menus[i]);
    }
    var mdInline = function (s) {
      var out = [];
      var re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(~~[^~]+~~)|(\|\|[^|]+\|\|)|(\*[^*]+\*)|(_[^_]+_)|(\[[^\]]+\]\([^)]+\))/;
      var guard = 0;
      while (s.length && guard < 400) {
        guard++;
        var m = re.exec(s);
        if (!m) { out.push({ cls: 'md-t', text: s }); break; }
        if (m.index > 0) { out.push({ cls: 'md-t', text: s.slice(0, m.index) }); }
        var tok = m[0];
        if (m[1]) { out.push({ cls: 'md-c', text: tok.slice(1, -1) }); }
        else if (m[2]) { out.push({ cls: 'md-b', text: tok.slice(2, -2) }); }
        else if (m[3]) { out.push({ cls: 'md-u', text: tok.slice(2, -2) }); }
        else if (m[4]) { out.push({ cls: 'md-s', text: tok.slice(2, -2) }); }
        else if (m[5]) { out.push({ cls: 'md-sp', text: tok.slice(2, -2) }); }
        else if (m[6] || m[7]) { out.push({ cls: 'md-i', text: tok.slice(1, -1) }); }
        else { out.push({ cls: 'md-a', text: tok.slice(1, tok.indexOf('](')) }); }
        s = s.slice(m.index + tok.length);
      }
      if (!out.length) { out.push({ cls: 'md-t', text: '' }); }
      return out;
    };
    var mdBlocks = function (src) {
      var lines = String(src || '').split('\n');
      var out = [];
      var code = false;
      var j;
      for (j = 0; j < lines.length && j < 300; j++) {
        var ln = lines[j];
        if (ln.trim().slice(0, 3) === '```') { code = !code; continue; }
        if (code) { out.push({ cls: 'md-pre', segs: [{ cls: 'md-t', text: ln || ' ' }] }); continue; }
        if (ln.trim() === '') { out.push({ cls: 'md-gap', segs: [{ cls: 'md-t', text: '' }] }); continue; }
        if (ln.slice(0, 4) === '### ') { out.push({ cls: 'md-h3', segs: mdInline(ln.slice(4)) }); continue; }
        if (ln.slice(0, 3) === '## ') { out.push({ cls: 'md-h2', segs: mdInline(ln.slice(3)) }); continue; }
        if (ln.slice(0, 2) === '# ') { out.push({ cls: 'md-h1', segs: mdInline(ln.slice(2)) }); continue; }
        if (ln.slice(0, 3) === '-# ') { out.push({ cls: 'md-sub', segs: mdInline(ln.slice(3)) }); continue; }
        if (ln.slice(0, 2) === '> ') { out.push({ cls: 'md-quote', segs: mdInline(ln.slice(2)) }); continue; }
        if (ln.slice(0, 2) === '- ' || ln.slice(0, 2) === '* ') { out.push({ cls: 'md-li', segs: mdInline(ln.slice(2)) }); continue; }
        if (/^\d+\. /.test(ln)) { out.push({ cls: 'md-ol', segs: mdInline(ln) }); continue; }
        out.push({ cls: 'md-p', segs: mdInline(ln) });
      }
      return out;
    };
    var posts = [{"title": "Chapter 2 is live", "cat": "Announcement", "date": "October 2, 2026", "src": "# Chapter 2 is live\nChapter 2 launched on **October 2, 2026**. Here is what is happening first.\n\n## Competitions\n- **Build Competition** - the theme is *Halloween*. Entries open soon. The day will be announced on Discord.\n- Voting opens **October 14** and results are published **October 21**.\n- The **Mapart Competition** starts on **October 24**, with voting from **November 8**.\n\n> Raiding and open PvP are part of Enthusia. Read the rules before you log in.\n\n-# Posted by Fain"}, {"title": "Changelog - [version or date]", "cat": "Changelog", "date": "[date]", "src": "## Added\n- [new feature and where to find it]\n\n## Changed\n- `[plugin]` [what changed and why]\n- ~~[old behaviour]~~ is now __[new behaviour]__\n\n## Fixed\n- [bug that was fixed]\n\n-# [who posted]"}, {"title": "Build Competition: entries open soon", "cat": "Event", "date": "October 2, 2026", "src": "# Build Competition\nThe theme is **Halloween**.\n\n1. Submissions open **soon**: the day will be announced here and on Discord\n2. Voting opens **October 14**\n3. Results are published **October 21**\n\nYou need to sign in with Discord and have a Minecraft account linked before you can submit or vote.\n\n[Open the competition page](Competitions)"}];
    var tagCls = { Announcement: 'tag-red', Changelog: 'tag-dark', Event: 'tag-gold' };
    var kinds = ['All', 'Announcement', 'Changelog', 'Event'];
    for (i = 0; i < posts.length; i++) {
      (function (n) {
        v['pp' + n] = on(st.post === n);
        v['pc' + n] = show(st.cat === 'All' || posts[n].cat === st.cat);
        v['pickP' + n] = function () { self.setState({ post: n }); };
      })(i);
    }
    for (i = 0; i < kinds.length; i++) {
      (function (name) {
        v['k' + name] = on(st.cat === name);
        v['pickK' + name] = function () {
          var first = st.post;
          var j;
          if (name !== 'All' && posts[st.post].cat !== name) {
            for (j = 0; j < posts.length; j++) { if (posts[j].cat === name) { first = j; break; } }
          }
          self.setState({ cat: name, post: first });
        };
      })(kinds[i]);
    }
    var cur = posts[st.post];
    v.postTitle = cur.title;
    v.postCat = cur.cat;
    v.postDate = cur.date;
    v.postTag = tagCls[cur.cat];
    v.blocks = mdBlocks(cur.src);
    return v;
  }
}
EnthusiaMock.mount(Component, {});
