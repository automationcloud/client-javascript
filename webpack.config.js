const path = require('path');

module.exports = {
    entry: './src/main/index.ts',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    output: {
        filename: 'automationcloud.js',
        path: path.resolve(__dirname, 'dist'),
        library: 'AutomationCloud',
        libraryTarget: 'umd',
    },
};
