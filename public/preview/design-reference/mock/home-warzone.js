/* Preview only: the Home mockup logic, used here for the Warzone tile. */
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

class Component extends DCLogic {
  componentDidMount() {
    var self = this;
    var still = false;
    try { still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    if (still) { return; }
    this._heroTimer = setInterval(function () {
      if (self.props.autoplay === false) { return; }
      var cur = (self.state && self.state.hero) || 0;
      self.setState({ hero: (cur + 1) % 3 });
    }, 7000);
  }
  componentWillUnmount() {
    clearInterval(this._heroTimer);
    clearTimeout(this._toastTimer);
  }
  renderVals() {
    var self = this;
    var st = Object.assign({ hero: 0, menu: '', feat: 0, ed: 'java', gal: 0, lb: 'playtime', role: 'All', copied: false }, this.state || {});
    var heroLabels = ['Season 1 spawn', 'Open Beta KOTH arena', "SarahNova's Open Beta house"];
    var galLabels = ['Season 1 spawn', 'Open Beta end fight', 'First Open Beta KOTH fight', 'Open Beta Halloween spawn', 'Open Beta BloodGuard build', 'Open Beta dragon death', 'ScarEye guild banner', 'Open Beta Christmas spawn'];
    var roles = ['All', 'Founder', 'Admin', 'Developer', 'Mod', 'Helper'];
    var on = function (c) { return c ? 'true' : 'false'; };
    var show = function (c) { return c ? '' : 'hide'; };
    var v = {};
    var i;

    for (i = 0; i < 3; i++) {
      (function (n) {
        v['h' + n] = st.hero === n ? 'show' : '';
        v['hd' + n] = on(st.hero === n);
        v['pickH' + n] = function () { self.setState({ hero: n }); };
      })(i);
    }
    v.heroLabel = heroLabels[st.hero];

    for (i = 0; i < 4; i++) {
      (function (n) {
        v['f' + n] = on(st.feat === n);
        v['fp' + n] = show(st.feat === n);
        v['pickF' + n] = function () { self.setState({ feat: n }); };
      })(i);
    }

    v.edJava = on(st.ed === 'java');
    v.edBed = on(st.ed === 'bedrock');
    v.javaShow = show(st.ed === 'java');
    v.bedShow = show(st.ed === 'bedrock');
    v.pickJava = function () { self.setState({ ed: 'java' }); };
    v.pickBed = function () { self.setState({ ed: 'bedrock' }); };

    for (i = 0; i < 8; i++) {
      (function (n) {
        v['g' + n] = st.gal === n ? 'show' : '';
        v['t' + n] = on(st.gal === n);
        v['pickG' + n] = function () { self.setState({ gal: n }); };
      })(i);
    }
    v.galLabel = galLabels[st.gal];
    v.galPos = (st.gal + 1) + ' / 8';
    v.galPrev = function () { self.setState({ gal: (st.gal + 7) % 8 }); };
    v.galNext = function () { self.setState({ gal: (st.gal + 1) % 8 }); };

    v.lbPlay = on(st.lb === 'playtime');
    v.lbBal = on(st.lb === 'balance');
    v.playShow = show(st.lb === 'playtime');
    v.balShow = show(st.lb === 'balance');
    v.pickPlay = function () { self.setState({ lb: 'playtime' }); };
    v.pickBal = function () { self.setState({ lb: 'balance' }); };

    for (i = 0; i < roles.length; i++) {
      (function (name) {
        v['r' + name] = on(st.role === name);
        v['s' + name] = show(st.role === 'All' || st.role === name);
        v['pick' + name] = function () { self.setState({ role: name }); };
      })(roles[i]);
    }

    navigationValues(self,st,v);





    v.splashShow = show(this.props.splash ?? true);

    v.toastShow = show(st.copied);
    v.copyIp = function () {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('enthusia.net').catch(function () {});
        }
      } catch (e) {}
      self.setState({ copied: true });
      clearTimeout(self._toastTimer);
      self._toastTimer = setTimeout(function () { self.setState({ copied: false }); }, 2600);
    };

