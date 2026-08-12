export class GrantWidgetRegistry {
  #handlers = new Map();

  register(type, handler) {
    const key = typeof type === "string" ? type.trim() : "";
    if (!key || typeof handler !== "function") throw new TypeError("A grant widget handler requires a non-empty type and function.");
    if (this.#handlers.has(key)) throw new Error(`A grant widget handler is already registered for "${key}".`);
    this.#handlers.set(key, handler);
    return this;
  }

  get(type) {
    return this.#handlers.get(typeof type === "string" ? type.trim() : "") || null;
  }

  remove(type) {
    this.#handlers.delete(typeof type === "string" ? type.trim() : "");
    return this;
  }

  clone() {
    const registry = new GrantWidgetRegistry();
    for (const [type, handler] of this.#handlers) registry.register(type, handler);
    return registry;
  }

  describe() {
    return Object.freeze(Array.from(this.#handlers.keys()).sort());
  }
}
