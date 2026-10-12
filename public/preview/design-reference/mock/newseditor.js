/* Preview only: logic of the "NewsEditor" mockup, run by preview/mock.js. */
class Component extends DCLogic {
  renderVals() {
    var self = this;
    var st = Object.assign({ menu: '', draft: null, title: 'Chapter 2 is live', cat: 'Announcement', pin: true, ping: true, sent: false }, this.state || {});
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
    var DRAFT = "# Chapter 2 is live\nChapter 2 launched on **October 2, 2026**. Here is what is happening first.\n\n## Competitions\n- **Build Competition** - the theme is *Halloween*. Entries open soon. The day will be announced on Discord.\n- Voting opens **October 14** and results are published **October 21**.\n- The **Mapart Competition** starts on **October 24**.\n\n> Raiding and open PvP are part of Enthusia. Read the rules before you log in.\n\n### Changelog\n- `[plugin]` [what changed]\n- ~~[something removed]~~\n- __[something important]__\n\nHidden until hovered: ||[spoiler text]||\n-# Posted from the website - no 2,000 character limit here.";
    var draft = st.draft === null ? DRAFT : st.draft;
    var tagCls = { Announcement: 'tag-red', Changelog: 'tag-dark', Event: 'tag-gold' };
    var kinds = ['Announcement', 'Changelog', 'Event'];
    for (i = 0; i < kinds.length; i++) {
      (function (name) {
        v['c' + name] = on(st.cat === name);
        v['pickC' + name] = function () { self.setState({ cat: name }); };
      })(kinds[i]);
    }
    var wrap = function (pre, post, sample) {
      return function () {
        var s = typeof self._ss === 'number' ? self._ss : draft.length;
        var e = typeof self._se === 'number' ? self._se : draft.length;
        var sel = draft.slice(s, e) || sample;
        self._ss = null; self._se = null;
        self.setState({ draft: draft.slice(0, s) + pre + sel + post + draft.slice(e), sent: false });
      };
    };
    var line = function (prefix) {
      return function () {
        var s = typeof self._ss === 'number' ? self._ss : draft.length;
        var at = draft.lastIndexOf('\n', s - 1) + 1;
        var lead = (s === draft.length && draft.length && draft.charAt(draft.length - 1) !== '\n') ? '\n' : '';
        self._ss = null; self._se = null;
        if (lead) { self.setState({ draft: draft + lead + prefix + 'text', sent: false }); }
        else { self.setState({ draft: draft.slice(0, at) + prefix + draft.slice(at), sent: false }); }
      };
    };
    v.wrapB = wrap('**', '**', 'bold text');
    v.wrapI = wrap('*', '*', 'italic text');
    v.wrapU = wrap('__', '__', 'underlined text');
    v.wrapS = wrap('~~', '~~', 'struck text');
    v.wrapC = wrap('`', '`', 'code');
    v.wrapSp = wrap('||', '||', 'spoiler');
    v.lineH = line('# ');
    v.lineL = line('- ');
    v.lineQ = line('> ');
    v.lineSub = line('-# ');
    v.trackSel = function (e) { self._ss = e.target.selectionStart; self._se = e.target.selectionEnd; };
    v.setDraft = function (e) { self.setState({ draft: e.target.value, sent: false }); };
    v.setTitle = function (e) { self.setState({ title: e.target.value, sent: false }); };
    v.togPin = function () { self.setState({ pin: !st.pin }); };
    v.togPing = function () { self.setState({ ping: !st.ping }); };
    v.publish = function () { self.setState({ sent: true }); };
    v.draft = draft;
    v.title = st.title;
    v.cat = st.cat;
    v.pin = !!st.pin;
    v.ping = !!st.ping;
    v.pinShow = show(st.pin);
    v.postTag = tagCls[st.cat];
    v.sentShow = show(st.sent);
    v.sentNote = st.ping ? 'A short announcement with the link was sent to Discord.' : 'Nothing was sent to Discord.';
    v.charCount = draft.length + ' characters - Discord would cut a message off at 2,000';
    v.blocks = mdBlocks(draft);
    return v;
  }
}
EnthusiaMock.mount(Component, {});