    // Video of the week: one video from the community playlist, changing every Monday.
    // The list is the playlist with repeats removed, newest first. Week 0 starts Monday 28 Sep 2026.
    var vids = [["72aL_0jTz6M", "THE GREAT BATHROOM BATTLE (And living in Qwimble's walls) | Enthusia SMP", "Uneducated Cardboard", "26:03"], ["thFu8Q1nVbI", "How To Vibe", "StepSoy", "6:16"], ["BSWM60K5_XM", "Everywhere I Go | Enthusia SMP", "Laix", "9:53"], ["uMXm0WQ6YsM", "Kill SomeBodys Cat Cold BLOODED On Enthusia Smp (ft: EyedDevotee896)", "Sleepysul", "1:01"], ["bFMfFB_o7AE", "Enthusia SMP: Episode 1 - Boggers is UNC???", "BoggersTheFish", "12:40"], ["QBdJyE07L0A", "I joined a Minecraft tournament | Enthusia SMP", "Uneducated Cardboard", "12:03"], ["17gOWRyhi20", "Project End Star", "H3dge", "2:12"], ["Xc7XZsKrI5k", "It's About Sending a Message", "KILLTEAM", "4:44"], ["U3X0xJQxy7I", "p2wn is our ball", "DracoKagomen", "1:51"], ["WCdD5QwMrz8", "Get Back | Teaser", "StepSoy", "0:16"], ["zHDrJ-Z0XIc", "Joining Minecrafts Strongest Faction (Enthusia SMP)", "Uneducated Cardboard", "18:03"], ["YWhbLASvH8U", "Enthusia SMP II (Lets try this again)", "Uneducated Cardboard", "2:51"], ["h59q_TMbSyQ", "This One Here | Enthusia", "StepSoy", "5:00"], ["v2zY1xPwAyY", "Becoming RICH On Enthusia SMP", "Pyro", "23:21"], ["_fXf4Unyx5M", "Enthusia SMP (A new beginning)", "Uneducated Cardboard", "7:22"], ["ON-bGUYzSzQ", "The Art of War", "KILLTEAM", "5:23"], ["IgDgYYqcDpw", "The Great Kirky Guild Massacre", "Laix", "1:31"], ["SDM-9Xcuats", "Enthusia Players Slander 3", "Sleepysul", "0:26"], ["If56ccTuttU", "Enthusia players Slander 2", "Sleepysul", "0:30"], ["6Q159jjkCh8", "Enthusia Players Slander 1", "Sleepysul", "0:16"], ["Zg5xW_iX_Qo", "Destorying Scareye banner (lost my mace doing this) - Enthusia SMP", "Sleepysul", "22:25"], ["PMKuLRvW4Uw", "Duels Test On Enthusia", "Sleepysul", "3:49"], ["PC5nZOcc-Nc", "End Event [Enthusia 2025-12-26]", "Fain", "42:49"]];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var weekStart = function (w) { return new Date(2026, 8, 28 + w * 7); };
    var dayLabel = function (d) { return d.getDate() + ' ' + months[d.getMonth()]; };
    var nowWeek = Math.floor((Date.now() - weekStart(0).getTime()) / 604800000);
    var vidOff = st.vidOff || 0;
    var wk = nowWeek + vidOff;
    var pickVid = function (w) { return ((w % vids.length) + vids.length) % vids.length; };
    var vi = pickVid(wk);
    for (i = 0; i < vids.length; i++) { v['vp' + i] = i === vi ? 'show' : ''; }
    var wkEnd = new Date(2026, 8, 28 + wk * 7 + 6);
    v.vidKick = vidOff === 0 ? 'VIDEO OF THE WEEK' : (vidOff < 0 ? 'AN EARLIER WEEK' : 'A COMING WEEK');
    v.vidTitle = vids[vi][1];
    v.vidBy = vids[vi][2];
    v.vidLen = vids[vi][3];
    v.vidWeek = 'Week of ' + dayLabel(weekStart(wk)) + ' to ' + dayLabel(wkEnd) + ' ' + wkEnd.getFullYear();
    v.vidPos = 'Video ' + (vi + 1) + ' of ' + vids.length + ' in the rotation.';
    v.vidUrl = 'https://www.youtube.com/watch?v=' + vids[vi][0] + '&list=PLSgBkD7J_cbc';
    v.vidIdle = show(!st.vidOn);
    v.vidOn = show(!!st.vidOn);
    v.vidPlay = function () { self.setState({ vidOn: true }); };
    v.vidStop = function () { self.setState({ vidOn: false }); };
    v.vidIsNow = on(vidOff === 0);
    v.vidPrev = function () { self.setState({ vidOff: vidOff - 1, vidOn: false }); };
    v.vidNext = function () { self.setState({ vidOff: vidOff + 1, vidOn: false }); };
    v.vidNow = function () { self.setState({ vidOff: 0, vidOn: false }); };
    for (i = 0; i < 3; i++) {
      var nx = vids[pickVid(wk + 1 + i)];
      v['vn' + i + 'd'] = 'From ' + dayLabel(weekStart(wk + 1 + i));
      v['vn' + i + 't'] = nx[1];
      v['vn' + i + 'b'] = nx[2];
    }

    // This week in the Warzone: the week label follows the same Monday weeks as the video.
    var wzEnd = new Date(2026, 8, 28 + nowWeek * 7 + 6);
    v.wzWeek = 'WEEK OF ' + dayLabel(weekStart(nowWeek)).toUpperCase() + ' TO ' + dayLabel(wzEnd).toUpperCase();
    var wzDates = [[Date.UTC(2026, 9, 14, 4), 'Build Competition voting opens'], [Date.UTC(2026, 9, 21, 4), 'Build Competition results'], [Date.UTC(2026, 9, 24, 4), 'Mapart Competition opens'], [Date.UTC(2026, 10, 8, 5), 'Mapart Competition voting opens']];
    v.wzNext = 'Next event to be announced';
    v.wzNextIn = 'Soon';
    for (i = 0; i < wzDates.length; i++) {
      if (wzDates[i][0] > Date.now()) {
        var wzDays = Math.ceil((wzDates[i][0] - Date.now()) / 86400000);
        v.wzNext = wzDates[i][1];
        v.wzNextIn = wzDays === 1 ? 'Tomorrow' : 'In ' + wzDays + ' days';
        break;
      }
    }

    return v;
  }
}
EnthusiaMock.mount(Component, {}, { controls: false });
