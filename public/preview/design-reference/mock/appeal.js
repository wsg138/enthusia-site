/* Preview only: logic of the "Appeal" mockup, run by preview/mock.js. */
function navigationValues(self,st,v) {
  const on=c=>c?"true":"false",show=c=>c?"":"hide";
  let i;
var menus = ['Play', 'World', 'Comm', 'News'];
for (i = 0; i < menus.length; i++) {
      (function (name) {
        v['m' + name + 'Open'] = on(st.menu === name);
        v['m' + name + 'Show'] = show(st.menu === name);
        v['tog' + name] = function () { self.setState({ menu: st.menu === name ? '' : name }); };
      })(menus[i]);
    }
v.mobOpen = on(!!st.mob);
v.mobCls = st.mob ? 'open' : '';
v.togMob = function () { self.setState({ mob: !st.mob }); };
}

class Component extends DCLogic {
  renderVals() {
    var self = this;
    var st = Object.assign({ menu: '' }, this.state || {});
    var on = function (c) { return c ? 'true' : 'false'; };
    var show = function (c) { return c ? '' : 'hide'; };
    var v = {};
    var i;
    navigationValues(self,st,v);




    var view = st.view || 'hist';
    v.vHist = on(view === 'hist');
    v.vNew = on(view === 'new');
    v.histShow = show(view === 'hist');
    v.newShow = show(view === 'new');
    v.goHist = function () { self.setState({ view: 'hist' }); };
    v.goNew = function () { self.setState({ view: 'new' }); };
    var replied = !!st.replied;
    v.needShow = show(!replied);
    v.sentShow = show(replied);
    v.reply = st.reply || '';
    v.replyText = st.replyText || '';
    v.setReply = function (e) { self.setState({ reply: e.target.value }); };
    v.sendReply = function () {
      var text = (st.reply || '').replace(/^\s+|\s+$/g, '');
      if (text.length < 3) { return; }
      self.setState({ replied: true, replyText: text });
    };
    var answers = st.answers || {};
    for (i = 0; i < 5; i++) {
      (function (n) {
        var text = answers[n] || '';
        v['a' + n] = text;
        v['c' + n] = String(text.length);
        v['set' + n] = function (e) {
          var next = Object.assign({}, answers);
          next[n] = e.target.value;
          self.setState({ answers: next, done: false });
        };
      })(i);
    }
    v.doneShow = show(!!st.done);
    v.send = function () { self.setState({ done: true }); };
    return v;
  }
}
EnthusiaMock.mount(Component, {});
