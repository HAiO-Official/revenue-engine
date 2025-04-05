const webpack = require('webpack');

module.exports = function override(config, env) {
    // Webpack 5 Polyfill 설정
    config.resolve.fallback = {
        ...config.resolve.fallback, // 기존 fallback 유지 (있다면)
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        http: require.resolve('stream-http'),
        https: require.resolve('https-browserify'),
        zlib: require.resolve('browserify-zlib'),
        url: require.resolve('url/'), // 'url/' 로 끝나야 함
        buffer: require.resolve('buffer/'),
        assert: require.resolve('assert/'),
        process: require.resolve('process/browser'), // process 폴리필 추가
        vm: require.resolve('vm-browserify'),
    };

    // Buffer와 Process 전역 변수 제공
    config.plugins = (config.plugins || []).concat([
        new webpack.ProvidePlugin({
            process: 'process/browser',
            Buffer: ['buffer', 'Buffer'],
        }),
    ]);

    // 다른 설정들...
     // source-map-loader 제외 (선택 사항, 빌드 경고 제거)
     config.module.rules.push({
         test: /\.m?js/,
         resolve: {
             fullySpecified: false
         }
     });
     config.ignoreWarnings = [/Failed to parse source map/];


    return config;
}