/* Preview only: logic of the "BuildComp" mockup, run by preview/mock.js. */
class Component extends DCLogic {
  renderVals() {
    var self = this;
    var st = Object.assign({ menu: '', tab: 0, etype: 0, ftitle: '', fdesc: '', votes: [], cast: false, sent: false }, this.state || {});
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
    var CFG = {"stage": "upcoming", "next": {"upcoming": "Submissions open soon. The day will be announced on Discord", "submissions": "Voting opens October 14", "voting": "Results are published October 21", "results": "No further stages"}, "count": 6};
    var stage = this.props.stage ?? CFG.stage;
    var order = { upcoming: 0, submissions: 1, voting: 3, results: 5 };
    var at = order[stage] === undefined ? 1 : order[stage];
    var COPY = {
      upcoming: ['Getting ready', 'Read the brief and plan your entry before submissions open.'],
      submissions: ['Submissions open', 'Create an entry, add your screenshots, and send it to staff for review.'],
      voting: ['Community voting', 'Eligible players can vote for their favorite approved entries.'],
      results: ['Results published', 'Placements are final and the approved entries remain available here.']
    };
    var copy = COPY[stage] || COPY.submissions;
    v.stageTitle = copy[0];
    v.stageDesc = copy[1];
    v.nextLine = CFG.next[stage] || CFG.next.submissions;
    for (i = 0; i < 6; i++) { v['k' + i] = i < at ? 'done' : (i === at ? 'now' : ''); }
    for (i = 0; i < 4; i++) {
      (function (n) {
        v['t' + n] = on(st.tab === n);
        v['tp' + n] = show(st.tab === n);
        v['pickT' + n] = function () { self.setState({ tab: n }); };
      })(i);
    }
    v.ctaEnter = show(stage === 'submissions');
    v.ctaVote = show(stage === 'voting');
    v.ctaRes = show(stage === 'results');
    v.ctaWait = show(stage === 'upcoming');
    v.formShow = show(stage === 'submissions' && !st.sent);
    v.sentShow = show(stage === 'submissions' && st.sent);
    v.send = function () { self.setState({ sent: true }); };
    v.unsend = function () { self.setState({ sent: false }); };
    for (i = 0; i < 3; i++) {
      (function (n) {
        v['y' + n] = on(st.etype === n);
        v['pickY' + n] = function () { self.setState({ etype: n }); };
      })(i);
    }
    v.teamShow = show(st.etype !== 0);
    v.teamLabel = st.etype === 2 ? 'Guild' : 'Contributors';
    v.teamHint = st.etype === 2 ? '[Choose a guild]' : '[Add a player]';
    v.ftitle = st.ftitle;
    v.fdesc = st.fdesc;
    v.setFtitle = function (e) { self.setState({ ftitle: e.target.value }); };
    v.setFdesc = function (e) { self.setState({ fdesc: e.target.value }); };
    var votes = st.votes || [];
    var MAXV = 3;
    for (i = 0; i < CFG.count; i++) {
      (function (n) {
        v['v' + n] = on(votes.indexOf(n) !== -1);
        v['pickV' + n] = function () {
          var next = votes.slice();
          var where = next.indexOf(n);
          if (where !== -1) { next.splice(where, 1); }
          else if (next.length < MAXV) { next.push(n); }
          self.setState({ votes: next, cast: false });
        };
      })(i);
    }
    v.emptyShow = show(stage === 'upcoming' || stage === 'submissions');
    v.gridShow = show(stage === 'voting' || stage === 'results');
    v.voteShow = show(stage === 'voting');
    v.resShow = show(stage === 'results');
    v.cast = function () { if (votes.length) { self.setState({ cast: true }); } };
    v.ballotLine = st.cast ? 'Ballot submitted. You can change it until voting closes.' : (votes.length + ' of ' + MAXV + ' choices used');
    return v;
  }
}
EnthusiaMock.mount(Component, {"stage": {"editor": "enum", "options": ["upcoming", "submissions", "voting", "results"], "default": "upcoming"}});
