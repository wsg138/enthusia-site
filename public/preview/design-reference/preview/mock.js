/*
 * Preview build only - not part of the site.
 *
 * Runs the logic of a design mockup on a static copy of its markup. Each mockup is a class with a
 * renderVals() method that returns the values and click handlers for the current state; the markup
 * marks where they go:
 *   data-b-<attribute>="row {{name}}"   attribute filled from the values
 *   data-b-text="name"                  text filled from a value
 *   data-on-click="name"                handler taken from the values (also change, select, keyup)
 * Options a mockup exposes (competition stage, signed in or out...) become dropdowns in the preview bar.
 */
(function () {
  "use strict";

  var doc = document;

  function DCLogic(props) { this.props = props || {}; }
  DCLogic.prototype.setState = function (patch) {
    var next = typeof patch === "function" ? patch(this.state || {}) : patch;
    this.state = Object.assign({}, this.state || {}, next);
    if (this.__render) this.__render();
  };
  window.DCLogic = DCLogic;

  function mount(Component, spec, options) {
    var props = {};
    Object.keys(spec || {}).forEach(function (key) { props[key] = spec[key] && spec[key].default; });
    var instance = new Component(props);
    var vals = {};
    var handlers = new Map();
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
      handlers = new Map(Object.entries(vals).filter(function (entry) { return typeof entry[1] === 'function'; }));
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
        var handler = handlers.get(name);
        if (handler) {
          handler.call(vals,event);
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

    function controls() {
      var bar = doc.querySelector(".preview-bar");
      if (!bar || (options && options.controls === false)) return;
      Object.keys(spec || {}).forEach(function (key) {
        var entry = spec[key] || {};
        var choices = entry.editor === "boolean" ? ["true", "false"] : Array.isArray(entry.options) ? entry.options.map(String) : null;
        if (!choices) return;
        var label = doc.createElement("label");
        label.textContent = key.replace(/([A-Z])/g, " $1").replace(/^./, function (c) { return c.toUpperCase(); });
        var select = doc.createElement("select");
        select.id = "preview-option-" + key;
        choices.forEach(function (choice) {
          var option = new Option(choice === "true" ? "on" : choice === "false" ? "off" : choice, choice);
          select.add(option);
        });
        select.value = String(props[key]);
        select.addEventListener("change", function () {
          instance.props[key] = entry.editor === "boolean" ? select.value === "true" : select.value;
          render();
        });
        label.append(select);
        bar.append(label);
      });
    }

    function start() {
      render();
      if (typeof instance.componentDidMount === "function") instance.componentDidMount();
    }
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start); else start();
    // The preview bar is added when the document has finished loading, so the dropdowns wait for it.
    if (doc.readyState === "complete") controls(); else doc.addEventListener("DOMContentLoaded", controls);
  }

  window.EnthusiaMock = { mount: mount };
})();
