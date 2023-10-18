const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const WebpackShellPlugin = require('webpack-shell-plugin');

module.exports = {
    entry: "./src/index.ts",
    output: {
        path: path.resolve(__dirname, "wwwroot"),
        filename: "[name].[chunkhash].js",
        publicPath: "/"
    },
    resolve: {
        extensions: [".js", ".ts"]
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: "ts-loader"
            },
            {
                test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, "css-loader"]
            }
        ]
    },
    devtool: "inline-source-map",
    plugins: [
        new CleanWebpackPlugin(),
        // // new WebpackShellPlugin({
        // //     onBuildStart:['del bin -Recurse -Force -Confirm:$false']
        // //   }),
        new HtmlWebpackPlugin({
            template: "./src/index.html",
            title: 'SingTogether'
        }),
        new MiniCssExtractPlugin({
            filename: "css/[name].[chunkhash].css"
        })
    ]
};