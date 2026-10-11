import { createRequire as __gwbCreateRequireInit } from "node:module";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  return __gwbCreateRequireInit(import.meta.url)(x);
});
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
    var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
    var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
    var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
    var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
    var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
    var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path2) {
      const ctrl = callVisitor(key, node, visitor, path2);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path2, ctrl);
        return visit_(key, ctrl, visitor, path2);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path2 = Object.freeze(path2.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path2);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path2 = Object.freeze(path2.concat(node));
          const ck = visit_("key", node.key, visitor, path2);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path2);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path2) {
      const ctrl = await callVisitor(key, node, visitor, path2);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path2, ctrl);
        return visitAsync_(key, ctrl, visitor, path2);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path2 = Object.freeze(path2.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path2);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path2 = Object.freeze(path2.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path2);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path2);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path2) {
      if (typeof visitor === "function")
        return visitor(key, node, path2);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path2);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path2);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path2);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path2);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path2);
      return void 0;
    }
    function replaceNode(key, path2, node) {
      const parent = path2[path2.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const { anchors: anchors2, doc, maxAliasCount } = ctx;
        const source = this.resolve(doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        let data = anchors2.get(source);
        if (!data) {
          toJS.toJS(source, null, ctx);
          data = anchors2.get(source);
        }
        if (data?.res === void 0) {
          const msg = "This should not happen: Alias anchor was not resolved?";
          throw new ReferenceError(msg);
        }
        if (maxAliasCount >= 0) {
          data.count += 1;
          if (data.aliasCount === 0)
            data.aliasCount = getAliasCount(doc, source, anchors2);
          if (data.count * data.aliasCount > maxAliasCount) {
            const msg = "Excessive alias count indicates a resource exhaustion attack";
            throw new ReferenceError(msg);
          }
        }
        return data.res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path2, value) {
      let v = value;
      for (let i = path2.length - 1; i >= 0; --i) {
        const k = path2[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path2) => path2 == null || typeof path2 === "object" && !!path2[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path2, value) {
        if (isEmptyPath(path2))
          this.add(value);
        else {
          const [key, ...rest] = path2;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path2) {
        const [key, ...rest] = path2;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path2, keepScalar) {
        const [key, ...rest] = path2;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path2) {
        const [key, ...rest] = path2;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path2, value) {
        const [key, ...rest] = path2;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify2(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type2) {
        const map = Type2 ? new Type2() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path2, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path2, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path2) {
        if (Collection.isEmptyPath(path2)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path2) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path2, keepScalar) {
        if (Collection.isEmptyPath(path2))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path2, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path2) {
        if (Collection.isEmptyPath(path2))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path2) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path2, value) {
        if (Collection.isEmptyPath(path2)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path2), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path2, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep: sep4, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep4?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep4) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep4 ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep4, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep4 = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep4 + cb;
              sep4 = "";
              break;
            }
            case "newline":
              if (comment)
                sep4 += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep: sep4, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep4?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep4 && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep4 && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep4, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep4 ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep4)
                for (const st of sep4) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep4, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep4 = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep4 + indent.slice(trimIndent) + content;
          sep4 = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep4 === " ")
            sep4 = "\n";
          else if (!prevMoreIndented && sep4 === "\n")
            sep4 = "\n\n";
          value += sep4 + indent.slice(trimIndent) + content;
          sep4 = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep4 === "\n")
            value += "\n";
          else
            sep4 = "\n";
        } else {
          value += sep4 + content;
          sep4 = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return foldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return foldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function foldLines(source) {
      let first, line;
      try {
        first = new RegExp("(.*?)(?<![ 	])[ 	]*\r?\n", "sy");
        line = new RegExp("[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n", "sy");
      } catch {
        first = /(.*?)[ \t]*\r?\n/sy;
        line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
      }
      let match = first.exec(source);
      if (!match)
        return source;
      let res = match[1];
      let sep4 = " ";
      let pos = first.lastIndex;
      line.lastIndex = pos;
      while (match = line.exec(source)) {
        if (match[1] === "") {
          if (sep4 === "\n")
            res += sep4;
          else
            sep4 = "\n";
        } else {
          res += sep4 + match[1];
          sep4 = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep4 + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep: sep4, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep4)
        for (const st of sep4)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path2) => {
      let item = cst;
      for (const [field, index] of path2) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path2) => {
      const parent = visit.itemAtPath(cst, path2.slice(0, -1));
      const field = path2[path2.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path2, item, visitor) {
      let ctrl = visitor(item, path2);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path2.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path2);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path2) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep4;
          if (scalar.end) {
            sep4 = scalar.end;
            sep4.push(this.sourceToken);
            delete scalar.end;
          } else
            sep4 = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep: sep4 }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep4 = it.sep;
                  sep4.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep: sep4 }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs3 = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs3, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs3);
              } else {
                Object.assign(it, { key: fs3, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs3 = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs3, sep: [] });
              else if (it.sep)
                this.stack.push(fs3);
              else
                Object.assign(it, { key: fs3, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep4 = fc.end.splice(1, fc.end.length);
            sep4.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep: sep4 }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument2(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse2(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument2(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse2;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument2;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/shared/format-utils.ts
function normalizeStringArray(value, options) {
  if (!Array.isArray(value)) return [];
  const items = value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  return options?.dedupe ? [...new Set(items)] : items;
}
var init_format_utils = __esm({
  "../../../../../../../../tmp/gsd-pi/src/resources/extensions/shared/format-utils.ts"() {
    "use strict";
  }
});

// node_modules/retry/lib/retry_operation.js
var require_retry_operation = __commonJS({
  "node_modules/retry/lib/retry_operation.js"(exports, module2) {
    function RetryOperation(timeouts, options) {
      if (typeof options === "boolean") {
        options = { forever: options };
      }
      this._originalTimeouts = JSON.parse(JSON.stringify(timeouts));
      this._timeouts = timeouts;
      this._options = options || {};
      this._maxRetryTime = options && options.maxRetryTime || Infinity;
      this._fn = null;
      this._errors = [];
      this._attempts = 1;
      this._operationTimeout = null;
      this._operationTimeoutCb = null;
      this._timeout = null;
      this._operationStart = null;
      this._timer = null;
      if (this._options.forever) {
        this._cachedTimeouts = this._timeouts.slice(0);
      }
    }
    module2.exports = RetryOperation;
    RetryOperation.prototype.reset = function() {
      this._attempts = 1;
      this._timeouts = this._originalTimeouts.slice(0);
    };
    RetryOperation.prototype.stop = function() {
      if (this._timeout) {
        clearTimeout(this._timeout);
      }
      if (this._timer) {
        clearTimeout(this._timer);
      }
      this._timeouts = [];
      this._cachedTimeouts = null;
    };
    RetryOperation.prototype.retry = function(err) {
      if (this._timeout) {
        clearTimeout(this._timeout);
      }
      if (!err) {
        return false;
      }
      var currentTime = (/* @__PURE__ */ new Date()).getTime();
      if (err && currentTime - this._operationStart >= this._maxRetryTime) {
        this._errors.push(err);
        this._errors.unshift(new Error("RetryOperation timeout occurred"));
        return false;
      }
      this._errors.push(err);
      var timeout = this._timeouts.shift();
      if (timeout === void 0) {
        if (this._cachedTimeouts) {
          this._errors.splice(0, this._errors.length - 1);
          timeout = this._cachedTimeouts.slice(-1);
        } else {
          return false;
        }
      }
      var self = this;
      this._timer = setTimeout(function() {
        self._attempts++;
        if (self._operationTimeoutCb) {
          self._timeout = setTimeout(function() {
            self._operationTimeoutCb(self._attempts);
          }, self._operationTimeout);
          if (self._options.unref) {
            self._timeout.unref();
          }
        }
        self._fn(self._attempts);
      }, timeout);
      if (this._options.unref) {
        this._timer.unref();
      }
      return true;
    };
    RetryOperation.prototype.attempt = function(fn, timeoutOps) {
      this._fn = fn;
      if (timeoutOps) {
        if (timeoutOps.timeout) {
          this._operationTimeout = timeoutOps.timeout;
        }
        if (timeoutOps.cb) {
          this._operationTimeoutCb = timeoutOps.cb;
        }
      }
      var self = this;
      if (this._operationTimeoutCb) {
        this._timeout = setTimeout(function() {
          self._operationTimeoutCb();
        }, self._operationTimeout);
      }
      this._operationStart = (/* @__PURE__ */ new Date()).getTime();
      this._fn(this._attempts);
    };
    RetryOperation.prototype.try = function(fn) {
      console.log("Using RetryOperation.try() is deprecated");
      this.attempt(fn);
    };
    RetryOperation.prototype.start = function(fn) {
      console.log("Using RetryOperation.start() is deprecated");
      this.attempt(fn);
    };
    RetryOperation.prototype.start = RetryOperation.prototype.try;
    RetryOperation.prototype.errors = function() {
      return this._errors;
    };
    RetryOperation.prototype.attempts = function() {
      return this._attempts;
    };
    RetryOperation.prototype.mainError = function() {
      if (this._errors.length === 0) {
        return null;
      }
      var counts = {};
      var mainError = null;
      var mainErrorCount = 0;
      for (var i = 0; i < this._errors.length; i++) {
        var error = this._errors[i];
        var message = error.message;
        var count = (counts[message] || 0) + 1;
        counts[message] = count;
        if (count >= mainErrorCount) {
          mainError = error;
          mainErrorCount = count;
        }
      }
      return mainError;
    };
  }
});

// node_modules/retry/lib/retry.js
var require_retry = __commonJS({
  "node_modules/retry/lib/retry.js"(exports) {
    var RetryOperation = require_retry_operation();
    exports.operation = function(options) {
      var timeouts = exports.timeouts(options);
      return new RetryOperation(timeouts, {
        forever: options && (options.forever || options.retries === Infinity),
        unref: options && options.unref,
        maxRetryTime: options && options.maxRetryTime
      });
    };
    exports.timeouts = function(options) {
      if (options instanceof Array) {
        return [].concat(options);
      }
      var opts = {
        retries: 10,
        factor: 2,
        minTimeout: 1 * 1e3,
        maxTimeout: Infinity,
        randomize: false
      };
      for (var key in options) {
        opts[key] = options[key];
      }
      if (opts.minTimeout > opts.maxTimeout) {
        throw new Error("minTimeout is greater than maxTimeout");
      }
      var timeouts = [];
      for (var i = 0; i < opts.retries; i++) {
        timeouts.push(this.createTimeout(i, opts));
      }
      if (options && options.forever && !timeouts.length) {
        timeouts.push(this.createTimeout(i, opts));
      }
      timeouts.sort(function(a, b) {
        return a - b;
      });
      return timeouts;
    };
    exports.createTimeout = function(attempt, opts) {
      var random = opts.randomize ? Math.random() + 1 : 1;
      var timeout = Math.round(random * Math.max(opts.minTimeout, 1) * Math.pow(opts.factor, attempt));
      timeout = Math.min(timeout, opts.maxTimeout);
      return timeout;
    };
    exports.wrap = function(obj, options, methods) {
      if (options instanceof Array) {
        methods = options;
        options = null;
      }
      if (!methods) {
        methods = [];
        for (var key in obj) {
          if (typeof obj[key] === "function") {
            methods.push(key);
          }
        }
      }
      for (var i = 0; i < methods.length; i++) {
        var method = methods[i];
        var original = obj[method];
        obj[method] = function retryWrapper(original2) {
          var op = exports.operation(options);
          var args = Array.prototype.slice.call(arguments, 1);
          var callback = args.pop();
          args.push(function(err) {
            if (op.retry(err)) {
              return;
            }
            if (err) {
              arguments[0] = op.mainError();
            }
            callback.apply(this, arguments);
          });
          op.attempt(function() {
            original2.apply(obj, args);
          });
        }.bind(obj, original);
        obj[method].options = options;
      }
    };
  }
});

// node_modules/retry/index.js
var require_retry2 = __commonJS({
  "node_modules/retry/index.js"(exports, module2) {
    module2.exports = require_retry();
  }
});

// node_modules/signal-exit/signals.js
var require_signals = __commonJS({
  "node_modules/signal-exit/signals.js"(exports, module2) {
    module2.exports = [
      "SIGABRT",
      "SIGALRM",
      "SIGHUP",
      "SIGINT",
      "SIGTERM"
    ];
    if (process.platform !== "win32") {
      module2.exports.push(
        "SIGVTALRM",
        "SIGXCPU",
        "SIGXFSZ",
        "SIGUSR2",
        "SIGTRAP",
        "SIGSYS",
        "SIGQUIT",
        "SIGIOT"
        // should detect profiler and enable/disable accordingly.
        // see #21
        // 'SIGPROF'
      );
    }
    if (process.platform === "linux") {
      module2.exports.push(
        "SIGIO",
        "SIGPOLL",
        "SIGPWR",
        "SIGSTKFLT",
        "SIGUNUSED"
      );
    }
  }
});

// node_modules/signal-exit/index.js
import {} from "process";
var require_signal_exit = __commonJS({
  "node_modules/signal-exit/index.js"(exports, module2) {
    var processOk = function(process2) {
      return process2 && typeof process2 === "object" && typeof process2.removeListener === "function" && typeof process2.emit === "function" && typeof process2.reallyExit === "function" && typeof process2.listeners === "function" && typeof process2.kill === "function" && typeof process2.pid === "number" && typeof process2.on === "function";
    };
    if (!processOk(process)) {
      module2.exports = function() {
        return function() {
        };
      };
    } else {
      assert = __require("assert");
      signals = require_signals();
      isWin = /^win/i.test(process.platform);
      EE = __require("events");
      if (typeof EE !== "function") {
        EE = EE.EventEmitter;
      }
      if (process.__signal_exit_emitter__) {
        emitter = process.__signal_exit_emitter__;
      } else {
        emitter = process.__signal_exit_emitter__ = new EE();
        emitter.count = 0;
        emitter.emitted = {};
      }
      if (!emitter.infinite) {
        emitter.setMaxListeners(Infinity);
        emitter.infinite = true;
      }
      module2.exports = function(cb, opts) {
        if (!processOk(global.process)) {
          return function() {
          };
        }
        assert.equal(typeof cb, "function", "a callback must be provided for exit handler");
        if (loaded === false) {
          load();
        }
        var ev = "exit";
        if (opts && opts.alwaysLast) {
          ev = "afterexit";
        }
        var remove = function() {
          emitter.removeListener(ev, cb);
          if (emitter.listeners("exit").length === 0 && emitter.listeners("afterexit").length === 0) {
            unload();
          }
        };
        emitter.on(ev, cb);
        return remove;
      };
      unload = function unload2() {
        if (!loaded || !processOk(global.process)) {
          return;
        }
        loaded = false;
        signals.forEach(function(sig) {
          try {
            process.removeListener(sig, sigListeners[sig]);
          } catch (er) {
          }
        });
        process.emit = originalProcessEmit;
        process.reallyExit = originalProcessReallyExit;
        emitter.count -= 1;
      };
      module2.exports.unload = unload;
      emit = function emit2(event, code, signal) {
        if (emitter.emitted[event]) {
          return;
        }
        emitter.emitted[event] = true;
        emitter.emit(event, code, signal);
      };
      sigListeners = {};
      signals.forEach(function(sig) {
        sigListeners[sig] = function listener() {
          if (!processOk(global.process)) {
            return;
          }
          var listeners = process.listeners(sig);
          if (listeners.length === emitter.count) {
            unload();
            emit("exit", null, sig);
            emit("afterexit", null, sig);
            if (isWin && sig === "SIGHUP") {
              sig = "SIGINT";
            }
            process.kill(process.pid, sig);
          }
        };
      });
      module2.exports.signals = function() {
        return signals;
      };
      loaded = false;
      load = function load2() {
        if (loaded || !processOk(global.process)) {
          return;
        }
        loaded = true;
        emitter.count += 1;
        signals = signals.filter(function(sig) {
          try {
            process.on(sig, sigListeners[sig]);
            return true;
          } catch (er) {
            return false;
          }
        });
        process.emit = processEmit;
        process.reallyExit = processReallyExit;
      };
      module2.exports.load = load;
      originalProcessReallyExit = process.reallyExit;
      processReallyExit = function processReallyExit2(code) {
        if (!processOk(global.process)) {
          return;
        }
        process.exitCode = code || /* istanbul ignore next */
        0;
        emit("exit", process.exitCode, null);
        emit("afterexit", process.exitCode, null);
        originalProcessReallyExit.call(process, process.exitCode);
      };
      originalProcessEmit = process.emit;
      processEmit = function processEmit2(ev, arg) {
        if (ev === "exit" && processOk(global.process)) {
          if (arg !== void 0) {
            process.exitCode = arg;
          }
          var ret = originalProcessEmit.apply(this, arguments);
          emit("exit", process.exitCode, null);
          emit("afterexit", process.exitCode, null);
          return ret;
        } else {
          return originalProcessEmit.apply(this, arguments);
        }
      };
    }
    var assert;
    var signals;
    var isWin;
    var EE;
    var emitter;
    var unload;
    var emit;
    var sigListeners;
    var loaded;
    var load;
    var originalProcessReallyExit;
    var processReallyExit;
    var originalProcessEmit;
    var processEmit;
  }
});

// node_modules/proper-lockfile/lib/mtime-precision.js
var require_mtime_precision = __commonJS({
  "node_modules/proper-lockfile/lib/mtime-precision.js"(exports, module2) {
    "use strict";
    var cacheSymbol = /* @__PURE__ */ Symbol();
    function probe(file, fs3, callback) {
      const cachedPrecision = fs3[cacheSymbol];
      if (cachedPrecision) {
        return fs3.stat(file, (err, stat) => {
          if (err) {
            return callback(err);
          }
          callback(null, stat.mtime, cachedPrecision);
        });
      }
      const mtime = new Date(Math.ceil(Date.now() / 1e3) * 1e3 + 5);
      fs3.utimes(file, mtime, mtime, (err) => {
        if (err) {
          return callback(err);
        }
        fs3.stat(file, (err2, stat) => {
          if (err2) {
            return callback(err2);
          }
          const precision = stat.mtime.getTime() % 1e3 === 0 ? "s" : "ms";
          Object.defineProperty(fs3, cacheSymbol, { value: precision });
          callback(null, stat.mtime, precision);
        });
      });
    }
    function getMtime(precision) {
      let now = Date.now();
      if (precision === "s") {
        now = Math.ceil(now / 1e3) * 1e3;
      }
      return new Date(now);
    }
    module2.exports.probe = probe;
    module2.exports.getMtime = getMtime;
  }
});

// node_modules/proper-lockfile/lib/lockfile.js
var lockfile_exports = {};
__export(lockfile_exports, {
  path: () => path
});
import path from "path";
import fs from "fs";
function getLockFile(file, options) {
  return options.lockfilePath || `${file}.lock`;
}
function resolveCanonicalPath(file, options, callback) {
  if (!options.realpath) {
    return callback(null, path.resolve(file));
  }
  options.fs.realpath(file, callback);
}
function acquireLock(file, options, callback) {
  const lockfilePath = getLockFile(file, options);
  options.fs.mkdir(lockfilePath, (err) => {
    if (!err) {
      return import_mtime_precision.default.probe(lockfilePath, options.fs, (err2, mtime, mtimePrecision2) => {
        if (err2) {
          options.fs.rmdir(lockfilePath, () => {
          });
          return callback(err2);
        }
        callback(null, mtime, mtimePrecision2);
      });
    }
    if (err.code !== "EEXIST") {
      return callback(err);
    }
    if (options.stale <= 0) {
      return callback(Object.assign(new Error("Lock file is already being held"), { code: "ELOCKED", file }));
    }
    options.fs.stat(lockfilePath, (err2, stat) => {
      if (err2) {
        if (err2.code === "ENOENT") {
          return acquireLock(file, { ...options, stale: 0 }, callback);
        }
        return callback(err2);
      }
      if (!isLockStale(stat, options)) {
        return callback(Object.assign(new Error("Lock file is already being held"), { code: "ELOCKED", file }));
      }
      removeLock(file, options, (err3) => {
        if (err3) {
          return callback(err3);
        }
        acquireLock(file, { ...options, stale: 0 }, callback);
      });
    });
  });
}
function isLockStale(stat, options) {
  return stat.mtime.getTime() < Date.now() - options.stale;
}
function removeLock(file, options, callback) {
  options.fs.rmdir(getLockFile(file, options), (err) => {
    if (err && err.code !== "ENOENT") {
      return callback(err);
    }
    callback();
  });
}
function updateLock(file, options) {
  const lock2 = locks[file];
  if (lock2.updateTimeout) {
    return;
  }
  lock2.updateDelay = lock2.updateDelay || options.update;
  lock2.updateTimeout = setTimeout(() => {
    lock2.updateTimeout = null;
    options.fs.stat(lock2.lockfilePath, (err, stat) => {
      const isOverThreshold = lock2.lastUpdate + options.stale < Date.now();
      if (err) {
        if (err.code === "ENOENT" || isOverThreshold) {
          return setLockAsCompromised(file, lock2, Object.assign(err, { code: "ECOMPROMISED" }));
        }
        lock2.updateDelay = 1e3;
        return updateLock(file, options);
      }
      const isMtimeOurs = lock2.mtime.getTime() === stat.mtime.getTime();
      if (!isMtimeOurs) {
        return setLockAsCompromised(
          file,
          lock2,
          Object.assign(
            new Error("Unable to update lock within the stale threshold"),
            { code: "ECOMPROMISED" }
          )
        );
      }
      const mtime = import_mtime_precision.default.getMtime(lock2.mtimePrecision);
      options.fs.utimes(lock2.lockfilePath, mtime, mtime, (err2) => {
        const isOverThreshold2 = lock2.lastUpdate + options.stale < Date.now();
        if (lock2.released) {
          return;
        }
        if (err2) {
          if (err2.code === "ENOENT" || isOverThreshold2) {
            return setLockAsCompromised(file, lock2, Object.assign(err2, { code: "ECOMPROMISED" }));
          }
          lock2.updateDelay = 1e3;
          return updateLock(file, options);
        }
        lock2.mtime = mtime;
        lock2.lastUpdate = Date.now();
        lock2.updateDelay = null;
        updateLock(file, options);
      });
    });
  }, lock2.updateDelay);
  if (lock2.updateTimeout.unref) {
    lock2.updateTimeout.unref();
  }
}
function setLockAsCompromised(file, lock2, err) {
  lock2.released = true;
  if (lock2.updateTimeout) {
    clearTimeout(lock2.updateTimeout);
  }
  if (locks[file] === lock2) {
    delete locks[file];
  }
  lock2.options.onCompromised(err);
}
function lock(file, options, callback) {
  options = {
    stale: 1e4,
    update: null,
    realpath: true,
    retries: 0,
    fs,
    onCompromised: (err) => {
      throw err;
    },
    ...options
  };
  options.retries = options.retries || 0;
  options.retries = typeof options.retries === "number" ? { retries: options.retries } : options.retries;
  options.stale = Math.max(options.stale || 0, 2e3);
  options.update = options.update == null ? options.stale / 2 : options.update || 0;
  options.update = Math.max(Math.min(options.update, options.stale / 2), 1e3);
  resolveCanonicalPath(file, options, (err, file2) => {
    if (err) {
      return callback(err);
    }
    const operation = import_retry.default.operation(options.retries);
    operation.attempt(() => {
      acquireLock(file2, options, (err2, mtime, mtimePrecision2) => {
        if (operation.retry(err2)) {
          return;
        }
        if (err2) {
          return callback(operation.mainError());
        }
        const lock2 = locks[file2] = {
          lockfilePath: getLockFile(file2, options),
          mtime,
          mtimePrecision: mtimePrecision2,
          options,
          lastUpdate: Date.now()
        };
        updateLock(file2, options);
        callback(null, (releasedCallback) => {
          if (lock2.released) {
            return releasedCallback && releasedCallback(Object.assign(new Error("Lock is already released"), { code: "ERELEASED" }));
          }
          unlock(file2, { ...options, realpath: false }, releasedCallback);
        });
      });
    });
  });
}
function unlock(file, options, callback) {
  options = {
    fs,
    realpath: true,
    ...options
  };
  resolveCanonicalPath(file, options, (err, file2) => {
    if (err) {
      return callback(err);
    }
    const lock2 = locks[file2];
    if (!lock2) {
      return callback(Object.assign(new Error("Lock is not acquired/owned by you"), { code: "ENOTACQUIRED" }));
    }
    lock2.updateTimeout && clearTimeout(lock2.updateTimeout);
    lock2.released = true;
    delete locks[file2];
    removeLock(file2, options, callback);
  });
}
function check(file, options, callback) {
  options = {
    stale: 1e4,
    realpath: true,
    fs,
    ...options
  };
  options.stale = Math.max(options.stale || 0, 2e3);
  resolveCanonicalPath(file, options, (err, file2) => {
    if (err) {
      return callback(err);
    }
    options.fs.stat(getLockFile(file2, options), (err2, stat) => {
      if (err2) {
        return err2.code === "ENOENT" ? callback(null, false) : callback(err2);
      }
      return callback(null, !isLockStale(stat, options));
    });
  });
}
function getLocks() {
  return locks;
}
var import_retry, import_signal_exit, import_mtime_precision, locks;
var init_lockfile = __esm({
  "node_modules/proper-lockfile/lib/lockfile.js"() {
    "use strict";
    import_retry = __toESM(require_retry2());
    import_signal_exit = __toESM(require_signal_exit());
    import_mtime_precision = __toESM(require_mtime_precision());
    locks = {};
    (0, import_signal_exit.default)(() => {
      for (const file in locks) {
        const options = locks[file].options;
        try {
          options.fs.rmdirSync(getLockFile(file, options));
        } catch (e) {
        }
      }
    });
    lockfile_exports.lock = lock;
    lockfile_exports.unlock = unlock;
    lockfile_exports.check = check;
    lockfile_exports.getLocks = getLocks;
  }
});

// web/node_modules/graceful-fs/polyfills.js
var require_polyfills = __commonJS({
  "web/node_modules/graceful-fs/polyfills.js"(exports, module2) {
    var constants3 = __require("constants");
    var origCwd = process.cwd;
    var cwd = null;
    var platform = process.env.GRACEFUL_FS_PLATFORM || process.platform;
    process.cwd = function() {
      if (!cwd)
        cwd = origCwd.call(process);
      return cwd;
    };
    try {
      process.cwd();
    } catch (er) {
    }
    if (typeof process.chdir === "function") {
      chdir = process.chdir;
      process.chdir = function(d) {
        cwd = null;
        chdir.call(process, d);
      };
      if (Object.setPrototypeOf) Object.setPrototypeOf(process.chdir, chdir);
    }
    var chdir;
    module2.exports = patch;
    function patch(fs3) {
      if (constants3.hasOwnProperty("O_SYMLINK") && process.version.match(/^v0\.6\.[0-2]|^v0\.5\./)) {
        patchLchmod(fs3);
      }
      if (!fs3.lutimes) {
        patchLutimes(fs3);
      }
      fs3.chown = chownFix(fs3.chown);
      fs3.fchown = chownFix(fs3.fchown);
      fs3.lchown = chownFix(fs3.lchown);
      fs3.chmod = chmodFix(fs3.chmod);
      fs3.fchmod = chmodFix(fs3.fchmod);
      fs3.lchmod = chmodFix(fs3.lchmod);
      fs3.chownSync = chownFixSync(fs3.chownSync);
      fs3.fchownSync = chownFixSync(fs3.fchownSync);
      fs3.lchownSync = chownFixSync(fs3.lchownSync);
      fs3.chmodSync = chmodFixSync(fs3.chmodSync);
      fs3.fchmodSync = chmodFixSync(fs3.fchmodSync);
      fs3.lchmodSync = chmodFixSync(fs3.lchmodSync);
      fs3.stat = statFix(fs3.stat);
      fs3.fstat = statFix(fs3.fstat);
      fs3.lstat = statFix(fs3.lstat);
      fs3.statSync = statFixSync(fs3.statSync);
      fs3.fstatSync = statFixSync(fs3.fstatSync);
      fs3.lstatSync = statFixSync(fs3.lstatSync);
      if (fs3.chmod && !fs3.lchmod) {
        fs3.lchmod = function(path2, mode, cb) {
          if (cb) process.nextTick(cb);
        };
        fs3.lchmodSync = function() {
        };
      }
      if (fs3.chown && !fs3.lchown) {
        fs3.lchown = function(path2, uid, gid, cb) {
          if (cb) process.nextTick(cb);
        };
        fs3.lchownSync = function() {
        };
      }
      if (platform === "win32") {
        fs3.rename = typeof fs3.rename !== "function" ? fs3.rename : (function(fs$rename) {
          function rename(from, to, cb) {
            var start = Date.now();
            var backoff = 0;
            fs$rename(from, to, function CB(er) {
              if (er && (er.code === "EACCES" || er.code === "EPERM" || er.code === "EBUSY") && Date.now() - start < 6e4) {
                setTimeout(function() {
                  fs3.stat(to, function(stater, st) {
                    if (stater && stater.code === "ENOENT")
                      fs$rename(from, to, CB);
                    else
                      cb(er);
                  });
                }, backoff);
                if (backoff < 100)
                  backoff += 10;
                return;
              }
              if (cb) cb(er);
            });
          }
          if (Object.setPrototypeOf) Object.setPrototypeOf(rename, fs$rename);
          return rename;
        })(fs3.rename);
      }
      fs3.read = typeof fs3.read !== "function" ? fs3.read : (function(fs$read) {
        function read(fd, buffer, offset, length, position, callback_) {
          var callback;
          if (callback_ && typeof callback_ === "function") {
            var eagCounter = 0;
            callback = function(er, _, __) {
              if (er && er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                return fs$read.call(fs3, fd, buffer, offset, length, position, callback);
              }
              callback_.apply(this, arguments);
            };
          }
          return fs$read.call(fs3, fd, buffer, offset, length, position, callback);
        }
        if (Object.setPrototypeOf) Object.setPrototypeOf(read, fs$read);
        return read;
      })(fs3.read);
      fs3.readSync = typeof fs3.readSync !== "function" ? fs3.readSync : /* @__PURE__ */ (function(fs$readSync) {
        return function(fd, buffer, offset, length, position) {
          var eagCounter = 0;
          while (true) {
            try {
              return fs$readSync.call(fs3, fd, buffer, offset, length, position);
            } catch (er) {
              if (er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                continue;
              }
              throw er;
            }
          }
        };
      })(fs3.readSync);
      function patchLchmod(fs4) {
        fs4.lchmod = function(path2, mode, callback) {
          fs4.open(
            path2,
            constants3.O_WRONLY | constants3.O_SYMLINK,
            mode,
            function(err, fd) {
              if (err) {
                if (callback) callback(err);
                return;
              }
              fs4.fchmod(fd, mode, function(err2) {
                fs4.close(fd, function(err22) {
                  if (callback) callback(err2 || err22);
                });
              });
            }
          );
        };
        fs4.lchmodSync = function(path2, mode) {
          var fd = fs4.openSync(path2, constants3.O_WRONLY | constants3.O_SYMLINK, mode);
          var threw = true;
          var ret;
          try {
            ret = fs4.fchmodSync(fd, mode);
            threw = false;
          } finally {
            if (threw) {
              try {
                fs4.closeSync(fd);
              } catch (er) {
              }
            } else {
              fs4.closeSync(fd);
            }
          }
          return ret;
        };
      }
      function patchLutimes(fs4) {
        if (constants3.hasOwnProperty("O_SYMLINK") && fs4.futimes) {
          fs4.lutimes = function(path2, at, mt, cb) {
            fs4.open(path2, constants3.O_SYMLINK, function(er, fd) {
              if (er) {
                if (cb) cb(er);
                return;
              }
              fs4.futimes(fd, at, mt, function(er2) {
                fs4.close(fd, function(er22) {
                  if (cb) cb(er2 || er22);
                });
              });
            });
          };
          fs4.lutimesSync = function(path2, at, mt) {
            var fd = fs4.openSync(path2, constants3.O_SYMLINK);
            var ret;
            var threw = true;
            try {
              ret = fs4.futimesSync(fd, at, mt);
              threw = false;
            } finally {
              if (threw) {
                try {
                  fs4.closeSync(fd);
                } catch (er) {
                }
              } else {
                fs4.closeSync(fd);
              }
            }
            return ret;
          };
        } else if (fs4.futimes) {
          fs4.lutimes = function(_a, _b, _c, cb) {
            if (cb) process.nextTick(cb);
          };
          fs4.lutimesSync = function() {
          };
        }
      }
      function chmodFix(orig) {
        if (!orig) return orig;
        return function(target, mode, cb) {
          return orig.call(fs3, target, mode, function(er) {
            if (chownErOk(er)) er = null;
            if (cb) cb.apply(this, arguments);
          });
        };
      }
      function chmodFixSync(orig) {
        if (!orig) return orig;
        return function(target, mode) {
          try {
            return orig.call(fs3, target, mode);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function chownFix(orig) {
        if (!orig) return orig;
        return function(target, uid, gid, cb) {
          return orig.call(fs3, target, uid, gid, function(er) {
            if (chownErOk(er)) er = null;
            if (cb) cb.apply(this, arguments);
          });
        };
      }
      function chownFixSync(orig) {
        if (!orig) return orig;
        return function(target, uid, gid) {
          try {
            return orig.call(fs3, target, uid, gid);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function statFix(orig) {
        if (!orig) return orig;
        return function(target, options, cb) {
          if (typeof options === "function") {
            cb = options;
            options = null;
          }
          function callback(er, stats) {
            if (stats) {
              if (stats.uid < 0) stats.uid += 4294967296;
              if (stats.gid < 0) stats.gid += 4294967296;
            }
            if (cb) cb.apply(this, arguments);
          }
          return options ? orig.call(fs3, target, options, callback) : orig.call(fs3, target, callback);
        };
      }
      function statFixSync(orig) {
        if (!orig) return orig;
        return function(target, options) {
          var stats = options ? orig.call(fs3, target, options) : orig.call(fs3, target);
          if (stats) {
            if (stats.uid < 0) stats.uid += 4294967296;
            if (stats.gid < 0) stats.gid += 4294967296;
          }
          return stats;
        };
      }
      function chownErOk(er) {
        if (!er)
          return true;
        if (er.code === "ENOSYS")
          return true;
        var nonroot = !process.getuid || process.getuid() !== 0;
        if (nonroot) {
          if (er.code === "EINVAL" || er.code === "EPERM")
            return true;
        }
        return false;
      }
    }
  }
});

// web/node_modules/graceful-fs/legacy-streams.js
var require_legacy_streams = __commonJS({
  "web/node_modules/graceful-fs/legacy-streams.js"(exports, module2) {
    var Stream = __require("stream").Stream;
    module2.exports = legacy;
    function legacy(fs3) {
      return {
        ReadStream,
        WriteStream
      };
      function ReadStream(path2, options) {
        if (!(this instanceof ReadStream)) return new ReadStream(path2, options);
        Stream.call(this);
        var self = this;
        this.path = path2;
        this.fd = null;
        this.readable = true;
        this.paused = false;
        this.flags = "r";
        this.mode = 438;
        this.bufferSize = 64 * 1024;
        options = options || {};
        var keys = Object.keys(options);
        for (var index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options[key];
        }
        if (this.encoding) this.setEncoding(this.encoding);
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.end === void 0) {
            this.end = Infinity;
          } else if ("number" !== typeof this.end) {
            throw TypeError("end must be a Number");
          }
          if (this.start > this.end) {
            throw new Error("start must be <= end");
          }
          this.pos = this.start;
        }
        if (this.fd !== null) {
          process.nextTick(function() {
            self._read();
          });
          return;
        }
        fs3.open(this.path, this.flags, this.mode, function(err, fd) {
          if (err) {
            self.emit("error", err);
            self.readable = false;
            return;
          }
          self.fd = fd;
          self.emit("open", fd);
          self._read();
        });
      }
      function WriteStream(path2, options) {
        if (!(this instanceof WriteStream)) return new WriteStream(path2, options);
        Stream.call(this);
        this.path = path2;
        this.fd = null;
        this.writable = true;
        this.flags = "w";
        this.encoding = "binary";
        this.mode = 438;
        this.bytesWritten = 0;
        options = options || {};
        var keys = Object.keys(options);
        for (var index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options[key];
        }
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.start < 0) {
            throw new Error("start must be >= zero");
          }
          this.pos = this.start;
        }
        this.busy = false;
        this._queue = [];
        if (this.fd === null) {
          this._open = fs3.open;
          this._queue.push([this._open, this.path, this.flags, this.mode, void 0]);
          this.flush();
        }
      }
    }
  }
});

// web/node_modules/graceful-fs/clone.js
var require_clone = __commonJS({
  "web/node_modules/graceful-fs/clone.js"(exports, module2) {
    "use strict";
    module2.exports = clone;
    var getPrototypeOf = Object.getPrototypeOf || function(obj) {
      return obj.__proto__;
    };
    function clone(obj) {
      if (obj === null || typeof obj !== "object")
        return obj;
      if (obj instanceof Object)
        var copy = { __proto__: getPrototypeOf(obj) };
      else
        var copy = /* @__PURE__ */ Object.create(null);
      Object.getOwnPropertyNames(obj).forEach(function(key) {
        Object.defineProperty(copy, key, Object.getOwnPropertyDescriptor(obj, key));
      });
      return copy;
    }
  }
});

// web/node_modules/graceful-fs/graceful-fs.js
var require_graceful_fs = __commonJS({
  "web/node_modules/graceful-fs/graceful-fs.js"(exports, module2) {
    var fs3 = __require("fs");
    var polyfills = require_polyfills();
    var legacy = require_legacy_streams();
    var clone = require_clone();
    var util = __require("util");
    var gracefulQueue;
    var previousSymbol;
    if (typeof Symbol === "function" && typeof Symbol.for === "function") {
      gracefulQueue = /* @__PURE__ */ Symbol.for("graceful-fs.queue");
      previousSymbol = /* @__PURE__ */ Symbol.for("graceful-fs.previous");
    } else {
      gracefulQueue = "___graceful-fs.queue";
      previousSymbol = "___graceful-fs.previous";
    }
    function noop() {
    }
    function publishQueue(context, queue2) {
      Object.defineProperty(context, gracefulQueue, {
        get: function() {
          return queue2;
        }
      });
    }
    var debug = noop;
    if (util.debuglog)
      debug = util.debuglog("gfs4");
    else if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || ""))
      debug = function() {
        var m = util.format.apply(util, arguments);
        m = "GFS4: " + m.split(/\n/).join("\nGFS4: ");
        console.error(m);
      };
    if (!fs3[gracefulQueue]) {
      queue = global[gracefulQueue] || [];
      publishQueue(fs3, queue);
      fs3.close = (function(fs$close) {
        function close(fd, cb) {
          return fs$close.call(fs3, fd, function(err) {
            if (!err) {
              resetQueue();
            }
            if (typeof cb === "function")
              cb.apply(this, arguments);
          });
        }
        Object.defineProperty(close, previousSymbol, {
          value: fs$close
        });
        return close;
      })(fs3.close);
      fs3.closeSync = (function(fs$closeSync) {
        function closeSync12(fd) {
          fs$closeSync.apply(fs3, arguments);
          resetQueue();
        }
        Object.defineProperty(closeSync12, previousSymbol, {
          value: fs$closeSync
        });
        return closeSync12;
      })(fs3.closeSync);
      if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || "")) {
        process.on("exit", function() {
          debug(fs3[gracefulQueue]);
          __require("assert").equal(fs3[gracefulQueue].length, 0);
        });
      }
    }
    var queue;
    if (!global[gracefulQueue]) {
      publishQueue(global, fs3[gracefulQueue]);
    }
    module2.exports = patch(clone(fs3));
    if (process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !fs3.__patched) {
      module2.exports = patch(fs3);
      fs3.__patched = true;
    }
    function patch(fs4) {
      polyfills(fs4);
      fs4.gracefulify = patch;
      fs4.createReadStream = createReadStream;
      fs4.createWriteStream = createWriteStream;
      var fs$readFile = fs4.readFile;
      fs4.readFile = readFile;
      function readFile(path2, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$readFile(path2, options, cb);
        function go$readFile(path3, options2, cb2, startTime) {
          return fs$readFile(path3, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$readFile, [path3, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$writeFile = fs4.writeFile;
      fs4.writeFile = writeFile;
      function writeFile(path2, data, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$writeFile(path2, data, options, cb);
        function go$writeFile(path3, data2, options2, cb2, startTime) {
          return fs$writeFile(path3, data2, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$writeFile, [path3, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$appendFile = fs4.appendFile;
      if (fs$appendFile)
        fs4.appendFile = appendFile;
      function appendFile(path2, data, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$appendFile(path2, data, options, cb);
        function go$appendFile(path3, data2, options2, cb2, startTime) {
          return fs$appendFile(path3, data2, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$appendFile, [path3, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$copyFile = fs4.copyFile;
      if (fs$copyFile)
        fs4.copyFile = copyFile;
      function copyFile(src, dest, flags, cb) {
        if (typeof flags === "function") {
          cb = flags;
          flags = 0;
        }
        return go$copyFile(src, dest, flags, cb);
        function go$copyFile(src2, dest2, flags2, cb2, startTime) {
          return fs$copyFile(src2, dest2, flags2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$copyFile, [src2, dest2, flags2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$readdir = fs4.readdir;
      fs4.readdir = readdir;
      var noReaddirOptionVersions = /^v[0-5]\./;
      function readdir(path2, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        var go$readdir = noReaddirOptionVersions.test(process.version) ? function go$readdir2(path3, options2, cb2, startTime) {
          return fs$readdir(path3, fs$readdirCallback(
            path3,
            options2,
            cb2,
            startTime
          ));
        } : function go$readdir2(path3, options2, cb2, startTime) {
          return fs$readdir(path3, options2, fs$readdirCallback(
            path3,
            options2,
            cb2,
            startTime
          ));
        };
        return go$readdir(path2, options, cb);
        function fs$readdirCallback(path3, options2, cb2, startTime) {
          return function(err, files) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([
                go$readdir,
                [path3, options2, cb2],
                err,
                startTime || Date.now(),
                Date.now()
              ]);
            else {
              if (files && files.sort)
                files.sort();
              if (typeof cb2 === "function")
                cb2.call(this, err, files);
            }
          };
        }
      }
      if (process.version.substr(0, 4) === "v0.8") {
        var legStreams = legacy(fs4);
        ReadStream = legStreams.ReadStream;
        WriteStream = legStreams.WriteStream;
      }
      var fs$ReadStream = fs4.ReadStream;
      if (fs$ReadStream) {
        ReadStream.prototype = Object.create(fs$ReadStream.prototype);
        ReadStream.prototype.open = ReadStream$open;
      }
      var fs$WriteStream = fs4.WriteStream;
      if (fs$WriteStream) {
        WriteStream.prototype = Object.create(fs$WriteStream.prototype);
        WriteStream.prototype.open = WriteStream$open;
      }
      Object.defineProperty(fs4, "ReadStream", {
        get: function() {
          return ReadStream;
        },
        set: function(val) {
          ReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      Object.defineProperty(fs4, "WriteStream", {
        get: function() {
          return WriteStream;
        },
        set: function(val) {
          WriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileReadStream = ReadStream;
      Object.defineProperty(fs4, "FileReadStream", {
        get: function() {
          return FileReadStream;
        },
        set: function(val) {
          FileReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileWriteStream = WriteStream;
      Object.defineProperty(fs4, "FileWriteStream", {
        get: function() {
          return FileWriteStream;
        },
        set: function(val) {
          FileWriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      function ReadStream(path2, options) {
        if (this instanceof ReadStream)
          return fs$ReadStream.apply(this, arguments), this;
        else
          return ReadStream.apply(Object.create(ReadStream.prototype), arguments);
      }
      function ReadStream$open() {
        var that = this;
        open(that.path, that.flags, that.mode, function(err, fd) {
          if (err) {
            if (that.autoClose)
              that.destroy();
            that.emit("error", err);
          } else {
            that.fd = fd;
            that.emit("open", fd);
            that.read();
          }
        });
      }
      function WriteStream(path2, options) {
        if (this instanceof WriteStream)
          return fs$WriteStream.apply(this, arguments), this;
        else
          return WriteStream.apply(Object.create(WriteStream.prototype), arguments);
      }
      function WriteStream$open() {
        var that = this;
        open(that.path, that.flags, that.mode, function(err, fd) {
          if (err) {
            that.destroy();
            that.emit("error", err);
          } else {
            that.fd = fd;
            that.emit("open", fd);
          }
        });
      }
      function createReadStream(path2, options) {
        return new fs4.ReadStream(path2, options);
      }
      function createWriteStream(path2, options) {
        return new fs4.WriteStream(path2, options);
      }
      var fs$open = fs4.open;
      fs4.open = open;
      function open(path2, flags, mode, cb) {
        if (typeof mode === "function")
          cb = mode, mode = null;
        return go$open(path2, flags, mode, cb);
        function go$open(path3, flags2, mode2, cb2, startTime) {
          return fs$open(path3, flags2, mode2, function(err, fd) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$open, [path3, flags2, mode2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      return fs4;
    }
    function enqueue(elem) {
      debug("ENQUEUE", elem[0].name, elem[1]);
      fs3[gracefulQueue].push(elem);
      retry2();
    }
    var retryTimer;
    function resetQueue() {
      var now = Date.now();
      for (var i = 0; i < fs3[gracefulQueue].length; ++i) {
        if (fs3[gracefulQueue][i].length > 2) {
          fs3[gracefulQueue][i][3] = now;
          fs3[gracefulQueue][i][4] = now;
        }
      }
      retry2();
    }
    function retry2() {
      clearTimeout(retryTimer);
      retryTimer = void 0;
      if (fs3[gracefulQueue].length === 0)
        return;
      var elem = fs3[gracefulQueue].shift();
      var fn = elem[0];
      var args = elem[1];
      var err = elem[2];
      var startTime = elem[3];
      var lastTime = elem[4];
      if (startTime === void 0) {
        debug("RETRY", fn.name, args);
        fn.apply(null, args);
      } else if (Date.now() - startTime >= 6e4) {
        debug("TIMEOUT", fn.name, args);
        var cb = args.pop();
        if (typeof cb === "function")
          cb.call(null, err);
      } else {
        var sinceAttempt = Date.now() - lastTime;
        var sinceStart = Math.max(lastTime - startTime, 1);
        var desiredDelay = Math.min(sinceStart * 1.2, 100);
        if (sinceAttempt >= desiredDelay) {
          debug("RETRY", fn.name, args);
          fn.apply(null, args.concat([startTime]));
        } else {
          fs3[gracefulQueue].push(elem);
        }
      }
      if (retryTimer === void 0) {
        retryTimer = setTimeout(retry2, 0);
      }
    }
  }
});

// node_modules/proper-lockfile/lib/adapter.js
var require_adapter = __commonJS({
  "node_modules/proper-lockfile/lib/adapter.js"(exports, module2) {
    "use strict";
    var fs3 = require_graceful_fs();
    function createSyncFs(fs4) {
      const methods = ["mkdir", "realpath", "stat", "rmdir", "utimes"];
      const newFs = { ...fs4 };
      methods.forEach((method) => {
        newFs[method] = (...args) => {
          const callback = args.pop();
          let ret;
          try {
            ret = fs4[`${method}Sync`](...args);
          } catch (err) {
            return callback(err);
          }
          callback(null, ret);
        };
      });
      return newFs;
    }
    function toPromise(method) {
      return (...args) => new Promise((resolve17, reject) => {
        args.push((err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve17(result);
          }
        });
        method(...args);
      });
    }
    function toSync(method) {
      return (...args) => {
        let err;
        let result;
        args.push((_err, _result) => {
          err = _err;
          result = _result;
        });
        method(...args);
        if (err) {
          throw err;
        }
        return result;
      };
    }
    function toSyncOptions(options) {
      options = { ...options };
      options.fs = createSyncFs(options.fs || fs3);
      if (typeof options.retries === "number" && options.retries > 0 || options.retries && typeof options.retries.retries === "number" && options.retries.retries > 0) {
        throw Object.assign(new Error("Cannot use retries with the sync api"), { code: "ESYNC" });
      }
      return options;
    }
    module2.exports = {
      toPromise,
      toSync,
      toSyncOptions
    };
  }
});

// node_modules/proper-lockfile/index.js
var require_proper_lockfile = __commonJS({
  "node_modules/proper-lockfile/index.js"(exports, module2) {
    "use strict";
    var lockfile2 = (init_lockfile(), __toCommonJS(lockfile_exports));
    var { toPromise, toSync, toSyncOptions } = require_adapter();
    async function lock2(file, options) {
      const release = await toPromise(lockfile2.lock)(file, options);
      return toPromise(release);
    }
    function lockSync(file, options) {
      const release = toSync(lockfile2.lock)(file, toSyncOptions(options));
      return toSync(release);
    }
    function unlock2(file, options) {
      return toPromise(lockfile2.unlock)(file, options);
    }
    function unlockSync(file, options) {
      return toSync(lockfile2.unlock)(file, toSyncOptions(options));
    }
    function check2(file, options) {
      return toPromise(lockfile2.check)(file, options);
    }
    function checkSync(file, options) {
      return toSync(lockfile2.check)(file, toSyncOptions(options));
    }
    module2.exports = lock2;
    module2.exports.lock = lock2;
    module2.exports.unlock = unlock2;
    module2.exports.lockSync = lockSync;
    module2.exports.unlockSync = unlockSync;
    module2.exports.check = check2;
    module2.exports.checkSync = checkSync;
  }
});

// node_modules/@gsd/pi-coding-agent/index.js
var unavailable2, createBashTool, createEditTool, createReadTool, createWriteTool, importExtensionModule, getSkillDirectories, killProcessTree, DEFAULT_MAX_BYTES, HARD_DEADLINE_MS;
var init_pi_coding_agent = __esm({
  "node_modules/@gsd/pi-coding-agent/index.js"() {
    unavailable2 = (name) => () => {
      throw new Error(`@gsd/pi-coding-agent runtime is not available in @ezxomp/gsd-web (${name})`);
    };
    createBashTool = unavailable2("createBashTool");
    createEditTool = unavailable2("createEditTool");
    createReadTool = unavailable2("createReadTool");
    createWriteTool = unavailable2("createWriteTool");
    importExtensionModule = unavailable2("importExtensionModule");
    getSkillDirectories = () => [];
    killProcessTree = unavailable2("killProcessTree");
    DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
    HARD_DEADLINE_MS = 10 * 60 * 1e3;
  }
});

// node_modules/@gsd/native/index.mjs
var native_exports = {};
__export(native_exports, {
  batchParseGsdFiles: () => batchParseGsdFiles,
  extractSection: () => extractSection,
  gitCurrentBranch: () => gitCurrentBranch,
  gitHasChanges: () => gitHasChanges,
  highlightCode: () => highlightCode,
  isNativeAddonLoaded: () => isNativeAddonLoaded,
  parseFrontmatter: () => parseFrontmatter,
  supportsLanguage: () => supportsLanguage
});
var unavailable3, gitCurrentBranch, gitHasChanges, parseFrontmatter, extractSection, batchParseGsdFiles, isNativeAddonLoaded, highlightCode, supportsLanguage;
var init_native = __esm({
  "node_modules/@gsd/native/index.mjs"() {
    unavailable3 = (name) => () => {
      throw new Error(`@gsd/native is not available in @ezxomp/gsd-web (${name})`);
    };
    gitCurrentBranch = unavailable3("gitCurrentBranch");
    gitHasChanges = unavailable3("gitHasChanges");
    parseFrontmatter = unavailable3("parseFrontmatter");
    extractSection = unavailable3("extractSection");
    batchParseGsdFiles = unavailable3("batchParseGsdFiles");
    isNativeAddonLoaded = () => false;
    highlightCode = unavailable3("highlightCode");
    supportsLanguage = () => false;
  }
});

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/shared/rtk-shared.ts
import { existsSync as existsSync17 } from "node:fs";
import { homedir as osHomedir } from "node:os";
import { delimiter, join as join21 } from "node:path";
var init_rtk_shared = __esm({
  "../../../../../../../../tmp/gsd-pi/src/resources/extensions/shared/rtk-shared.ts"() {
    "use strict";
  }
});

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/shared/rtk.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import { existsSync as existsSync18 } from "node:fs";
import { join as join22 } from "node:path";
var init_rtk = __esm({
  "../../../../../../../../tmp/gsd-pi/src/resources/extensions/shared/rtk.ts"() {
    "use strict";
    init_rtk_shared();
  }
});

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/preferences.ts
import { existsSync as existsSync30, readFileSync as readFileSync25, statSync as statSync5 } from "node:fs";
import { homedir as homedir6 } from "node:os";
import { join as join33 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/paths.ts
import { readdirSync, existsSync as existsSync2, realpathSync as realpathSync2, statSync as statSync2, Dirent } from "node:fs";
import { join as join3, dirname, normalize, relative, resolve as resolve3 } from "node:path";
import { homedir as homedir2 } from "node:os";
import { spawnSync } from "node:child_process";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/native-parser-bridge.ts
var NATIVE_GSD_PARSER_ENABLED = process.env.GSD_ENABLE_NATIVE_GSD_PARSER === "1";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/gsd-home.ts
import { homedir } from "node:os";
import { join, resolve } from "node:path";
function gsdHome() {
  return process.env.GSD_HOME ? resolve(process.env.GSD_HOME) : join(homedir(), ".gsd");
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/worktree-root.ts
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, join as join2, resolve as resolve2 } from "node:path";
function normalizeWorktreePathForCompare(path2) {
  let normalized;
  try {
    normalized = realpathSync(path2);
  } catch {
    normalized = resolve2(path2);
  }
  const slashed = normalized.replaceAll("\\", "/");
  const trimmed = slashed.replace(/\/+$/, "");
  return process.platform === "win32" ? (trimmed || "/").toLowerCase() : trimmed || "/";
}
function findWorktreeSegment(normalizedPath) {
  const canonicalMarker = "/.gsd-worktrees/";
  const canonicalIdx = normalizedPath.indexOf(canonicalMarker);
  if (canonicalIdx !== -1) {
    return { gsdIdx: canonicalIdx, afterWorktrees: canonicalIdx + canonicalMarker.length };
  }
  const directMarker = "/.gsd/worktrees/";
  const directIdx = normalizedPath.indexOf(directMarker);
  if (directIdx !== -1) {
    return { gsdIdx: directIdx, afterWorktrees: directIdx + directMarker.length };
  }
  const externalRe = /\/\.gsd\/projects\/[^/]+\/worktrees\//;
  const externalMatch = normalizedPath.match(externalRe);
  if (externalMatch && externalMatch.index !== void 0) {
    return {
      gsdIdx: externalMatch.index,
      afterWorktrees: externalMatch.index + externalMatch[0].length
    };
  }
  const projectsRoot = join2(process.env.GSD_STATE_DIR || gsdHome(), "projects").replaceAll("\\", "/").replace(/\/+$/, "");
  const marker = `${projectsRoot}/`;
  if (normalizedPath.startsWith(marker)) {
    const rel = normalizedPath.slice(marker.length);
    const worktreesIdx = rel.indexOf("/worktrees/");
    if (worktreesIdx > 0) {
      const gsdIdx = marker.length + worktreesIdx;
      return {
        gsdIdx,
        afterWorktrees: gsdIdx + "/worktrees/".length
      };
    }
  }
  return null;
}
function isGsdWorktreePath(path2) {
  return findWorktreeSegment(path2.replaceAll("\\", "/")) !== null;
}
function resolveExternalStateProjectGsdFromWorktreePath(projectPath) {
  const normalized = resolve2(projectPath).replaceAll("\\", "/");
  if (normalized.includes("/.gsd-worktrees/")) return null;
  if (normalized.includes("/.gsd/worktrees/") && !normalized.includes("/.gsd/projects/")) {
    return null;
  }
  const externalDotGsd = /[/\\]\.gsd[/\\]projects[/\\][^/\\]+[/\\]worktrees(?:[/\\]|$)/.exec(normalized);
  if (externalDotGsd && externalDotGsd.index !== void 0) {
    const worktreesIdx = externalDotGsd[0].search(/[/\\]worktrees(?:[/\\]|$)/);
    return resolve2(normalized.slice(0, externalDotGsd.index + worktreesIdx));
  }
  const projectsRoot = join2(process.env.GSD_STATE_DIR || gsdHome(), "projects").replaceAll("\\", "/").replace(/\/+$/, "");
  const marker = `${projectsRoot}/`;
  if (normalized.startsWith(marker)) {
    const rel = normalized.slice(marker.length);
    const slash = rel.indexOf("/");
    if (slash === -1) return null;
    const hash = rel.slice(0, slash);
    const rest = rel.slice(slash + 1);
    if (rest.startsWith("worktrees/") || rest === "worktrees") {
      return resolve2(projectsRoot, hash);
    }
  }
  return null;
}
function resolveWorktreeProjectRoot(basePath, originalBasePath) {
  const explicitOriginal = originalBasePath?.trim();
  if (explicitOriginal) return resolveProjectRootFromPath(explicitOriginal);
  const envProjectRoot = process.env.GSD_PROJECT_ROOT?.trim();
  if (envProjectRoot && isGsdWorktreePath(basePath)) {
    return resolveProjectRootFromPath(envProjectRoot);
  }
  return resolveProjectRootFromPath(basePath || envProjectRoot || process.cwd());
}
function resolveProjectRootFromPath(path2) {
  const normalizedPath = path2.replaceAll("\\", "/");
  const segment = findWorktreeSegment(normalizedPath);
  if (!segment) {
    return resolveNearestBootstrappedGsdRoot(path2) ?? resolveGitWorkingTreeRoot(path2) ?? path2;
  }
  const sepChar = path2.includes("\\") ? "\\" : "/";
  const gsdMarker = `${sepChar}.gsd${sepChar}`;
  const markerIdx = path2.indexOf(gsdMarker);
  const sliceIdx = markerIdx !== -1 ? Math.min(markerIdx, segment.gsdIdx) : segment.gsdIdx;
  const candidate = path2.slice(0, sliceIdx);
  const gsdHomeNorm = normalizeWorktreePathForCompare(gsdHome());
  const candidateGsdPath = normalizeWorktreePathForCompare(join2(candidate, ".gsd"));
  if (candidateGsdPath === gsdHomeNorm || candidateGsdPath.startsWith(`${gsdHomeNorm}/`)) {
    const realRoot = resolveProjectRootFromGitFile(path2);
    return realRoot ?? path2;
  }
  return candidate;
}
function resolveNearestBootstrappedGsdRoot(path2) {
  try {
    let dir = existsSync(path2) && !statSync(path2).isDirectory() ? resolve2(path2, "..") : path2;
    const externalStateParent = normalizeWorktreePathForCompare(resolve2(gsdHome(), ".."));
    for (let i = 0; i < 30; i++) {
      if (normalizeWorktreePathForCompare(dir) === externalStateParent) return null;
      if (hasGsdBootstrapArtifacts(join2(dir, ".gsd"))) return dir;
      const gitPath = join2(dir, ".git");
      if (existsSync(gitPath)) return null;
      const parent = resolve2(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
  }
  return null;
}
function hasGsdBootstrapArtifacts(gsdPath) {
  return existsSync(gsdPath) && (existsSync(join2(gsdPath, "PREFERENCES.md")) || existsSync(join2(gsdPath, "preferences.md")) || existsSync(join2(gsdPath, "milestones")));
}
function resolveGitWorkingTreeRoot(path2) {
  try {
    let dir = existsSync(path2) && !statSync(path2).isDirectory() ? resolve2(path2, "..") : path2;
    const externalStateParent = normalizeWorktreePathForCompare(resolve2(gsdHome(), ".."));
    for (let i = 0; i < 30; i++) {
      if (normalizeWorktreePathForCompare(dir) === externalStateParent) return null;
      const gitPath = join2(dir, ".git");
      if (existsSync(gitPath)) return dir;
      const parent = resolve2(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
  }
  return null;
}
function resolveProjectRootFromGitFile(worktreePath) {
  try {
    let dir = worktreePath;
    for (let i = 0; i < 30; i++) {
      const gitPath = join2(dir, ".git");
      if (existsSync(gitPath)) {
        const content = readFileSync(gitPath, "utf8").trim();
        if (content.startsWith("gitdir: ")) {
          const gitDir = resolve2(dir, content.slice(8));
          const dotGitDir = resolve2(gitDir, "..", "..");
          if (dotGitDir.endsWith(".git") || dotGitDir.endsWith(".git/") || dotGitDir.endsWith(".git\\")) {
            return resolve2(dotGitDir, "..");
          }
          const commonDirPath = join2(gitDir, "commondir");
          if (existsSync(commonDirPath)) {
            const commonDir = readFileSync(commonDirPath, "utf8").trim();
            const resolvedCommonDir = resolve2(gitDir, commonDir);
            return resolve2(resolvedCommonDir, "..");
          }
        }
        break;
      }
      const parent = resolve2(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
  }
  return null;
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/paths.ts
var PLANNING_ARTIFACT_SUFFIXES = [
  "CONTEXT",
  "CONTEXT-DRAFT",
  "ROADMAP",
  "PLAN",
  "REPLAN",
  "SUMMARY",
  "RESEARCH",
  "UI-SPEC",
  "VALIDATION",
  "ASSESSMENT",
  "UAT",
  "DISCUSSION",
  "EVAL-REVIEW",
  "PARKED",
  "VERIFICATION-FAILED",
  "CONTINUE"
];
var PLANNING_ARTIFACT_NAME_RE = new RegExp(
  `^[MST]\\d+-(${PLANNING_ARTIFACT_SUFFIXES.join("|")})\\.md$`,
  "i"
);
var gsdRootCache = /* @__PURE__ */ new Map();
function resolveGsdPathContract(workRoot, originalProjectRoot) {
  const resolvedWorkRoot = resolve3(workRoot || process.cwd());
  const isWorktree = isGsdWorktreePath(resolvedWorkRoot);
  if (isWorktree && !originalProjectRoot?.trim()) {
    const rawProjectGsd = resolveExternalStateProjectGsdFromWorktreePath(resolvedWorkRoot);
    if (rawProjectGsd) {
      const projectGsd2 = normalizeRealPath(rawProjectGsd);
      return {
        projectRoot: dirname(dirname(projectGsd2)),
        workRoot: resolvedWorkRoot,
        projectGsd: projectGsd2,
        worktreeGsd: normalizeRealPath(join3(resolvedWorkRoot, ".gsd")),
        projectDb: join3(projectGsd2, "gsd.db"),
        isWorktree
      };
    }
  }
  const projectRoot = resolve3(resolveWorktreeProjectRoot(resolvedWorkRoot, originalProjectRoot));
  const projectGsd = normalizeRealPath(join3(projectRoot, ".gsd"));
  const worktreeGsd = isWorktree ? normalizeRealPath(join3(resolvedWorkRoot, ".gsd")) : null;
  return {
    projectRoot,
    workRoot: resolvedWorkRoot,
    projectGsd,
    worktreeGsd,
    projectDb: join3(projectGsd, "gsd.db"),
    isWorktree
  };
}
function normalizeRealPath(p) {
  try {
    return realpathSync2.native(p);
  } catch {
    return resolve3(p);
  }
}
function normCacheKey(p) {
  const r = normalizeRealPath(p);
  const s = r.replaceAll("\\", "/").replace(/\/+$/, "");
  return process.platform === "win32" ? s.toLowerCase() : s;
}
function gsdRoot(basePath) {
  const cacheKey = normCacheKey(basePath);
  const cached = gsdRootCache.get(cacheKey);
  if (cached) return cached;
  const result = normalizeRealPath(probeGsdRoot(basePath));
  assertNotGlobalGsdHome(basePath, result);
  gsdRootCache.set(cacheKey, result);
  return result;
}
function assertNotGlobalGsdHome(basePath, result) {
  const norm = (p) => {
    let r;
    try {
      r = realpathSync2.native(p);
    } catch {
      r = p;
    }
    const s = r.replaceAll("\\", "/").replace(/\/+$/, "");
    return process.platform === "win32" ? s.toLowerCase() : s;
  };
  let baseNorm;
  let homeNorm;
  let resultNorm;
  let gsdHomeNorm;
  try {
    baseNorm = norm(basePath);
    homeNorm = norm(homedir2());
    resultNorm = norm(result);
    gsdHomeNorm = norm(gsdHome());
  } catch {
    return;
  }
  if (baseNorm === homeNorm && resultNorm === gsdHomeNorm) {
    throw new Error(
      `Refusing to use ${result} as a project .gsd directory \u2014 that is the global GSD home. Run GSD from inside a project directory.`
    );
  }
}
function isInsideGsdWorktree(p) {
  const normalized = p.replaceAll("\\", "/");
  const segment = findWorktreeSegment(normalized);
  if (!segment) return false;
  const name = normalized.slice(segment.afterWorktrees).split("/")[0];
  return name.length > 0;
}
var MIGRATION_STAGING_DIR_PREFIX = ".gsd-migrate-stage-";
function isInsideMigrationStaging(p) {
  return p.replaceAll("\\", "/").split("/").some((seg) => seg.startsWith(MIGRATION_STAGING_DIR_PREFIX));
}
function probeGsdRoot(rawBasePath) {
  const contract = resolveGsdPathContract(rawBasePath);
  if (contract.isWorktree) return contract.projectGsd;
  const local = join3(rawBasePath, ".gsd");
  if (existsSync2(local)) return local;
  if (isInsideGsdWorktree(rawBasePath)) return local;
  if (isInsideMigrationStaging(rawBasePath)) return local;
  let basePath;
  try {
    basePath = realpathSync2.native(rawBasePath);
  } catch {
    basePath = rawBasePath;
  }
  if (basePath !== rawBasePath && isInsideGsdWorktree(basePath)) return local;
  if (basePath !== rawBasePath && isInsideMigrationStaging(basePath)) return local;
  let gitRoot = null;
  try {
    const out = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: basePath,
      encoding: "utf-8"
    });
    if (out.status === 0) {
      const r = out.stdout.trim();
      if (r) gitRoot = normalize(r);
    }
  } catch {
  }
  const normPath = (p) => {
    let r;
    try {
      r = realpathSync2.native(p);
    } catch {
      r = p;
    }
    const s = r.replaceAll("\\", "/").replace(/\/+$/, "");
    return process.platform === "win32" ? s.toLowerCase() : s;
  };
  let gsdHomeNorm;
  try {
    gsdHomeNorm = normPath(gsdHome());
  } catch {
    gsdHomeNorm = "";
  }
  if (gitRoot) {
    const candidate = join3(gitRoot, ".gsd");
    if (existsSync2(candidate) && normPath(candidate) !== gsdHomeNorm) return candidate;
  }
  if (gitRoot && basePath !== gitRoot) {
    let cur = dirname(basePath);
    while (cur !== basePath) {
      const candidate = join3(cur, ".gsd");
      if (existsSync2(candidate) && normPath(candidate) !== gsdHomeNorm) return candidate;
      if (cur === gitRoot) break;
      basePath = cur;
      cur = dirname(cur);
    }
  }
  return local;
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/preferences.ts
var import_yaml3 = __toESM(require_dist(), 1);
init_format_utils();

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/workflow-logger.ts
import {
  appendFileSync as appendFileSync4,
  closeSync as closeSync9,
  existsSync as existsSync12,
  mkdirSync as mkdirSync7,
  openSync as openSync9,
  readFileSync as readFileSync12
} from "node:fs";
import { join as join16 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/file-lock.ts
var import_proper_lockfile = __toESM(require_proper_lockfile(), 1);
import { existsSync as existsSync3 } from "node:fs";
var DEFAULT_RETRIES = 5;
var DEFAULT_STALE_MS = 1e4;
var SYNC_RETRY_DELAY_MS = 50;
function sleepSync(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function acquireLockSyncWithRetry(filePath, retries, stale, realpath) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return import_proper_lockfile.default.lockSync(filePath, { realpath, stale });
    } catch (err) {
      lastErr = err;
      if (err?.code !== "ELOCKED") throw err;
      if (attempt < retries) sleepSync(SYNC_RETRY_DELAY_MS);
    }
  }
  throw lastErr;
}
function withFileLockSync(filePath, fn, opts = {}) {
  if (!existsSync3(filePath)) return fn();
  const stale = opts.stale ?? DEFAULT_STALE_MS;
  const realpath = opts.realpath ?? true;
  const onLocked = opts.onLocked ?? "fail";
  const retries = onLocked === "skip" ? 0 : opts.retries ?? DEFAULT_RETRIES;
  try {
    const release = acquireLockSyncWithRetry(filePath, retries, stale, realpath);
    try {
      return fn();
    } finally {
      release();
    }
  } catch (err) {
    if (err?.code === "ELOCKED" && onLocked === "skip") {
      return fn();
    }
    throw err;
  }
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/notification-store.ts
import { appendFileSync, existsSync as existsSync4, mkdirSync, openSync, closeSync, readFileSync as readFileSync2, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join as join4 } from "node:path";
import { randomUUID } from "node:crypto";
var MAX_ENTRIES = 500;
var FILENAME = "notifications.jsonl";
var LOCKFILE = "notifications.lock";
var DEDUP_WINDOW_MS = 3e4;
var DEDUP_PRUNE_THRESHOLD = 200;
var _basePath = null;
var _lineCount = 0;
var _suppressCount = 0;
var _recentMessageTimestamps = /* @__PURE__ */ new Map();
var _changeListeners = /* @__PURE__ */ new Set();
function appendNotification(message, severity, source = "notify", meta) {
  if (!_basePath) return;
  if (_suppressCount > 0) return;
  const persistedMessage = message.length > 500 ? message.slice(0, 500) + "\u2026" : message;
  const identity = meta?.kind ? `${meta.kind}:${meta.scope ?? ""}` : persistedMessage;
  const dedupKey = `${_basePath}:${severity}:${source}:${identity}`;
  const now = Date.now();
  const lastSeen = _recentMessageTimestamps.get(dedupKey);
  if (lastSeen !== void 0 && now - lastSeen < DEDUP_WINDOW_MS) return;
  _recentMessageTimestamps.set(dedupKey, now);
  if (_recentMessageTimestamps.size > DEDUP_PRUNE_THRESHOLD) {
    for (const [key, ts] of _recentMessageTimestamps) {
      if (now - ts > DEDUP_WINDOW_MS) _recentMessageTimestamps.delete(key);
    }
  }
  const entry = {
    id: randomUUID(),
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    severity,
    message: persistedMessage,
    source,
    read: false,
    ...meta?.kind ? { kind: meta.kind } : {},
    ...meta?.scope ? { scope: meta.scope } : {}
  };
  try {
    const dir = join4(_basePath, ".gsd");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join4(dir, FILENAME), JSON.stringify(entry) + "\n", "utf-8");
    _lineCount++;
    if (_lineCount > MAX_ENTRIES) {
      _rotate();
    }
    _emitChange();
  } catch {
  }
}
function _readEntriesFromDisk(basePath) {
  const filePath = join4(basePath, ".gsd", FILENAME);
  if (!existsSync4(filePath)) return [];
  try {
    const content = readFileSync2(filePath, "utf-8");
    return content.split("\n").filter((l) => l.length > 0).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter((e) => e !== null);
  } catch {
    return [];
  }
}
function _rotate() {
  if (!_basePath) return;
  try {
    _withLock(_basePath, () => {
      const entries = _readEntriesFromDisk(_basePath);
      if (entries.length <= MAX_ENTRIES) return;
      const trimmed = entries.slice(entries.length - MAX_ENTRIES);
      const lines = trimmed.map((e) => JSON.stringify(e));
      _atomicWrite(_basePath, lines.join("\n") + "\n");
      _lineCount = trimmed.length;
    });
  } catch {
  }
}
function _emitChange() {
  for (const listener of _changeListeners) {
    try {
      listener();
    } catch {
    }
  }
}
function _atomicWrite(basePath, content) {
  const dir = join4(basePath, ".gsd");
  mkdirSync(dir, { recursive: true });
  const target = join4(dir, FILENAME);
  const tmp = target + ".tmp." + process.pid;
  writeFileSync(tmp, content, "utf-8");
  renameSync(tmp, target);
}
function _withLock(basePath, fn) {
  const lockPath = join4(basePath, ".gsd", LOCKFILE);
  let fd = null;
  try {
    mkdirSync(join4(basePath, ".gsd"), { recursive: true });
    fd = openSync(lockPath, "wx");
  } catch (err) {
    if (err?.code === "EEXIST") {
      try {
        const stat = readFileSync2(lockPath, "utf-8");
        const lockTime = parseInt(stat, 10);
        if (Date.now() - lockTime > 5e3) {
          try {
            unlinkSync(lockPath);
          } catch {
          }
          try {
            fd = openSync(lockPath, "wx");
          } catch {
          }
        }
      } catch {
      }
    }
  }
  const createdLock = fd !== null;
  try {
    if (createdLock && fd !== null) {
      writeFileSync(lockPath, String(Date.now()), "utf-8");
      closeSync(fd);
    }
    return fn();
  } finally {
    if (createdLock) {
      try {
        unlinkSync(lockPath);
      } catch {
      }
    }
  }
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/uok/audit.ts
import { appendFileSync as appendFileSync3, closeSync as closeSync8, existsSync as existsSync11, mkdirSync as mkdirSync6, openSync as openSync8 } from "node:fs";
import { dirname as dirname10, join as join15 } from "node:path";
import { randomUUID as randomUUID8 } from "node:crypto";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/auto/turn-epoch.ts
import { AsyncLocalStorage } from "node:async_hooks";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/debug-logger.ts
import { appendFileSync as appendFileSync2, mkdirSync as mkdirSync2, readdirSync as readdirSync2, unlinkSync as unlinkSync2 } from "node:fs";
import { join as join5 } from "node:path";
var _enabled = false;
var _logPath = null;
function debugLog(event, data) {
  if (!_enabled || !_logPath) return;
  const entry = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    event,
    ...data
  };
  try {
    appendFileSync2(_logPath, JSON.stringify(entry) + "\n");
  } catch {
  }
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/auto/turn-epoch.ts
var _currentGeneration = 0;
var turnContext = new AsyncLocalStorage();
function isStaleWrite(component) {
  const store = turnContext.getStore();
  if (!store) return false;
  const captured = store.capturedGen;
  const current = _currentGeneration;
  if (captured < current) {
    debugLog("turnEpoch.stale", {
      component: component ?? "unknown",
      captured,
      current
    });
    return true;
  }
  return false;
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/gsd-db.ts
import { createHash as createHash12 } from "node:crypto";
import { dirname as dirname9 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/phase-dir-rename.ts
import { existsSync as existsSync5, renameSync as renameSync2 } from "node:fs";
import { basename as basename2, join as join6 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/errors.ts
var GSD_STALE_STATE = "GSD_STALE_STATE";
var GSDError = class extends Error {
  code;
  constructor(code, message, options) {
    super(message, options);
    this.name = "GSDError";
    this.code = code;
  }
};

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/gate-registry.ts
var GATE_REGISTRY = {
  Q3: {
    id: "Q3",
    scope: "slice",
    ownerTurn: "gate-evaluate",
    question: "How can this be exploited?",
    guidance: [
      "Identify abuse scenarios: parameter tampering, replay attacks, privilege escalation.",
      "Map data exposure risks: PII, tokens, secrets accessible through this slice.",
      "Define input trust boundaries: untrusted user input reaching DB, API, or filesystem.",
      "If none apply, return verdict 'omitted' with rationale explaining why."
    ].join("\n"),
    promptSection: "Abuse Surface"
  },
  Q4: {
    id: "Q4",
    scope: "slice",
    ownerTurn: "gate-evaluate",
    question: "Which existing requirements (R-IDs) does this slice touch, and which must be re-tested?",
    guidance: [
      "List the R-IDs (e.g. R001, R003) touched by this slice; see the milestone requirements artifact at .gsd/milestones/<id>/REQUIREMENTS.md.",
      "Identify what must be re-tested after shipping.",
      "Flag decisions that should be revisited given the new scope.",
      "If no existing requirements are affected, return verdict 'omitted'."
    ].join("\n"),
    promptSection: "Broken Promises"
  },
  Q5: {
    id: "Q5",
    scope: "task",
    ownerTurn: "execute-task",
    question: "What breaks when dependencies fail?",
    guidance: [
      "Enumerate the task's external dependencies (APIs, filesystem, network, subprocesses).",
      "Describe the failure path for each: timeout, malformed response, connection loss.",
      "Verify the implementation handles each failure or explicitly bubbles the error.",
      "Return verdict 'omitted' only if the task has no external dependencies."
    ].join("\n"),
    promptSection: "Failure Modes"
  },
  Q6: {
    id: "Q6",
    scope: "task",
    ownerTurn: "execute-task",
    question: "What is the 10x load breakpoint?",
    guidance: [
      "Identify the resource that saturates first at 10x the expected load.",
      "Describe the protection applied (pool sizing, rate limiting, pagination, caching).",
      "Return verdict 'omitted' if the task has no runtime load dimension."
    ].join("\n"),
    promptSection: "Load Profile"
  },
  Q7: {
    id: "Q7",
    scope: "task",
    ownerTurn: "execute-task",
    question: "What negative tests protect this task?",
    guidance: [
      "List malformed inputs, error paths, and boundary conditions the tests cover.",
      "Point to the specific test files or cases that assert each negative scenario.",
      "Return verdict 'omitted' only if the task has no meaningful negative surface."
    ].join("\n"),
    promptSection: "Negative Tests"
  },
  Q8: {
    id: "Q8",
    scope: "slice",
    ownerTurn: "complete-slice",
    question: "How will ops know this slice is healthy or broken?",
    guidance: [
      "Describe the health signal (metric, log line, dashboard) that proves the slice works.",
      "Describe the failure signal that triggers an alert or paging.",
      "Document the recovery procedure and any monitoring gaps.",
      "Return verdict 'omitted' only for slices with no runtime behavior at all."
    ].join("\n"),
    promptSection: "Operational Readiness"
  },
  MV01: {
    id: "MV01",
    scope: "milestone",
    ownerTurn: "validate-milestone",
    question: "Is every success criterion in the milestone roadmap satisfied?",
    guidance: [
      "Walk the success-criteria checklist from the milestone roadmap.",
      "For each criterion, point to the slice / assessment / verification evidence that proves it.",
      "Return verdict 'flag' if any criterion is unmet or unverifiable."
    ].join("\n"),
    promptSection: "Success Criteria Checklist"
  },
  MV02: {
    id: "MV02",
    scope: "milestone",
    ownerTurn: "validate-milestone",
    question: "Does every slice have a SUMMARY.md and a passing assessment?",
    guidance: [
      "Confirm every slice listed in the roadmap has a SUMMARY.md.",
      "Confirm each slice has an ASSESSMENT verdict of 'pass' (or justified 'omitted').",
      "Flag missing artifacts and slices with outstanding follow-ups or known limitations."
    ].join("\n"),
    promptSection: "Slice Delivery Audit"
  },
  MV03: {
    id: "MV03",
    scope: "milestone",
    ownerTurn: "validate-milestone",
    question: "Do the slices integrate end-to-end?",
    guidance: [
      "Trace at least one cross-slice flow proving the pieces compose.",
      "Flag gaps where two slices were built in isolation with no integration evidence."
    ].join("\n"),
    promptSection: "Cross-Slice Integration"
  },
  MV04: {
    id: "MV04",
    scope: "milestone",
    ownerTurn: "validate-milestone",
    question: "Are all touched requirements covered and still coherent?",
    guidance: [
      "For each requirement advanced, validated, surfaced, or invalidated across the milestone's slices, confirm the milestone-level evidence matches.",
      "Flag requirements that slices claim to advance but no artifact proves."
    ].join("\n"),
    promptSection: "Requirement Coverage"
  }
};
var ORDERED_GATES = Object.values(GATE_REGISTRY);
function getGatesForTurn(turn) {
  return ORDERED_GATES.filter((g) => g.ownerTurn === turn);
}
function getGateIdsForTurn(turn) {
  return new Set(getGatesForTurn(turn).map((g) => g.id));
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/status-guards.ts
var CANONICAL_STATUSES = [
  "pending",
  "queued",
  "active",
  "parked",
  "in_progress",
  "blocked",
  "complete",
  "skipped",
  "deferred"
];
var CANONICAL_STATUS_SET = new Set(CANONICAL_STATUSES);
var RAW_CLOSED_STATUSES = ["complete", "done", "skipped", "closed", "cancelled"];
var RAW_CLOSED_SET = new Set(RAW_CLOSED_STATUSES);

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/db/engine.ts
import { createRequire as createRequire3 } from "node:module";
import { createHash as createHash2, randomUUID as randomUUID3 } from "node:crypto";
import {
  closeSync as closeSync4,
  constants,
  copyFileSync,
  existsSync as existsSync6,
  fstatSync as fstatSync2,
  fsyncSync as fsyncSync2,
  linkSync as linkSync2,
  lstatSync as lstatSync3,
  openSync as openSync4,
  readFileSync as readFileSync5,
  realpathSync as realpathSync5,
  renameSync as renameSync3,
  unlinkSync as unlinkSync4,
  writeFileSync as writeFileSync3
} from "node:fs";
import { dirname as dirname4, resolve as resolve7 } from "node:path";

// node_modules/@gsd/native/directory-sync.mjs
var native = new Proxy({}, { get() {
  return void 0;
} });

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/database-replacement-paths.ts
import { basename as basename3, dirname as dirname2, join as join7, resolve as resolve4 } from "node:path";
function getDatabaseReplacementPaths(databasePath) {
  if (typeof databasePath !== "string" || databasePath.length === 0 || databasePath === ":memory:") {
    throw new GSDError(GSD_STALE_STATE, "gsd-db: Database replacement requires a file-backed database path");
  }
  const resolvedPath = resolve4(databasePath);
  const recoveryDirectory = join7(dirname2(resolvedPath), `${basename3(resolvedPath)}.recovery`);
  return Object.freeze({
    recoveryDirectory,
    activeIntentPath: join7(recoveryDirectory, "active.json")
  });
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/database-maintenance-fence.ts
import { AsyncLocalStorage as AsyncLocalStorage2 } from "node:async_hooks";
import { randomUUID as randomUUID2 } from "node:crypto";
import {
  closeSync as closeSync2,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync as openSync2,
  readFileSync as readFileSync4,
  realpathSync as realpathSync3,
  unlinkSync as unlinkSync3,
  writeFileSync as writeFileSync2
} from "node:fs";
import { basename as basename4, dirname as dirname3, join as join8, resolve as resolve5 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/process-start-identity.ts
import { createHash } from "node:crypto";
import { readFileSync as readFileSync3 } from "node:fs";
import { createRequire } from "node:module";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/database-maintenance-fence.ts
var owners = new AsyncLocalStorage2();
var projectionClaimSleep = new Int32Array(new SharedArrayBuffer(4));
function pathExistsFailClosed(path2) {
  try {
    lstatSync(path2);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
function canonicalDatabasePath(databasePath) {
  try {
    return realpathSync3.native(databasePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new GSDError(GSD_STALE_STATE, "gsd-db: Cannot prove the database maintenance path", { cause: error });
    }
    try {
      return join8(realpathSync3.native(dirname3(resolve5(databasePath))), basename4(databasePath));
    } catch (parentError) {
      if (parentError.code !== "ENOENT") {
        throw new GSDError(GSD_STALE_STATE, "gsd-db: Cannot prove the database maintenance parent", { cause: parentError });
      }
      return resolve5(databasePath);
    }
  }
}
function databaseMaintenanceIntentPath(databasePath) {
  return `${canonicalDatabasePath(databasePath)}.maintenance.json`;
}
var projectionClaimRegistry = /* @__PURE__ */ new Map();
function nestedProjectionOwnerActive(canonical) {
  if (!owners.getStore()?.has(canonical)) return false;
  const entry = projectionClaimRegistry.get(canonical);
  return entry !== void 0 && (entry.mutationDepth > 0 || entry.ownerDepth > 0);
}
function assertDatabaseMaintenanceFenceAllowsWrite(databasePath) {
  if (databasePath === ":memory:") return;
  const canonical = canonicalDatabasePath(databasePath);
  if (nestedProjectionOwnerActive(canonical)) return;
  const marker = databaseMaintenanceIntentPath(databasePath);
  if (pathExistsFailClosed(marker)) {
    throw new GSDError(
      GSD_STALE_STATE,
      `gsd-db: Database writes are fenced while maintenance intent exists at ${marker}`
    );
  }
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/db-connection-cache.ts
var DbConnectionCache = class {
  entries = /* @__PURE__ */ new Map();
  get(key) {
    return this.entries.get(key);
  }
  set(key, entry) {
    this.entries.set(key, entry);
  }
  has(key) {
    return this.entries.has(key);
  }
  delete(key) {
    return this.entries.delete(key);
  }
  asReadonlyMap() {
    return this.entries;
  }
  closeNonActive(activeDb, closeEntry) {
    for (const [key, entry] of this.entries) {
      if (entry.db === activeDb) continue;
      closeEntry(entry);
      this.entries.delete(key);
    }
  }
};
function createDbConnectionCache() {
  return new DbConnectionCache();
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/db/sql-constants.ts
function currentEvidenceBackedFailureVerdictSqlV39(resultAlias, causalAuthorityAlias) {
  const causalAuthoritySql = causalAuthorityAlias ? `AND verdict.project_revision < ${causalAuthorityAlias}.project_revision
    AND verdict.authority_epoch <= ${causalAuthorityAlias}.authority_epoch` : "";
  return `EXISTS (
  SELECT 1
  FROM workflow_technical_verdicts verdict
  JOIN workflow_acceptance_criteria criterion
    ON criterion.criterion_id = verdict.criterion_id
   AND criterion.project_id = verdict.project_id
   AND criterion.lifecycle_id = verdict.lifecycle_id
  JOIN workflow_verification_evidence evidence
    ON evidence.verdict_id = verdict.verdict_id
   AND evidence.project_id = verdict.project_id
   AND evidence.attempt_id = verdict.attempt_id
  WHERE verdict.project_id = ${resultAlias}.project_id
    AND verdict.lifecycle_id = ${resultAlias}.lifecycle_id
    AND verdict.attempt_id = ${resultAlias}.attempt_id
    AND verdict.verdict IN ('fail', 'inconclusive')
    ${causalAuthoritySql}
    AND NOT EXISTS (
      SELECT 1 FROM workflow_acceptance_criteria successor
      WHERE successor.supersedes_criterion_id = criterion.criterion_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM workflow_technical_verdicts successor
      WHERE successor.supersedes_verdict_id = verdict.verdict_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM workflow_technical_verdicts newer
      JOIN workflow_verification_evidence newer_evidence
        ON newer_evidence.verdict_id = newer.verdict_id
       AND newer_evidence.project_id = newer.project_id
       AND newer_evidence.attempt_id = newer.attempt_id
      WHERE newer.project_id = verdict.project_id
        AND newer.criterion_id = verdict.criterion_id
        AND newer.lifecycle_id = verdict.lifecycle_id
        AND newer.attempt_id = verdict.attempt_id
        AND newer.project_revision > verdict.project_revision
        AND NOT EXISTS (
          SELECT 1 FROM workflow_technical_verdicts successor
          WHERE successor.supersedes_verdict_id = newer.verdict_id
        )
    )
)`;
}
var CURRENT_EVIDENCE_BACKED_FAILURE_VERDICT_SQL = currentEvidenceBackedFailureVerdictSqlV39("result");
var CURRENT_TASK_RECOVERY_CAUSAL_AUTHORITY_SQL = `(
  (observation.boundary_stage = 'execute' AND result.outcome IN ('failed', 'interrupted')) OR
  (observation.boundary_stage = 'verify' AND result.outcome = 'succeeded'
    AND ${CURRENT_EVIDENCE_BACKED_FAILURE_VERDICT_SQL})
)`;
var TERMINAL_STATUS_SQL = RAW_CLOSED_STATUSES.map((s) => `'${s}'`).join(", ");

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/db-open-state.ts
var DbOpenState = class {
  attempted = false;
  lastError = null;
  lastPhase = null;
  markAttempted() {
    this.attempted = true;
  }
  clearError() {
    this.lastError = null;
    this.lastPhase = null;
  }
  recordError(phase, error) {
    this.lastPhase = phase;
    this.lastError = error instanceof Error ? error : new Error(String(error));
  }
  reset() {
    this.attempted = false;
    this.clearError();
  }
  snapshot() {
    return {
      attempted: this.attempted,
      lastError: this.lastError,
      lastPhase: this.lastPhase
    };
  }
};
function createDbOpenState() {
  return new DbOpenState();
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/db-transaction.ts
var DbTransactionRunner = class {
  depth = 0;
  isInTransaction() {
    return this.depth > 0;
  }
  transaction(controls, fn) {
    return this.runTransaction(controls, () => controls.begin(), fn);
  }
  /**
   * Run a BEGIN IMMEDIATE transaction through the same depth counter as regular
   * transactions so callers can compose it inside existing transaction scopes.
   */
  immediateTransaction(controls, fn) {
    if (!controls.beginImmediate) {
      throw new Error("db transaction controls do not support immediate transactions");
    }
    return this.runTransaction(controls, () => controls.beginImmediate(), fn);
  }
  readTransaction(controls, fn, logRollbackError) {
    return this.runTransaction(controls, () => controls.beginRead(), fn, logRollbackError);
  }
  runTransaction(controls, begin, fn, logRollbackError) {
    if (this.depth > 0) {
      return this.runNested(fn);
    }
    begin();
    this.depth++;
    try {
      const result = fn();
      controls.commit();
      return result;
    } catch (err) {
      this.rollback(controls, logRollbackError);
      throw err;
    } finally {
      this.depth--;
    }
  }
  runNested(fn) {
    this.depth++;
    try {
      return fn();
    } finally {
      this.depth--;
    }
  }
  rollback(controls, logRollbackError) {
    if (!logRollbackError) {
      controls.rollback();
      return;
    }
    try {
      controls.rollback();
    } catch (rollbackErr) {
      logRollbackError(rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr)));
    }
  }
};
function createDbTransactionRunner() {
  return new DbTransactionRunner();
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/sqlite-readonly.ts
import { createRequire as createRequire2 } from "node:module";
import { fstatSync, lstatSync as lstatSync2, readdirSync as readdirSync3, readSync, realpathSync as realpathSync4 } from "node:fs";
import { resolve as resolve6 } from "node:path";
import { pathToFileURL } from "node:url";

// node_modules/@gsd/native/file-identity.mjs
var native2 = new Proxy({}, { get() {
  return void 0;
} });

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/db-provider.ts
import { closeSync as closeSync3, openSync as openSync3 } from "node:fs";
import { pathToFileURL as pathToFileURL2 } from "node:url";
var MIN_SQLITE_NODE_VERSION = "22.18.0";
function isClosedDatabaseError(error) {
  return /database (?:is )?not open|database is closed/iu.test(String(error));
}
function versionTuple(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
function supportsRequiredSqliteApi(version) {
  const actual = versionTuple(version);
  const minimum = versionTuple(MIN_SQLITE_NODE_VERSION);
  if (!actual) return false;
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] !== minimum[index]) return actual[index] > minimum[index];
  }
  return true;
}
function suppressSqliteWarning() {
  const origEmit = process.emit;
  process.emit = function(event, ...args) {
    if (event === "warning" && args[0] && typeof args[0] === "object" && "name" in args[0] && args[0].name === "ExperimentalWarning" && "message" in args[0] && typeof args[0].message === "string" && args[0].message.includes("SQLite")) {
      return false;
    }
    return origEmit.apply(process, [event, ...args]);
  };
}
function withReadOnlyCloseGuard(writable, readOnlyGuard) {
  let writableClosed = false;
  let guardClosed = false;
  function closeHandle(database) {
    try {
      database.close();
    } catch (error) {
      try {
        database.prepare("PRAGMA schema_version").get();
      } catch (probeError) {
        if (isClosedDatabaseError(probeError)) return;
      }
      throw error;
    }
  }
  return {
    exec(sql) {
      writable.exec(sql);
    },
    prepare(sql) {
      return writable.prepare(sql);
    },
    close() {
      if (guardClosed) return;
      if (!writableClosed) {
        try {
          readOnlyGuard.prepare("PRAGMA schema_version").get();
        } catch (error) {
          const journalMode = writable.prepare("PRAGMA journal_mode").get()?.["journal_mode"];
          if (journalMode !== "delete") throw error;
        }
        closeHandle(writable);
        writableClosed = true;
      }
      closeHandle(readOnlyGuard);
      guardClosed = true;
    }
  };
}
var SqliteProviderLoader = class {
  providerModule = null;
  loadAttempted = false;
  deps;
  constructor(deps) {
    this.deps = deps;
  }
  load() {
    if (this.loadAttempted) return;
    this.loadAttempted = true;
    const supportedRuntime = supportsRequiredSqliteApi(this.deps.nodeVersion);
    if (supportedRuntime) {
      try {
        this.deps.suppressSqliteWarning();
        const mod = this.deps.tryRequireNodeSqlite();
        if (mod.DatabaseSync) {
          this.providerModule = mod;
          return;
        }
      } catch {
        this.providerModule = null;
      }
    }
    const versionHint = supportedRuntime ? " Use a Node build with node:sqlite enabled." : ` GSD requires Node >= ${MIN_SQLITE_NODE_VERSION} for node:sqlite (current: v${this.deps.nodeVersion}). Upgrade Node to fix this.`;
    this.deps.writeStderr(`gsd-db: No SQLite provider available.${versionHint}
`);
  }
  getProviderName() {
    return this.providerModule ? "node:sqlite" : null;
  }
  openRaw(path2, options = {}) {
    this.load();
    const DatabaseSync = this.providerModule?.DatabaseSync;
    if (!DatabaseSync) return null;
    if (path2 === ":memory:") return new DatabaseSync(path2);
    const createIfMissing = options.createIfMissing !== false;
    if (createIfMissing) closeSync3(openSync3(path2, "a"));
    const readOnlyGuard = new DatabaseSync(path2, { readOnly: true });
    try {
      let writablePath = path2;
      if (!createIfMissing) {
        writablePath = pathToFileURL2(path2);
        writablePath.searchParams.set("mode", "rw");
      }
      return withReadOnlyCloseGuard(new DatabaseSync(writablePath), readOnlyGuard);
    } catch (error) {
      readOnlyGuard.close();
      throw error;
    }
  }
  reset() {
    this.loadAttempted = false;
    this.providerModule = null;
  }
};
function createSqliteProviderLoader(deps) {
  return new SqliteProviderLoader(deps);
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/db/engine.ts
var _gsdRequire;
function getGsdRequire() {
  if (_gsdRequire !== void 0) return _gsdRequire;
  try {
    const packageRoot = process.env.GSD_WEB_PACKAGE_ROOT || process.env.GSD_PKG_ROOT || process.cwd();
    _gsdRequire = createRequire3(resolve7(packageRoot, "package.json"));
  } catch {
    _gsdRequire = null;
  }
  return _gsdRequire;
}
var providerLoader = createSqliteProviderLoader({
  tryRequireNodeSqlite: () => {
    const req = getGsdRequire();
    if (!req) throw new Error("unavailable");
    return req("node:sqlite");
  },
  suppressSqliteWarning,
  nodeVersion: process.versions.node,
  writeStderr: (message) => process.stderr.write(message)
});
var currentDb = null;
var currentPath = null;
var _dbOpenState = createDbOpenState();
var DB_OPEN_BUSY_SLEEP = new Int32Array(new SharedArrayBuffer(4));
var _dbCache = createDbConnectionCache();
function closeQuietly(descriptor) {
  try {
    closeSync4(descriptor);
  } catch {
  }
}
var _databaseReplacementIntentHandleRegistry = new FinalizationRegistry(
  (descriptor) => {
    closeQuietly(descriptor);
  }
);
var _databaseReplacementWriteBypassDepth = 0;
function pathExistsFailClosed2(path2) {
  try {
    lstatSync3(path2);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw new GSDError(
      GSD_STALE_STATE,
      `gsd-db: Cannot inspect database replacement fence at ${path2}`,
      { cause: error }
    );
  }
}
function assertDatabaseReplacementFenceAllowsWrite() {
  if (_databaseReplacementWriteBypassDepth > 0 || !currentPath || currentPath === ":memory:") return;
  assertDatabaseReplacementFenceAllowsPath(currentPath);
  assertDatabaseMaintenanceFenceAllowsWrite(currentPath);
}
function assertDatabaseReplacementFenceAllowsPath(databasePath) {
  if (_databaseReplacementWriteBypassDepth > 0 || databasePath === ":memory:") return;
  const { activeIntentPath } = getDatabaseReplacementPaths(databasePath);
  if (pathExistsFailClosed2(activeIntentPath)) {
    throw new GSDError(
      GSD_STALE_STATE,
      `gsd-db: Database writes are fenced while replacement intent exists at ${activeIntentPath}`
    );
  }
}
function isDbAvailable() {
  return currentDb !== null;
}
var _transactionRunner = createDbTransactionRunner();
function beginWriteTransaction(db) {
  db.exec("BEGIN IMMEDIATE");
  try {
    assertDatabaseReplacementFenceAllowsWrite();
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch (rollbackError) {
      throw new GSDError(
        GSD_STALE_STATE,
        "gsd-db: Database replacement fence rejected a writer and rollback failed",
        { cause: rollbackError }
      );
    }
    throw error;
  }
}
function createTransactionControls(db) {
  return {
    begin: () => beginWriteTransaction(db),
    beginRead: () => db.exec("BEGIN DEFERRED"),
    beginImmediate: () => beginWriteTransaction(db),
    commit: () => db.exec("COMMIT"),
    rollback: () => db.exec("ROLLBACK")
  };
}
function transaction(fn) {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  if (!_transactionRunner.isInTransaction()) assertDatabaseReplacementFenceAllowsWrite();
  return _transactionRunner.transaction(createTransactionControls(currentDb), fn);
}
function getDbOrNull() {
  return currentDb;
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/db/writers/import-restore.ts
import { createHash as createHash3 } from "node:crypto";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/db/writers/reconcile.ts
import { existsSync as existsSync7, mkdirSync as mkdirSync3, realpathSync as realpathSync6 } from "node:fs";
import { dirname as dirname5 } from "node:path";
import { createHash as createHash4 } from "node:crypto";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/db/writers/lifecycle-commands.ts
import { randomUUID as randomUUID5 } from "node:crypto";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/db/domain-operation.ts
import { createHash as createHash6, randomUUID as randomUUID4 } from "node:crypto";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/legacy-import-preview.ts
import { createHash as createHash5 } from "node:crypto";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/legacy-import-preview-classifier-targets.ts
var LEGACY_IMPORT_TARGET_ADAPTERS = {
  milestone: {
    rowSet: "milestones",
    identity: { kind: "scalar", fields: ["id"] },
    fields: /* @__PURE__ */ new Set([
      "id",
      "title",
      "status",
      "depends_on",
      "completed_at",
      "vision",
      "success_criteria",
      "key_risks",
      "proof_strategy",
      "verification_contract",
      "verification_integration",
      "verification_operational",
      "verification_uat",
      "definition_of_done",
      "requirement_coverage",
      "boundary_map_markdown",
      "sequence"
    ]),
    metadata: /* @__PURE__ */ new Set(["layout", "grammar", "source_alias", "legacy_provenance"]),
    aliases: {}
  },
  slice: {
    rowSet: "slices",
    identity: { kind: "hierarchy", fields: ["milestone_id", "id"] },
    fields: /* @__PURE__ */ new Set([
      "milestone_id",
      "id",
      "title",
      "status",
      "risk",
      "depends",
      "demo",
      "completed_at",
      "full_summary_md",
      "full_uat_md",
      "goal",
      "success_criteria",
      "proof_level",
      "integration_closure",
      "observability_impact",
      "target_repositories",
      "sequence",
      "replan_triggered_at",
      "is_sketch",
      "sketch_scope"
    ]),
    metadata: /* @__PURE__ */ new Set([
      "layout",
      "grammar",
      "source_alias",
      "task_count",
      "tasks",
      "legacy_phase_number",
      "legacy_provenance"
    ]),
    aliases: { depends_on: "depends", sketch: "is_sketch", canonical_sequence: "sequence" }
  },
  task: {
    rowSet: "tasks",
    identity: { kind: "hierarchy", fields: ["milestone_id", "slice_id", "id"] },
    fields: /* @__PURE__ */ new Set([
      "milestone_id",
      "slice_id",
      "id",
      "title",
      "status",
      "one_liner",
      "narrative",
      "verification_result",
      "duration",
      "completed_at",
      "blocker_discovered",
      "blocker_source",
      "escalation_pending",
      "escalation_awaiting_review",
      "escalation_artifact_path",
      "escalation_override_applied_at",
      "deviations",
      "known_issues",
      "key_files",
      "key_decisions",
      "full_summary_md",
      "description",
      "estimate",
      "files",
      "verify",
      "inputs",
      "expected_output",
      "observability_impact",
      "full_plan_md",
      "target_repositories",
      "sequence"
    ]),
    metadata: /* @__PURE__ */ new Set([
      "layout",
      "grammar",
      "source_alias",
      "numbering_provenance",
      "legacy_provenance"
    ]),
    aliases: {
      summary: "full_summary_md",
      objective: "description",
      canonical_sequence: "sequence"
    }
  },
  requirement: {
    rowSet: "requirements",
    identity: { kind: "scalar", fields: ["id"] },
    fields: /* @__PURE__ */ new Set([
      "id",
      "class",
      "status",
      "description",
      "why",
      "source",
      "primary_owner",
      "supporting_slices",
      "validation",
      "notes",
      "full_content",
      "superseded_by"
    ]),
    metadata: /* @__PURE__ */ new Set(["title"]),
    aliases: { text: "description" }
  },
  artifact: {
    rowSet: "artifacts",
    identity: { kind: "scalar", fields: ["path"] },
    fields: /* @__PURE__ */ new Set(["path", "artifact_type", "milestone_id", "slice_id", "task_id", "full_content", "content_hash"]),
    metadata: /* @__PURE__ */ new Set(),
    aliases: { content: "full_content" }
  },
  assessment: {
    rowSet: "assessments",
    identity: { kind: "assessment", fields: ["milestone_id", "slice_id", "task_id", "scope"] },
    fields: /* @__PURE__ */ new Set(["milestone_id", "slice_id", "task_id", "status", "scope", "full_content", "path"]),
    metadata: /* @__PURE__ */ new Set(["authority", "legacy_verdict", "result_shape"]),
    aliases: { verdict: "status" }
  },
  decision: {
    rowSet: "decisions",
    identity: { kind: "scalar", fields: ["id"] },
    fields: /* @__PURE__ */ new Set([
      "id",
      "when_context",
      "scope",
      "decision",
      "choice",
      "rationale",
      "revisable",
      "made_by",
      "source",
      "superseded_by"
    ]),
    metadata: /* @__PURE__ */ new Set(["seq"]),
    aliases: {}
  }
};

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/legacy-import-preview-interpretation.ts
import { isUtf8 } from "node:buffer";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/legacy-import-preview-json.ts
import { isUtf8 as isUtf82 } from "node:buffer";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/legacy-import-preview-gsd-lifecycle.ts
var MILESTONE_ID = "M\\d+(?:-[a-z0-9]+)?";
var SLICE_ID = "S\\d+";
var TASK_ID = "T\\d+";
var MILESTONE_ID_PATTERN = new RegExp(`^${MILESTONE_ID}$`, "u");
var SLICE_ID_PATTERN = new RegExp(`^${SLICE_ID}$`, "u");
var TASK_ID_PATTERN = new RegExp(`^${TASK_ID}$`, "u");

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/legacy-import-preview-gsd.ts
var EMPTY = Object.freeze([]);

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/legacy-import-preview-gsd-workflows.ts
var import_yaml2 = __toESM(require_dist(), 1);

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/definition-loader.ts
var import_yaml = __toESM(require_dist(), 1);
import { readFileSync as readFileSync6, existsSync as existsSync8 } from "node:fs";
import { join as join10 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/knowledge-parser.ts
import { existsSync as existsSync9, readFileSync as readFileSync7 } from "node:fs";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/legacy-import-preview-worktree.ts
import { isUtf8 as isUtf83 } from "node:buffer";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/legacy-import-preview-supplemental.ts
var EMPTY_DATABASE_EVIDENCE = Object.freeze([]);
var EMPTY_DEFINITION_NAMES = Object.freeze([]);

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/legacy-import-database-target-inspector.ts
import { mkdtempSync, readFileSync as readFileSync8, rmSync, writeFileSync as writeFileSync4 } from "node:fs";
import { tmpdir } from "node:os";
import { join as join11 } from "node:path";
var SQLITE_HEADER = Buffer.from("SQLite format 3\0", "binary");

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/legacy-import-preview-source.ts
import {
  closeSync as closeSync5,
  constants as constants2,
  fstatSync as fstatSync3,
  lstatSync as lstatSync4,
  openSync as openSync5,
  readFileSync as readFileSync9,
  readdirSync as readdirSync4,
  readlinkSync,
  realpathSync as realpathSync7
} from "node:fs";
import { dirname as dirname6, isAbsolute, posix, relative as relative2, resolve as resolve8, sep } from "node:path";
var DEFAULT_CAPTURE_LIMITS = {
  max_entries: 1e5,
  max_total_bytes: 256 * 1024 * 1024,
  max_depth: 128
};

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/project-authority-cutover-domain-operation.ts
import { createHash as createHash8 } from "node:crypto";
import { readFileSync as readFileSync10 } from "node:fs";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/db/writers/authority-recovery.ts
import { randomUUID as randomUUID6 } from "node:crypto";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/legacy-import-backup.ts
import { createHash as createHash7, randomUUID as createRandomUUID } from "node:crypto";
import {
  closeSync as closeSync6,
  constants as fsConstants,
  fstatSync as fstatSync4,
  fsyncSync as fsyncSync3,
  linkSync as linkSync3,
  lstatSync as lstatSync5,
  mkdirSync as mkdirSync4,
  openSync as openSync6,
  readSync as readSync2,
  readdirSync as readdirSync5,
  realpathSync as realpathSync8,
  rmSync as rmSync2,
  statSync as statSync3
} from "node:fs";
import { basename as basename5, dirname as dirname7, isAbsolute as isAbsolute2, join as join12, relative as relative3, resolve as resolve9, sep as sep2 } from "node:path";
var SNAPSHOT_READ_BUFFER_SIZE = 64 * 1024;

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/db/writers/legacy-import-application.ts
var ROW_DEFINITIONS = {
  milestone: definition("milestones", ["id"], LEGACY_IMPORT_TARGET_ADAPTERS.milestone.fields),
  slice: definition("slices", ["milestone_id", "id"], LEGACY_IMPORT_TARGET_ADAPTERS.slice.fields),
  task: definition("tasks", ["milestone_id", "slice_id", "id"], LEGACY_IMPORT_TARGET_ADAPTERS.task.fields),
  requirement: definition("requirements", ["id"], LEGACY_IMPORT_TARGET_ADAPTERS.requirement.fields),
  artifact: definition("artifacts", ["path"], LEGACY_IMPORT_TARGET_ADAPTERS.artifact.fields),
  assessment: definition(
    "assessments",
    ["path", "milestone_id", "slice_id", "task_id", "scope"],
    LEGACY_IMPORT_TARGET_ADAPTERS.assessment.fields
  )
};
function definition(table, identity, fields) {
  return { table, identity, fields };
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/legacy-import-live-restore.ts
import { createHash as createHash9, randomUUID as randomUUID7 } from "node:crypto";
import {
  chmodSync,
  closeSync as closeSync7,
  constants as fsConstants2,
  copyFileSync as copyFileSync2,
  existsSync as existsSync10,
  fstatSync as fstatSync5,
  fsyncSync as fsyncSync4,
  lstatSync as lstatSync6,
  linkSync as linkSync4,
  mkdirSync as mkdirSync5,
  openSync as openSync7,
  readFileSync as readFileSync11,
  readdirSync as readdirSync6,
  realpathSync as realpathSync9,
  renameSync as renameSync4,
  rmdirSync,
  unlinkSync as unlinkSync5,
  writeFileSync as writeFileSync5
} from "node:fs";
import { dirname as dirname8, isAbsolute as isAbsolute3, join as join13 } from "node:path";
var INTENT_FILE = "active.json";
var RECOVERY_CLAIM_PREFIX = `${INTENT_FILE}.recovery-claim-`;

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/db/queries.ts
import { createHash as createHash11 } from "node:crypto";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/lifecycle-shadow-observation.ts
import { createHash as createHash10 } from "node:crypto";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/gsd-db.ts
function insertAuditEvent(entry) {
  if (!getDbOrNull()) return;
  transaction(() => {
    getDbOrNull().prepare(
      `INSERT OR IGNORE INTO audit_events (
        event_id, trace_id, turn_id, caused_by, category, type, ts, payload_json
      ) VALUES (
        :event_id, :trace_id, :turn_id, :caused_by, :category, :type, :ts, :payload_json
      )`
    ).run({
      ":event_id": entry.eventId,
      ":trace_id": entry.traceId,
      ":turn_id": entry.turnId ?? null,
      ":caused_by": entry.causedBy ?? null,
      ":category": entry.category,
      ":type": entry.type,
      ":ts": entry.ts,
      ":payload_json": JSON.stringify(entry.payload ?? {})
    });
    if (entry.turnId) {
      const row = getDbOrNull().prepare(
        `SELECT event_count, first_ts, last_ts
         FROM audit_turn_index
         WHERE trace_id = :trace_id AND turn_id = :turn_id`
      ).get({
        ":trace_id": entry.traceId,
        ":turn_id": entry.turnId
      });
      if (row) {
        getDbOrNull().prepare(
          `UPDATE audit_turn_index
           SET first_ts = CASE WHEN :ts < first_ts THEN :ts ELSE first_ts END,
               last_ts = CASE WHEN :ts > last_ts THEN :ts ELSE last_ts END,
               event_count = event_count + 1
           WHERE trace_id = :trace_id AND turn_id = :turn_id`
        ).run({
          ":trace_id": entry.traceId,
          ":turn_id": entry.turnId,
          ":ts": entry.ts
        });
      } else {
        getDbOrNull().prepare(
          `INSERT INTO audit_turn_index (trace_id, turn_id, first_ts, last_ts, event_count)
           VALUES (:trace_id, :turn_id, :first_ts, :last_ts, :event_count)`
        ).run({
          ":trace_id": entry.traceId,
          ":turn_id": entry.turnId,
          ":first_ts": entry.ts,
          ":last_ts": entry.ts,
          ":event_count": 1
        });
      }
    }
  });
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/uok/contracts.ts
var CURRENT_UOK_CONTRACT_VERSION = "1";
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizeVersion(value) {
  return value === CURRENT_UOK_CONTRACT_VERSION ? CURRENT_UOK_CONTRACT_VERSION : "0";
}
function requireString(value, key, issues) {
  if (typeof value[key] !== "string" || value[key] === "") {
    issues.push({ path: key, message: `${key} must be a non-empty string` });
  }
}
function requireRecord(value, key, issues) {
  if (!isRecord(value[key])) {
    issues.push({ path: key, message: `${key} must be an object` });
  }
}
function normalizeAuditEvent(value) {
  return { ...value, version: normalizeVersion(value.version) };
}
function validateAuditEvent(value) {
  const normalized = normalizeAuditEvent(value);
  const record = normalized;
  const issues = [];
  requireString(record, "eventId", issues);
  requireString(record, "traceId", issues);
  requireString(record, "category", issues);
  requireString(record, "type", issues);
  requireString(record, "ts", issues);
  requireRecord(record, "payload", issues);
  return { ok: issues.length === 0, value: normalized, issues };
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/uok/audit-toggle.ts
var AUDIT_ENV_KEY = "GSD_UOK_AUDIT_UNIFIED";
var suppressedBasePaths = /* @__PURE__ */ new Set();
function isUnifiedAuditEnabled(basePath) {
  if (basePath && suppressedBasePaths.has(basePath)) return false;
  return process.env[AUDIT_ENV_KEY] !== "0";
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/uok/audit.ts
function auditLogPath(basePath) {
  return join15(gsdRoot(basePath), "audit", "events.jsonl");
}
function appendLockedJsonl(path2, event) {
  mkdirSync6(dirname10(path2), { recursive: true });
  if (!existsSync11(path2)) closeSync8(openSync8(path2, "a"));
  withFileLockSync(
    path2,
    () => {
      appendFileSync3(path2, `${JSON.stringify(event)}
`, "utf-8");
    },
    { onLocked: "skip" }
  );
}
function appendAuditProjection(basePath, event) {
  appendLockedJsonl(auditLogPath(basePath), event);
}
function buildAuditEnvelope(args) {
  return {
    version: CURRENT_UOK_CONTRACT_VERSION,
    eventId: randomUUID8(),
    traceId: args.traceId,
    turnId: args.turnId,
    causedBy: args.causedBy,
    category: args.category,
    type: args.type,
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    payload: args.payload ?? {}
  };
}
function emitUokAuditEvent(basePath, event) {
  if (isStaleWrite("uok-audit")) return;
  if (!isUnifiedAuditEnabled(basePath)) return;
  const validation = validateAuditEvent(event);
  if (!validation.ok) {
    throw new Error(`Invalid UOK audit event: ${validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
  }
  const canonical = validation.value;
  if (isDbAvailable()) {
    try {
      insertAuditEvent({
        ...canonical,
        payload: {
          ...canonical.payload,
          contractVersion: canonical.version ?? CURRENT_UOK_CONTRACT_VERSION
        }
      });
    } catch (err) {
      throw new Error(`DB authoritative audit write failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  try {
    appendAuditProjection(basePath, canonical);
  } catch {
  }
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/workflow-logger.ts
var MAX_BUFFER = 100;
var _buffer = [];
var _auditBasePath = null;
var _stderrEnabled = true;
function logWarning(component, message, context) {
  _push("warn", component, message, context);
}
function _push(severity, component, message, context) {
  const entry = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    severity,
    component,
    message,
    ...context ? { context } : {}
  };
  if (severity === "error") {
    const ctxStr = context ? ` ${JSON.stringify(context)}` : "";
    _writeStderr(`[gsd:${component}] ERROR: ${message}${ctxStr}
`);
  }
  try {
    appendNotification(
      `[${component}] ${message}`,
      severity === "error" ? "error" : "warning",
      "workflow-logger"
    );
  } catch (notifErr) {
    _writeStderr(`[gsd:workflow-logger] notification-store append failed: ${notifErr.message}
`);
  }
  _buffer.push(entry);
  if (_buffer.length > MAX_BUFFER) {
    _buffer.shift();
  }
  if (_auditBasePath && isUnifiedAuditEnabled(_auditBasePath)) {
    try {
      emitUokAuditEvent(
        _auditBasePath,
        buildAuditEnvelope({
          traceId: `workflow-log:${component}`,
          turnId: context?.id,
          causedBy: context?.fn ?? context?.tool,
          category: "orchestration",
          type: severity === "error" ? "workflow-log-error" : "workflow-log-warn",
          payload: {
            component,
            message,
            context: context ?? {}
          }
        })
      );
    } catch (auditEmitErr) {
      _writeStderr(`[gsd:workflow-logger] unified-audit emit failed: ${auditEmitErr.message}
`);
    }
  }
  if (_auditBasePath && severity === "error") {
    try {
      const auditDir = join16(_auditBasePath, ".gsd");
      mkdirSync7(auditDir, { recursive: true });
      const auditPath = join16(auditDir, "audit-log.jsonl");
      const sanitized = _sanitizeForAudit(entry);
      if (!existsSync12(auditPath)) closeSync9(openSync9(auditPath, "a"));
      withFileLockSync(
        auditPath,
        () => {
          appendFileSync4(auditPath, JSON.stringify(sanitized) + "\n", "utf-8");
        },
        { onLocked: "skip" }
      );
    } catch (auditErr) {
      _writeStderr(`[gsd:audit] failed to persist log entry: ${auditErr.message}
`);
    }
  }
}
function _writeStderr(message) {
  if (!_stderrEnabled) return;
  process.stderr.write(message);
}
function _sanitizeForAudit(entry) {
  const sanitized = {
    ts: entry.ts,
    severity: entry.severity,
    component: entry.component,
    // Truncate message to avoid persisting oversized raw error dumps
    message: entry.message.length > 200 ? entry.message.slice(0, 200) + "\u2026[truncated]" : entry.message
  };
  if (entry.context) {
    const SAFE_KEYS = /* @__PURE__ */ new Set(["fn", "tool", "mid", "sid", "tid", "worktree", "id", "error", "count"]);
    const filtered = {};
    for (const [k, v] of Object.entries(entry.context)) {
      if (SAFE_KEYS.has(k)) {
        filtered[k] = v;
      }
    }
    if (Object.keys(filtered).length > 0) {
      sanitized.context = filtered;
    }
  }
  return sanitized;
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/preferences-models.ts
import { existsSync as existsSync15, readFileSync as readFileSync15, writeFileSync as writeFileSync8 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { join as join19 } from "node:path";

// node_modules/@gsd/pi-ai/index.js
var unavailable = (name) => (arg) => typeof arg === "string" ? arg : void 0;
var parseMcpToolName = unavailable("parseMcpToolName");
var stripMcpToolPrefix = unavailable("stripMcpToolPrefix");
var getProviderCapabilities = unavailable("getProviderCapabilities");
var getProviders = unavailable("getProviders");
var getModels = unavailable("getModels");
var Type = new Proxy(
  {},
  { get: (_t, prop) => (...args) => ({ type: String(prop), ...args[0] ?? {} }) }
);

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/model-router.ts
init_pi_coding_agent();

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/complexity-classifier.ts
import { existsSync as existsSync14, readFileSync as readFileSync14 } from "node:fs";
import { join as join18 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/routing-history.ts
import { join as join17 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/json-persistence.ts
import { existsSync as existsSync13, readFileSync as readFileSync13, writeFileSync as writeFileSync6, mkdirSync as mkdirSync8, renameSync as renameSync5 } from "node:fs";
import { dirname as dirname11 } from "node:path";
import { randomBytes } from "node:crypto";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/complexity-classifier.ts
function tierOrdinal(tier) {
  switch (tier) {
    case "light":
      return 0;
    case "standard":
      return 1;
    case "heavy":
      return 2;
  }
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/legacy-telemetry.ts
import { mkdirSync as mkdirSync9, writeFileSync as writeFileSync7 } from "node:fs";
import { dirname as dirname12 } from "node:path";
var COUNTERS = [
  "legacy.workflowEngineUsed",
  "legacy.uokFallbackUsed",
  "legacy.mcpAliasUsed",
  "legacy.componentFormatUsed",
  "legacy.providerDefaultUsed"
];
var values = Object.fromEntries(
  COUNTERS.map((counter) => [counter, 0])
);
var warnedCounters = /* @__PURE__ */ new Set();
var DIAGNOSTICS = {
  "legacy.workflowEngineUsed": "Deprecated workflow engine path used; prefer auto-milestone workflow templates before removing legacy engines.",
  "legacy.uokFallbackUsed": "Deprecated UOK fallback path used; resolve UOK kernel blockers before removing parity fallback wrappers.",
  "legacy.mcpAliasUsed": "Deprecated MCP alias tool used; update callers to the canonical gsd_* tool name before alias removal.",
  "legacy.componentFormatUsed": "Deprecated component format loaded; migrate skills/agents to component.yaml before removing legacy loaders.",
  "legacy.providerDefaultUsed": "Provider-specific default fallback used without an explicit available model; configure provider-aware model preferences before removing defaults."
};
process.once("beforeExit", persistLegacyTelemetry);
function incrementLegacyTelemetry(counter, amount = 1) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  values[counter] += amount;
  emitLegacyDiagnostic(counter);
  persistLegacyTelemetry();
}
function getLegacyTelemetry() {
  return { ...values };
}
function getLegacyTelemetryReport() {
  return {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    counters: getLegacyTelemetry()
  };
}
function emitLegacyDiagnostic(counter) {
  if (warnedCounters.has(counter)) return;
  warnedCounters.add(counter);
  logWarning("migration", DIAGNOSTICS[counter], { counter });
}
function persistLegacyTelemetry() {
  const outputPath = process.env.GSD_LEGACY_TELEMETRY_FILE?.trim();
  if (!outputPath) return;
  try {
    mkdirSync9(dirname12(outputPath), { recursive: true });
    writeFileSync7(outputPath, `${JSON.stringify(getLegacyTelemetryReport(), null, 2)}
`, "utf-8");
  } catch {
  }
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/model-cost-table.ts
function stripProviderPrefix(modelId) {
  if (!modelId.includes("/")) return modelId;
  return modelId.split("/").pop() ?? modelId;
}
function toFiniteNonNegativeNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : void 0;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : void 0;
  }
  return void 0;
}
function normalizeTokenPriceTier(value) {
  if (!value || typeof value !== "object") return void 0;
  const record = value;
  const inputPer1k = toFiniteNonNegativeNumber(record.inputPer1k);
  const outputPer1k = toFiniteNonNegativeNumber(record.outputPer1k);
  if (inputPer1k === void 0 || outputPer1k === void 0) return void 0;
  const cachedInputPer1k = toFiniteNonNegativeNumber(record.cachedInputPer1k);
  const cachedOutputPer1k = toFiniteNonNegativeNumber(record.cachedOutputPer1k);
  const inputTokensAbove = toFiniteNonNegativeNumber(record.inputTokensAbove);
  return {
    inputPer1k,
    outputPer1k,
    ...cachedInputPer1k !== void 0 ? { cachedInputPer1k } : {},
    ...cachedOutputPer1k !== void 0 ? { cachedOutputPer1k } : {},
    ...inputTokensAbove !== void 0 ? { inputTokensAbove } : {}
  };
}
function normalizeLongContextTiers(value) {
  if (!Array.isArray(value)) return void 0;
  const tiers = value.map((entry) => normalizeTokenPriceTier(entry)).filter(
    (entry) => !!entry && typeof entry.inputTokensAbove === "number"
  ).sort((a, b) => a.inputTokensAbove - b.inputTokensAbove);
  return tiers.length > 0 ? tiers : void 0;
}
function computePromotionStatus(startsAt, endsAt, now = Date.now()) {
  const startsAtMs = startsAt ? Date.parse(startsAt) : Number.NaN;
  const endsAtMs = endsAt ? Date.parse(endsAt) : Number.NaN;
  if (Number.isFinite(startsAtMs) && startsAtMs > now) return "future";
  if (Number.isFinite(endsAtMs) && endsAtMs < now) return "expired";
  if (Number.isFinite(startsAtMs) || Number.isFinite(endsAtMs)) return "active";
  return "unknown";
}
function normalizePromotion(value) {
  if (!value || typeof value !== "object") return void 0;
  const record = value;
  const discountPercent = toFiniteNonNegativeNumber(
    record.discountPercent ?? record.discount_percent
  );
  const startsAt = typeof (record.startsAt ?? record.starts_at) === "string" ? String(record.startsAt ?? record.starts_at) : void 0;
  const endsAt = typeof (record.endsAt ?? record.ends_at) === "string" ? String(record.endsAt ?? record.ends_at) : void 0;
  const message = typeof record.message === "string" ? record.message : void 0;
  if (discountPercent === void 0 && startsAt === void 0 && endsAt === void 0 && message === void 0) {
    return void 0;
  }
  return {
    ...discountPercent !== void 0 ? { discountPercent } : {},
    ...startsAt !== void 0 ? { startsAt } : {},
    ...endsAt !== void 0 ? { endsAt } : {},
    ...message !== void 0 ? { message } : {},
    status: computePromotionStatus(startsAt, endsAt)
  };
}
function freshnessFor(source, stale) {
  if (source === "unknown") return "unknown";
  if (source === "user") return "fresh";
  if (source === "provider-live") return stale === false ? "fresh" : "stale";
  return "stale";
}
function resolutionFor(source, candidate) {
  return {
    source,
    freshness: freshnessFor(source, candidate?.stale),
    ...typeof candidate?.fetchedAt === "number" ? { fetchedAt: candidate.fetchedAt } : {}
  };
}
function hasMeaningfulEconomics(value) {
  return !!value && Object.keys(value).length > 0;
}
function buildDefaultTokenPricesFromBundle(modelId) {
  const bareId = stripProviderPrefix(modelId);
  const costEntry = lookupModelCost(bareId);
  if (!costEntry) return void 0;
  return {
    default: {
      inputPer1k: costEntry.inputPer1k,
      outputPer1k: costEntry.outputPer1k
    },
    ...costEntry.tiers?.length ? {
      longContextTiers: costEntry.tiers.map((tier) => ({
        inputTokensAbove: tier.inputTokensAbove,
        inputPer1k: tier.inputPer1k,
        outputPer1k: tier.outputPer1k
      }))
    } : {}
  };
}
function buildImplicitFallbackEconomics(modelId) {
  const tokenPrices = buildDefaultTokenPricesFromBundle(modelId);
  if (!tokenPrices?.default) return void 0;
  return {
    billingUnit: "tokens",
    tokenPrices,
    stale: true
  };
}
function firstResolvedField(candidates) {
  for (const { source, candidate, value } of candidates) {
    if (value === void 0) continue;
    return { value, resolution: resolutionFor(source, candidate) };
  }
  return { resolution: { source: "unknown", freshness: "unknown" } };
}
function resolveModelEconomics(input) {
  const modelId = stripProviderPrefix(input.modelId || "unknown");
  const provider = input.provider || input.userOverride?.provider || input.liveEconomics?.provider || input.staticEconomics?.provider || input.fallbackEconomics?.provider || "unknown";
  const implicitFallback = input.disableImplicitFallback ? void 0 : buildImplicitFallbackEconomics(modelId);
  const fallbackEconomics = hasMeaningfulEconomics(input.fallbackEconomics) ? {
    ...implicitFallback,
    ...input.fallbackEconomics,
    tokenPrices: input.fallbackEconomics?.tokenPrices ?? implicitFallback?.tokenPrices
  } : implicitFallback;
  const precedence = [
    { source: "user", candidate: hasMeaningfulEconomics(input.userOverride) ? input.userOverride : void 0 },
    { source: "provider-live", candidate: hasMeaningfulEconomics(input.liveEconomics) ? input.liveEconomics : void 0 },
    { source: "provider-static", candidate: hasMeaningfulEconomics(input.staticEconomics) ? input.staticEconomics : void 0 },
    { source: "bundled-fallback", candidate: hasMeaningfulEconomics(fallbackEconomics) ? fallbackEconomics : void 0 }
  ];
  const billingUnit = firstResolvedField(
    precedence.map(({ source: source2, candidate }) => ({
      source: source2,
      candidate,
      value: candidate?.billingUnit === "tokens" || candidate?.billingUnit === "request" || candidate?.billingUnit === "unknown" ? candidate.billingUnit : void 0
    }))
  );
  const defaultTokenPrices = firstResolvedField(
    precedence.map(({ source: source2, candidate }) => ({
      source: source2,
      candidate,
      value: normalizeTokenPriceTier(candidate?.tokenPrices?.default)
    }))
  );
  const longContextTiers = firstResolvedField(
    precedence.map(({ source: source2, candidate }) => ({
      source: source2,
      candidate,
      value: normalizeLongContextTiers(candidate?.tokenPrices?.longContextTiers) ?? (() => {
        const tier = normalizeTokenPriceTier(candidate?.tokenPrices?.longContext);
        return tier && typeof tier.inputTokensAbove === "number" ? [tier] : void 0;
      })()
    }))
  );
  const requestMultiplier = firstResolvedField(
    precedence.map(({ source: source2, candidate }) => ({
      source: source2,
      candidate,
      value: toFiniteNonNegativeNumber(candidate?.requestMultiplier)
    }))
  );
  const promotion = firstResolvedField(
    precedence.map(({ source: source2, candidate }) => ({
      source: source2,
      candidate,
      value: normalizePromotion(candidate?.promotion)
    }))
  );
  const usedSources = [
    billingUnit.resolution.source,
    defaultTokenPrices.resolution.source,
    longContextTiers.resolution.source,
    requestMultiplier.resolution.source,
    promotion.resolution.source
  ].filter((source2) => source2 !== "unknown");
  const source = usedSources.length === 0 ? "unknown" : usedSources.every((candidate) => candidate === usedSources[0]) ? usedSources[0] : "mixed";
  const fetchedAt = [
    billingUnit.resolution.fetchedAt,
    defaultTokenPrices.resolution.fetchedAt,
    longContextTiers.resolution.fetchedAt,
    requestMultiplier.resolution.fetchedAt,
    promotion.resolution.fetchedAt
  ].filter((value) => typeof value === "number").sort((a, b) => b - a)[0];
  const stale = [
    billingUnit.resolution.freshness,
    defaultTokenPrices.resolution.freshness,
    longContextTiers.resolution.freshness,
    requestMultiplier.resolution.freshness,
    promotion.resolution.freshness
  ].includes("stale");
  return {
    provider,
    modelId,
    source,
    ...fetchedAt !== void 0 ? { fetchedAt } : {},
    stale,
    billingUnit: billingUnit.value ?? (defaultTokenPrices.value ? "tokens" : "unknown"),
    ...defaultTokenPrices.value ? {
      tokenPrices: {
        default: defaultTokenPrices.value,
        ...longContextTiers.value?.[0] ? { longContext: longContextTiers.value[0] } : {},
        ...longContextTiers.value ? { longContextTiers: longContextTiers.value } : {}
      }
    } : {},
    ...requestMultiplier.value !== void 0 ? { requestMultiplier: requestMultiplier.value } : {},
    ...promotion.value ? { promotion: promotion.value } : {},
    provenance: {
      billingUnit: billingUnit.resolution,
      ...defaultTokenPrices.value ? { defaultTokenPrices: defaultTokenPrices.resolution } : {},
      ...longContextTiers.value ? { longContextTiers: longContextTiers.resolution } : {},
      ...requestMultiplier.value !== void 0 ? { requestMultiplier: requestMultiplier.resolution } : {},
      ...promotion.value ? { promotion: promotion.resolution } : {}
    }
  };
}
var BUNDLED_COST_TABLE = [
  // Anthropic
  { id: "claude-opus-4-6", inputPer1k: 5e-3, outputPer1k: 0.025, updatedAt: "2026-04-16" },
  { id: "claude-opus-4-7", inputPer1k: 5e-3, outputPer1k: 0.025, updatedAt: "2026-04-16" },
  { id: "claude-opus-4-8", inputPer1k: 5e-3, outputPer1k: 0.025, updatedAt: "2026-05-28" },
  { id: "claude-opus-5", inputPer1k: 5e-3, outputPer1k: 0.025, updatedAt: "2026-08-12" },
  { id: "claude-fable-5", inputPer1k: 0.01, outputPer1k: 0.05, updatedAt: "2026-06-09" },
  { id: "claude-sonnet-4-6", inputPer1k: 3e-3, outputPer1k: 0.015, updatedAt: "2025-03-15" },
  { id: "claude-sonnet-5", inputPer1k: 3e-3, outputPer1k: 0.015, updatedAt: "2026-08-12" },
  { id: "claude-haiku-4-5", inputPer1k: 8e-4, outputPer1k: 4e-3, updatedAt: "2025-03-15" },
  { id: "claude-sonnet-4-5-20250514", inputPer1k: 3e-3, outputPer1k: 0.015, updatedAt: "2025-03-15" },
  { id: "claude-3-5-sonnet-latest", inputPer1k: 3e-3, outputPer1k: 0.015, updatedAt: "2025-03-15" },
  { id: "claude-3-5-haiku-latest", inputPer1k: 8e-4, outputPer1k: 4e-3, updatedAt: "2025-03-15" },
  { id: "claude-3-opus-latest", inputPer1k: 0.015, outputPer1k: 0.075, updatedAt: "2025-03-15" },
  // OpenAI
  { id: "gpt-4o", inputPer1k: 25e-4, outputPer1k: 0.01, updatedAt: "2025-03-15" },
  { id: "gpt-4o-mini", inputPer1k: 15e-5, outputPer1k: 6e-4, updatedAt: "2025-03-15" },
  { id: "gpt-4.1", inputPer1k: 2e-3, outputPer1k: 8e-3, updatedAt: "2026-03-29" },
  { id: "gpt-4.1-mini", inputPer1k: 4e-4, outputPer1k: 16e-4, updatedAt: "2026-03-29" },
  { id: "gpt-4.1-nano", inputPer1k: 1e-4, outputPer1k: 4e-4, updatedAt: "2026-03-29" },
  { id: "gpt-5", inputPer1k: 0.01, outputPer1k: 0.04, updatedAt: "2026-03-29" },
  { id: "gpt-5-mini", inputPer1k: 3e-4, outputPer1k: 12e-4, updatedAt: "2026-03-29" },
  { id: "gpt-5-nano", inputPer1k: 1e-4, outputPer1k: 4e-4, updatedAt: "2026-03-29" },
  { id: "gpt-5-pro", inputPer1k: 0.015, outputPer1k: 0.06, updatedAt: "2026-03-29" },
  { id: "o1", inputPer1k: 0.015, outputPer1k: 0.06, updatedAt: "2025-03-15" },
  { id: "o3", inputPer1k: 0.015, outputPer1k: 0.06, updatedAt: "2025-03-15" },
  { id: "o4-mini", inputPer1k: 5e-3, outputPer1k: 0.02, updatedAt: "2026-03-29" },
  { id: "o4-mini-deep-research", inputPer1k: 5e-3, outputPer1k: 0.02, updatedAt: "2026-03-29" },
  { id: "gpt-4-turbo", inputPer1k: 0.01, outputPer1k: 0.03, updatedAt: "2025-03-15" },
  // OpenAI Codex
  { id: "gpt-5.1", inputPer1k: 5e-3, outputPer1k: 0.02, updatedAt: "2026-03-29" },
  { id: "gpt-5.1-codex-max", inputPer1k: 3e-3, outputPer1k: 0.012, updatedAt: "2026-03-29" },
  { id: "gpt-5.1-codex-mini", inputPer1k: 3e-4, outputPer1k: 12e-4, updatedAt: "2026-03-29" },
  { id: "gpt-5.2", inputPer1k: 5e-3, outputPer1k: 0.02, updatedAt: "2026-03-29" },
  { id: "gpt-5.2-codex", inputPer1k: 5e-3, outputPer1k: 0.02, updatedAt: "2026-03-29" },
  { id: "gpt-5.3-codex", inputPer1k: 5e-3, outputPer1k: 0.02, updatedAt: "2026-03-29" },
  { id: "gpt-5.3-codex-spark", inputPer1k: 3e-4, outputPer1k: 12e-4, updatedAt: "2026-03-29" },
  { id: "gpt-5.4", inputPer1k: 5e-3, outputPer1k: 0.02, updatedAt: "2026-03-29" },
  { id: "gpt-5.4-mini", inputPer1k: 75e-5, outputPer1k: 45e-4, updatedAt: "2026-04-18" },
  // GPT-5.5 API list price, also used for live Codex OAuth routing.
  // Source: https://openai.com/api/pricing/
  { id: "gpt-5.5", inputPer1k: 5e-3, outputPer1k: 0.03, updatedAt: "2026-04-23" },
  { id: "gpt-5.6-sol", inputPer1k: 5e-3, outputPer1k: 0.03, tiers: [{ inputTokensAbove: 272e3, inputPer1k: 0.01, outputPer1k: 0.045 }], updatedAt: "2026-07-11" },
  { id: "gpt-5.6-terra", inputPer1k: 25e-4, outputPer1k: 0.015, tiers: [{ inputTokensAbove: 272e3, inputPer1k: 5e-3, outputPer1k: 0.0225 }], updatedAt: "2026-07-11" },
  { id: "gpt-5.6-luna", inputPer1k: 1e-3, outputPer1k: 6e-3, tiers: [{ inputTokensAbove: 272e3, inputPer1k: 2e-3, outputPer1k: 9e-3 }], updatedAt: "2026-07-11" },
  // GitHub Copilot
  { id: "mai-code-1.1-flash", inputPer1k: 2e-4, outputPer1k: 12e-4, updatedAt: "2026-08-14" },
  // Google
  { id: "gemini-2.0-flash", inputPer1k: 1e-4, outputPer1k: 4e-4, updatedAt: "2025-03-15" },
  { id: "gemini-flash-2.0", inputPer1k: 1e-4, outputPer1k: 4e-4, updatedAt: "2025-03-15" },
  { id: "gemini-2.5-pro", inputPer1k: 125e-5, outputPer1k: 5e-3, updatedAt: "2025-03-15" },
  // DeepSeek
  { id: "deepseek-chat", inputPer1k: 14e-5, outputPer1k: 28e-5, updatedAt: "2025-03-15" }
];
function lookupModelCost(modelId) {
  const bareId = modelId.includes("/") ? modelId.split("/").pop() ?? modelId : modelId;
  return BUNDLED_COST_TABLE.find((e) => e.id === bareId) ?? BUNDLED_COST_TABLE.find(
    (e) => bareId.startsWith(`${e.id}-`) || bareId.startsWith(`${e.id}:`) || bareId.startsWith(`${e.id}@`)
  );
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/model-router.ts
var MODEL_ID_ALIASES = {
  "gemini-flash-2-0": "gemini-2-0-flash"
};
var warnedUnknownRoutingModelIds = /* @__PURE__ */ new Set();
function canonicalizeModelId(modelId) {
  const trimmedId = modelId.trim();
  const slash = trimmedId.lastIndexOf("/");
  const bareId = slash >= 0 ? trimmedId.slice(slash + 1) : trimmedId;
  const canonicalId = bareId.trim().toLowerCase().replace(/[._-]+/g, "-");
  return MODEL_ID_ALIASES[canonicalId] ?? canonicalId;
}
function warnUnknownRoutingModel(modelId) {
  const warningKey = canonicalizeModelId(modelId) || modelId;
  if (warnedUnknownRoutingModelIds.has(warningKey)) return;
  warnedUnknownRoutingModelIds.add(warningKey);
  console.warn(
    `[gsd] Dynamic routing does not recognize model "${modelId}"; using safe defaults (standard tier, neutral capabilities, and expensive cost).`
  );
}
var CAPABILITY_DIMENSIONS = [
  "coding",
  "debugging",
  "research",
  "reasoning",
  "speed",
  "longContext",
  "instruction"
];
var MODEL_CAPABILITY_TIER = {
  // Light-tier models (cheapest)
  "claude-haiku-4-5": "light",
  "claude-3-5-haiku-latest": "light",
  "claude-3-haiku-20240307": "light",
  "gpt-4o-mini": "light",
  "gpt-4-1-mini": "light",
  "gpt-4-1-nano": "light",
  "gpt-5-mini": "light",
  "gpt-5-nano": "light",
  "gpt-5-4-mini": "light",
  "gpt-5-4-nano": "light",
  "gpt-5-1-codex-mini": "light",
  "gpt-5-3-codex-spark": "light",
  "mai-code-1-flash-picker": "light",
  "mai-code-1-1-flash": "light",
  "gemini-2-0-flash": "light",
  "gemini-3-5-flash": "light",
  "gemini-3-6-flash": "light",
  "gemini-3-7-flash": "light",
  // Standard-tier models
  "claude-sonnet-4": "standard",
  "claude-sonnet-4-5": "standard",
  "claude-sonnet-4-6": "standard",
  "claude-sonnet-5": "standard",
  // GA on GitHub Copilot, Anthropic, Vertex, Bedrock
  "claude-sonnet-4-5-20250514": "standard",
  "claude-3-5-sonnet-latest": "standard",
  "gpt-4o": "standard",
  "gpt-4-1": "standard",
  "gpt-5-1-codex-max": "standard",
  "gemini-2-5-pro": "standard",
  "gemini-3-1-pro-preview": "standard",
  "kimi-k2-7-code": "standard",
  "deepseek-chat": "standard",
  // Heavy-tier models (most capable)
  "claude-opus-4-5": "heavy",
  "claude-opus-4-6": "heavy",
  "claude-opus-4-7": "heavy",
  "claude-opus-4-8": "heavy",
  "claude-opus-5": "heavy",
  "claude-fable-5": "heavy",
  "claude-3-opus-latest": "heavy",
  "gpt-4-turbo": "heavy",
  "gpt-5": "heavy",
  "gpt-5-pro": "heavy",
  "gpt-5-1": "heavy",
  "gpt-5-2": "heavy",
  "gpt-5-2-codex": "heavy",
  "gpt-5-3-codex": "heavy",
  "gpt-5-4": "heavy",
  "gpt-5-5": "heavy",
  "gpt-5-6-sol": "heavy",
  "gpt-5-6-terra": "heavy",
  "gpt-5-6-luna": "heavy",
  "o1": "heavy",
  "o3": "heavy",
  "o4-mini": "heavy",
  "o4-mini-deep-research": "heavy",
  "grok-4-5": "heavy",
  "grok-4-6": "heavy",
  "kimi-k3": "heavy"
};
var MODEL_COST_PER_1K_INPUT = {
  "claude-haiku-4-5": 8e-4,
  "claude-3-5-haiku-latest": 8e-4,
  "claude-sonnet-4": 3e-3,
  "claude-sonnet-4-5": 3e-3,
  "claude-sonnet-4-6": 3e-3,
  "claude-sonnet-5": 3e-3,
  // $3.00/M input; matches Sonnet 4.x pricing
  "claude-sonnet-4-5-20250514": 3e-3,
  "claude-opus-4-5": 5e-3,
  "claude-opus-4-6": 5e-3,
  "claude-opus-4-7": 5e-3,
  "claude-opus-4-8": 5e-3,
  "claude-opus-5": 5e-3,
  "claude-fable-5": 0.01,
  "gpt-4o-mini": 15e-5,
  "gpt-4o": 25e-4,
  "gpt-4-1": 2e-3,
  "gpt-4-1-mini": 4e-4,
  "gpt-4-1-nano": 1e-4,
  "gpt-5": 0.01,
  "gpt-5-mini": 3e-4,
  "gpt-5-nano": 1e-4,
  "gpt-5-4-mini": 75e-5,
  "gpt-5-4-nano": 2e-4,
  "gpt-5-pro": 0.015,
  "gpt-5-1": 5e-3,
  "gpt-5-1-codex-max": 3e-3,
  "gpt-5-1-codex-mini": 3e-4,
  "gpt-5-2": 5e-3,
  "gpt-5-2-codex": 5e-3,
  "gpt-5-3-codex": 5e-3,
  "gpt-5-3-codex-spark": 3e-4,
  "mai-code-1-flash-picker": 75e-5,
  "mai-code-1-1-flash": 2e-4,
  "gpt-5-4": 5e-3,
  "gpt-5-5": 5e-3,
  "gpt-5-6-sol": 5e-3,
  "gpt-5-6-terra": 25e-4,
  "gpt-5-6-luna": 1e-3,
  "o4-mini": 5e-3,
  "o4-mini-deep-research": 5e-3,
  "gemini-2-0-flash": 1e-4,
  "gemini-2-5-pro": 125e-5,
  "gemini-3-1-pro-preview": 2e-3,
  "gemini-3-5-flash": 15e-4,
  "gemini-3-6-flash": 75e-5,
  "gemini-3-7-flash": 75e-5,
  "deepseek-chat": 14e-5,
  "grok-4-5": 2e-3,
  "grok-4-6": 2e-3,
  "kimi-k2-7-code": 95e-5,
  "kimi-k3": 3e-3
};
var MODEL_CAPABILITY_PROFILES = {
  // ── Anthropic ──────────────────────────────────────────────────────────────
  "claude-opus-4-5": { coding: 95, debugging: 90, research: 85, reasoning: 95, speed: 30, longContext: 80, instruction: 90 },
  "claude-opus-4-6": { coding: 95, debugging: 90, research: 85, reasoning: 95, speed: 30, longContext: 80, instruction: 90 },
  "claude-opus-4-7": { coding: 95, debugging: 90, research: 85, reasoning: 95, speed: 30, longContext: 80, instruction: 90 },
  "claude-opus-4-8": { coding: 97, debugging: 92, research: 87, reasoning: 97, speed: 30, longContext: 85, instruction: 92 },
  "claude-opus-5": { coding: 97, debugging: 92, research: 87, reasoning: 97, speed: 30, longContext: 85, instruction: 92 },
  "claude-fable-5": { coding: 97, debugging: 92, research: 87, reasoning: 97, speed: 30, longContext: 85, instruction: 92 },
  "claude-sonnet-4": { coding: 85, debugging: 80, research: 75, reasoning: 80, speed: 60, longContext: 75, instruction: 85 },
  "claude-sonnet-4-5": { coding: 85, debugging: 80, research: 75, reasoning: 80, speed: 60, longContext: 75, instruction: 85 },
  "claude-sonnet-4-6": { coding: 85, debugging: 80, research: 75, reasoning: 80, speed: 60, longContext: 75, instruction: 85 },
  "claude-sonnet-5": { coding: 90, debugging: 85, research: 80, reasoning: 87, speed: 55, longContext: 80, instruction: 88 },
  "claude-sonnet-4-5-20250514": { coding: 85, debugging: 80, research: 75, reasoning: 80, speed: 60, longContext: 75, instruction: 85 },
  "claude-3-5-sonnet-latest": { coding: 82, debugging: 78, research: 72, reasoning: 78, speed: 62, longContext: 70, instruction: 82 },
  "claude-haiku-4-5": { coding: 60, debugging: 50, research: 45, reasoning: 50, speed: 95, longContext: 50, instruction: 75 },
  "claude-3-5-haiku-latest": { coding: 60, debugging: 50, research: 45, reasoning: 50, speed: 95, longContext: 50, instruction: 75 },
  "claude-3-haiku-20240307": { coding: 50, debugging: 40, research: 35, reasoning: 40, speed: 95, longContext: 40, instruction: 65 },
  "claude-3-opus-latest": { coding: 90, debugging: 85, research: 82, reasoning: 90, speed: 35, longContext: 75, instruction: 88 },
  // ── OpenAI GPT ─────────────────────────────────────────────────────────────
  "gpt-4o": { coding: 80, debugging: 75, research: 70, reasoning: 75, speed: 65, longContext: 70, instruction: 80 },
  "gpt-4o-mini": { coding: 55, debugging: 45, research: 40, reasoning: 45, speed: 90, longContext: 45, instruction: 70 },
  "gpt-4-turbo": { coding: 78, debugging: 72, research: 68, reasoning: 72, speed: 50, longContext: 65, instruction: 78 },
  "gpt-4-1": { coding: 82, debugging: 78, research: 72, reasoning: 78, speed: 62, longContext: 72, instruction: 82 },
  "gpt-4-1-mini": { coding: 58, debugging: 48, research: 42, reasoning: 48, speed: 88, longContext: 48, instruction: 72 },
  "gpt-4-1-nano": { coding: 40, debugging: 30, research: 25, reasoning: 30, speed: 95, longContext: 30, instruction: 60 },
  "gpt-5": { coding: 92, debugging: 88, research: 85, reasoning: 92, speed: 40, longContext: 85, instruction: 90 },
  "gpt-5-mini": { coding: 62, debugging: 52, research: 48, reasoning: 52, speed: 88, longContext: 52, instruction: 74 },
  "gpt-5-nano": { coding: 42, debugging: 32, research: 28, reasoning: 32, speed: 95, longContext: 32, instruction: 62 },
  "gpt-5-4-mini": { coding: 70, debugging: 60, research: 55, reasoning: 60, speed: 84, longContext: 60, instruction: 78 },
  "gpt-5-4-nano": { coding: 50, debugging: 40, research: 35, reasoning: 42, speed: 94, longContext: 55, instruction: 66 },
  "gpt-5-pro": { coding: 94, debugging: 90, research: 88, reasoning: 94, speed: 35, longContext: 88, instruction: 92 },
  "gpt-5-1": { coding: 93, debugging: 89, research: 86, reasoning: 93, speed: 42, longContext: 86, instruction: 91 },
  "gpt-5-1-codex-max": { coding: 90, debugging: 85, research: 70, reasoning: 85, speed: 55, longContext: 75, instruction: 85 },
  "gpt-5-1-codex-mini": { coding: 65, debugging: 55, research: 40, reasoning: 50, speed: 88, longContext: 48, instruction: 72 },
  "gpt-5-2": { coding: 93, debugging: 90, research: 87, reasoning: 93, speed: 42, longContext: 87, instruction: 91 },
  "gpt-5-2-codex": { coding: 93, debugging: 90, research: 72, reasoning: 88, speed: 50, longContext: 78, instruction: 88 },
  "gpt-5-3-codex": { coding: 94, debugging: 91, research: 74, reasoning: 89, speed: 50, longContext: 80, instruction: 89 },
  "gpt-5-3-codex-spark": { coding: 68, debugging: 58, research: 42, reasoning: 52, speed: 90, longContext: 50, instruction: 74 },
  "mai-code-1-flash-picker": { coding: 74, debugging: 64, research: 42, reasoning: 58, speed: 96, longContext: 68, instruction: 76 },
  "mai-code-1-1-flash": { coding: 78, debugging: 68, research: 45, reasoning: 62, speed: 96, longContext: 70, instruction: 78 },
  "gpt-5-4": { coding: 95, debugging: 92, research: 88, reasoning: 94, speed: 42, longContext: 88, instruction: 92 },
  // GPT-5.5 scores are relative to the existing gpt-5.4 profile and backed by
  // OpenAI's 2026-04-23 published eval deltas across coding, tool use, and long context.
  // Source: https://openai.com/index/introducing-gpt-5-5/
  "gpt-5-5": { coding: 96, debugging: 93, research: 89, reasoning: 95, speed: 42, longContext: 90, instruction: 93 },
  // GPT-5.6 profiles are provisional until official eval results are available.
  "gpt-5-6-sol": { coding: 97, debugging: 94, research: 90, reasoning: 96, speed: 42, longContext: 91, instruction: 94 },
  "gpt-5-6-terra": { coding: 96, debugging: 93, research: 89, reasoning: 95, speed: 48, longContext: 91, instruction: 93 },
  "gpt-5-6-luna": { coding: 92, debugging: 88, research: 84, reasoning: 91, speed: 72, longContext: 91, instruction: 90 },
  // ── OpenAI o-series (reasoning-first) ──────────────────────────────────────
  "o1": { coding: 78, debugging: 82, research: 78, reasoning: 90, speed: 20, longContext: 65, instruction: 82 },
  "o3": { coding: 80, debugging: 85, research: 80, reasoning: 92, speed: 25, longContext: 70, instruction: 85 },
  "o4-mini": { coding: 75, debugging: 80, research: 72, reasoning: 88, speed: 60, longContext: 65, instruction: 80 },
  "o4-mini-deep-research": { coding: 75, debugging: 80, research: 85, reasoning: 88, speed: 30, longContext: 80, instruction: 80 },
  // ── Google ─────────────────────────────────────────────────────────────────
  "gemini-2-5-pro": { coding: 75, debugging: 70, research: 85, reasoning: 75, speed: 55, longContext: 90, instruction: 75 },
  "gemini-2-0-flash": { coding: 50, debugging: 40, research: 50, reasoning: 40, speed: 95, longContext: 60, instruction: 65 },
  "gemini-3-1-pro-preview": { coding: 80, debugging: 75, research: 88, reasoning: 82, speed: 55, longContext: 95, instruction: 78 },
  "gemini-3-5-flash": { coding: 62, debugging: 55, research: 60, reasoning: 58, speed: 92, longContext: 75, instruction: 72 },
  "gemini-3-6-flash": { coding: 66, debugging: 58, research: 64, reasoning: 62, speed: 93, longContext: 88, instruction: 74 },
  "gemini-3-7-flash": { coding: 68, debugging: 60, research: 66, reasoning: 64, speed: 93, longContext: 88, instruction: 75 },
  // ── DeepSeek ───────────────────────────────────────────────────────────────
  "deepseek-chat": { coding: 75, debugging: 65, research: 55, reasoning: 70, speed: 70, longContext: 55, instruction: 65 },
  // ── Moonshot/Kimi ─────────────────────────────────────────────────────────
  "kimi-k2-7-code": { coding: 82, debugging: 76, research: 62, reasoning: 78, speed: 70, longContext: 78, instruction: 80 },
  "kimi-k3": { coding: 90, debugging: 84, research: 78, reasoning: 88, speed: 55, longContext: 95, instruction: 86 },
  // ── xAI ────────────────────────────────────────────────────────────────────
  // Grok 4.5 (2026-07): Opus-class frontier model tuned for coding and agentic
  // work; notably faster and more token-efficient than peer heavy models.
  "grok-4-5": { coding: 95, debugging: 90, research: 82, reasoning: 93, speed: 55, longContext: 80, instruction: 90 },
  "grok-4-6": { coding: 96, debugging: 91, research: 83, reasoning: 94, speed: 55, longContext: 82, instruction: 91 }
};
function getModelProfileConfidence(modelId, capabilityOverrides) {
  const bareId = canonicalizeModelId(modelId);
  if (MODEL_CAPABILITY_PROFILES[bareId] !== void 0) {
    return "curated";
  }
  if (findInheritedProfileBase(bareId)) {
    return "inherited";
  }
  const override = findCapabilityOverride(modelId, capabilityOverrides);
  if (override && CAPABILITY_DIMENSIONS.every((dimension) => typeof override[dimension] === "number")) {
    return "provisional";
  }
  return "unknown";
}
function findCapabilityOverride(modelId, capabilityOverrides) {
  if (!capabilityOverrides) return void 0;
  const directOverride = capabilityOverrides[modelId];
  if (directOverride) return directOverride;
  const canonicalId = canonicalizeModelId(modelId);
  return capabilityOverrides[canonicalId] ?? Object.entries(capabilityOverrides).find(([id]) => canonicalizeModelId(id) === canonicalId)?.[1];
}
function findInheritedProfileBase(modelId) {
  const bareId = canonicalizeModelId(modelId);
  return Object.keys(MODEL_CAPABILITY_PROFILES).sort((a, b) => b.length - a.length).find(
    (knownId) => bareId !== knownId && (bareId.startsWith(`${knownId}-`) || bareId.startsWith(`${knownId}.`) || bareId.startsWith(`${knownId}:`) || bareId.startsWith(`${knownId}@`))
  );
}
function sameProviderQualifiedModel(modelId, candidate) {
  const provider = modelProvider(modelId)?.toLowerCase();
  const bareId = canonicalizeModelId(modelId);
  const candidateProvider = candidate.provider?.toLowerCase();
  if (provider && candidateProvider && provider !== candidateProvider) return false;
  return bareId === candidate.id;
}
function getEligibleModels(tier, availableModelIds, routingConfig, preferredModelId, availableModels) {
  const explicitModel = routingConfig.tier_models?.[tier];
  if (explicitModel) {
    if (availableModelIds.includes(explicitModel)) return [explicitModel];
    const canonicalExplicitModelId = canonicalizeModelId(explicitModel);
    const match = availableModelIds.find((id) => canonicalizeModelId(id) === canonicalExplicitModelId);
    if (match) return [match];
  }
  const tierMatches = availableModelIds.filter((id) => getModelTier(id) === tier).sort((a, b) => {
    const costA = getModelCost(a, availableModels);
    const costB = getModelCost(b, availableModels);
    return costA - costB;
  });
  const preferred = findPreferredModelForTier(tier, availableModelIds, preferredModelId);
  if (!preferred) return tierMatches;
  return [preferred, ...tierMatches.filter((id) => id !== preferred)];
}
function defaultRoutingConfig() {
  return {
    enabled: true,
    capability_routing: true,
    escalate_on_failure: true,
    budget_pressure: true,
    cross_provider: true,
    hooks: true
  };
}
var CANONICAL_TIER_MODELS = {
  light: "claude-haiku-4-5",
  standard: "claude-sonnet-4-6",
  heavy: "claude-opus-4-6"
};
function canonicalModelForTier(tier) {
  return CANONICAL_TIER_MODELS[tier];
}
function findModelForTier(tier, routingConfig, availableModelIds, crossProvider, preferredModelId, availableModels, capabilityGate) {
  const eligible = getEligibleModels(tier, availableModelIds, routingConfig, preferredModelId, availableModels);
  if (eligible.length === 0) return void 0;
  if (crossProvider) {
    if (!capabilityGate) return eligible[0];
    const explicitTierPin = routingConfig.tier_models?.[tier];
    const isExplicitTierPin = (modelId) => !!explicitTierPin && (modelId === explicitTierPin || canonicalizeModelId(modelId) === canonicalizeModelId(explicitTierPin));
    return eligible.find(
      (modelId) => isExplicitTierPin(modelId) || getModelProfileConfidence(modelId, capabilityGate.overrides) !== "unknown"
    );
  }
  const sameProvider = eligible.filter((id) => {
    const bare = canonicalizeModelId(id);
    return MODEL_CAPABILITY_TIER[bare] === tier && bare.startsWith("claude-");
  });
  const preferred = findPreferredModelForTier(tier, availableModelIds, preferredModelId);
  if (preferred && sameProvider.includes(preferred)) return preferred;
  return sameProvider[0];
}
function resolveModelForTier(tier, availableModelIds, routingConfigOrCrossProvider = defaultRoutingConfig(), crossProvider, preferredModelId) {
  const routingConfig = typeof routingConfigOrCrossProvider === "boolean" ? defaultRoutingConfig() : { ...defaultRoutingConfig(), ...routingConfigOrCrossProvider };
  const allowCrossProvider = typeof routingConfigOrCrossProvider === "boolean" ? routingConfigOrCrossProvider : crossProvider ?? routingConfig.cross_provider !== false;
  if (availableModelIds.length === 0) {
    if (preferredModelId) {
      return normalizeResolvedTierModelId(preferredModelId, tier, routingConfig);
    }
    incrementLegacyTelemetry("legacy.providerDefaultUsed");
    return canonicalModelForTier(tier);
  }
  const resolved = findModelForTier(tier, routingConfig, availableModelIds, allowCrossProvider, preferredModelId);
  if (resolved) {
    return normalizeResolvedTierModelId(resolved, tier, routingConfig);
  }
  const providerLocalFallback = findAvailableModelId(preferredModelId, availableModelIds) ?? availableModelIds[0] ?? canonicalModelForTier(tier);
  return normalizeResolvedTierModelId(providerLocalFallback, tier, routingConfig);
}
function modelProvider(modelId) {
  const trimmedId = modelId.trim();
  const slash = trimmedId.indexOf("/");
  return slash > 0 ? trimmedId.slice(0, slash).trim() : void 0;
}
function findAvailableModelId(preferredModelId, availableModelIds) {
  if (!preferredModelId) return void 0;
  if (availableModelIds.includes(preferredModelId)) return preferredModelId;
  const preferredBare = canonicalizeModelId(preferredModelId);
  if (!preferredBare) return void 0;
  const preferredProvider = modelProvider(preferredModelId)?.toLowerCase();
  if (preferredProvider) {
    const providerMatch = availableModelIds.find(
      (id) => modelProvider(id)?.toLowerCase() === preferredProvider && canonicalizeModelId(id) === preferredBare
    );
    if (providerMatch) return providerMatch;
  }
  return availableModelIds.find((id) => canonicalizeModelId(id) === preferredBare);
}
function modelSatisfiesTier(modelId, tier) {
  return tierOrdinal(getModelTier(modelId)) >= tierOrdinal(tier);
}
function findPreferredModelForTier(tier, availableModelIds, preferredModelId) {
  const preferred = findAvailableModelId(preferredModelId, availableModelIds);
  if (!preferred) return void 0;
  return modelSatisfiesTier(preferred, tier) ? preferred : void 0;
}
function getModelTier(modelId) {
  const bareId = canonicalizeModelId(modelId);
  if (MODEL_CAPABILITY_TIER[bareId]) return MODEL_CAPABILITY_TIER[bareId];
  warnUnknownRoutingModel(modelId);
  return "standard";
}
function getModelCost(modelId, availableModels) {
  const provider = modelProvider(modelId) ?? availableModels?.find((candidate) => sameProviderQualifiedModel(modelId, candidate))?.provider ?? "unknown";
  const bareId = canonicalizeModelId(modelId);
  const runtimeModel = availableModels?.find((candidate) => sameProviderQualifiedModel(modelId, candidate));
  const hasMeaningfulRuntimeCost = runtimeModel?.cost && (runtimeModel.cost.input > 0 || runtimeModel.cost.output > 0 || runtimeModel.cost.cacheRead > 0 || runtimeModel.cost.cacheWrite > 0 || (runtimeModel.cost.tiers?.length ?? 0) > 0);
  if (hasMeaningfulRuntimeCost && runtimeModel?.cost) {
    const runtimeLongContextTiers = runtimeModel.cost.tiers?.filter(
      (tier) => typeof tier.input === "number" && typeof tier.output === "number"
    ).map((tier) => ({
      inputTokensAbove: tier.inputTokensAbove,
      inputPer1k: tier.input / 1e3,
      outputPer1k: tier.output / 1e3,
      ...typeof tier.cacheRead === "number" ? { cachedInputPer1k: tier.cacheRead / 1e3 } : {},
      ...typeof tier.cacheWrite === "number" ? { cachedOutputPer1k: tier.cacheWrite / 1e3 } : {}
    }));
    const runtimeEconomics = resolveModelEconomics({
      provider,
      modelId: bareId,
      liveEconomics: {
        billingUnit: "tokens",
        stale: false,
        tokenPrices: {
          default: {
            inputPer1k: runtimeModel.cost.input / 1e3,
            outputPer1k: runtimeModel.cost.output / 1e3,
            cachedInputPer1k: runtimeModel.cost.cacheRead / 1e3,
            cachedOutputPer1k: runtimeModel.cost.cacheWrite / 1e3
          },
          ...runtimeLongContextTiers?.length ? { longContextTiers: runtimeLongContextTiers } : {}
        }
      }
    });
    const runtimeCost = runtimeEconomics.tokenPrices?.default.inputPer1k;
    if (runtimeCost !== void 0) return runtimeCost;
  }
  if (!runtimeModel) {
    if (MODEL_COST_PER_1K_INPUT[bareId] !== void 0) {
      return MODEL_COST_PER_1K_INPUT[bareId];
    }
    for (const [knownId, cost] of Object.entries(MODEL_COST_PER_1K_INPUT)) {
      if (bareId.includes(knownId) || knownId.includes(bareId)) return cost;
    }
  }
  warnUnknownRoutingModel(modelId);
  return 999;
}
function normalizeResolvedTierModelId(modelId, tier, routingConfig) {
  const explicitModel = routingConfig.tier_models?.[tier];
  if (explicitModel?.includes("/")) {
    return modelId;
  }
  const canonicalId = canonicalizeModelId(modelId);
  if (!MODEL_CAPABILITY_TIER[canonicalId]) return modelId;
  return modelId.split("/").pop() ?? modelId;
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/shared/browser-contract.ts
var BROWSER_CONTRACT_TOOL_NAMES = [
  "browser_navigate",
  "browser_click",
  "browser_type",
  "browser_fill_form",
  "browser_click_ref",
  "browser_fill_ref",
  "browser_wait_for",
  "browser_assert",
  "browser_verify",
  "browser_screenshot",
  "browser_snapshot_refs",
  "browser_find",
  "browser_get_console_logs",
  "browser_get_network_logs",
  "browser_evaluate",
  "browser_reload",
  "browser_batch",
  "browser_act"
];
var BROWSER_CONTRACT_TOOL_NAME_SET = new Set(BROWSER_CONTRACT_TOOL_NAMES);

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/unit-registry.ts
var RUN_UAT_WORKFLOW_TOOL_NAMES = [
  "gsd_uat_exec",
  "gsd_uat_result_save",
  "gsd_resume",
  "gsd_milestone_status",
  "gsd_journal_query"
];
var UNIT_REGISTRY = {
  "research-milestone": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: ["research"],
    promptTemplate: "research-milestone",
    toolContract: {
      allowedGsdTools: [
        "gsd_summary_save",
        "gsd_decision_save",
        "gsd_exec",
        "gsd_exec_search",
        "gsd_resume"
      ],
      requiredWorkflowTools: ["gsd_summary_save"]
    }
  },
  "plan-milestone": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: ["planning"],
    promptTemplate: "plan-milestone",
    toolContract: {
      allowedGsdTools: [
        "gsd_milestone_status",
        "gsd_plan_milestone",
        "gsd_plan_slice",
        "gsd_plan_task",
        "gsd_decision_save",
        "gsd_requirement_update"
      ],
      requiredWorkflowTools: ["gsd_milestone_status", "gsd_plan_milestone", "gsd_plan_slice", "gsd_plan_task"]
    }
  },
  "discuss-milestone": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: ["discuss", "planning"],
    promptTemplates: ["discuss", "discuss-headless", "guided-discuss-milestone"],
    toolContract: {
      allowedGsdTools: [
        "gsd_summary_save",
        "gsd_decision_save",
        "gsd_requirement_save",
        "gsd_requirement_update",
        "gsd_plan_milestone",
        "gsd_milestone_generate_id"
      ],
      requiredWorkflowTools: [
        "ask_user_questions",
        "gsd_summary_save",
        "gsd_requirement_save",
        "gsd_requirement_update",
        "gsd_plan_milestone",
        "gsd_milestone_generate_id"
      ]
    }
  },
  "discuss-slice": {
    kind: "variant",
    scopeClass: "standard",
    phaseChain: ["discuss", "planning"],
    toolContract: {
      allowedGsdTools: ["gsd_summary_save", "gsd_decision_save"],
      requiredWorkflowTools: ["ask_user_questions", "gsd_summary_save"]
    }
  },
  "validate-milestone": {
    kind: "primary",
    scopeClass: "section-close",
    phaseChain: ["validation", "planning"],
    promptTemplate: "validate-milestone",
    toolContract: {
      allowedGsdTools: [
        "gsd_milestone_status",
        "gsd_exec",
        "gsd_exec_search",
        "gsd_resume",
        "gsd_validate_milestone",
        "gsd_reassess_roadmap",
        "subagent"
      ],
      requiredWorkflowTools: ["gsd_milestone_status", "gsd_validate_milestone", "gsd_reassess_roadmap"]
    }
  },
  "complete-milestone": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: ["completion"],
    promptTemplate: "complete-milestone",
    toolContract: {
      allowedGsdTools: [
        "gsd_milestone_status",
        "gsd_exec",
        "gsd_exec_search",
        "gsd_resume",
        "gsd_requirement_update",
        "gsd_summary_save",
        "gsd_complete_milestone",
        "subagent"
      ],
      requiredWorkflowTools: [
        "gsd_milestone_status",
        "gsd_requirement_update",
        "gsd_summary_save",
        "gsd_complete_milestone"
      ]
    }
  },
  "research-slice": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: ["research"],
    promptTemplate: "research-slice",
    toolContract: {
      allowedGsdTools: [
        "gsd_milestone_status",
        "gsd_summary_save",
        "gsd_decision_save",
        "gsd_exec",
        "gsd_exec_search",
        "gsd_resume"
      ],
      requiredWorkflowTools: ["gsd_summary_save"]
    }
  },
  "plan-slice": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: ["planning"],
    promptTemplate: "plan-slice",
    toolContract: {
      allowedGsdTools: [
        "gsd_milestone_status",
        "gsd_plan_slice",
        "gsd_plan_task",
        "gsd_reassess_roadmap",
        "gsd_decision_save",
        "gsd_exec",
        "gsd_exec_search",
        "gsd_resume"
      ],
      requiredWorkflowTools: ["gsd_plan_slice", "gsd_plan_task", "gsd_reassess_roadmap"]
    }
  },
  "refine-slice": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: ["planning"],
    promptTemplate: "refine-slice",
    toolContract: {
      allowedGsdTools: [
        "gsd_milestone_status",
        "gsd_plan_slice",
        "gsd_decision_save",
        "gsd_exec",
        "gsd_exec_search",
        "gsd_resume"
      ],
      requiredWorkflowTools: ["gsd_plan_slice"]
    }
  },
  "replan-slice": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: ["planning"],
    promptTemplate: "replan-slice",
    toolContract: {
      allowedGsdTools: ["gsd_replan_slice", "gsd_decision_save"],
      requiredWorkflowTools: ["gsd_replan_slice"]
    }
  },
  "complete-slice": {
    kind: "primary",
    scopeClass: "section-close",
    phaseChain: ["completion"],
    promptTemplate: "complete-slice",
    toolContract: {
      allowedGsdTools: [
        "gsd_milestone_status",
        "gsd_journal_query",
        "gsd_exec",
        "gsd_exec_search",
        "gsd_resume",
        "gsd_slice_complete",
        "gsd_slice_reopen",
        "gsd_task_reopen",
        "gsd_task_complete",
        "gsd_replan_slice",
        "gsd_replan_task",
        "gsd_rework_brief_save",
        "gsd_decision_save",
        "gsd_capture_thought",
        "gsd_requirement_update",
        "gsd_summary_save",
        "subagent"
      ],
      requiredWorkflowTools: [
        "gsd_milestone_status",
        "gsd_exec",
        "gsd_capture_thought",
        "gsd_slice_complete",
        "gsd_task_reopen",
        "gsd_replan_slice",
        "gsd_replan_task",
        "gsd_rework_brief_save",
        "gsd_requirement_update",
        "gsd_summary_save"
      ],
      forbiddenGsdTools: {
        gsd_uat_result_save: "Run UAT owns persisted UAT Assessment."
      }
    }
  },
  "reassess-roadmap": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: ["validation", "planning"],
    promptTemplate: "reassess-roadmap",
    toolContract: {
      allowedGsdTools: ["gsd_milestone_status", "gsd_reassess_roadmap"],
      requiredWorkflowTools: ["gsd_milestone_status", "gsd_reassess_roadmap"]
    }
  },
  "execute-task": {
    kind: "primary",
    scopeClass: "execute-task",
    phaseChain: ["execution"],
    promptTemplate: "execute-task",
    toolContract: {
      allowedGsdTools: [
        "gsd_task_complete",
        "gsd_task_recovery_resume",
        "gsd_exec",
        "gsd_exec_search",
        "gsd_resume",
        "gsd_capture_thought",
        "gsd_decision_save"
      ],
      requiredWorkflowTools: [
        "gsd_task_complete",
        "gsd_exec",
        "gsd_exec_search",
        "gsd_resume",
        "gsd_capture_thought"
      ]
    }
  },
  "replan-task": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: ["planning"],
    promptTemplate: "replan-task",
    toolContract: {
      allowedGsdTools: ["gsd_replan_task", "gsd_decision_save"],
      requiredWorkflowTools: ["gsd_replan_task"]
    }
  },
  "execute-task-simple": {
    kind: "variant",
    scopeClass: "execute-task",
    phaseChain: ["execution_simple", "execution"],
    toolContract: {
      allowedGsdTools: [
        "gsd_task_complete",
        "gsd_exec",
        "gsd_exec_search",
        "gsd_resume",
        "gsd_capture_thought",
        "gsd_decision_save"
      ],
      requiredWorkflowTools: [
        "gsd_task_complete",
        "gsd_exec",
        "gsd_exec_search",
        "gsd_resume",
        "gsd_capture_thought"
      ]
    }
  },
  "reactive-execute": {
    kind: "primary",
    scopeClass: "execute-task",
    phaseChain: ["execution"],
    promptTemplate: "reactive-execute",
    toolContract: {
      allowedGsdTools: [
        "gsd_milestone_status",
        "gsd_task_complete",
        "gsd_exec",
        "gsd_summary_save",
        "gsd_decision_save"
      ],
      requiredWorkflowTools: ["gsd_task_complete", "gsd_summary_save"]
    }
  },
  "run-uat": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: ["uat", "completion"],
    promptTemplate: "run-uat",
    toolContract: {
      allowedGsdTools: [...RUN_UAT_WORKFLOW_TOOL_NAMES, "subagent"],
      requiredWorkflowTools: [...RUN_UAT_WORKFLOW_TOOL_NAMES],
      forbiddenGsdTools: {
        gsd_exec: "Use gsd_uat_exec so acceptance evidence is typed as UAT-owned.",
        gsd_save_gate_result: "gsd_uat_result_save owns the aggregate UAT gate.",
        gsd_summary_save: "gsd_uat_result_save owns persisted UAT Assessment writes."
      }
    }
  },
  "gate-evaluate": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: ["validation", "planning"],
    promptTemplate: "gate-evaluate",
    toolContract: {
      allowedGsdTools: ["gsd_save_gate_result"],
      requiredWorkflowTools: ["gsd_save_gate_result"]
    }
  },
  "rewrite-docs": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: ["validation", "planning"],
    promptTemplate: "rewrite-docs",
    toolContract: {
      allowedGsdTools: ["gsd_summary_save", "gsd_decision_save"],
      requiredWorkflowTools: []
    }
  },
  // Sidecar units (triage, quick-task) — manifests exist, but no scoped tool
  // contract and no phase routing (today's behaviour, preserved explicitly).
  "triage-captures": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: null,
    toolContract: null
  },
  "quick-task": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: null,
    toolContract: null
  },
  // Deep planning mode (project-level) units
  "workflow-preferences": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: ["discuss", "planning"],
    promptTemplate: "guided-workflow-preferences",
    toolContract: {
      allowedGsdTools: ["gsd_summary_save"],
      requiredWorkflowTools: []
    }
  },
  "discuss-project": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: ["discuss", "planning"],
    promptTemplate: "guided-discuss-project",
    toolContract: {
      allowedGsdTools: ["gsd_summary_save", "gsd_decision_save", "gsd_requirement_save"],
      requiredWorkflowTools: ["ask_user_questions", "gsd_summary_save"]
    }
  },
  "discuss-requirements": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: ["discuss", "planning"],
    promptTemplate: "guided-discuss-requirements",
    toolContract: {
      allowedGsdTools: ["gsd_requirement_save", "gsd_summary_save"],
      requiredWorkflowTools: ["ask_user_questions", "gsd_requirement_save", "gsd_summary_save"]
    }
  },
  "research-decision": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: ["discuss", "planning"],
    promptTemplate: "guided-research-decision",
    toolContract: {
      allowedGsdTools: ["gsd_summary_save"],
      requiredWorkflowTools: ["ask_user_questions"]
    }
  },
  // research-project dispatches 4 parallel scout subagents (Task calls); each scout
  // writes one file under .gsd/research/ directly. The parent coordinator does not
  // call gsd_summary_save or gsd_decision_save — the scouts own their own output.
  "research-project": {
    kind: "primary",
    scopeClass: "standard",
    phaseChain: ["research"],
    promptTemplate: "guided-research-project",
    toolContract: {
      allowedGsdTools: [],
      requiredWorkflowTools: []
    }
  }
};
var ALL_UNIT_KEYS = Object.keys(UNIT_REGISTRY);
var KNOWN_UNIT_TYPES = Object.freeze(
  ALL_UNIT_KEYS.filter((t) => UNIT_REGISTRY[t].kind === "primary")
);
var EXECUTE_TASK_UNIT_TYPES = new Set(
  ALL_UNIT_KEYS.filter((t) => UNIT_REGISTRY[t].scopeClass === "execute-task")
);
var SECTION_CLOSE_GATE_UNIT_TYPES = new Set(
  ALL_UNIT_KEYS.filter((t) => UNIT_REGISTRY[t].scopeClass !== "standard")
);
function getUnitDescriptor(unitType) {
  return UNIT_REGISTRY[unitType];
}
function getUnitPhaseChain(unitType) {
  return getUnitDescriptor(unitType)?.phaseChain ?? null;
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/preferences-models.ts
function resolveModelForUnit(unitType) {
  const resolved = resolveModelWithFallbacksForUnit(unitType);
  return resolved?.primary;
}
function phaseChainForUnit(unitType) {
  const declared = getUnitPhaseChain(unitType);
  if (declared) return [...declared];
  if (unitType === "worktree-merge") return ["completion"];
  if (unitType === "subagent" || unitType.startsWith("subagent/")) {
    return ["subagent"];
  }
  return void 0;
}
function resolveWinningPhase(models, chain) {
  if (!models) return void 0;
  for (const key of chain) {
    const config = models[key];
    if (!config) continue;
    if (typeof config === "object" && !config.model) continue;
    return { phase: key, config };
  }
  return void 0;
}
function normalizeModelFieldConfig(field) {
  if (!field) return void 0;
  if (typeof field === "string") {
    return field.trim() ? { primary: field, fallbacks: [] } : void 0;
  }
  if (!field.model) return void 0;
  const primary = field.provider && !field.model.includes("/") ? `${field.provider}/${field.model}` : field.model;
  return {
    primary,
    fallbacks: field.fallbacks ?? [],
    ...field.thinking ? { thinking: field.thinking } : {}
  };
}
function resolveModelWithFallbacksForUnit(unitType, basePath, availableModelIds, preferredModelId, skipProfileDefaults = false) {
  const loadOpts = {
    ...availableModelIds !== void 0 ? { availableModelIds } : {},
    ...preferredModelId !== void 0 ? { preferredModelId } : {},
    ...skipProfileDefaults ? { skipProfileDefaults: true } : {}
  };
  const prefs = loadEffectiveGSDPreferences(basePath, loadOpts);
  if (unitType === "supervisor") {
    return normalizeModelFieldConfig(prefs?.preferences?.auto_supervisor?.model);
  }
  if (unitType.startsWith("hook/")) {
    const hookName = unitType.slice("hook/".length);
    const hooks = prefs?.preferences?.post_unit_hooks;
    const hook = Array.isArray(hooks) ? hooks.find((h) => h.name === hookName) : void 0;
    return normalizeModelFieldConfig(hook?.model);
  }
  const chain = phaseChainForUnit(unitType);
  if (!chain) return void 0;
  const winner = resolveWinningPhase(prefs?.preferences?.models, chain);
  if (!winner) return void 0;
  return normalizeModelFieldConfig(winner.config);
}
function resolveThinkingLevelForUnit(unitType, basePath, availableModelIds) {
  if (unitType === "supervisor" || unitType.startsWith("hook/")) {
    return resolveModelWithFallbacksForUnit(unitType, basePath, availableModelIds)?.thinking;
  }
  const loadOpts = availableModelIds !== void 0 ? { availableModelIds } : void 0;
  const prefs = loadEffectiveGSDPreferences(basePath, loadOpts)?.preferences;
  if (!prefs) return void 0;
  const chain = phaseChainForUnit(unitType);
  if (!chain) return void 0;
  const models = prefs.models;
  const block = prefs.thinking;
  const winner = resolveWinningPhase(models, chain);
  const limit = winner ? chain.indexOf(winner.phase) + 1 : chain.length;
  for (let i = 0; i < limit; i++) {
    const key = chain[i];
    const entry = models?.[key];
    if (typeof entry === "object" && entry?.thinking) return entry.thinking;
    const blockLevel = block?.[key];
    if (blockLevel) return blockLevel;
  }
  return void 0;
}
function getNextFallbackModel(currentModelId, modelConfig) {
  const modelsToTry = [modelConfig.primary, ...modelConfig.fallbacks];
  if (!currentModelId) {
    return modelsToTry[0];
  }
  let foundCurrent = false;
  for (let i = 0; i < modelsToTry.length; i++) {
    const mId = modelsToTry[i];
    if (mId === currentModelId || mId.includes("/") && mId.endsWith(`/${currentModelId}`)) {
      foundCurrent = true;
      return modelsToTry[i + 1];
    }
  }
  if (!foundCurrent) {
    return modelsToTry[0];
  }
}
function isTransientNetworkError(errorMsg) {
  if (!errorMsg) return false;
  const hasNetworkSignal = /network|ECONNRESET|ETIMEDOUT|ECONNREFUSED|socket hang up|fetch failed|connection.*reset|dns/i.test(errorMsg);
  const hasPermanentSignal = /auth|unauthorized|forbidden|invalid.*key|quota|billing/i.test(errorMsg);
  return hasNetworkSignal && !hasPermanentSignal;
}
function validateModelId(modelId) {
  if (!modelId || typeof modelId !== "string") return false;
  const trimmed = modelId.trim();
  if (trimmed.length === 0 || trimmed.length > 256) return false;
  return /^[a-zA-Z0-9\-_./:]+$/.test(trimmed);
}
function updatePreferencesModels(models) {
  const prefsPath = getGlobalGSDPreferencesPath();
  let content = "";
  if (existsSync15(prefsPath)) {
    content = readFileSync15(prefsPath, "utf-8");
  }
  const lines = ["models:"];
  for (const [phase, value] of Object.entries(models)) {
    if (typeof value === "string") {
      lines.push(`  ${phase}: ${value}`);
    } else if (value && typeof value === "object") {
      const config = value;
      lines.push(`  ${phase}:`);
      lines.push(`    model: ${config.model}`);
      if (config.provider) {
        lines.push(`    provider: ${config.provider}`);
      }
      if (config.fallbacks && config.fallbacks.length > 0) {
        lines.push(`    fallbacks:`);
        for (const fb of config.fallbacks) {
          lines.push(`      - ${fb}`);
        }
      }
    }
  }
  const modelsBlock = lines.join("\n");
  const modelsRegex = /^models:[\s\S]*?(?=\n[a-z_]|\n*$)/m;
  if (modelsRegex.test(content)) {
    content = content.replace(modelsRegex, modelsBlock);
  } else {
    content = content.trimEnd() + "\n\n" + modelsBlock + "\n";
  }
  writeFileSync8(prefsPath, content, "utf-8");
  clearGSDPreferencesCache();
}
function resolveDynamicRoutingConfig() {
  const prefs = loadEffectiveGSDPreferences();
  const configured = prefs?.preferences.dynamic_routing;
  if (!configured) return defaultRoutingConfig();
  return {
    ...defaultRoutingConfig(),
    ...configured
  };
}
function resolveAutoSupervisorConfig() {
  const prefs = loadEffectiveGSDPreferences();
  const configured = prefs?.preferences.auto_supervisor ?? {};
  const modelConfig = normalizeModelFieldConfig(configured.model);
  return {
    soft_timeout_minutes: configured.soft_timeout_minutes ?? 20,
    idle_timeout_minutes: configured.idle_timeout_minutes ?? 10,
    hard_timeout_minutes: configured.hard_timeout_minutes ?? 30,
    stalled_tool_timeout_minutes: configured.stalled_tool_timeout_minutes ?? 5,
    ...modelConfig ? { model: modelConfig.primary, modelFallbacks: modelConfig.fallbacks } : {}
  };
}
var VALID_TOKEN_PROFILES = /* @__PURE__ */ new Set(["budget", "balanced", "quality", "burn-max"]);
var DEFAULT_TOKEN_PROFILE = "balanced";
var PROFILE_TIER_MAP = {
  budget: {
    planning: "standard",
    research: "light",
    execution: "standard",
    execution_simple: "light",
    completion: "light",
    subagent: "light"
  },
  balanced: {
    planning: "standard",
    research: "standard",
    execution: "standard",
    execution_simple: "light",
    completion: "light",
    subagent: "light"
  },
  quality: {
    planning: "heavy",
    research: "standard",
    execution: "standard",
    execution_simple: "light",
    completion: "light",
    subagent: "standard"
  },
  // burn-max intentionally omits a tier map: it never writes model defaults
  // (it preserves the user's explicit model selection), so resolveProfileDefaults
  // skips model resolution for this profile.
  "burn-max": {}
};
function resolveProfileDefaults(profile, availableModelIds, routingConfig = defaultRoutingConfig(), preferredModelId) {
  const tierMap = PROFILE_TIER_MAP[profile];
  const resolveTierModel = (tier) => Array.isArray(availableModelIds) || preferredModelId ? resolveModelForTier(tier, availableModelIds ?? [], routingConfig, void 0, preferredModelId) : canonicalModelForTier(tier);
  const models = profile === "burn-max" ? void 0 : {
    planning: resolveTierModel(tierMap.planning),
    research: resolveTierModel(tierMap.research),
    execution: resolveTierModel(tierMap.execution),
    execution_simple: resolveTierModel(tierMap.execution_simple),
    completion: resolveTierModel(tierMap.completion),
    subagent: resolveTierModel(tierMap.subagent)
  };
  switch (profile) {
    case "budget":
      return {
        models,
        phases: {
          skip_research: true,
          skip_reassess: true,
          skip_slice_research: true,
          skip_milestone_validation: true
        }
      };
    case "balanced":
      return {
        models,
        phases: {
          skip_research: true,
          skip_reassess: true,
          skip_slice_research: true
        }
      };
    case "quality":
      return {
        models,
        phases: {
          skip_research: true,
          skip_slice_research: true,
          skip_reassess: true
        }
      };
    case "burn-max":
      return {
        // Quality-first profile: keep user-selected models, disable downgrade routing.
        // Policy constraints still apply at dispatch time.
        dynamic_routing: {
          enabled: false
        },
        context_selection: "full",
        phases: {
          skip_research: false,
          skip_slice_research: false,
          skip_reassess: false,
          skip_milestone_validation: false,
          reassess_after_slice: true
        }
      };
  }
}
function getProfileTierMap(profile) {
  return { ...PROFILE_TIER_MAP[profile] };
}
function resolveEffectiveProfile() {
  const prefs = loadEffectiveGSDPreferences();
  const profile = prefs?.preferences.token_profile;
  if (profile && VALID_TOKEN_PROFILES.has(profile)) return profile;
  return "balanced";
}
function resolveInlineLevel() {
  const profile = resolveEffectiveProfile();
  switch (profile) {
    case "budget":
      return "minimal";
    case "balanced":
      return "standard";
    case "quality":
      return "full";
    case "burn-max":
      return "full";
  }
}
function resolveContextSelection() {
  const prefs = loadEffectiveGSDPreferences();
  if (prefs?.preferences.context_selection) return prefs.preferences.context_selection;
  const profile = resolveEffectiveProfile();
  return profile === "budget" ? "smart" : "full";
}
function resolveSearchProviderFromPreferences() {
  const prefs = loadEffectiveGSDPreferences();
  return prefs?.preferences.search_provider;
}
function resolveDisabledModelProvidersFromPreferences() {
  const prefs = loadEffectiveGSDPreferences();
  const raw = prefs?.preferences.disabled_model_providers;
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(
    raw.map((provider) => provider.trim()).filter((provider) => provider.length > 0)
  ));
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/native-git-bridge.ts
import { execFileSync } from "node:child_process";
import { existsSync as existsSync16, readFileSync as readFileSync16, rmSync as rmSync3, writeFileSync as writeFileSync9 } from "node:fs";
import { join as join20 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/git-constants.ts
var LEAKING_GIT_ENV_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_NAMESPACE"
];
function buildSafeParentEnv() {
  const safe = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!LEAKING_GIT_ENV_VARS.includes(k)) {
      safe[k] = v;
    }
  }
  return safe;
}
var GIT_NO_PROMPT_ENV = {
  ...buildSafeParentEnv(),
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "",
  GIT_SVN_ID: "",
  LC_ALL: "C"
  // force English git output so stderr string checks work on all locales (#1997)
};

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/native-git-bridge.ts
var NATIVE_GSD_GIT_ENABLED = process.env.GSD_ENABLE_NATIVE_GSD_GIT === "1";
var nativeModule = null;
var loadAttempted = false;
function loadNative() {
  if (loadAttempted) return nativeModule;
  loadAttempted = true;
  if (!NATIVE_GSD_GIT_ENABLED) return nativeModule;
  try {
    const mod = (init_native(), __toCommonJS(native_exports));
    if (mod.gitCurrentBranch && mod.gitHasChanges) {
      nativeModule = mod;
    }
  } catch {
  }
  return nativeModule;
}
function nativeIsRepo(basePath) {
  const native3 = loadNative();
  if (native3) {
    return native3.gitIsRepo(basePath);
  }
  try {
    execFileSync("git", ["rev-parse", "--git-dir"], { cwd: basePath, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
function nativeHasCommittedHead(basePath) {
  try {
    execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
      cwd: basePath,
      stdio: ["ignore", "ignore", "ignore"],
      env: GIT_NO_PROMPT_ENV
    });
    return true;
  } catch {
    return false;
  }
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/preferences-types.ts
var MODE_DEFAULTS = {
  solo: {
    git: {
      auto_push: true,
      push_branches: false,
      pre_merge_check: "auto",
      merge_strategy: "squash",
      isolation: "none"
    },
    unique_milestone_ids: false
  },
  team: {
    git: {
      auto_push: false,
      push_branches: true,
      pre_merge_check: true,
      merge_strategy: "squash",
      isolation: "none"
    },
    unique_milestone_ids: true
  }
};
var KNOWN_PREFERENCE_KEYS = /* @__PURE__ */ new Set([
  "version",
  "mode",
  "always_use_skills",
  "prefer_skills",
  "avoid_skills",
  "skill_rules",
  "custom_instructions",
  "models",
  "thinking",
  "skill_discovery",
  "skill_staleness_days",
  "auto_supervisor",
  "uat_dispatch",
  "unique_milestone_ids",
  "budget_ceiling",
  "budget_enforcement",
  "context_pause_threshold",
  "notifications",
  "cmux",
  "remote_questions",
  "git",
  "post_unit_hooks",
  "pre_dispatch_hooks",
  "planning_subagent_registry",
  "planning_subagents",
  "dynamic_routing",
  "disabled_model_providers",
  "uok",
  "token_profile",
  "phases",
  "auto_visualize",
  "auto_report",
  "parallel",
  "verification_commands",
  "verification_auto_fix",
  "verification_max_retries",
  "verification_timeout_ms",
  "per_unit_cost_cap_usd",
  "unit_cost_spike_multiplier",
  "search_provider",
  "context_selection",
  "widget_mode",
  "reactive_execution",
  "gate_evaluation",
  "github",
  "service_tier",
  "forensics_dedup",
  "show_token_cost",
  "min_request_interval_ms",
  "stale_commit_threshold_minutes",
  "context_management",
  "tool_call_loop_guard",
  "experimental",
  "codebase",
  "slice_parallel",
  "safety_harness",
  "enhanced_verification",
  "enhanced_verification_pre",
  "enhanced_verification_post",
  "enhanced_verification_strict",
  "discuss_preparation",
  "discuss_web_research",
  "discuss_depth",
  "flat_rate_providers",
  "language",
  "context_window_override",
  "context_mode",
  "copilot_catalog",
  "planning_depth",
  "claude_code_mcp",
  "workspace",
  "runtime"
]);
var KNOWN_UNIT_LABELS = [
  "research-milestone",
  "plan-milestone",
  "research-slice",
  "plan-slice",
  "refine-slice",
  "execute-task",
  "replan-task",
  "reactive-execute",
  "gate-evaluate",
  "complete-slice",
  "replan-slice",
  "reassess-roadmap",
  "run-uat",
  "complete-milestone",
  "validate-milestone",
  "rewrite-docs",
  "discuss-milestone",
  "discuss-slice",
  "worktree-merge",
  // Deep planning mode (project-level) units
  "workflow-preferences",
  "discuss-project",
  "discuss-requirements",
  "research-decision",
  "research-project"
];
var CONFIGURABLE_PLANNING_SUBAGENT_UNITS = [
  "plan-milestone",
  "plan-slice"
];
var SKILL_ACTIONS = /* @__PURE__ */ new Set(["use", "prefer", "avoid"]);
var GSD_MODEL_PHASE_KEYS = [
  "research",
  "planning",
  "discuss",
  "execution",
  "execution_simple",
  "completion",
  "validation",
  "subagent",
  "uat"
];
function formatSkillRef(ref, resolutions) {
  const resolution = resolutions.get(ref);
  if (!resolution || resolution.method === "unresolved") {
    return `${ref} (\u26A0 not found \u2014 check skill name or path)`;
  }
  if (resolution.method === "absolute-path" || resolution.method === "absolute-dir") {
    return ref;
  }
  return `${ref} \u2192 \`${resolution.resolvedPath}\``;
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/preferences-validation.ts
import { isAbsolute as isAbsolute8, posix as posix2, win32 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/git-service.ts
import { execFileSync as execFileSync4 } from "node:child_process";
import { existsSync as existsSync28, mkdirSync as mkdirSync13, readFileSync as readFileSync24, readdirSync as readdirSync11, writeFileSync as writeFileSync13 } from "node:fs";
import { isAbsolute as isAbsolute7, join as join31, normalize as normalize3, relative as relative9, resolve as resolve16, sep as sep3 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/repository-registry.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import { isAbsolute as isAbsolute5, relative as relative5, resolve as resolve11 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/pre-execution-checks.ts
import { existsSync as existsSync22, readdirSync as readdirSync8 } from "node:fs";
import { spawn } from "node:child_process";
import { homedir as homedir4 } from "node:os";
import { isAbsolute as isAbsolute4, relative as relative4, resolve as resolve10 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/verification-gate.ts
import { spawnSync as spawnSync4 } from "node:child_process";
import {
  closeSync as closeSync10,
  existsSync as existsSync21,
  fstatSync as fstatSync6,
  mkdtempSync as mkdtempSync2,
  openSync as openSync10,
  readFileSync as readFileSync18,
  readSync as readSync3,
  readdirSync as readdirSync7,
  rmSync as rmSync4
} from "node:fs";
import { join as join25, basename as basename6, delimiter as delimiter2 } from "node:path";
import { tmpdir as tmpdir2 } from "node:os";
init_rtk();

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/python-resolver.ts
import { spawnSync as spawnSync3 } from "node:child_process";
import { existsSync as existsSync19 } from "node:fs";
import { dirname as dirname13, join as join23 } from "node:path";

// node_modules/@opengsd/contracts/index.js
var WORKFLOW_TOOL_CONTRACTS = [];
var WORKFLOW_TOOL_NAMES = WORKFLOW_TOOL_CONTRACTS.map((c) => c.canonicalName);
var CANONICAL_WORKFLOW_TOOL_NAMES = new Set(WORKFLOW_TOOL_NAMES);
var WORKFLOW_TOOL_ALIAS_NAMES = WORKFLOW_TOOL_CONTRACTS.flatMap((c) => [...c.aliases]);

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/workflow-tool-surface.ts
var WORKFLOW_TOOL_CONTRACTS2 = WORKFLOW_TOOL_CONTRACTS;
var DB_WORKFLOW_TOOL_NAMES = WORKFLOW_TOOL_NAMES;
var WORKFLOW_TOOL_ALIAS_PAIRS = WORKFLOW_TOOL_CONTRACTS2.flatMap(
  (tool) => tool.aliases.map((alias) => ({ canonical: tool.canonicalName, alias }))
);
var WORKFLOW_TOOL_ALIAS_TO_CANONICAL = Object.fromEntries(WORKFLOW_TOOL_ALIAS_PAIRS.map(({ alias, canonical }) => [alias, canonical]));
var WORKFLOW_MCP_ADAPTER_TOOL_NAMES = [
  "gsd_cancel",
  "gsd_captures",
  "ask_user_questions",
  "gsd_doctor",
  "gsd_execute",
  "gsd_graph",
  "gsd_history",
  "gsd_knowledge",
  "gsd_progress",
  "gsd_query",
  "gsd_result",
  "gsd_resolve_blocker",
  "gsd_roadmap",
  "gsd_status"
];
var WORKFLOW_TOOL_SURFACE_NAMES = [
  ...WORKFLOW_MCP_ADAPTER_TOOL_NAMES,
  ...DB_WORKFLOW_TOOL_NAMES
];
var WORKFLOW_TOOL_SURFACE_NAME_SET = new Set(WORKFLOW_TOOL_SURFACE_NAMES);

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/package-manager.ts
import { existsSync as existsSync20, readFileSync as readFileSync17 } from "node:fs";
import { join as join24 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/verification-gate.ts
var MAX_OUTPUT_BYTES = 10 * 1024;

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/pre-execution-checks.ts
var NPM_COMMAND = process.platform === "win32" ? "npm.cmd" : "npm";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/gitignore.ts
import { join as join29 } from "node:path";
import { execFileSync as execFileSync3 } from "node:child_process";
import { existsSync as existsSync26, lstatSync as lstatSync9, readFileSync as readFileSync22 } from "node:fs";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/atomic-write.ts
import { closeSync as closeSync11, constants as fsConstants3, existsSync as existsSync25, fstatSync as fstatSync7, fsyncSync as fsyncSync5, lstatSync as lstatSync8, openSync as openSync11, readdirSync as readdirSync10, readFileSync as readFileSync21, realpathSync as realpathSync11, rmSync as rmSync5, writeFileSync as writeFileSync12, renameSync as renameSync7, unlinkSync as unlinkSync9, mkdirSync as mkdirSync12, promises as fs2 } from "node:fs";
import { basename as basename9, dirname as dirname16, join as join28, relative as relative8, resolve as resolve14 } from "node:path";
import { createHash as createHash15, randomBytes as randomBytes2 } from "node:crypto";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/managed-projection-history.ts
import { createHash as createHash13, randomUUID as randomUUID9 } from "node:crypto";
import {
  existsSync as existsSync23,
  lstatSync as lstatSync7,
  mkdirSync as mkdirSync10,
  readFileSync as readFileSync19,
  readdirSync as readdirSync9,
  realpathSync as realpathSync10,
  renameSync as renameSync6,
  rmdirSync as rmdirSync2,
  unlinkSync as unlinkSync8,
  writeFileSync as writeFileSync10
} from "node:fs";
import { basename as basename7, dirname as dirname14, join as join26, relative as relative6, resolve as resolve12 } from "node:path";
var projectionRootLockRetrySleep = new Int32Array(new SharedArrayBuffer(4));

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/projection-mutation-guard.ts
import { existsSync as existsSync24, mkdirSync as mkdirSync11, readFileSync as readFileSync20, writeFileSync as writeFileSync11 } from "node:fs";
import { basename as basename8, dirname as dirname15, extname, join as join27, relative as relative7, resolve as resolve13 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/projection-content-hash.ts
import { createHash as createHash14 } from "node:crypto";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/compat/compat-marker-validation.ts
import { isAbsolute as isAbsolute6, normalize as normalize2 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/atomic-write.ts
var SYNC_SLEEP_BUFFER = new SharedArrayBuffer(4);
var SYNC_SLEEP_VIEW = new Int32Array(SYNC_SLEEP_BUFFER);

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/worktree.ts
import { existsSync as existsSync27, readFileSync as readFileSync23, utimesSync } from "node:fs";
import { join as join30, resolve as resolve15 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/git-service.ts
var VALID_BRANCH_NAME = /^[a-zA-Z0-9_\-\/.]+$/;

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/preferences-validation.ts
init_format_utils();

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/planning-subagent-registry.ts
var PLANNING_DISPATCH_AGENT_REGISTRY = {
  mnemo: { readOnlySpecialist: true },
  scout: { readOnlySpecialist: true },
  planner: { readOnlySpecialist: true },
  reviewer: { readOnlySpecialist: true },
  security: { readOnlySpecialist: true },
  tester: { readOnlySpecialist: true }
};
var ALLOWED_PLANNING_DISPATCH_AGENTS = new Set(
  Object.entries(PLANNING_DISPATCH_AGENT_REGISTRY).filter(([, metadata]) => metadata.readOnlySpecialist).map(([agentId]) => agentId)
);
function configuredPlanningDispatchAgents(registry) {
  return Object.entries(registry ?? {}).filter(([, metadata]) => metadata.read_only_specialist === true).map(([agentId]) => agentId);
}
function isReadOnlyPlanningDispatchAgent(agentId, registry) {
  const metadata = PLANNING_DISPATCH_AGENT_REGISTRY[agentId];
  return metadata?.readOnlySpecialist === true || registry?.[agentId]?.read_only_specialist === true;
}
function allowedPlanningDispatchAgentsList(registry) {
  return Array.from(/* @__PURE__ */ new Set([
    ...ALLOWED_PLANNING_DISPATCH_AGENTS,
    ...configuredPlanningDispatchAgents(registry)
  ])).join(", ");
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/preferences-validation.ts
var VALID_TOKEN_PROFILES2 = /* @__PURE__ */ new Set(["budget", "balanced", "quality", "burn-max"]);
var VALID_THINKING_LEVELS = /* @__PURE__ */ new Set([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
]);
var KNOWN_MODEL_PHASE_KEYS = new Set(GSD_MODEL_PHASE_KEYS);
var VALID_UOK_TURN_ACTIONS = /* @__PURE__ */ new Set([
  "commit",
  "snapshot",
  "status-only"
]);
function sanitizeModelField(raw, label, errors, warnings) {
  if (raw === void 0) return void 0;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      errors.push(`${label} must not be an empty string`);
      return void 0;
    }
    return trimmed;
  }
  if (raw && typeof raw === "object") {
    const obj = raw;
    const model = typeof obj.model === "string" ? obj.model.trim() : "";
    if (!model) {
      errors.push(`${label} object form requires a non-empty "model"`);
      return void 0;
    }
    const sanitized = { model };
    if (typeof obj.provider === "string" && obj.provider.trim()) {
      sanitized.provider = obj.provider.trim();
    }
    if (obj.fallbacks !== void 0) {
      const fallbacks = normalizeStringArray(obj.fallbacks);
      if (fallbacks.length > 0) sanitized.fallbacks = fallbacks;
    }
    if (obj.thinking !== void 0) {
      if (VALID_THINKING_LEVELS.has(obj.thinking)) {
        sanitized.thinking = obj.thinking;
      } else {
        warnings?.push(
          `${label} thinking "${String(obj.thinking)}" is not a valid thinking level (off, minimal, low, medium, high, xhigh, max) \u2014 ignored`
        );
      }
    }
    return sanitized;
  }
  errors.push(`${label} must be a string or an object with a "model" field`);
  return void 0;
}
var VALID_POST_UNIT_HOOK_CRITICALITIES = /* @__PURE__ */ new Set(["advisory", "blocking"]);
var VALID_POST_UNIT_HOOK_ON_BLOCK_ACTIONS = /* @__PURE__ */ new Set([
  "retry-unit",
  "retry-task",
  "queue-task",
  "queue-slice",
  "pause"
]);
var VALID_GATE_EVALUATE_SLICE_GATES = new Set(getGateIdsForTurn("gate-evaluate"));
function crossAxisPreferenceWarnings(preferences) {
  if (preferences.mode === "team" && preferences.workspace?.mode === "parent") {
    return [
      "mode:team + workspace.mode:parent: team branch-push/PR resolves at the project root and will not push child repositories \u2014 see docs/dev/ADR-044"
    ];
  }
  return [];
}
function validatePreferences(preferences) {
  const errors = [];
  const warnings = [];
  const validated = {};
  const KEY_MIGRATION_HINTS = {
    taskIsolation: 'use "git.isolation" instead (values: worktree, branch, none)',
    task_isolation: 'use "git.isolation" instead (values: worktree, branch, none)',
    isolation: 'use "git.isolation" instead (values: worktree, branch, none)',
    manage_gitignore: 'use "git.manage_gitignore" instead',
    auto_push: 'use "git.auto_push" instead',
    main_branch: 'use "git.main_branch" instead'
  };
  for (const key of Object.keys(preferences)) {
    if (!KNOWN_PREFERENCE_KEYS.has(key)) {
      const hint = KEY_MIGRATION_HINTS[key];
      if (hint) {
        warnings.push(`unknown preference key "${key}" \u2014 ${hint}`);
      } else {
        warnings.push(`unknown preference key "${key}" \u2014 ignored`);
      }
    }
  }
  if (preferences.version !== void 0) {
    if (preferences.version === 1) {
      validated.version = 1;
    } else {
      errors.push(`unsupported version ${preferences.version}`);
    }
  }
  if (preferences.mode !== void 0) {
    const validModes = /* @__PURE__ */ new Set(["solo", "team"]);
    if (typeof preferences.mode === "string" && validModes.has(preferences.mode)) {
      validated.mode = preferences.mode;
    } else {
      errors.push(`invalid mode "${preferences.mode}" \u2014 must be one of: solo, team`);
    }
  }
  const validDiscoveryModes = /* @__PURE__ */ new Set(["auto", "suggest", "off"]);
  if (preferences.skill_discovery) {
    if (validDiscoveryModes.has(preferences.skill_discovery)) {
      validated.skill_discovery = preferences.skill_discovery;
    } else {
      errors.push(`invalid skill_discovery value: ${preferences.skill_discovery}`);
    }
  }
  if (preferences.skill_staleness_days !== void 0) {
    const days = Number(preferences.skill_staleness_days);
    if (Number.isFinite(days) && days >= 0) {
      validated.skill_staleness_days = Math.floor(days);
    } else {
      errors.push(`invalid skill_staleness_days: must be a non-negative number`);
    }
  }
  validated.always_use_skills = normalizeStringArray(preferences.always_use_skills);
  validated.prefer_skills = normalizeStringArray(preferences.prefer_skills);
  validated.avoid_skills = normalizeStringArray(preferences.avoid_skills);
  validated.custom_instructions = normalizeStringArray(preferences.custom_instructions);
  if (preferences.runtime !== void 0) {
    if (typeof preferences.runtime === "object" && preferences.runtime !== null && !Array.isArray(preferences.runtime)) {
      const runtime = preferences.runtime;
      const rawContract = runtime.contract;
      if (typeof rawContract === "object" && rawContract !== null && !Array.isArray(rawContract)) {
        const contract = rawContract;
        const validContract = {};
        let contractIsValid = true;
        for (const key of ["path", "entry"]) {
          const value = contract[key];
          if (value === void 0) continue;
          if (typeof value !== "string" || value.trim().length === 0) {
            errors.push(`runtime.contract.${key} must be a non-empty relative path`);
            contractIsValid = false;
            continue;
          }
          const trimmed = value.trim();
          const slashPath = trimmed.replaceAll("\\", "/");
          const normalized = posix2.normalize(slashPath);
          if (/[\u0000-\u001f\u007f]/.test(trimmed) || isAbsolute8(trimmed) || win32.isAbsolute(trimmed) || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
            const boundary = key === "path" ? "project" : "runtime contract directory";
            errors.push(`runtime.contract.${key} must stay within the ${boundary}`);
            contractIsValid = false;
            continue;
          }
          validContract[key] = normalized;
        }
        for (const key of Object.keys(contract)) {
          if (key !== "path" && key !== "entry") {
            warnings.push(`unknown runtime.contract key "${key}" \u2014 ignored`);
          }
        }
        if (contractIsValid) validated.runtime = { contract: validContract };
      } else {
        errors.push("runtime.contract must be an object");
      }
      for (const key of Object.keys(runtime)) {
        if (key !== "contract") warnings.push(`unknown runtime key "${key}" \u2014 ignored`);
      }
    } else {
      errors.push("runtime must be an object");
    }
  }
  if (preferences.skill_rules) {
    const validRules = [];
    for (const rule of preferences.skill_rules) {
      if (!rule || typeof rule !== "object") {
        errors.push("invalid skill_rules entry");
        continue;
      }
      const when = typeof rule.when === "string" ? rule.when.trim() : "";
      if (!when) {
        errors.push("skill_rules entry missing when");
        continue;
      }
      const validatedRule = { when };
      for (const action of SKILL_ACTIONS) {
        const values2 = normalizeStringArray(rule[action]);
        if (values2.length > 0) {
          validatedRule[action] = values2;
        }
      }
      if (!validatedRule.use && !validatedRule.prefer && !validatedRule.avoid) {
        errors.push(`skill rule has no actions: ${when}`);
        continue;
      }
      validRules.push(validatedRule);
    }
    if (validRules.length > 0) {
      validated.skill_rules = validRules;
    }
  }
  for (const key of ["always_use_skills", "prefer_skills", "avoid_skills", "custom_instructions"]) {
    if (validated[key] && validated[key].length === 0) {
      delete validated[key];
    }
  }
  if (preferences.uat_dispatch !== void 0) {
    validated.uat_dispatch = !!preferences.uat_dispatch;
  }
  if (preferences.unique_milestone_ids !== void 0) {
    validated.unique_milestone_ids = !!preferences.unique_milestone_ids;
  }
  if (preferences.budget_ceiling !== void 0) {
    const raw = preferences.budget_ceiling;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      validated.budget_ceiling = raw;
    } else if (typeof raw === "string" && Number.isFinite(Number(raw))) {
      validated.budget_ceiling = Number(raw);
    } else {
      errors.push("budget_ceiling must be a finite number");
    }
  }
  if (preferences.budget_enforcement !== void 0) {
    const validModes = /* @__PURE__ */ new Set(["warn", "pause", "halt"]);
    if (typeof preferences.budget_enforcement === "string" && validModes.has(preferences.budget_enforcement)) {
      validated.budget_enforcement = preferences.budget_enforcement;
    } else {
      errors.push(`budget_enforcement must be one of: warn, pause, halt`);
    }
  }
  if (preferences.uok !== void 0) {
    if (typeof preferences.uok === "object" && preferences.uok !== null) {
      const raw = preferences.uok;
      const valid = {};
      if (raw.enabled !== void 0) {
        if (typeof raw.enabled === "boolean") valid.enabled = raw.enabled;
        else errors.push("uok.enabled must be a boolean");
      }
      const parseEnabledBlock = (key) => {
        const value = raw[key];
        if (value === void 0) return;
        if (typeof value !== "object" || value === null) {
          errors.push(`uok.${key} must be an object`);
          return;
        }
        const block = value;
        const parsed = {};
        if (block.enabled !== void 0) {
          if (typeof block.enabled === "boolean") parsed.enabled = block.enabled;
          else errors.push(`uok.${key}.enabled must be a boolean`);
        }
        const unknown = Object.keys(block).filter((k) => k !== "enabled");
        for (const unk of unknown) {
          warnings.push(`unknown uok.${key} key "${unk}" \u2014 ignored`);
        }
        if (Object.keys(parsed).length > 0) {
          valid[key] = parsed;
        }
      };
      parseEnabledBlock("legacy_fallback");
      parseEnabledBlock("gates");
      parseEnabledBlock("model_policy");
      parseEnabledBlock("execution_graph");
      parseEnabledBlock("audit_unified");
      parseEnabledBlock("plan_v2");
      if (raw.gitops !== void 0) {
        if (typeof raw.gitops !== "object" || raw.gitops === null) {
          errors.push("uok.gitops must be an object");
        } else {
          const gitops = raw.gitops;
          const parsed = {};
          if (gitops.enabled !== void 0) {
            if (typeof gitops.enabled === "boolean") parsed.enabled = gitops.enabled;
            else errors.push("uok.gitops.enabled must be a boolean");
          }
          if (gitops.turn_action !== void 0) {
            if (typeof gitops.turn_action === "string" && VALID_UOK_TURN_ACTIONS.has(gitops.turn_action)) {
              parsed.turn_action = gitops.turn_action;
            } else {
              errors.push("uok.gitops.turn_action must be one of: commit, snapshot, status-only");
            }
          }
          if (gitops.turn_push !== void 0) {
            if (typeof gitops.turn_push === "boolean") parsed.turn_push = gitops.turn_push;
            else errors.push("uok.gitops.turn_push must be a boolean");
          }
          const unknown = Object.keys(gitops).filter((k) => !["enabled", "turn_action", "turn_push"].includes(k));
          for (const unk of unknown) {
            warnings.push(`unknown uok.gitops key "${unk}" \u2014 ignored`);
          }
          if (Object.keys(parsed).length > 0) {
            valid.gitops = parsed;
          }
        }
      }
      const knownUokKeys = /* @__PURE__ */ new Set([
        "enabled",
        "legacy_fallback",
        "gates",
        "model_policy",
        "execution_graph",
        "gitops",
        "audit_unified",
        "plan_v2"
      ]);
      for (const key of Object.keys(raw)) {
        if (!knownUokKeys.has(key)) {
          warnings.push(`unknown uok key "${key}" \u2014 ignored`);
        }
      }
      if (Object.keys(valid).length > 0) {
        validated.uok = valid;
      }
    } else {
      errors.push("uok must be an object");
    }
  }
  if (preferences.token_profile !== void 0) {
    if (typeof preferences.token_profile === "string" && VALID_TOKEN_PROFILES2.has(preferences.token_profile)) {
      validated.token_profile = preferences.token_profile;
    } else {
      errors.push(`token_profile must be one of: budget, balanced, quality, burn-max`);
    }
  }
  if (preferences.planning_depth !== void 0) {
    if (preferences.planning_depth === "light" || preferences.planning_depth === "deep") {
      validated.planning_depth = preferences.planning_depth;
    } else {
      errors.push(`planning_depth must be "light" or "deep"`);
    }
  }
  if (preferences.search_provider !== void 0) {
    const validSearchProviders = /* @__PURE__ */ new Set(["brave", "tavily", "ollama", "native", "auto"]);
    if (typeof preferences.search_provider === "string" && validSearchProviders.has(preferences.search_provider)) {
      validated.search_provider = preferences.search_provider;
    } else {
      errors.push(`search_provider must be one of: brave, tavily, ollama, native, auto`);
    }
  }
  if (preferences.flat_rate_providers !== void 0) {
    if (Array.isArray(preferences.flat_rate_providers)) {
      const allStrings = preferences.flat_rate_providers.every(
        (item) => typeof item === "string"
      );
      if (allStrings) {
        validated.flat_rate_providers = preferences.flat_rate_providers.map((s) => s.trim()).filter((s) => s.length > 0);
      } else {
        errors.push("flat_rate_providers must be an array of strings");
      }
    } else {
      errors.push("flat_rate_providers must be an array of strings");
    }
  }
  if (preferences.phases !== void 0) {
    if (typeof preferences.phases === "object" && preferences.phases !== null) {
      const validatedPhases = {};
      const p = preferences.phases;
      const parseStrictBoolean = (key, raw) => {
        if (typeof raw === "boolean") return raw;
        if (typeof raw === "string") {
          if (raw === "true") return true;
          if (raw === "false") return false;
        }
        warnings.push(`phases.${key} must be a boolean (got ${typeof raw}: ${JSON.stringify(raw)}) \u2014 ignored`);
        return void 0;
      };
      const assignBool = (key, raw) => {
        const v = parseStrictBoolean(String(key), raw);
        if (v !== void 0) validatedPhases[key] = v;
      };
      if (p.skip_research !== void 0) assignBool("skip_research", p.skip_research);
      if (p.skip_reassess !== void 0) assignBool("skip_reassess", p.skip_reassess);
      if (p.skip_slice_research !== void 0) assignBool("skip_slice_research", p.skip_slice_research);
      if (p.skip_milestone_validation !== void 0) assignBool("skip_milestone_validation", p.skip_milestone_validation);
      if (p.reassess_after_slice !== void 0) assignBool("reassess_after_slice", p.reassess_after_slice);
      if (p.require_slice_discussion !== void 0) {
        const v = parseStrictBoolean("require_slice_discussion", p.require_slice_discussion);
        if (v !== void 0) validatedPhases.require_slice_discussion = v;
      }
      if (p.mid_execution_escalation !== void 0) assignBool("mid_execution_escalation", p.mid_execution_escalation);
      if (p.progressive_planning !== void 0) assignBool("progressive_planning", p.progressive_planning);
      const knownPhaseKeys = /* @__PURE__ */ new Set(["skip_research", "skip_reassess", "skip_slice_research", "skip_milestone_validation", "reassess_after_slice", "require_slice_discussion", "mid_execution_escalation", "progressive_planning"]);
      for (const key of Object.keys(p)) {
        if (!knownPhaseKeys.has(key)) {
          warnings.push(`unknown phases key "${key}" \u2014 ignored`);
        }
      }
      validated.phases = validatedPhases;
    } else {
      errors.push(`phases must be an object`);
    }
  }
  if (preferences.context_pause_threshold !== void 0) {
    const raw = preferences.context_pause_threshold;
    const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
    if (typeof value === "number" && Number.isFinite(value) && (value === 0 || value >= 1 && value <= 100)) {
      validated.context_pause_threshold = value;
    } else {
      errors.push("context_pause_threshold must be 0 to disable or a percentage between 1 and 100");
    }
  }
  if (preferences.models !== void 0) {
    if (preferences.models && typeof preferences.models === "object") {
      const sanitizedModels = {};
      for (const [phase, entry] of Object.entries(preferences.models)) {
        if (entry && typeof entry === "object" && "thinking" in entry) {
          const level = entry.thinking;
          if (level !== void 0 && !VALID_THINKING_LEVELS.has(level)) {
            warnings.push(
              `models.${phase}.thinking "${String(level)}" is not a valid thinking level (off, minimal, low, medium, high, xhigh, max) \u2014 ignored`
            );
            const { thinking: _ignored, ...rest } = entry;
            if (rest.model) {
              sanitizedModels[phase] = rest;
            }
            continue;
          }
        }
        sanitizedModels[phase] = entry;
      }
      validated.models = sanitizedModels;
    } else {
      errors.push("models must be an object");
    }
  }
  if (preferences.thinking !== void 0) {
    if (preferences.thinking && typeof preferences.thinking === "object" && !Array.isArray(preferences.thinking)) {
      const validatedThinking = {};
      for (const [phase, level] of Object.entries(preferences.thinking)) {
        if (!KNOWN_MODEL_PHASE_KEYS.has(phase)) {
          warnings.push(
            `unknown thinking phase "${phase}" \u2014 must be one of: ${[...KNOWN_MODEL_PHASE_KEYS].join(", ")} \u2014 ignored`
          );
          continue;
        }
        if (!VALID_THINKING_LEVELS.has(level)) {
          warnings.push(
            `thinking.${phase} "${String(level)}" is not a valid thinking level (off, minimal, low, medium, high, xhigh, max) \u2014 ignored`
          );
          continue;
        }
        validatedThinking[phase] = level;
      }
      if (Object.keys(validatedThinking).length > 0) {
        validated.thinking = validatedThinking;
      }
    } else {
      errors.push("thinking must be an object");
    }
  }
  if (preferences.auto_supervisor !== void 0) {
    if (preferences.auto_supervisor && typeof preferences.auto_supervisor === "object") {
      const supervisor = { ...preferences.auto_supervisor };
      if (supervisor.model !== void 0) {
        supervisor.model = sanitizeModelField(supervisor.model, "auto_supervisor.model", errors, warnings);
      }
      validated.auto_supervisor = supervisor;
    } else {
      errors.push("auto_supervisor must be an object");
    }
  }
  if (preferences.notifications !== void 0) {
    if (preferences.notifications && typeof preferences.notifications === "object") {
      validated.notifications = preferences.notifications;
    } else {
      errors.push("notifications must be an object");
    }
  }
  if (preferences.cmux !== void 0) {
    if (preferences.cmux && typeof preferences.cmux === "object") {
      const cmux = preferences.cmux;
      const validatedCmux = {};
      if (cmux.enabled !== void 0) validatedCmux.enabled = !!cmux.enabled;
      if (cmux.notifications !== void 0) validatedCmux.notifications = !!cmux.notifications;
      if (cmux.sidebar !== void 0) validatedCmux.sidebar = !!cmux.sidebar;
      if (cmux.splits !== void 0) validatedCmux.splits = !!cmux.splits;
      if (cmux.browser !== void 0) validatedCmux.browser = !!cmux.browser;
      const knownCmuxKeys = /* @__PURE__ */ new Set(["enabled", "notifications", "sidebar", "splits", "browser"]);
      for (const key of Object.keys(cmux)) {
        if (!knownCmuxKeys.has(key)) {
          warnings.push(`unknown cmux key "${key}" \u2014 ignored`);
        }
      }
      if (Object.keys(validatedCmux).length > 0) {
        validated.cmux = validatedCmux;
      }
    } else {
      errors.push("cmux must be an object");
    }
  }
  if (preferences.remote_questions !== void 0) {
    const remoteQuestions = preferences.remote_questions;
    if (remoteQuestions === null || remoteQuestions === false) {
    } else if (typeof remoteQuestions === "object") {
      validated.remote_questions = remoteQuestions;
    } else {
      errors.push("remote_questions must be an object");
    }
  }
  if (preferences.post_unit_hooks && Array.isArray(preferences.post_unit_hooks)) {
    const validHooks = [];
    const seenNames = /* @__PURE__ */ new Set();
    const knownUnitTypes = new Set(KNOWN_UNIT_LABELS);
    for (const hook of preferences.post_unit_hooks) {
      if (!hook || typeof hook !== "object") {
        errors.push("post_unit_hooks entry must be an object");
        continue;
      }
      const name = typeof hook.name === "string" ? hook.name.trim() : "";
      if (!name) {
        errors.push("post_unit_hooks entry missing name");
        continue;
      }
      if (seenNames.has(name)) {
        errors.push(`duplicate post_unit_hooks name: ${name}`);
        continue;
      }
      const after = normalizeStringArray(hook.after);
      if (after.length === 0) {
        errors.push(`post_unit_hooks "${name}" missing after`);
        continue;
      }
      for (const ut of after) {
        if (!knownUnitTypes.has(ut)) {
          errors.push(`post_unit_hooks "${name}" unknown unit type in after: ${ut}`);
        }
      }
      const prompt = typeof hook.prompt === "string" ? hook.prompt.trim() : "";
      if (!prompt) {
        errors.push(`post_unit_hooks "${name}" missing prompt`);
        continue;
      }
      const validHook = { name, after, prompt };
      if (hook.max_cycles !== void 0) {
        const mc = typeof hook.max_cycles === "number" ? hook.max_cycles : Number(hook.max_cycles);
        validHook.max_cycles = Number.isFinite(mc) ? Math.max(1, Math.min(10, Math.round(mc))) : 1;
      }
      const hookModel = sanitizeModelField(hook.model, `post_unit_hooks "${name}" model`, errors, warnings);
      if (hookModel !== void 0) {
        validHook.model = hookModel;
      }
      if (typeof hook.artifact === "string" && hook.artifact.trim()) {
        validHook.artifact = hook.artifact.trim();
      }
      if (hook.criticality !== void 0) {
        const criticality = typeof hook.criticality === "string" ? hook.criticality.trim() : "";
        if (VALID_POST_UNIT_HOOK_CRITICALITIES.has(criticality)) {
          validHook.criticality = criticality;
        } else {
          errors.push(`post_unit_hooks "${name}" invalid criticality: ${String(hook.criticality)}`);
        }
      }
      if (typeof hook.retry_on === "string" && hook.retry_on.trim()) {
        validHook.retry_on = hook.retry_on.trim();
      }
      if (hook.on_block !== void 0) {
        if (!hook.on_block || typeof hook.on_block !== "object") {
          errors.push(`post_unit_hooks "${name}" on_block must be an object`);
        } else {
          const onBlock = hook.on_block;
          const action = typeof onBlock.action === "string" ? onBlock.action.trim() : "";
          if (!VALID_POST_UNIT_HOOK_ON_BLOCK_ACTIONS.has(action)) {
            errors.push(`post_unit_hooks "${name}" invalid on_block action: ${String(onBlock.action)}`);
          } else {
            validHook.on_block = { action };
            if (typeof onBlock.artifact === "string" && onBlock.artifact.trim()) {
              validHook.on_block.artifact = onBlock.artifact.trim();
            }
          }
        }
      }
      if (validHook.criticality === "blocking" && !validHook.artifact) {
        errors.push(`post_unit_hooks "${name}" criticality blocking requires artifact`);
        continue;
      }
      if (typeof hook.agent === "string" && hook.agent.trim()) {
        validHook.agent = hook.agent.trim();
      }
      if (hook.enabled !== void 0) {
        validHook.enabled = !!hook.enabled;
      }
      seenNames.add(name);
      validHooks.push(validHook);
    }
    if (validHooks.length > 0) {
      validated.post_unit_hooks = validHooks;
    }
  }
  if (preferences.pre_dispatch_hooks && Array.isArray(preferences.pre_dispatch_hooks)) {
    const validPreHooks = [];
    const seenPreNames = /* @__PURE__ */ new Set();
    const knownUnitTypes = new Set(KNOWN_UNIT_LABELS);
    const validActions = /* @__PURE__ */ new Set(["modify", "skip", "replace"]);
    for (const hook of preferences.pre_dispatch_hooks) {
      if (!hook || typeof hook !== "object") {
        errors.push("pre_dispatch_hooks entry must be an object");
        continue;
      }
      const name = typeof hook.name === "string" ? hook.name.trim() : "";
      if (!name) {
        errors.push("pre_dispatch_hooks entry missing name");
        continue;
      }
      if (seenPreNames.has(name)) {
        errors.push(`duplicate pre_dispatch_hooks name: ${name}`);
        continue;
      }
      const before = normalizeStringArray(hook.before);
      if (before.length === 0) {
        errors.push(`pre_dispatch_hooks "${name}" missing before`);
        continue;
      }
      for (const ut of before) {
        if (!knownUnitTypes.has(ut)) {
          errors.push(`pre_dispatch_hooks "${name}" unknown unit type in before: ${ut}`);
        }
      }
      const action = typeof hook.action === "string" ? hook.action.trim() : "";
      if (!validActions.has(action)) {
        errors.push(`pre_dispatch_hooks "${name}" invalid action: ${action} (must be modify, skip, or replace)`);
        continue;
      }
      const validHook = { name, before, action };
      if (typeof hook.prepend === "string" && hook.prepend.trim()) validHook.prepend = hook.prepend.trim();
      if (typeof hook.append === "string" && hook.append.trim()) validHook.append = hook.append.trim();
      if (typeof hook.prompt === "string" && hook.prompt.trim()) validHook.prompt = hook.prompt.trim();
      if (typeof hook.unit_type === "string" && hook.unit_type.trim()) validHook.unit_type = hook.unit_type.trim();
      if (typeof hook.skip_if === "string" && hook.skip_if.trim()) validHook.skip_if = hook.skip_if.trim();
      if (typeof hook.model === "string" && hook.model.trim()) validHook.model = hook.model.trim();
      if (hook.enabled !== void 0) validHook.enabled = !!hook.enabled;
      if (action === "replace" && !validHook.prompt) {
        errors.push(`pre_dispatch_hooks "${name}" action "replace" requires prompt`);
        continue;
      }
      if (action === "modify" && !validHook.prepend && !validHook.append) {
        errors.push(`pre_dispatch_hooks "${name}" action "modify" requires prepend or append`);
        continue;
      }
      seenPreNames.add(name);
      validPreHooks.push(validHook);
    }
    if (validPreHooks.length > 0) {
      validated.pre_dispatch_hooks = validPreHooks;
    }
  }
  if (preferences.planning_subagent_registry !== void 0) {
    if (!preferences.planning_subagent_registry || typeof preferences.planning_subagent_registry !== "object" || Array.isArray(preferences.planning_subagent_registry)) {
      errors.push("planning_subagent_registry must be an object keyed by agent id");
    } else {
      const validRegistry = {};
      for (const [rawAgentId, rawConfig] of Object.entries(preferences.planning_subagent_registry)) {
        const agentId = rawAgentId.trim();
        if (!agentId) {
          errors.push("planning_subagent_registry includes an empty agent id");
          continue;
        }
        if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
          errors.push(`planning_subagent_registry.${agentId} must be an object with read_only_specialist: true`);
          continue;
        }
        const readOnlySpecialist = rawConfig.read_only_specialist;
        if (readOnlySpecialist !== true) {
          errors.push(
            `planning_subagent_registry.${agentId}.read_only_specialist must be true to classify "${agentId}" as a read-only planning specialist`
          );
          continue;
        }
        validRegistry[agentId] = { read_only_specialist: true };
      }
      if (Object.keys(validRegistry).length > 0) {
        validated.planning_subagent_registry = validRegistry;
      }
    }
  }
  if (preferences.planning_subagents !== void 0) {
    if (!preferences.planning_subagents || typeof preferences.planning_subagents !== "object" || Array.isArray(preferences.planning_subagents)) {
      errors.push("planning_subagents must be an object keyed by planning unit type");
    } else {
      const validUnits = new Set(CONFIGURABLE_PLANNING_SUBAGENT_UNITS);
      const validPlanningSubagents = {};
      for (const [unitType, rawConfig] of Object.entries(preferences.planning_subagents)) {
        if (!validUnits.has(unitType)) {
          errors.push(
            `planning_subagents unknown or unsupported unit "${unitType}" \u2014 supported units: ${CONFIGURABLE_PLANNING_SUBAGENT_UNITS.join(", ")}`
          );
          continue;
        }
        if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
          errors.push(`planning_subagents.${unitType} must be an object with an allowed array`);
          continue;
        }
        const allowed = normalizeStringArray(rawConfig.allowed);
        if (allowed.length === 0) {
          errors.push(`planning_subagents.${unitType}.allowed must include at least one read-only planning specialist`);
          continue;
        }
        const sanitizedAllowed = [];
        for (const agentId of allowed) {
          if (!isReadOnlyPlanningDispatchAgent(agentId, validated.planning_subagent_registry)) {
            errors.push(
              `planning_subagents.${unitType}.allowed includes "${agentId}", which is not classified as a read-only planning specialist. Allowed agents: ${allowedPlanningDispatchAgentsList(validated.planning_subagent_registry)}. For custom planning agents, add planning_subagent_registry.${agentId}.read_only_specialist: true`
            );
            continue;
          }
          sanitizedAllowed.push(agentId);
        }
        const dedupedAllowed = Array.from(new Set(sanitizedAllowed));
        if (dedupedAllowed.length > 0) {
          validPlanningSubagents[unitType] = {
            allowed: dedupedAllowed
          };
        }
      }
      if (Object.keys(validPlanningSubagents).length > 0) {
        validated.planning_subagents = validPlanningSubagents;
      }
    }
  }
  if (preferences.dynamic_routing !== void 0) {
    if (typeof preferences.dynamic_routing === "object" && preferences.dynamic_routing !== null) {
      const dr = preferences.dynamic_routing;
      const validDr = {};
      if (dr.enabled !== void 0) {
        if (typeof dr.enabled === "boolean") validDr.enabled = dr.enabled;
        else errors.push("dynamic_routing.enabled must be a boolean");
      }
      if (dr.escalate_on_failure !== void 0) {
        if (typeof dr.escalate_on_failure === "boolean") validDr.escalate_on_failure = dr.escalate_on_failure;
        else errors.push("dynamic_routing.escalate_on_failure must be a boolean");
      }
      if (dr.budget_pressure !== void 0) {
        if (typeof dr.budget_pressure === "boolean") validDr.budget_pressure = dr.budget_pressure;
        else errors.push("dynamic_routing.budget_pressure must be a boolean");
      }
      if (dr.cross_provider !== void 0) {
        if (typeof dr.cross_provider === "boolean") validDr.cross_provider = dr.cross_provider;
        else errors.push("dynamic_routing.cross_provider must be a boolean");
      }
      if (dr.hooks !== void 0) {
        if (typeof dr.hooks === "boolean") validDr.hooks = dr.hooks;
        else errors.push("dynamic_routing.hooks must be a boolean");
      }
      if (dr.capability_routing !== void 0) {
        if (typeof dr.capability_routing === "boolean") validDr.capability_routing = dr.capability_routing;
        else errors.push("dynamic_routing.capability_routing must be a boolean");
      }
      if (dr.allow_flat_rate_providers !== void 0) {
        if (typeof dr.allow_flat_rate_providers === "boolean") validDr.allow_flat_rate_providers = dr.allow_flat_rate_providers;
        else errors.push("dynamic_routing.allow_flat_rate_providers must be a boolean");
      }
      if (dr.tier_models !== void 0) {
        if (typeof dr.tier_models === "object" && dr.tier_models !== null) {
          const tm = dr.tier_models;
          const validTm = {};
          for (const tier of ["light", "standard", "heavy"]) {
            if (tm[tier] !== void 0) {
              if (typeof tm[tier] === "string") validTm[tier] = tm[tier];
              else errors.push(`dynamic_routing.tier_models.${tier} must be a string`);
            }
          }
          if (Object.keys(validTm).length > 0) validDr.tier_models = validTm;
        } else {
          errors.push("dynamic_routing.tier_models must be an object");
        }
      }
      if (Object.keys(validDr).length > 0) {
        validated.dynamic_routing = validDr;
      }
    } else {
      errors.push("dynamic_routing must be an object");
    }
  }
  if (preferences.disabled_model_providers !== void 0) {
    if (Array.isArray(preferences.disabled_model_providers)) {
      const allStrings = preferences.disabled_model_providers.every(
        (provider) => typeof provider === "string"
      );
      if (!allStrings) {
        errors.push("disabled_model_providers must be an array of strings");
      } else {
        const normalized = preferences.disabled_model_providers.map((provider) => provider.trim()).filter((provider) => provider.length > 0);
        if (normalized.length > 0) {
          validated.disabled_model_providers = Array.from(new Set(normalized));
        }
      }
    } else {
      errors.push("disabled_model_providers must be an array of strings");
    }
  }
  if (preferences.context_management !== void 0) {
    if (typeof preferences.context_management === "object" && preferences.context_management !== null) {
      const cm = preferences.context_management;
      const validCm = {};
      if (cm.observation_masking !== void 0) {
        if (typeof cm.observation_masking === "boolean") validCm.observation_masking = cm.observation_masking;
        else errors.push("context_management.observation_masking must be a boolean");
      }
      if (cm.observation_mask_turns !== void 0) {
        const turns = cm.observation_mask_turns;
        if (typeof turns === "number" && turns >= 1 && turns <= 50) validCm.observation_mask_turns = turns;
        else errors.push("context_management.observation_mask_turns must be a number between 1 and 50");
      }
      if (cm.compaction_threshold_percent !== void 0) {
        const pct = cm.compaction_threshold_percent;
        if (typeof pct === "number" && pct >= 0.5 && pct <= 0.95) validCm.compaction_threshold_percent = pct;
        else errors.push("context_management.compaction_threshold_percent must be a number between 0.5 and 0.95");
      }
      if (cm.tool_result_max_chars !== void 0) {
        const chars = cm.tool_result_max_chars;
        if (typeof chars === "number" && chars >= 200 && chars <= 1e4) validCm.tool_result_max_chars = chars;
        else errors.push("context_management.tool_result_max_chars must be a number between 200 and 10000");
      }
      if (Object.keys(validCm).length > 0) {
        validated.context_management = validCm;
      }
    } else {
      errors.push("context_management must be an object");
    }
  }
  if (preferences.tool_call_loop_guard !== void 0) {
    if (typeof preferences.tool_call_loop_guard === "object" && preferences.tool_call_loop_guard !== null) {
      const g = preferences.tool_call_loop_guard;
      const validGuard = {};
      if (g.enabled !== void 0) {
        if (typeof g.enabled === "boolean") validGuard.enabled = g.enabled;
        else errors.push("tool_call_loop_guard.enabled must be a boolean");
      }
      if (g.identical_args !== void 0) {
        if (typeof g.identical_args === "object" && g.identical_args !== null) {
          const ia = g.identical_args;
          const validIa = {};
          if (ia.enabled !== void 0) {
            if (typeof ia.enabled === "boolean") validIa.enabled = ia.enabled;
            else errors.push("tool_call_loop_guard.identical_args.enabled must be a boolean");
          }
          if (ia.max_consecutive_calls !== void 0) {
            const n = ia.max_consecutive_calls;
            if (typeof n === "number" && Number.isInteger(n) && n >= 1) validIa.max_consecutive_calls = n;
            else errors.push("tool_call_loop_guard.identical_args.max_consecutive_calls must be an integer >= 1");
          }
          if (Object.keys(validIa).length > 0) validGuard.identical_args = validIa;
        } else {
          errors.push("tool_call_loop_guard.identical_args must be an object");
        }
      }
      if (g.repeated_tool !== void 0) {
        if (typeof g.repeated_tool === "object" && g.repeated_tool !== null) {
          const rt = g.repeated_tool;
          const validRt = {};
          if (rt.enabled !== void 0) {
            if (typeof rt.enabled === "boolean") validRt.enabled = rt.enabled;
            else errors.push("tool_call_loop_guard.repeated_tool.enabled must be a boolean");
          }
          if (rt.default_cap !== void 0) {
            const n = rt.default_cap;
            if (typeof n === "number" && Number.isInteger(n) && n >= 1) validRt.default_cap = n;
            else errors.push("tool_call_loop_guard.repeated_tool.default_cap must be an integer >= 1");
          }
          if (rt.repeatable_cap !== void 0) {
            const n = rt.repeatable_cap;
            if (typeof n === "number" && Number.isInteger(n) && n >= 1) validRt.repeatable_cap = n;
            else errors.push("tool_call_loop_guard.repeated_tool.repeatable_cap must be an integer >= 1");
          }
          if (rt.exempt_tools !== void 0) {
            if (Array.isArray(rt.exempt_tools) && rt.exempt_tools.every((t) => typeof t === "string")) {
              validRt.exempt_tools = rt.exempt_tools;
            } else {
              errors.push("tool_call_loop_guard.repeated_tool.exempt_tools must be an array of strings");
            }
          }
          if (Object.keys(validRt).length > 0) validGuard.repeated_tool = validRt;
        } else {
          errors.push("tool_call_loop_guard.repeated_tool must be an object");
        }
      }
      if (Object.keys(validGuard).length > 0) {
        validated.tool_call_loop_guard = validGuard;
      }
    } else {
      errors.push("tool_call_loop_guard must be an object");
    }
  }
  if (preferences.context_mode !== void 0) {
    if (typeof preferences.context_mode === "object" && preferences.context_mode !== null) {
      const cmode = preferences.context_mode;
      const validCmode = {};
      if (cmode.enabled !== void 0) {
        if (typeof cmode.enabled === "boolean") validCmode.enabled = cmode.enabled;
        else errors.push("context_mode.enabled must be a boolean");
      }
      if (cmode.exec_timeout_ms !== void 0) {
        const t = cmode.exec_timeout_ms;
        if (typeof t === "number" && t >= 1e3 && t <= 6e5) validCmode.exec_timeout_ms = Math.floor(t);
        else errors.push("context_mode.exec_timeout_ms must be a number between 1000 and 600000");
      }
      if (cmode.exec_stdout_cap_bytes !== void 0) {
        const b = cmode.exec_stdout_cap_bytes;
        if (typeof b === "number" && b >= 4096 && b <= 16777216) validCmode.exec_stdout_cap_bytes = Math.floor(b);
        else errors.push("context_mode.exec_stdout_cap_bytes must be a number between 4096 and 16777216");
      }
      if (cmode.exec_digest_chars !== void 0) {
        const c = cmode.exec_digest_chars;
        if (typeof c === "number" && c >= 0 && c <= 4e3) validCmode.exec_digest_chars = Math.floor(c);
        else errors.push("context_mode.exec_digest_chars must be a number between 0 and 4000");
      }
      if (cmode.exec_env_allowlist !== void 0) {
        if (Array.isArray(cmode.exec_env_allowlist) && cmode.exec_env_allowlist.every((v) => typeof v === "string" && /^[A-Z_][A-Z0-9_]*$/i.test(v))) {
          validCmode.exec_env_allowlist = cmode.exec_env_allowlist;
        } else {
          errors.push("context_mode.exec_env_allowlist must be an array of valid env var names");
        }
      }
      if (Object.keys(validCmode).length > 0) {
        validated.context_mode = validCmode;
      }
    } else {
      errors.push("context_mode must be an object");
    }
  }
  if (preferences.copilot_catalog !== void 0) {
    if (typeof preferences.copilot_catalog === "object" && preferences.copilot_catalog !== null) {
      const catalog = preferences.copilot_catalog;
      const validCatalog = {};
      const validRefreshModes = /* @__PURE__ */ new Set(["off", "if_stale", "always"]);
      if (catalog.refresh_on_session_start !== void 0) {
        if (typeof catalog.refresh_on_session_start === "string" && validRefreshModes.has(catalog.refresh_on_session_start)) {
          validCatalog.refresh_on_session_start = catalog.refresh_on_session_start;
        } else {
          errors.push("copilot_catalog.refresh_on_session_start must be one of: off, if_stale, always");
        }
      }
      if (catalog.notify_on_changes !== void 0) {
        if (typeof catalog.notify_on_changes === "boolean") validCatalog.notify_on_changes = catalog.notify_on_changes;
        else errors.push("copilot_catalog.notify_on_changes must be a boolean");
      }
      if (catalog.stale_after_ms !== void 0) {
        const ms = catalog.stale_after_ms;
        if (typeof ms === "number" && ms >= 6e4 && ms <= 6048e5) validCatalog.stale_after_ms = Math.floor(ms);
        else errors.push("copilot_catalog.stale_after_ms must be a number between 60000 and 604800000");
      }
      for (const key of Object.keys(catalog)) {
        if (key !== "refresh_on_session_start" && key !== "notify_on_changes" && key !== "stale_after_ms") {
          warnings.push(`unknown copilot_catalog key "${key}" \u2014 ignored`);
        }
      }
      if (Object.keys(validCatalog).length > 0) {
        validated.copilot_catalog = validCatalog;
      }
    } else {
      errors.push("copilot_catalog must be an object");
    }
  }
  if (preferences.parallel && typeof preferences.parallel === "object") {
    const p = preferences.parallel;
    const parallel = {};
    if (p.enabled !== void 0) {
      if (typeof p.enabled === "boolean") parallel.enabled = p.enabled;
      else errors.push("parallel.enabled must be a boolean");
    }
    if (p.max_workers !== void 0) {
      if (typeof p.max_workers === "number" && p.max_workers >= 1 && p.max_workers <= 4) {
        parallel.max_workers = Math.floor(p.max_workers);
      } else {
        errors.push("parallel.max_workers must be a number between 1 and 4");
      }
    }
    if (p.budget_ceiling !== void 0) {
      if (typeof p.budget_ceiling === "number" && p.budget_ceiling > 0) {
        parallel.budget_ceiling = p.budget_ceiling;
      } else {
        errors.push("parallel.budget_ceiling must be a positive number");
      }
    }
    if (p.merge_strategy !== void 0) {
      const validStrategies = /* @__PURE__ */ new Set(["per-slice", "per-milestone"]);
      if (typeof p.merge_strategy === "string" && validStrategies.has(p.merge_strategy)) {
        parallel.merge_strategy = p.merge_strategy;
      } else {
        errors.push("parallel.merge_strategy must be one of: per-slice, per-milestone");
      }
    }
    if (p.auto_merge !== void 0) {
      const validModes = /* @__PURE__ */ new Set(["auto", "confirm", "manual"]);
      if (typeof p.auto_merge === "string" && validModes.has(p.auto_merge)) {
        parallel.auto_merge = p.auto_merge;
      } else {
        errors.push("parallel.auto_merge must be one of: auto, confirm, manual");
      }
    }
    if (p.worker_model !== void 0) {
      if (typeof p.worker_model === "string" && p.worker_model.length > 0) {
        parallel.worker_model = p.worker_model;
      } else {
        errors.push("parallel.worker_model must be a non-empty string");
      }
    }
    if (Object.keys(parallel).length > 0) {
      validated.parallel = parallel;
    }
  }
  if (preferences.slice_parallel !== void 0) {
    if (typeof preferences.slice_parallel === "object" && preferences.slice_parallel !== null) {
      const sp = preferences.slice_parallel;
      const validSp = {};
      if (sp.enabled !== void 0) {
        if (typeof sp.enabled === "boolean") validSp.enabled = sp.enabled;
        else errors.push("slice_parallel.enabled must be a boolean");
      }
      if (sp.max_workers !== void 0) {
        const maxWorkers = typeof sp.max_workers === "number" ? sp.max_workers : Number(sp.max_workers);
        if (Number.isFinite(maxWorkers) && maxWorkers >= 1 && maxWorkers <= 8) {
          validSp.max_workers = Math.floor(maxWorkers);
        } else {
          errors.push("slice_parallel.max_workers must be a number between 1 and 8");
        }
      }
      const knownSliceParallelKeys = /* @__PURE__ */ new Set(["enabled", "max_workers"]);
      for (const key of Object.keys(sp)) {
        if (!knownSliceParallelKeys.has(key)) {
          warnings.push(`unknown slice_parallel key "${key}" \u2014 ignored`);
        }
      }
      if (Object.keys(validSp).length > 0) {
        validated.slice_parallel = validSp;
      }
    } else {
      errors.push("slice_parallel must be an object");
    }
  }
  if (preferences.reactive_execution !== void 0) {
    if (typeof preferences.reactive_execution === "object" && preferences.reactive_execution !== null) {
      const re = preferences.reactive_execution;
      const validRe = {};
      if (re.enabled !== void 0) {
        if (typeof re.enabled === "boolean") validRe.enabled = re.enabled;
        else errors.push("reactive_execution.enabled must be a boolean");
      }
      if (re.max_parallel !== void 0) {
        const mp = typeof re.max_parallel === "number" ? re.max_parallel : Number(re.max_parallel);
        if (Number.isFinite(mp) && mp >= 1 && mp <= 8) {
          validRe.max_parallel = Math.floor(mp);
        } else {
          errors.push("reactive_execution.max_parallel must be a number between 1 and 8");
        }
      }
      if (re.isolation_mode !== void 0) {
        if (re.isolation_mode === "same-tree") {
          validRe.isolation_mode = "same-tree";
        } else {
          errors.push('reactive_execution.isolation_mode must be "same-tree"');
        }
      }
      const subagentModel = sanitizeModelField(
        re.subagent_model,
        "reactive_execution.subagent_model",
        errors,
        warnings
      );
      if (subagentModel !== void 0) {
        validRe.subagent_model = subagentModel;
      }
      const knownReKeys = /* @__PURE__ */ new Set(["enabled", "max_parallel", "isolation_mode", "subagent_model"]);
      for (const key of Object.keys(re)) {
        if (!knownReKeys.has(key)) {
          warnings.push(`unknown reactive_execution key "${key}" \u2014 ignored`);
        }
      }
      if (Object.keys(validRe).length > 0) {
        validated.reactive_execution = validRe;
      }
    } else {
      errors.push("reactive_execution must be an object");
    }
  }
  if (preferences.gate_evaluation !== void 0) {
    if (typeof preferences.gate_evaluation === "object" && preferences.gate_evaluation !== null) {
      const ge = preferences.gate_evaluation;
      const validGe = {};
      if (ge.enabled !== void 0) {
        if (typeof ge.enabled === "boolean") validGe.enabled = ge.enabled;
        else errors.push("gate_evaluation.enabled must be a boolean");
      }
      if (ge.slice_gates !== void 0) {
        if (Array.isArray(ge.slice_gates) && ge.slice_gates.every((g) => typeof g === "string")) {
          const invalid = ge.slice_gates.filter((g) => !VALID_GATE_EVALUATE_SLICE_GATES.has(g));
          if (invalid.length === 0) {
            validGe.slice_gates = ge.slice_gates;
          } else {
            errors.push(
              `gate_evaluation.slice_gates must contain only gate-evaluate slice gates: ${[...VALID_GATE_EVALUATE_SLICE_GATES].join(", ")}`
            );
          }
        } else {
          errors.push("gate_evaluation.slice_gates must be an array of strings");
        }
      }
      if (ge.task_gates !== void 0) {
        if (typeof ge.task_gates === "boolean") validGe.task_gates = ge.task_gates;
        else errors.push("gate_evaluation.task_gates must be a boolean");
      }
      const knownGeKeys = /* @__PURE__ */ new Set(["enabled", "slice_gates", "task_gates"]);
      for (const key of Object.keys(ge)) {
        if (!knownGeKeys.has(key)) {
          warnings.push(`unknown gate_evaluation key "${key}" \u2014 ignored`);
        }
      }
      if (Object.keys(validGe).length > 0) {
        validated.gate_evaluation = validGe;
      }
    } else {
      errors.push("gate_evaluation must be an object");
    }
  }
  if (preferences.verification_commands !== void 0) {
    if (Array.isArray(preferences.verification_commands)) {
      const allStrings = preferences.verification_commands.every(
        (item) => typeof item === "string"
      );
      if (allStrings) {
        validated.verification_commands = preferences.verification_commands;
      } else {
        errors.push("verification_commands must be an array of strings");
      }
    } else {
      errors.push("verification_commands must be an array of strings");
    }
  }
  if (preferences.verification_auto_fix !== void 0) {
    if (typeof preferences.verification_auto_fix === "boolean") {
      validated.verification_auto_fix = preferences.verification_auto_fix;
    } else {
      errors.push("verification_auto_fix must be a boolean");
    }
  }
  if (preferences.verification_max_retries !== void 0) {
    const raw = preferences.verification_max_retries;
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
      validated.verification_max_retries = Math.floor(raw);
    } else {
      errors.push("verification_max_retries must be a non-negative number");
    }
  }
  if (preferences.verification_timeout_ms !== void 0) {
    const raw = preferences.verification_timeout_ms;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      validated.verification_timeout_ms = Math.floor(raw);
    } else {
      errors.push("verification_timeout_ms must be a positive number");
    }
  }
  if (preferences.per_unit_cost_cap_usd !== void 0) {
    const raw = preferences.per_unit_cost_cap_usd;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      validated.per_unit_cost_cap_usd = raw;
    } else {
      errors.push("per_unit_cost_cap_usd must be a positive number");
    }
  }
  if (preferences.unit_cost_spike_multiplier !== void 0) {
    const raw = preferences.unit_cost_spike_multiplier;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      validated.unit_cost_spike_multiplier = raw;
    } else {
      errors.push("unit_cost_spike_multiplier must be a positive number");
    }
  }
  if (preferences.git && typeof preferences.git === "object") {
    const git = {};
    const g = preferences.git;
    if (g.auto_push !== void 0) {
      if (typeof g.auto_push === "boolean") git.auto_push = g.auto_push;
      else errors.push("git.auto_push must be a boolean");
    }
    if (g.push_branches !== void 0) {
      if (typeof g.push_branches === "boolean") git.push_branches = g.push_branches;
      else errors.push("git.push_branches must be a boolean");
    }
    if (g.remote !== void 0) {
      if (typeof g.remote === "string" && g.remote.trim() !== "") git.remote = g.remote.trim();
      else errors.push("git.remote must be a non-empty string");
    }
    if (g.snapshots !== void 0) {
      if (typeof g.snapshots === "boolean") git.snapshots = g.snapshots;
      else errors.push("git.snapshots must be a boolean");
    }
    if (g.pre_merge_check !== void 0) {
      if (typeof g.pre_merge_check === "boolean") {
        git.pre_merge_check = g.pre_merge_check;
      } else if (typeof g.pre_merge_check === "string" && g.pre_merge_check.trim() !== "") {
        git.pre_merge_check = g.pre_merge_check.trim();
      } else {
        errors.push("git.pre_merge_check must be a boolean or a non-empty string command");
      }
    }
    if (g.commit_type !== void 0) {
      const validCommitTypes = /* @__PURE__ */ new Set([
        "feat",
        "fix",
        "refactor",
        "docs",
        "test",
        "chore",
        "perf",
        "ci",
        "build",
        "style"
      ]);
      if (typeof g.commit_type === "string" && validCommitTypes.has(g.commit_type)) {
        git.commit_type = g.commit_type;
      } else {
        errors.push(`git.commit_type must be one of: feat, fix, refactor, docs, test, chore, perf, ci, build, style`);
      }
    }
    if (g.merge_strategy !== void 0) {
      const validStrategies = /* @__PURE__ */ new Set(["squash", "merge"]);
      if (typeof g.merge_strategy === "string" && validStrategies.has(g.merge_strategy)) {
        git.merge_strategy = g.merge_strategy;
      } else {
        errors.push("git.merge_strategy must be one of: squash, merge");
      }
    }
    if (g.main_branch !== void 0) {
      if (typeof g.main_branch === "string" && g.main_branch.trim() !== "" && VALID_BRANCH_NAME.test(g.main_branch)) {
        git.main_branch = g.main_branch;
      } else {
        errors.push("git.main_branch must be a valid branch name (alphanumeric, _, -, /, .)");
      }
    }
    if (g.isolation !== void 0) {
      const validIsolation = /* @__PURE__ */ new Set(["worktree", "branch", "none"]);
      if (typeof g.isolation === "string" && validIsolation.has(g.isolation)) {
        git.isolation = g.isolation;
      } else {
        errors.push("git.isolation must be one of: worktree, branch, none");
      }
    }
    if (g.commit_docs !== void 0) {
      warnings.push("git.commit_docs is deprecated \u2014 .gsd/ is managed externally and always gitignored. Remove this setting.");
    }
    if (g.manage_gitignore !== void 0) {
      if (typeof g.manage_gitignore === "boolean") git.manage_gitignore = g.manage_gitignore;
      else errors.push("git.manage_gitignore must be a boolean");
    }
    if (g.worktree_post_create !== void 0) {
      if (typeof g.worktree_post_create === "string" && g.worktree_post_create.trim()) {
        git.worktree_post_create = g.worktree_post_create.trim();
      } else {
        errors.push("git.worktree_post_create must be a non-empty string (path to script)");
      }
    }
    if (g.auto_pr !== void 0) {
      if (typeof g.auto_pr === "boolean") git.auto_pr = g.auto_pr;
      else errors.push("git.auto_pr must be a boolean");
    }
    if (g.pr_target_branch !== void 0) {
      if (typeof g.pr_target_branch === "string" && g.pr_target_branch.trim()) {
        git.pr_target_branch = g.pr_target_branch.trim();
      } else {
        errors.push("git.pr_target_branch must be a non-empty string (branch name)");
      }
    }
    if (g.merge_to_main !== void 0) {
      warnings.push("git.merge_to_main is deprecated \u2014 milestone-level merge is now always used. Remove this setting.");
    }
    if (g.collapse_cadence !== void 0) {
      const validCadence = /* @__PURE__ */ new Set(["milestone", "slice"]);
      if (typeof g.collapse_cadence === "string" && validCadence.has(g.collapse_cadence)) {
        git.collapse_cadence = g.collapse_cadence;
      } else {
        errors.push("git.collapse_cadence must be one of: milestone, slice");
      }
    }
    if (g.milestone_resquash !== void 0) {
      if (typeof g.milestone_resquash === "boolean") {
        git.milestone_resquash = g.milestone_resquash;
        const cadence = git.collapse_cadence ?? (typeof g.collapse_cadence === "string" ? g.collapse_cadence : void 0);
        if (cadence !== "slice") {
          warnings.push('git.milestone_resquash is ignored unless git.collapse_cadence is "slice"');
        }
      } else {
        errors.push("git.milestone_resquash must be a boolean");
      }
    }
    if (Object.keys(git).length > 0) {
      validated.git = git;
    }
  }
  if (preferences.auto_visualize !== void 0) {
    if (typeof preferences.auto_visualize === "boolean") {
      validated.auto_visualize = preferences.auto_visualize;
    } else {
      errors.push("auto_visualize must be a boolean");
    }
  }
  if (preferences.auto_report !== void 0) {
    if (typeof preferences.auto_report === "boolean") {
      validated.auto_report = preferences.auto_report;
    } else {
      errors.push("auto_report must be a boolean");
    }
  }
  if (preferences.context_selection !== void 0) {
    const validModes = /* @__PURE__ */ new Set(["full", "smart"]);
    if (typeof preferences.context_selection === "string" && validModes.has(preferences.context_selection)) {
      validated.context_selection = preferences.context_selection;
    } else {
      errors.push(`context_selection must be one of: full, smart`);
    }
  }
  if (preferences.github !== void 0) {
    if (typeof preferences.github === "object" && preferences.github !== null) {
      const gh = preferences.github;
      const validGh = {};
      if (gh.enabled !== void 0) {
        if (typeof gh.enabled === "boolean") validGh.enabled = gh.enabled;
        else errors.push("github.enabled must be a boolean");
      }
      if (gh.repo !== void 0) {
        if (typeof gh.repo === "string" && gh.repo.includes("/")) validGh.repo = gh.repo;
        else errors.push('github.repo must be a string in "owner/repo" format');
      }
      if (gh.project !== void 0) {
        const p = typeof gh.project === "number" ? gh.project : Number(gh.project);
        if (Number.isFinite(p) && p > 0) validGh.project = Math.floor(p);
        else errors.push("github.project must be a positive number");
      }
      if (gh.labels !== void 0) {
        if (Array.isArray(gh.labels) && gh.labels.every((l) => typeof l === "string")) {
          validGh.labels = gh.labels;
        } else {
          errors.push("github.labels must be an array of strings");
        }
      }
      if (gh.auto_link_commits !== void 0) {
        if (typeof gh.auto_link_commits === "boolean") validGh.auto_link_commits = gh.auto_link_commits;
        else errors.push("github.auto_link_commits must be a boolean");
      }
      if (gh.slice_prs !== void 0) {
        if (typeof gh.slice_prs === "boolean") validGh.slice_prs = gh.slice_prs;
        else errors.push("github.slice_prs must be a boolean");
      }
      const knownGhKeys = /* @__PURE__ */ new Set(["enabled", "repo", "project", "labels", "auto_link_commits", "slice_prs"]);
      for (const key of Object.keys(gh)) {
        if (!knownGhKeys.has(key)) {
          warnings.push(`unknown github key "${key}" \u2014 ignored`);
        }
      }
      if (Object.keys(validGh).length > 0) {
        validated.github = validGh;
      }
    } else {
      errors.push("github must be an object");
    }
  }
  if (preferences.show_token_cost !== void 0) {
    if (typeof preferences.show_token_cost === "boolean") {
      validated.show_token_cost = preferences.show_token_cost;
    } else {
      errors.push("show_token_cost must be a boolean");
    }
  }
  if (preferences.min_request_interval_ms !== void 0) {
    if (typeof preferences.min_request_interval_ms === "number" && Number.isFinite(preferences.min_request_interval_ms) && preferences.min_request_interval_ms >= 0 && preferences.min_request_interval_ms <= 2147483647) {
      validated.min_request_interval_ms = Math.floor(preferences.min_request_interval_ms);
    } else {
      errors.push("min_request_interval_ms must be a non-negative number <= 2147483647");
    }
  }
  if (preferences.experimental !== void 0) {
    if (typeof preferences.experimental === "object" && preferences.experimental !== null) {
      const exp = preferences.experimental;
      const validExp = {};
      if (exp.rtk !== void 0) {
        if (typeof exp.rtk === "boolean") validExp.rtk = exp.rtk;
        else errors.push("experimental.rtk must be a boolean");
      }
      const knownExpKeys = /* @__PURE__ */ new Set(["rtk"]);
      for (const key of Object.keys(exp)) {
        if (!knownExpKeys.has(key)) {
          warnings.push(`unknown experimental key "${key}" \u2014 ignored`);
        }
      }
      if (Object.keys(validExp).length > 0) {
        validated.experimental = validExp;
      }
    } else {
      errors.push("experimental must be an object");
    }
  }
  if (preferences.codebase !== void 0) {
    if (typeof preferences.codebase === "object" && preferences.codebase !== null) {
      const cb = preferences.codebase;
      const validCb = {};
      if (cb.exclude_patterns !== void 0) {
        if (Array.isArray(cb.exclude_patterns) && cb.exclude_patterns.every((p) => typeof p === "string")) {
          validCb.exclude_patterns = cb.exclude_patterns;
        } else {
          errors.push("codebase.exclude_patterns must be an array of strings");
        }
      }
      if (cb.max_files !== void 0) {
        const mf = typeof cb.max_files === "number" ? cb.max_files : Number(cb.max_files);
        if (Number.isFinite(mf) && mf >= 1) {
          validCb.max_files = Math.floor(mf);
        } else {
          errors.push("codebase.max_files must be a positive integer");
        }
      }
      if (cb.collapse_threshold !== void 0) {
        const ct = typeof cb.collapse_threshold === "number" ? cb.collapse_threshold : Number(cb.collapse_threshold);
        if (Number.isFinite(ct) && ct >= 1) {
          validCb.collapse_threshold = Math.floor(ct);
        } else {
          errors.push("codebase.collapse_threshold must be a positive integer");
        }
      }
      const knownCbKeys = /* @__PURE__ */ new Set(["exclude_patterns", "max_files", "collapse_threshold"]);
      for (const key of Object.keys(cb)) {
        if (!knownCbKeys.has(key)) {
          warnings.push(`unknown codebase key "${key}" \u2014 ignored`);
        }
      }
      if (Object.keys(validCb).length > 0) {
        validated.codebase = validCb;
      }
    } else {
      errors.push("codebase must be an object");
    }
  }
  if (preferences.claude_code_mcp !== void 0) {
    if (typeof preferences.claude_code_mcp === "object" && preferences.claude_code_mcp !== null) {
      const raw = preferences.claude_code_mcp;
      if (typeof raw.per_model !== "object" || raw.per_model === null || Array.isArray(raw.per_model)) {
        warnings.push("claude_code_mcp.per_model must be an object \u2014 ignoring claude_code_mcp");
      } else {
        const perModel = raw.per_model;
        const validPerModel = {};
        for (const [prefix, entry] of Object.entries(perModel)) {
          if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
            warnings.push(`claude_code_mcp.per_model["${prefix}"] must be an object \u2014 ignoring entry`);
            continue;
          }
          const e = entry;
          const validEntry = {};
          for (const field of ["allowed_servers", "blocked_servers"]) {
            if (e[field] !== void 0) {
              if (Array.isArray(e[field]) && e[field].every((s) => typeof s === "string")) {
                validEntry[field] = e[field];
              } else {
                warnings.push(`claude_code_mcp.per_model["${prefix}"].${field} must be an array of strings \u2014 ignoring field`);
              }
            }
          }
          validPerModel[prefix] = validEntry;
        }
        validated.claude_code_mcp = { per_model: validPerModel };
      }
    } else {
      warnings.push("claude_code_mcp must be an object \u2014 ignoring");
    }
  }
  if (preferences.workspace !== void 0) {
    if (typeof preferences.workspace === "object" && preferences.workspace !== null && !Array.isArray(preferences.workspace)) {
      const workspace = preferences.workspace;
      const validWorkspace = {};
      if (workspace.mode !== void 0) {
        if (workspace.mode === "project" || workspace.mode === "parent") {
          validWorkspace.mode = workspace.mode;
        } else {
          errors.push("workspace.mode must be one of: project, parent");
        }
      }
      if (workspace.repositories !== void 0) {
        if (typeof workspace.repositories === "object" && workspace.repositories !== null && !Array.isArray(workspace.repositories)) {
          const repos = workspace.repositories;
          const validRepos = {};
          const normalizedPaths = /* @__PURE__ */ new Map();
          for (const [repoId, repoValue] of Object.entries(repos)) {
            if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(repoId)) {
              errors.push(`workspace.repositories key "${repoId}" must match /^[A-Za-z0-9][A-Za-z0-9._-]*$/`);
              continue;
            }
            if (typeof repoValue !== "object" || repoValue === null || Array.isArray(repoValue)) {
              errors.push(`workspace.repositories.${repoId} must be an object`);
              continue;
            }
            const repo = repoValue;
            const validRepo = { path: "" };
            if (typeof repo.path === "string" && repo.path.trim().length > 0) {
              validRepo.path = repo.path.trim();
              if (isAbsolute8(validRepo.path)) {
                errors.push(`workspace.repositories.${repoId}.path must be a relative path`);
                continue;
              }
              const normalizedPathKey = validRepo.path.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/\/+$/, "").toLowerCase();
              const existingRepoId = normalizedPaths.get(normalizedPathKey);
              if (existingRepoId !== void 0) {
                errors.push(
                  `workspace.repositories.${repoId}.path duplicates workspace.repositories.${existingRepoId}.path: ${validRepo.path}`
                );
                continue;
              }
              normalizedPaths.set(normalizedPathKey, repoId);
            } else {
              errors.push(`workspace.repositories.${repoId}.path must be a non-empty string`);
              continue;
            }
            if (repo.role !== void 0) {
              if (typeof repo.role === "string" && repo.role.trim().length > 0) validRepo.role = repo.role.trim();
              else errors.push(`workspace.repositories.${repoId}.role must be a non-empty string`);
            }
            if (repo.verification !== void 0) {
              if (Array.isArray(repo.verification) && repo.verification.every((v) => typeof v === "string" && v.trim().length > 0)) {
                validRepo.verification = repo.verification.map((v) => v.trim());
              } else {
                errors.push(`workspace.repositories.${repoId}.verification must be an array of non-empty strings`);
              }
            }
            if (repo.commit_policy !== void 0) {
              if (repo.commit_policy === "auto" || repo.commit_policy === "skip") {
                validRepo.commit_policy = repo.commit_policy;
              } else {
                errors.push(`workspace.repositories.${repoId}.commit_policy must be one of: auto, skip`);
              }
            }
            const knownRepoKeys = /* @__PURE__ */ new Set(["path", "role", "verification", "commit_policy"]);
            for (const key of Object.keys(repo)) {
              if (!knownRepoKeys.has(key)) {
                warnings.push(`unknown workspace.repositories.${repoId} key "${key}" \u2014 ignored`);
              }
            }
            validRepos[repoId] = validRepo;
          }
          if (Object.keys(validRepos).length > 0) {
            validWorkspace.repositories = validRepos;
          }
        } else {
          errors.push("workspace.repositories must be an object mapping repo ids to config");
        }
      }
      const knownWorkspaceKeys = /* @__PURE__ */ new Set(["mode", "repositories"]);
      for (const key of Object.keys(workspace)) {
        if (!knownWorkspaceKeys.has(key)) {
          warnings.push(`unknown workspace key "${key}" \u2014 ignored`);
        }
      }
      if (Object.keys(validWorkspace).length > 0) {
        validated.workspace = validWorkspace;
      }
    } else {
      errors.push("workspace must be an object");
    }
    if (validated.workspace?.mode === "parent") {
      const childRepoCount = validated.workspace.repositories ? Object.keys(validated.workspace.repositories).length : 0;
      if (childRepoCount === 0) {
        errors.push('workspace.mode "parent" requires at least one repository under workspace.repositories');
      }
    }
  }
  if (preferences.enhanced_verification !== void 0) {
    if (typeof preferences.enhanced_verification === "boolean") {
      validated.enhanced_verification = preferences.enhanced_verification;
    } else {
      errors.push("enhanced_verification must be a boolean");
    }
  }
  if (preferences.enhanced_verification_pre !== void 0) {
    if (typeof preferences.enhanced_verification_pre === "boolean") {
      validated.enhanced_verification_pre = preferences.enhanced_verification_pre;
    } else {
      errors.push("enhanced_verification_pre must be a boolean");
    }
  }
  if (preferences.enhanced_verification_post !== void 0) {
    if (typeof preferences.enhanced_verification_post === "boolean") {
      validated.enhanced_verification_post = preferences.enhanced_verification_post;
    } else {
      errors.push("enhanced_verification_post must be a boolean");
    }
  }
  if (preferences.enhanced_verification_strict !== void 0) {
    if (typeof preferences.enhanced_verification_strict === "boolean") {
      validated.enhanced_verification_strict = preferences.enhanced_verification_strict;
    } else {
      errors.push("enhanced_verification_strict must be a boolean");
    }
  }
  if (preferences.discuss_preparation !== void 0) {
    if (typeof preferences.discuss_preparation === "boolean") {
      validated.discuss_preparation = preferences.discuss_preparation;
    } else {
      errors.push("discuss_preparation must be a boolean");
    }
  }
  if (preferences.discuss_web_research !== void 0) {
    if (typeof preferences.discuss_web_research === "boolean") {
      validated.discuss_web_research = preferences.discuss_web_research;
    } else {
      errors.push("discuss_web_research must be a boolean");
    }
  }
  if (preferences.discuss_depth !== void 0) {
    const validDepths = /* @__PURE__ */ new Set(["quick", "standard", "thorough"]);
    if (typeof preferences.discuss_depth === "string" && validDepths.has(preferences.discuss_depth)) {
      validated.discuss_depth = preferences.discuss_depth;
    } else {
      errors.push(`discuss_depth must be one of: quick, standard, thorough`);
    }
  }
  if (preferences.language !== void 0) {
    const trimmed = typeof preferences.language === "string" ? preferences.language.trim() : void 0;
    if (trimmed && trimmed.length <= 50 && !/[\r\n]/.test(trimmed)) {
      validated.language = trimmed;
    } else {
      errors.push(`language must be a non-empty string up to 50 characters with no newlines (e.g. "Chinese", "de", "\u65E5\u672C\u8A9E")`);
    }
  }
  warnings.push(...crossAxisPreferenceWarnings(validated));
  return { preferences: validated, errors, warnings };
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/preferences-skills.ts
init_pi_coding_agent();
import { existsSync as existsSync29, readdirSync as readdirSync12, statSync as statSync4 } from "node:fs";
import { homedir as homedir5 } from "node:os";
import { isAbsolute as isAbsolute9, join as join32 } from "node:path";
function getSkillSearchDirs(cwd) {
  return getSkillDirectories({ cwd, gsdHome: gsdHome() }).map((entry) => ({
    dir: entry.path,
    method: entry.scope === "project" ? "project-skill" : "user-skill"
  }));
}
function resolveSkillReference(ref, cwd) {
  const trimmed = ref.trim();
  const expanded = trimmed.startsWith("~/") ? join32(homedir5(), trimmed.slice(2)) : trimmed;
  if (isAbsolute9(expanded)) {
    if (existsSync29(expanded)) {
      try {
        const stat = statSync4(expanded);
        if (stat.isDirectory()) {
          const skillFile = join32(expanded, "SKILL.md");
          if (existsSync29(skillFile)) {
            return { original: ref, resolvedPath: skillFile, method: "absolute-dir" };
          }
          return { original: ref, resolvedPath: null, method: "unresolved" };
        }
      } catch {
      }
      return { original: ref, resolvedPath: expanded, method: "absolute-path" };
    }
    const withSkillMd = join32(expanded, "SKILL.md");
    if (existsSync29(withSkillMd)) {
      return { original: ref, resolvedPath: withSkillMd, method: "absolute-dir" };
    }
    return { original: ref, resolvedPath: null, method: "unresolved" };
  }
  for (const { dir, method } of getSkillSearchDirs(cwd)) {
    if (!existsSync29(dir)) continue;
    try {
      const entries = readdirSync12(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        if (entry.name === expanded) {
          const skillFile = join32(dir, entry.name, "SKILL.md");
          if (existsSync29(skillFile)) {
            return { original: ref, resolvedPath: skillFile, method };
          }
        }
      }
    } catch {
    }
  }
  return { original: ref, resolvedPath: null, method: "unresolved" };
}
function resolveAllSkillReferences(preferences, cwd) {
  const validated = validatePreferences(preferences).preferences;
  preferences = validated;
  const resolutions = /* @__PURE__ */ new Map();
  const warnings = [];
  function resolve17(ref) {
    const existing = resolutions.get(ref);
    if (existing) return existing;
    const result = resolveSkillReference(ref, cwd);
    resolutions.set(ref, result);
    if (result.method === "unresolved") {
      warnings.push(ref);
    }
    return result;
  }
  for (const skill of preferences.always_use_skills ?? []) resolve17(skill);
  for (const skill of preferences.prefer_skills ?? []) resolve17(skill);
  for (const skill of preferences.avoid_skills ?? []) resolve17(skill);
  for (const rule of preferences.skill_rules ?? []) {
    for (const skill of rule.use ?? []) resolve17(skill);
    for (const skill of rule.prefer ?? []) resolve17(skill);
    for (const skill of rule.avoid ?? []) resolve17(skill);
  }
  return { resolutions, warnings };
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/preferences-mcp.ts
function resolveModelMcpConfig(modelId, config) {
  let bestKey;
  const perModel = config.per_model ?? {};
  for (const key of Object.keys(perModel)) {
    if (modelId.startsWith(key)) {
      if (bestKey === void 0 || key.length > bestKey.length) {
        bestKey = key;
      }
    }
  }
  return bestKey !== void 0 ? perModel[bestKey] : void 0;
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/preferences.ts
function resolveSkillDiscoveryMode(basePath) {
  const prefs = loadEffectiveGSDPreferences(basePath);
  return prefs?.preferences.skill_discovery ?? "suggest";
}
function resolveSkillStalenessDays(basePath) {
  const prefs = loadEffectiveGSDPreferences(basePath);
  return prefs?.preferences.skill_staleness_days ?? 60;
}
function globalPreferencesPath() {
  return join33(gsdHome(), "PREFERENCES.md");
}
function legacyGlobalPreferencesPath() {
  return join33(homedir6(), ".pi", "agent", "gsd-preferences.md");
}
function projectPreferencesPath(basePath = process.cwd()) {
  return join33(gsdRoot(basePath), "PREFERENCES.md");
}
function legacyGlobalPreferencesPathLowercase() {
  return join33(gsdHome(), "preferences.md");
}
function legacyProjectPreferencesPathLowercase(basePath = process.cwd()) {
  return join33(gsdRoot(basePath), "preferences.md");
}
function getGlobalGSDPreferencesPath() {
  return globalPreferencesPath();
}
function getLegacyGlobalGSDPreferencesPath() {
  return legacyGlobalPreferencesPath();
}
function getProjectGSDPreferencesPath(basePath) {
  return projectPreferencesPath(basePath);
}
function availableModelIdsFromRegistry(registry) {
  return registry.getAvailable().map((m) => `${m.provider}/${m.id}`);
}
function restrictModelIdsToProvider(modelIds, provider) {
  const normalized = provider.trim().toLowerCase();
  if (!normalized) return modelIds;
  return modelIds.filter((id) => {
    const slash = id.indexOf("/");
    if (slash <= 0) return false;
    return id.slice(0, slash).toLowerCase() === normalized;
  });
}
function modelIdsForProfileResolution(registry, anchorProvider, disabledProviders) {
  let all = availableModelIdsFromRegistry(registry);
  if (disabledProviders?.length) {
    const blocked = new Set(
      disabledProviders.map((p) => p.trim().toLowerCase()).filter((p) => p.length > 0)
    );
    all = all.filter((id) => {
      const slash = id.indexOf("/");
      if (slash <= 0) return true;
      return !blocked.has(id.slice(0, slash).toLowerCase());
    });
  }
  if (all.length === 0) return void 0;
  if (!anchorProvider?.trim()) return all;
  return restrictModelIdsToProvider(all, anchorProvider);
}
function resolveProfileAnchorProvider(sessionProvider, autoModeStartProvider) {
  const start = autoModeStartProvider?.trim();
  if (start) return start;
  const session = sessionProvider?.trim();
  return session || void 0;
}
function loadEffectiveGSDPreferencesWithRegistry(registry, basePath, anchorProvider, preferredModelId) {
  const preferenceOpts = preferredModelId !== void 0 ? { preferredModelId } : void 0;
  if (!registry) {
    return loadEffectiveGSDPreferences(basePath, preferenceOpts);
  }
  const disabledProviders = resolveDisabledModelProvidersFromPreferences();
  const availableModelIds = modelIdsForProfileResolution(registry, anchorProvider, disabledProviders);
  if (!availableModelIds) {
    return loadEffectiveGSDPreferences(basePath, preferenceOpts);
  }
  return loadEffectiveGSDPreferences(basePath, { availableModelIds, preferredModelId });
}
function normalizePreferencesShape(loaded) {
  if (!loaded || typeof loaded !== "object") return {};
  const obj = loaded;
  const candidate = "preferences" in obj ? obj.preferences : obj;
  if (!candidate || typeof candidate !== "object") return {};
  return { ...candidate };
}
var EFFECTIVE_PREFERENCES_CACHE_MAX = 64;
var effectivePreferencesCache = /* @__PURE__ */ new Map();
function clearGSDPreferencesCache() {
  effectivePreferencesCache.clear();
}
function globalPreferencesCandidatePaths() {
  return [
    globalPreferencesPath(),
    legacyGlobalPreferencesPathLowercase(),
    legacyGlobalPreferencesPath()
  ];
}
function projectPreferencesCandidatePaths(basePath) {
  return [
    projectPreferencesPath(basePath),
    legacyProjectPreferencesPathLowercase(basePath)
  ];
}
function preferencesFileSignature(path2) {
  try {
    const stats = statSync5(path2);
    return `${path2}:${stats.size}:${stats.mtimeMs}`;
  } catch (err) {
    const code = err.code ?? "unknown";
    return `${path2}:missing:${code}`;
  }
}
function effectivePreferencesCacheKey(basePath, opts) {
  return JSON.stringify({
    basePath: basePath ?? null,
    global: globalPreferencesCandidatePaths().map(preferencesFileSignature),
    project: projectPreferencesCandidatePaths(basePath).map(preferencesFileSignature),
    availableModelIds: opts?.availableModelIds ?? null,
    preferredModelId: opts?.preferredModelId ?? null,
    skipProfileDefaults: opts?.skipProfileDefaults === true
  });
}
function cloneLoadedPreferences(loaded) {
  return loaded ? structuredClone(loaded) : null;
}
function cacheEffectivePreferences(key, loaded) {
  if (!effectivePreferencesCache.has(key) && effectivePreferencesCache.size >= EFFECTIVE_PREFERENCES_CACHE_MAX) {
    effectivePreferencesCache.clear();
  }
  effectivePreferencesCache.set(key, cloneLoadedPreferences(loaded));
}
function loadGlobalGSDPreferences() {
  return loadFirstUsablePreferencesFile(globalPreferencesCandidatePaths(), "global");
}
function loadProjectGSDPreferences(basePath) {
  return loadFirstUsablePreferencesFile(projectPreferencesCandidatePaths(basePath), "project");
}
function _loadProjectPreferencesCandidatesForTest(paths) {
  return loadFirstUsablePreferencesFile(paths, "project");
}
function loadEffectiveGSDPreferences(basePath, opts) {
  const cacheKey = effectivePreferencesCacheKey(basePath, opts);
  if (effectivePreferencesCache.has(cacheKey)) {
    return cloneLoadedPreferences(effectivePreferencesCache.get(cacheKey));
  }
  const globalPreferences = loadGlobalGSDPreferences();
  const projectPreferences = loadProjectGSDPreferences(basePath);
  const effectiveGlobalPreferences = globalPreferences?.ignored ? null : globalPreferences;
  const effectiveProjectPreferences = projectPreferences?.ignored ? null : projectPreferences;
  const projectHasPlanningDepth = effectiveProjectPreferences?.preferences.planning_depth !== void 0;
  const projectHasRuntimeContract = effectiveProjectPreferences?.preferences.runtime?.contract !== void 0;
  if (!effectiveGlobalPreferences && !effectiveProjectPreferences) {
    if (projectPreferences?.projectRuntimeContract === "invalid") {
      const result2 = { ...projectPreferences, preferences: {} };
      cacheEffectivePreferences(cacheKey, result2);
      return result2;
    }
    cacheEffectivePreferences(cacheKey, null);
    return null;
  }
  let result;
  if (!effectiveGlobalPreferences) {
    result = effectiveProjectPreferences;
  } else if (!effectiveProjectPreferences) {
    result = mergePreferenceMetadata(effectiveGlobalPreferences, projectPreferences);
  } else {
    const metadata = mergePreferenceMetadata(effectiveGlobalPreferences, effectiveProjectPreferences);
    result = {
      path: effectiveProjectPreferences.path,
      scope: "project",
      preferences: mergePreferences(effectiveGlobalPreferences.preferences, effectiveProjectPreferences.preferences),
      ...metadata.projectRuntimeContract ? { projectRuntimeContract: metadata.projectRuntimeContract } : {},
      ...metadata.warnings ? { warnings: metadata.warnings } : {},
      ...metadata.diagnostics ? { diagnostics: metadata.diagnostics } : {}
    };
  }
  const explicitProfile = result.preferences.token_profile;
  let profileForDefaults;
  if (explicitProfile) {
    if (VALID_TOKEN_PROFILES.has(explicitProfile)) {
      profileForDefaults = explicitProfile;
    }
  } else {
    profileForDefaults = DEFAULT_TOKEN_PROFILE;
  }
  if (profileForDefaults && !opts?.skipProfileDefaults) {
    const profileDefaults = resolveProfileDefaults(
      profileForDefaults,
      opts?.availableModelIds,
      result.preferences.dynamic_routing,
      opts?.preferredModelId
    );
    const defaultsToApply = explicitProfile ? profileDefaults : withoutProfilePhaseDefaults(profileDefaults);
    result = {
      ...result,
      preferences: mergePreferences(defaultsToApply, result.preferences)
    };
  }
  if (result.preferences.mode) {
    result = {
      ...result,
      preferences: applyModeDefaults(result.preferences.mode, result.preferences)
    };
  }
  result = stripInheritedPlanningDepth(result, projectHasPlanningDepth);
  result = stripInheritedRuntimeContract(result, projectHasRuntimeContract);
  result = appendCrossAxisPreferenceWarnings(result);
  cacheEffectivePreferences(cacheKey, result);
  return result;
}
function appendCrossAxisPreferenceWarnings(loaded) {
  const crossWarnings = crossAxisPreferenceWarnings(loaded.preferences);
  const existingMessages = /* @__PURE__ */ new Set([
    ...loaded.warnings ?? [],
    ...(loaded.diagnostics ?? []).map((diagnostic) => diagnostic.message)
  ]);
  const newWarnings = crossWarnings.filter((message) => !existingMessages.has(message));
  if (newWarnings.length === 0) return loaded;
  return {
    ...loaded,
    warnings: [...loaded.warnings ?? [], ...newWarnings],
    diagnostics: [
      ...loaded.diagnostics ?? [],
      ...newWarnings.map((message) => ({
        path: loaded.path,
        scope: loaded.scope,
        severity: "warning",
        kind: "validation",
        message,
        sanitized: true
      }))
    ]
  };
}
function withoutProfilePhaseDefaults(defaults) {
  if (defaults.phases === void 0) return defaults;
  const { phases: _phases, ...rest } = defaults;
  return rest;
}
function mergePreferenceMetadata(primary, secondary) {
  const mergedWarnings = [
    ...primary.warnings ?? [],
    ...secondary?.warnings ?? []
  ];
  const mergedDiagnostics = [
    ...primary.diagnostics ?? [],
    ...secondary?.diagnostics ?? []
  ];
  const projectRuntimeContract = secondary?.projectRuntimeContract === "invalid" ? "invalid" : primary.projectRuntimeContract ?? secondary?.projectRuntimeContract;
  return {
    ...primary,
    ...projectRuntimeContract ? { projectRuntimeContract } : {},
    ...mergedWarnings.length > 0 ? { warnings: mergedWarnings } : {},
    ...mergedDiagnostics.length > 0 ? { diagnostics: mergedDiagnostics } : {}
  };
}
function loadFirstUsablePreferencesFile(paths, scope) {
  let ignoredPreferences = null;
  for (const path2 of paths) {
    const loaded = loadPreferencesFile(path2, scope);
    if (!loaded) continue;
    if (!loaded.ignored) return mergePreferenceMetadata(loaded, ignoredPreferences);
    ignoredPreferences = ignoredPreferences ? mergePreferenceMetadata(ignoredPreferences, loaded) : loaded;
  }
  return ignoredPreferences;
}
function stripInheritedPlanningDepth(loaded, projectHasPlanningDepth) {
  if (projectHasPlanningDepth || loaded.preferences.planning_depth === void 0) {
    return loaded;
  }
  const preferences = { ...loaded.preferences };
  delete preferences.planning_depth;
  return { ...loaded, preferences };
}
function stripInheritedRuntimeContract(loaded, projectHasRuntimeContract) {
  if (projectHasRuntimeContract || loaded.preferences.runtime?.contract === void 0) {
    return loaded;
  }
  const preferences = { ...loaded.preferences };
  delete preferences.runtime;
  return { ...loaded, preferences };
}
function loadPreferencesFile(path2, scope) {
  if (!existsSync30(path2)) return null;
  const raw = readFileSync25(path2, "utf-8");
  const parsed = parsePreferencesMarkdownWithDiagnostics(raw);
  if (!parsed.preferences && parsed.diagnostics.length === 0) return null;
  const ignored = parsed.diagnostics.some((diagnostic) => diagnostic.ignored === true);
  const preferences = parsed.preferences ?? {};
  const validation = validatePreferences(preferences);
  const rawRuntime = preferences.runtime;
  const hasParsedRuntimeContract = hasRuntimeContractProperty(rawRuntime);
  const hasConfiguredRuntimeContract = scope === "project" && (hasParsedRuntimeContract || parsed.runtimeContractParseFailed || ignored && containsRuntimeContractSetting(raw));
  let projectRuntimeContract;
  if (hasConfiguredRuntimeContract) {
    projectRuntimeContract = validation.preferences.runtime?.contract ? "valid" : "invalid";
  }
  const allWarnings = [...validation.warnings, ...validation.errors];
  const diagnostics = [
    ...parsed.diagnostics.map((diagnostic) => ({ ...diagnostic, path: path2, scope })),
    ...validation.errors.map((message) => ({
      path: path2,
      scope,
      severity: "error",
      kind: "validation",
      message,
      sanitized: true
    })),
    ...validation.warnings.map((message) => ({
      path: path2,
      scope,
      severity: "warning",
      kind: "validation",
      message,
      sanitized: true
    }))
  ];
  return {
    path: path2,
    scope,
    preferences: validation.preferences,
    ...projectRuntimeContract ? { projectRuntimeContract } : {},
    ...ignored ? { ignored: true } : {},
    ...allWarnings.length > 0 ? { warnings: allWarnings } : {},
    ...diagnostics.length > 0 ? { diagnostics } : {}
  };
}
function containsRuntimeContractSetting(content) {
  let start = 0;
  if (content.startsWith("---\r\n")) {
    start = 5;
  } else if (content.startsWith("---\n")) {
    start = 4;
  } else {
    return false;
  }
  const end = content.indexOf("\n---", start);
  const frontmatter = content.slice(start, end === -1 ? void 0 : end);
  return (0, import_yaml3.parseDocument)(frontmatter).hasIn(["runtime", "contract"]);
}
function hasRuntimeContractProperty(runtime) {
  if (Array.isArray(runtime)) return runtime.some(hasRuntimeContractProperty);
  return typeof runtime === "object" && runtime !== null && Object.hasOwn(runtime, "contract");
}
function arrayRootHasRuntimeContract(preferences) {
  return preferences.some((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
    return hasRuntimeContractProperty(item.runtime);
  });
}
var _warnedUnrecognizedFormat = false;
var _warnedSectionParse = false;
function _resetParseWarningFlag() {
  _warnedUnrecognizedFormat = false;
  _warnedFrontmatterParse = false;
  _warnedSectionParse = false;
}
function parsePreferencesMarkdown(content) {
  return parsePreferencesMarkdownWithDiagnostics(content).preferences;
}
function parsePreferencesMarkdownWithDiagnostics(content) {
  const startMarker = content.startsWith("---\r\n") ? "---\r\n" : "---\n";
  if (content.startsWith(startMarker)) {
    const searchStart = startMarker.length;
    const endIdx = content.indexOf("\n---", searchStart);
    if (endIdx === -1) {
      return {
        preferences: null,
        diagnostics: [{
          severity: "error",
          kind: "parse",
          message: "preferences frontmatter is missing a closing --- delimiter",
          ignored: true
        }]
      };
    }
    const block = content.slice(searchStart, endIdx);
    return parseFrontmatterBlockWithDiagnostics(block.replace(/\r/g, ""), 1);
  }
  if (/^##\s+\w/m.test(content)) {
    return parseHeadingListFormat(content);
  }
  if (content.trim().length > 0 && !_warnedUnrecognizedFormat) {
    _warnedUnrecognizedFormat = true;
    console.warn(
      "[GSD] Warning: preferences file has unrecognized format \u2014 content does not use YAML frontmatter delimiters (---). Wrap your preferences in --- fences. See https://github.com/open-gsd/gsd-pi/issues/2036"
    );
  }
  return {
    preferences: null,
    diagnostics: content.trim().length > 0 ? [{
      severity: "error",
      kind: "parse",
      message: "preferences file has unrecognized format; expected YAML frontmatter delimiters (---) or markdown preference sections",
      ignored: true
    }] : []
  };
}
var _warnedFrontmatterParse = false;
function parseFrontmatterBlockWithDiagnostics(frontmatter, lineOffset) {
  try {
    const parsed = (0, import_yaml3.parse)(frontmatter);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        preferences: {},
        diagnostics: [{
          severity: "error",
          kind: "validation",
          message: "preferences frontmatter must be a YAML object",
          ignored: true
        }],
        ...Array.isArray(parsed) && arrayRootHasRuntimeContract(parsed) ? { runtimeContractParseFailed: true } : {}
      };
    }
    return {
      preferences: normalizeParsedPreferences(parsed),
      diagnostics: []
    };
  } catch (e) {
    if (!_warnedFrontmatterParse) {
      _warnedFrontmatterParse = true;
      logWarning("guided", `YAML parse error in preferences frontmatter (suppressing further): ${e.message}`);
    }
    const location = extractYamlErrorLocation(e, lineOffset);
    return {
      preferences: {},
      diagnostics: [{
        severity: "error",
        kind: "parse",
        message: cleanYamlErrorMessage(e),
        ...location.line !== void 0 ? { line: location.line } : {},
        ...location.column !== void 0 ? { column: location.column } : {},
        ignored: true
      }]
    };
  }
}
function cleanYamlErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split("\n")[0]?.trim() ?? "unknown YAML parse error";
  return firstLine.replace(/\s+at line \d+, column \d+:?$/, "");
}
function extractYamlErrorLocation(error, lineOffset) {
  const linePos = error?.linePos;
  const first = Array.isArray(linePos) ? linePos[0] : void 0;
  const line = typeof first?.line === "number" ? first.line + lineOffset : void 0;
  const column = typeof first?.col === "number" ? first.col : void 0;
  return {
    ...line !== void 0 ? { line } : {},
    ...column !== void 0 ? { column } : {}
  };
}
function normalizeParsedPreferences(preferences) {
  const remoteQuestions = preferences.remote_questions;
  if (remoteQuestions && typeof remoteQuestions === "object" && typeof remoteQuestions.channel_id === "number") {
    const rawChannelId = remoteQuestions.channel_id;
    const normalizedChannelId = Number.isSafeInteger(rawChannelId) ? String(rawChannelId) : rawChannelId;
    return {
      ...preferences,
      remote_questions: {
        ...remoteQuestions,
        channel_id: normalizedChannelId
      }
    };
  }
  return preferences;
}
function brokenSectionReferencesRuntimeContract(section, yamlBlock) {
  const doc = (0, import_yaml3.parseDocument)(yamlBlock);
  if (section === "runtime" && doc.hasIn(["contract"])) return true;
  return doc.hasIn(["runtime", "contract"]);
}
function parseHeadingListFormat(content) {
  const result = {};
  const diagnostics = [];
  let runtimeContractParseFailed = false;
  let currentSection = null;
  for (const rawLine of content.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      currentSection = headingMatch[1].trim().toLowerCase().replace(/\s+/g, "_");
      if (!result[currentSection]) result[currentSection] = [];
      continue;
    }
    if (currentSection && line.trim() && !line.trimStart().startsWith("#")) {
      result[currentSection].push(line);
    }
  }
  const typed = {};
  for (const [section, lines] of Object.entries(result)) {
    if (lines.length === 0) continue;
    const usesLegacyListItems = lines.every((line) => /^\s*-\s+[^:]+:\s*.*$/.test(line));
    const yamlBlock = usesLegacyListItems ? lines.map((line) => line.replace(/^\s*-\s+/, "")).join("\n") : lines.join("\n");
    try {
      const parsed = (0, import_yaml3.parse)(yamlBlock);
      if (typeof parsed !== "object" || parsed === null) continue;
      let targetSection = section;
      let value = parsed;
      if (!Array.isArray(parsed)) {
        const keys = Object.keys(parsed);
        if (keys.length === 1) {
          const [onlyKey] = keys;
          if (onlyKey === section || !KNOWN_PREFERENCE_KEYS.has(section) && KNOWN_PREFERENCE_KEYS.has(onlyKey)) {
            targetSection = onlyKey;
            value = parsed[onlyKey];
          }
        }
      }
      typed[targetSection] = value;
    } catch (e) {
      if (brokenSectionReferencesRuntimeContract(section, yamlBlock)) {
        runtimeContractParseFailed = true;
        diagnostics.push({
          severity: "error",
          kind: "parse",
          message: "preferences runtime contract section could not be parsed",
          sanitized: true
        });
      }
      if (!_warnedSectionParse) {
        _warnedSectionParse = true;
        logWarning("guided", `preferences section parse failed: ${e.message}`);
      }
    }
  }
  return {
    preferences: normalizeParsedPreferences(typed),
    diagnostics,
    ...runtimeContractParseFailed ? { runtimeContractParseFailed: true } : {}
  };
}
function applyModeDefaults(mode, prefs) {
  const defaults = MODE_DEFAULTS[mode];
  if (!defaults) return prefs;
  return mergePreferences(defaults, prefs);
}
function mergePreferences(base, override) {
  return {
    // Preserve validated preference keys that do not need custom merge logic.
    // The explicit fields below still own defaults, arrays, and deep merges.
    ...base,
    ...override,
    version: override.version ?? base.version,
    mode: override.mode ?? base.mode,
    always_use_skills: mergeStringLists(base.always_use_skills, override.always_use_skills),
    prefer_skills: mergeStringLists(base.prefer_skills, override.prefer_skills),
    avoid_skills: mergeStringLists(base.avoid_skills, override.avoid_skills),
    skill_rules: [...base.skill_rules ?? [], ...override.skill_rules ?? []],
    custom_instructions: mergeStringLists(base.custom_instructions, override.custom_instructions),
    models: { ...base.models ?? {}, ...override.models ?? {} },
    thinking: base.thinking || override.thinking ? { ...base.thinking ?? {}, ...override.thinking ?? {} } : void 0,
    skill_discovery: override.skill_discovery ?? base.skill_discovery,
    skill_staleness_days: override.skill_staleness_days ?? base.skill_staleness_days,
    auto_supervisor: { ...base.auto_supervisor ?? {}, ...override.auto_supervisor ?? {} },
    uat_dispatch: override.uat_dispatch ?? base.uat_dispatch,
    unique_milestone_ids: override.unique_milestone_ids ?? base.unique_milestone_ids,
    budget_ceiling: override.budget_ceiling ?? base.budget_ceiling,
    budget_enforcement: override.budget_enforcement ?? base.budget_enforcement,
    context_pause_threshold: override.context_pause_threshold ?? base.context_pause_threshold,
    notifications: base.notifications || override.notifications ? { ...base.notifications ?? {}, ...override.notifications ?? {} } : void 0,
    cmux: base.cmux || override.cmux ? { ...base.cmux ?? {}, ...override.cmux ?? {} } : void 0,
    remote_questions: override.remote_questions ? { ...base.remote_questions ?? {}, ...override.remote_questions } : base.remote_questions,
    git: base.git || override.git ? { ...base.git ?? {}, ...override.git ?? {} } : void 0,
    post_unit_hooks: mergePostUnitHooks(base.post_unit_hooks, override.post_unit_hooks),
    pre_dispatch_hooks: mergePreDispatchHooks(base.pre_dispatch_hooks, override.pre_dispatch_hooks),
    planning_subagent_registry: mergePlanningSubagentRegistry(
      base.planning_subagent_registry,
      override.planning_subagent_registry
    ),
    planning_subagents: mergePlanningSubagents(base.planning_subagents, override.planning_subagents),
    dynamic_routing: base.dynamic_routing || override.dynamic_routing ? { ...base.dynamic_routing ?? {}, ...override.dynamic_routing ?? {} } : void 0,
    disabled_model_providers: mergeStringLists(
      base.disabled_model_providers,
      override.disabled_model_providers
    ),
    uok: base.uok || override.uok ? {
      enabled: override.uok?.enabled ?? base.uok?.enabled,
      legacy_fallback: base.uok?.legacy_fallback || override.uok?.legacy_fallback ? { ...base.uok?.legacy_fallback ?? {}, ...override.uok?.legacy_fallback ?? {} } : void 0,
      gates: base.uok?.gates || override.uok?.gates ? { ...base.uok?.gates ?? {}, ...override.uok?.gates ?? {} } : void 0,
      model_policy: base.uok?.model_policy || override.uok?.model_policy ? { ...base.uok?.model_policy ?? {}, ...override.uok?.model_policy ?? {} } : void 0,
      execution_graph: base.uok?.execution_graph || override.uok?.execution_graph ? { ...base.uok?.execution_graph ?? {}, ...override.uok?.execution_graph ?? {} } : void 0,
      gitops: base.uok?.gitops || override.uok?.gitops ? { ...base.uok?.gitops ?? {}, ...override.uok?.gitops ?? {} } : void 0,
      audit_unified: base.uok?.audit_unified || override.uok?.audit_unified ? { ...base.uok?.audit_unified ?? {}, ...override.uok?.audit_unified ?? {} } : void 0,
      plan_v2: base.uok?.plan_v2 || override.uok?.plan_v2 ? { ...base.uok?.plan_v2 ?? {}, ...override.uok?.plan_v2 ?? {} } : void 0
    } : void 0,
    token_profile: override.token_profile ?? base.token_profile,
    phases: base.phases || override.phases ? { ...base.phases ?? {}, ...override.phases ?? {} } : void 0,
    parallel: base.parallel || override.parallel ? { ...base.parallel ?? {}, ...override.parallel ?? {} } : void 0,
    verification_commands: mergeStringLists(base.verification_commands, override.verification_commands),
    verification_auto_fix: override.verification_auto_fix ?? base.verification_auto_fix,
    verification_max_retries: override.verification_max_retries ?? base.verification_max_retries,
    verification_timeout_ms: override.verification_timeout_ms ?? base.verification_timeout_ms,
    enhanced_verification: override.enhanced_verification ?? base.enhanced_verification,
    enhanced_verification_pre: override.enhanced_verification_pre ?? base.enhanced_verification_pre,
    enhanced_verification_post: override.enhanced_verification_post ?? base.enhanced_verification_post,
    enhanced_verification_strict: override.enhanced_verification_strict ?? base.enhanced_verification_strict,
    search_provider: override.search_provider ?? base.search_provider,
    context_selection: override.context_selection ?? base.context_selection,
    auto_visualize: override.auto_visualize ?? base.auto_visualize,
    auto_report: override.auto_report ?? base.auto_report,
    github: base.github || override.github ? { ...base.github ?? {}, ...override.github ?? {} } : void 0,
    experimental: base.experimental || override.experimental ? { ...base.experimental ?? {}, ...override.experimental ?? {} } : void 0,
    service_tier: override.service_tier ?? base.service_tier,
    forensics_dedup: override.forensics_dedup ?? base.forensics_dedup,
    show_token_cost: override.show_token_cost ?? base.show_token_cost,
    min_request_interval_ms: override.min_request_interval_ms ?? base.min_request_interval_ms,
    codebase: base.codebase || override.codebase ? {
      ...base.codebase ?? {},
      ...override.codebase ?? {},
      // Merge exclude_patterns arrays rather than overriding
      exclude_patterns: [
        ...base.codebase?.exclude_patterns ?? [],
        ...override.codebase?.exclude_patterns ?? []
      ].filter(Boolean)
    } : void 0,
    slice_parallel: base.slice_parallel || override.slice_parallel ? { ...base.slice_parallel ?? {}, ...override.slice_parallel ?? {} } : void 0,
    language: override.language ?? base.language,
    planning_depth: override.planning_depth ?? base.planning_depth,
    workspace: override.workspace ?? base.workspace
  };
}
function mergeStringLists(base, override) {
  const merged = [
    ...normalizeStringArray(base),
    ...normalizeStringArray(override)
  ].map((item) => item.trim()).filter(Boolean);
  return merged.length > 0 ? Array.from(new Set(merged)) : void 0;
}
function mergePostUnitHooks(base, override) {
  if (!base?.length && !override?.length) return void 0;
  const merged = [...base ?? []];
  for (const hook of override ?? []) {
    const idx = merged.findIndex((h) => h.name === hook.name);
    if (idx >= 0) {
      merged[idx] = hook;
    } else {
      merged.push(hook);
    }
  }
  return merged.length > 0 ? merged : void 0;
}
function mergePreDispatchHooks(base, override) {
  if (!base?.length && !override?.length) return void 0;
  const merged = [...base ?? []];
  for (const hook of override ?? []) {
    const idx = merged.findIndex((h) => h.name === hook.name);
    if (idx >= 0) {
      merged[idx] = hook;
    } else {
      merged.push(hook);
    }
  }
  return merged.length > 0 ? merged : void 0;
}
function mergePlanningSubagents(base, override) {
  if (!base && !override) return void 0;
  const merged = {};
  const unitTypes = /* @__PURE__ */ new Set([
    ...Object.keys(base ?? {}),
    ...Object.keys(override ?? {})
  ]);
  for (const unitType of unitTypes) {
    const allowed = mergeStringLists(
      base?.[unitType]?.allowed,
      override?.[unitType]?.allowed
    );
    if (allowed?.length) {
      merged[unitType] = { allowed };
    }
  }
  return Object.keys(merged).length > 0 ? merged : void 0;
}
function mergePlanningSubagentRegistry(base, override) {
  if (!base && !override) return void 0;
  const merged = { ...base ?? {}, ...override ?? {} };
  return Object.keys(merged).length > 0 ? merged : void 0;
}
function renderPreferencesForSystemPrompt(preferences, resolutions, options) {
  const validated = validatePreferences(preferences);
  const lines = ["## GSD Skill Preferences"];
  const includeResolvedPaths = options?.includeResolvedPaths ?? true;
  if (validated.errors.length > 0) {
    lines.push("- Validation: some preference values were ignored because they were invalid.");
  }
  for (const warning of validated.warnings) {
    lines.push(`- Deprecation: ${warning}`);
  }
  preferences = validated.preferences;
  lines.push(
    "- Treat these as explicit skill-selection policy for GSD work.",
    "- If a listed skill exists and is relevant, load and follow it instead of treating it as a vague suggestion.",
    "- Current user instructions still override these defaults."
  );
  const fmt = (ref) => {
    if (!resolutions) return ref;
    if (!includeResolvedPaths) {
      const resolution = resolutions.get(ref);
      if (!resolution || resolution.method === "unresolved") {
        return `${ref} (\u26A0 not found \u2014 check skill name or path)`;
      }
      return ref;
    }
    return formatSkillRef(ref, resolutions);
  };
  if (preferences.always_use_skills && preferences.always_use_skills.length > 0) {
    lines.push("- Always use these skills when relevant:");
    for (const skill of preferences.always_use_skills) {
      lines.push(`  - ${fmt(skill)}`);
    }
  }
  if (preferences.prefer_skills && preferences.prefer_skills.length > 0) {
    lines.push("- Prefer these skills when relevant:");
    for (const skill of preferences.prefer_skills) {
      lines.push(`  - ${fmt(skill)}`);
    }
  }
  if (preferences.avoid_skills && preferences.avoid_skills.length > 0) {
    lines.push("- Avoid these skills unless clearly needed:");
    for (const skill of preferences.avoid_skills) {
      lines.push(`  - ${fmt(skill)}`);
    }
  }
  if (preferences.skill_rules && preferences.skill_rules.length > 0) {
    lines.push("- Situational rules:");
    for (const rule of preferences.skill_rules) {
      lines.push(`  - When ${rule.when}:`);
      if (rule.use && rule.use.length > 0) {
        lines.push(`    - use: ${rule.use.map(fmt).join(", ")}`);
      }
      if (rule.prefer && rule.prefer.length > 0) {
        lines.push(`    - prefer: ${rule.prefer.map(fmt).join(", ")}`);
      }
      if (rule.avoid && rule.avoid.length > 0) {
        lines.push(`    - avoid: ${rule.avoid.map(fmt).join(", ")}`);
      }
    }
  }
  if (preferences.custom_instructions && preferences.custom_instructions.length > 0) {
    lines.push("- Additional instructions:");
    for (const instruction of preferences.custom_instructions) {
      lines.push(`  - ${instruction}`);
    }
  }
  if (preferences.language) {
    const safeLang = preferences.language.replace(/[\r\n]/g, " ").slice(0, 50);
    lines.push(`- Language: Always respond in ${safeLang}.`);
  }
  return lines.join("\n");
}
function renderLanguageDirectiveForPrompt(preferences) {
  if (!preferences?.language) return "";
  const safeLang = preferences.language.replace(/[\r\n]/g, " ").slice(0, 50);
  return `## Response Language

Always respond in ${safeLang} \u2014 questions, explanations, and summaries.`;
}
function resolvePostUnitHooks(basePath) {
  const prefs = loadEffectiveGSDPreferences(basePath);
  return (prefs?.preferences.post_unit_hooks ?? []).filter((h) => h.enabled !== false);
}
function resolvePreDispatchHooks(basePath) {
  const prefs = loadEffectiveGSDPreferences(basePath);
  return (prefs?.preferences.pre_dispatch_hooks ?? []).filter((h) => h.enabled !== false);
}
function getIsolationMode(basePath) {
  const prefs = loadEffectiveGSDPreferences(basePath)?.preferences?.git;
  if (prefs?.isolation === "worktree") {
    if (basePath && nativeIsRepo(basePath) && !nativeHasCommittedHead(basePath)) return "none";
    return "worktree";
  }
  if (prefs?.isolation === "branch") return "branch";
  return "none";
}
function resolveEffectiveUnitIsolationMode(configuredMode, isolationDegraded, strandedRecoveryIsolationMode = null) {
  if (configuredMode === "worktree" && isolationDegraded) return "branch";
  return strandedRecoveryIsolationMode ?? configuredMode;
}
function resolveParallelConfig(prefs) {
  return {
    enabled: prefs?.parallel?.enabled ?? false,
    max_workers: Math.max(1, Math.min(4, prefs?.parallel?.max_workers ?? 2)),
    budget_ceiling: prefs?.parallel?.budget_ceiling,
    merge_strategy: prefs?.parallel?.merge_strategy ?? "per-milestone",
    auto_merge: prefs?.parallel?.auto_merge ?? "confirm",
    worker_model: prefs?.parallel?.worker_model
  };
}
export {
  _loadProjectPreferencesCandidatesForTest,
  _resetParseWarningFlag,
  applyModeDefaults,
  availableModelIdsFromRegistry,
  clearGSDPreferencesCache,
  getGlobalGSDPreferencesPath,
  getIsolationMode,
  getLegacyGlobalGSDPreferencesPath,
  getNextFallbackModel,
  getProfileTierMap,
  getProjectGSDPreferencesPath,
  isTransientNetworkError,
  loadEffectiveGSDPreferences,
  loadEffectiveGSDPreferencesWithRegistry,
  loadGlobalGSDPreferences,
  loadProjectGSDPreferences,
  modelIdsForProfileResolution,
  normalizePreferencesShape,
  parsePreferencesMarkdown,
  phaseChainForUnit,
  renderLanguageDirectiveForPrompt,
  renderPreferencesForSystemPrompt,
  resolveAllSkillReferences,
  resolveAutoSupervisorConfig,
  resolveContextSelection,
  resolveDisabledModelProvidersFromPreferences,
  resolveDynamicRoutingConfig,
  resolveEffectiveProfile,
  resolveEffectiveUnitIsolationMode,
  resolveInlineLevel,
  resolveModelForUnit,
  resolveModelMcpConfig,
  resolveModelWithFallbacksForUnit,
  resolveParallelConfig,
  resolvePostUnitHooks,
  resolvePreDispatchHooks,
  resolveProfileAnchorProvider,
  resolveProfileDefaults,
  resolveSearchProviderFromPreferences,
  resolveSkillDiscoveryMode,
  resolveSkillStalenessDays,
  resolveThinkingLevelForUnit,
  restrictModelIdsToProvider,
  updatePreferencesModels,
  validateModelId,
  validatePreferences
};
