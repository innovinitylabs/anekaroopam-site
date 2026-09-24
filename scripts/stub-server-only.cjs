/** Stub `server-only` so Node/tsx unit tests can import Next server modules. */
const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function stubServerOnly(id) {
  if (id === "server-only") {
    return {};
  }
  return originalRequire.apply(this, arguments);
};
