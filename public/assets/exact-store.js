/* Store controls shared by the published page and its preview. */
function navigationValues(self,st,v) {
  const on=c=>c?"true":"false",show=c=>c?"":"hide";
  let i;
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
}

class StoreDesign extends window.DesignController {
  componentDidMount() {
    window.addEventListener('pageshow', event => {
      if (event.persisted) this.setState({pending:false});
    });
  }

  async beginCheckout(rank, username) {
    if (this.state.pending || !rank || !username) return;
    this.setState({pending:true, error:''});
    try {
      const response = await fetch('/api/store/checkout', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({rank,username})
      });
      const data = await response.json();
      if (response.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      const message = data.error === 'checkout_unconfigured'
        ? 'Tebex checkout is awaiting store configuration.'
        : 'Tebex could not open your basket. Check the username and try again.';
      this.setState({pending:false,error:message});
    } catch {
      this.setState({pending:false,error:'Could not reach checkout. Please try again.'});
    }
  }
  renderVals() {
    var self = this;
    var st = Object.assign({ menu: '', name: '', who: '', avid: false, dev: false }, this.state || {});
    var show = function (c) { return c ? '' : 'hide'; };
    var v = {};
    navigationValues(self,st,v);




    var clean = String(st.name || '').trim();
    v.name = st.name;
    v.setName = function (e) { self.setState({ name: e.target.value }); };
    v.confirm = function () { if (/^[^\s\p{C}]{1,32}$/u.test(clean)) self.setState({who:clean,error:''});
      else self.setState({error:'Enter your exact Minecraft username without spaces.'}); };
    v.logout = function () { if (!st.pending) self.setState({ who: '', error:'' }); };
    v.who = st.who;
    v.initial = st.who ? st.who.charAt(0).toUpperCase() : '?';
    v.loginShow = show(!st.who);
    v.signedShow = show(!!st.who);
    v.chatName = st.who || clean || 'YourName';
    v.togAvid = function () { if (!st.pending) self.setState({ avid: !st.avid, dev:false, error:'' }); };
    v.togDev = function () { if (!st.pending) self.setState({ dev: !st.dev, avid:false, error:'' }); };
    v.avidIn = show(st.avid);
    v.avidOut = show(!st.avid);
    v.devIn = show(st.dev);
    v.devOut = show(!st.dev);
    v.lineAvid = show(st.avid);
    v.lineDev = show(st.dev);
    v.emptyShow = show(!st.avid && !st.dev);
    var sum = (st.avid ? 5 : 0) + (st.dev ? 10 : 0);
    v.total = document.documentElement.hasAttribute('data-preview-root') ? '$' + sum.toFixed(2) + ' USD' : 'See Tebex';
    const rank = st.avid ? 'avid' : (st.dev ? 'devotee' : '');
    const rankLabel = st.avid ? 'Avid' : 'Devotee';
    document.querySelector('[data-tebex-checkout]').disabled = !rank || !st.who || !!st.pending;
    v.checkout = () => self.beginCheckout(rank,st.who);
    v.hint = st.error || (!st.who ? 'Confirm your Minecraft username.' : !rank ? 'Choose a rank above.' :
      st.pending ? 'Opening Tebex...' : rankLabel + ' for ' + st.who + '. Review the price on Tebex.');
    return v;
  }
}
window.EnthusiaDesign.mount(StoreDesign, {});

if (!document.documentElement.hasAttribute('data-preview-root')) {
  for (const node of document.querySelectorAll('main span')) if (/^\$[0-9]/.test(node.textContent.trim())) node.textContent='See Tebex';
}
