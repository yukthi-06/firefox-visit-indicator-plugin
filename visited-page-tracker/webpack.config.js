/**
 * webpack.config.js
 *
 * Webpack build configuration for the Visited Page Tracker extension.
 *
 * Produces the following output bundles in dist/:
 *   dist/
 *   ├── manifest.json         (copied)
 *   ├── background/
 *   │   └── background.js     (bundled)
 *   ├── content/
 *   │   ├── content.js        (bundled)
 *   │   └── styles.css        (extracted)
 *   ├── options/
 *   │   ├── options.html      (copied)
 *   │   ├── options.js        (bundled)
 *   │   └── options.css       (extracted)
 *   └── icons/                (copied)
 *
 * Design decisions:
 *   - Each entry point is a separate bundle to match extension conventions.
 *   - CSS is extracted via MiniCssExtractPlugin (not inlined) because
 *     content script CSS must be declared in manifest.json.
 *   - Source maps are generated in development mode for debugging.
 *   - Production mode applies terser minification.
 */

const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';

  return {
    mode: argv.mode || 'production',

    // -------------------------------------------------------------------------
    // Entry points — one bundle per script context
    // -------------------------------------------------------------------------
    entry: {
      'background/background': './background/background.ts',
      'content/content': './content/content.ts',
      'options/options': './options/options.ts',
    },

    // -------------------------------------------------------------------------
    // Output configuration
    // -------------------------------------------------------------------------
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },

    // -------------------------------------------------------------------------
    // Module resolution
    // -------------------------------------------------------------------------
    resolve: {
      extensions: ['.ts', '.js'],
    },

    // -------------------------------------------------------------------------
    // Loaders
    // -------------------------------------------------------------------------
    module: {
      rules: [
        // TypeScript → JavaScript
        {
          test: /\.ts$/,
          use: {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.json',
            },
          },
          exclude: /node_modules/,
        },

        // CSS → Extracted file (not inlined)
        // Content script CSS must be a separate file referenced in manifest.json
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader'],
        },
      ],
    },

    // -------------------------------------------------------------------------
    // Plugins
    // -------------------------------------------------------------------------
    plugins: [
      // Extract CSS files
      new MiniCssExtractPlugin({
        filename: '[name].css',
      }),

      // Copy static assets to dist/
      new CopyPlugin({
        patterns: [
          // Extension manifest
          { from: 'manifest.json', to: 'manifest.json' },

          // Options page HTML (JS/CSS are bundled separately)
          { from: 'options/options.html', to: 'options/options.html' },

          // Content script CSS (also bundled above, but we need it as a separate file)
          { from: 'content/styles.css', to: 'content/styles.css' },

          // Icons directory
          {
            from: 'icons',
            to: 'icons',
            noErrorOnMissing: true, // Don't fail if icons/ doesn't exist yet
          },
        ],
      }),
    ],

    // -------------------------------------------------------------------------
    // Source maps
    // -------------------------------------------------------------------------
    devtool: isDev ? 'inline-source-map' : false,

    // -------------------------------------------------------------------------
    // Optimization
    // -------------------------------------------------------------------------
    optimization: {
      minimize: !isDev,
      // Do NOT split chunks — each entry must be a single self-contained file
      // for Firefox to load it correctly as a content script or background script
      splitChunks: false,
      runtimeChunk: false,
    },

    // -------------------------------------------------------------------------
    // Stats output
    // -------------------------------------------------------------------------
    stats: {
      assets: true,
      modules: false,
      entrypoints: false,
    },
  };
};
