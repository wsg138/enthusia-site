/* DOM bindings for ported static design controls. No sample data or API overrides. */
(function () {
  "use strict";

  var doc = document;

  function DesignController(props) { this.props = props || {}; }
  DesignController.prototype.setState = function (patch) {
    var next = typeof patch === "function" ? patch(this.state || {}) : patch;
    this.state = Object.assign({}, this.state || {}, next);
    if (this.__render) this.__render();
  };
  window.DesignController = DesignController;

  function mount(Component, spec) {
    var props = {};
    Object.keys(spec || {}).forEach(function (key) { props[key] = spec[key] && spec[key].default; });
    var instance = new Component(props);
    var vals = {};
    var actions = new Map();
    var bound = [];

    Array.prototype.forEach.call(doc.querySelectorAll("*"), function (node) {
      Array.prototype.forEach.call(node.attributes, function (attribute) {
        if (attribute.name.indexOf("data-b-") === 0) bound.push({ node: node, name: attribute.name.slice(7), template: attribute.value });
      });
    });

    function text(value) { return value === undefined || value === null || value === false ? "" : String(value); }
    function fill(template) { return template.replace(/\{\{(\w+)\}\}/g, function (_, name) { return text(vals[name]); }); }

    function blocks(host, list) {
      host.replaceChildren();
      (Array.isArray(list) ? list : []).forEach(function (block) {
        var row = doc.createElement("div");
        row.className = text(block.cls);
        (Array.isArray(block.segs) ? block.segs : []).forEach(function (segment) {
          var span = doc.createElement("span");
          span.className = text(segment.cls);
          span.textContent = text(segment.text);
          row.append(span);
        });
        host.append(row);
      });
    }

    function render() {
      vals = instance.renderVals() || {};
      actions = new Map(Object.entries(vals).filter(function(entry){return typeof entry[1] === "function";}));
      bound.forEach(function (item) {
        var node = item.node;
        if (item.name === "text") {
          var content = text(vals[item.template]);
          if (node.textContent !== content) node.textContent = content;
        } else if (item.name === "blocks") {
          blocks(node, vals[item.template]);
        } else if (item.name === "value") {
          var value = fill(item.template);
          if (node.value !== value) node.value = value;
        } else if (item.name === "checked") {
          var raw = vals[item.template.replace(/[{}]/g, "")];
          node.checked = raw === true || raw === "true";
        } else {
          var filled = fill(item.template).replace(/\s+/g, " ").trim();
          if (node.getAttribute(item.name) !== filled) node.setAttribute(item.name, filled);
        }
      });
    }
    instance.__render = render;

    function dispatch(key, event) {
      var node = event.target;
      while (node && node !== doc) {
        var name = node.getAttribute && node.getAttribute("data-on-" + key);
        var action = actions.get(name);
        if (typeof action === "function") {
          action(event);
          if (event.cancelBubble) return;
        }
        node = node.parentNode;
      }
    }
    doc.addEventListener("click", function (event) {
      var link = event.target.closest && event.target.closest('a[href="#"]');
      if (link) event.preventDefault();
      dispatch("click", event);
    });
    doc.addEventListener("input", function (event) {
      if (event.target.type !== "checkbox" && event.target.type !== "radio") dispatch("change", event);
    });
    doc.addEventListener("change", function (event) {
      if (event.target.type === "checkbox" || event.target.type === "radio" || event.target.tagName === "SELECT") dispatch("change", event);
    });
    doc.addEventListener("select", function (event) { dispatch("select", event); }, true);
    doc.addEventListener("keyup", function (event) { dispatch("keyup", event); });

    function start() {
      render();
      if (typeof instance.componentDidMount === "function") instance.componentDidMount();
    }
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start); else start();

  }

  window.EnthusiaDesign = { mount: mount };
})();
