// d3.easygraph -- UMD wrapper (opening half; see _outro.js for the close).
// MIT License -- https://opensource.org/licenses/MIT
// Copyright (c) 2026, Lars Schumann, larsi.org@gmail.com
//
// Wraps the concatenated build so it works as a <script> tag (attaching to the global d3, the
// classic d3-plugin convention), as a CommonJS/bundler import, and as an AMD module -- and, just
// as importantly, so the build's own internal helpers stay function-scoped instead of leaking
// onto `window`. Inside the factory `d3` is a parameter, so every `d3.` reference in the source
// files below resolves to whatever the host handed us.
//
// The module branches deliberately do NOT hand over d3 itself: d3 v7 ships as ESM, and a module
// namespace object is sealed and non-extensible, so this file's `d3.easygraph = {}` would
// silently no-op there (assignment to a sealed object fails quietly outside strict mode) and
// every later reference would throw on undefined. Object.create(d3) gives a mutable view whose
// prototype is the real d3: reads of d3.scaleLinear/d3.extent/etc. fall straight through, while
// `d3.easygraph = {}` lands on the view, which _outro.js then returns as the module's export.
// Script-tag users keep getting the real global d3 mutated in place, so `d3.easygraph` stays
// available exactly as before.
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['d3'], function (d3) { return factory(Object.create(d3)); });
  } else if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory(Object.create(require('d3')));
  } else {
    factory(root.d3);
  }
}(typeof self !== 'undefined' ? self : this, function (d3) {
  if (!d3) throw new Error('d3.easygraph: d3 (v7) is required but was not found');
