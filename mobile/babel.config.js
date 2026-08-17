module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // jsxImportSource routes JSX through nativewind (v4 requirement).
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      // v4 is a preset; in v2 this was a plugin.
      'nativewind/babel',
    ],
  };
};
