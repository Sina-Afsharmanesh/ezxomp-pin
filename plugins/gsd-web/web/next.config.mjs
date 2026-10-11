import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = dirname(fileURLToPath(import.meta.url))
// Plugin root (plugins/gsd-web), not the repo root: Next's output file tracing
// must anchor inside the plugin so the staged standalone tree is portable.
const pluginRoot = resolve(webRoot, '..')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: pluginRoot,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Native addons actually loaded by the ported code at runtime.
  // @gsd/* workspace packages were removed with the vendoring of the service
  // layer (W3); koffi is kept only if the vendored agent core still needs it.
  serverExternalPackages: ['node-pty', 'koffi'],
  // NodeNext-style .js extension imports in server/ must resolve to .ts source.
  // Turbopack doesn't support extensionAlias, so builds use --webpack flag.
  webpack: (config, { isServer }) => {
    // The optional native addon shim (vendor-gsd-core/gsd/git/native-optional.cjs)
    // intentionally requires a non-existent module so the runtime require throws
    // and callers fall back to pure-JS. Alias it to false so webpack emits a
    // runtime-throwing module instead of failing the build (same semantics as
    // the services-dist esbuild externalPlugin).
    config.resolve.alias = {
      ...config.resolve.alias,
      '@ezxomp/gsd-web-nonexistent-native-addon': false,
    };
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    // Webpack swallows `node:module` imports because it treats `module` as an
    // internal concept.  We need createRequire to survive into the server
    // bundle so node-pty (a native addon) can be loaded at runtime.
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        'node:module': 'commonjs node:module',
        'node:fs': 'commonjs node:fs',
        'node:os': 'commonjs node:os',
        'node:path': 'commonjs node:path',
        // Native addons loaded via runtime require() inside vendored modules.
        // serverExternalPackages handles the top-level import, but webpack
        // still tries to resolve bare specifiers inside traced files.
        'koffi': 'commonjs koffi',
      });
      config.externals.push(({ request }, callback) => {
        if (
          typeof request === 'string' &&
          (
            request.startsWith('node:') ||
            request.startsWith('@gsd/native/') ||
            request === 'koffi' ||
            request.startsWith('koffi/')
          )
        ) {
          return callback(null, `commonjs ${request}`);
        }
        callback();
      });
    }
    return config;
  },
}

export default nextConfig
