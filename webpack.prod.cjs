const { merge } = require("webpack-merge");

const common = require("./webpack.common.cjs");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const InlineChunkHtmlPlugin = require("./inline-chunk-html-plugin.cjs");
const BundleAnalyzerPlugin =
  require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
const path = require("path");
const TerserJSPlugin = require("terser-webpack-plugin");
const HtmlMinimizerPlugin = require("html-minimizer-webpack-plugin");

module.exports = merge(common, {
  mode: "production",
  optimization: {
    usedExports: true,
    minimizer: [
      new TerserJSPlugin({
        terserOptions: { compress: true, mangle: { properties: true } },
      }),
      new HtmlMinimizerPlugin({minimizerOptions: { minifyJS: false}})
    ],
    minimize: true,
  },
  output: {
    path: path.join(process.cwd(), "dist"),
  },
  plugins: [
    new HtmlWebpackPlugin({ template: "src/index.html", inject: "body", filename: "index_preroll.html"}),
    new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [".js"]),
    new BundleAnalyzerPlugin({ openAnalyzer: false, analyzerMode: "static" }),
  ],
});
