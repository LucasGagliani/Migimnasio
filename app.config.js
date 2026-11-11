module.exports = ({ config }) => {
  const basePath = process.env.GYM_WEB_BASE_PATH?.replace(/\/$/, '');
  if (!basePath) return config;

  return {
    ...config,
    experiments: { ...config.experiments, baseUrl: basePath },
  };
};
