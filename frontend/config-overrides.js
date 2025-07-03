const webpack = require('webpack');

module.exports = function override(config, env) {
    // Webpack 5 Polyfill configuration
    config.resolve.fallback = {
        ...config.resolve.fallback, // Keep existing fallback (if any)
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        http: require.resolve('stream-http'),
        https: require.resolve('https-browserify'),
        zlib: require.resolve('browserify-zlib'),
        url: require.resolve('url/'), // Must end with 'url/'
        buffer: require.resolve('buffer/'),
        assert: require.resolve('assert/'),
        process: require.resolve('process/browser'), // Add process polyfill
        vm: require.resolve('vm-browserify'),
    };

    // Provide Buffer and Process global variables
    config.plugins = (config.plugins || []).concat([
        new webpack.ProvidePlugin({
            process: 'process/browser',
            Buffer: ['buffer', 'Buffer'],
        }),
    ]);

    // Other configurations...
     // Exclude source-map-loader (optional, remove build warnings)
     config.module.rules.push({
         test: /\.m?js/,
         resolve: {
             fullySpecified: false
         }
     });
     config.ignoreWarnings = [/Failed to parse source map/];


    return config;
}