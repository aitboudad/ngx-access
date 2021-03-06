export function flatten(config, { parse = v => v, group = false, delimiter = '.' } = {}) {
  const flatConfig = {};

  function setConfig(path, value) {
    if (!flatConfig[path]) {
      flatConfig[path] = new Set();
    }
    flatConfig[path].add(value);
  }

  function getPath(path, prop) {
    return path
      ? path + delimiter + prop
      : prop;
  }

  function visitor(accesses, prop, value, path) {
    if (Array.isArray(value)) {
      value.forEach(access => {
        visitor(accesses, prop, access, path);
      });
    } else if (typeof value === 'object') {
      const childrenAccesses = children(value, getPath(path, prop));
      if (group) {
        accesses = accesses.concat(childrenAccesses);
        accesses.forEach(access => {
          setConfig(getPath(path, access.prop), access.action);
        });
      }
    } else {
      const expression = parse(value);
      setConfig(getPath(path, prop), expression);
      accesses = accesses.concat({ action: expression, prop });
    }
    return accesses;
  }

  function children(obj, path = '') {
    return Object.keys(obj)
      .reduce(
        (accesses, prop) => visitor(accesses, prop, obj[prop], path), []
      );
  }

  children(config);
  return flatConfig;
}