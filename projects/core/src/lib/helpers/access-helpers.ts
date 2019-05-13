import { from, Observable, of } from 'rxjs';
import { map, mergeMap, reduce } from 'rxjs/operators';

export type HasAccessStrategy = (accessName: string) => Observable<boolean>;

interface Access {
  operator: Operator;
  list: Array<string>;
}

type AccessType = string | Access;

enum Operator {
  AND = 'AND',
  OR = 'OR'
}

const PATH_SEPARATOR = '.';

let configurationAccess = {};
let hasAccessStrategy: HasAccessStrategy;

export function setConfigurationAccess(config) {
  configurationAccess = config;
  const newConfig = {};

  function setConfig(path, value) {
    if (!newConfig[path]) {
      newConfig[path] = new Set();
    }
    newConfig[path].add(value);
  }

  function getPath(path, prop) {
    return path
      ? path + '.' + prop
      : prop;
  }

  function parse(expression) {
    return {
      list: expression.split(' && '),
      operator: Operator.AND
    };
  }

  function children(obj, path = '') {
    let accesses = [];
    function visitor(prop, value) {
      if (Array.isArray(value)) {
        value.forEach(access => {
          visitor(prop, access);
        });
      } else if (typeof value === 'string') {
        const expression = parse(value);
        setConfig(getPath(path, prop), expression);
        accesses = accesses.concat({ action: expression, prop });
      } else if (typeof value === 'object') {
        accesses = accesses.concat(children(value, getPath(path, prop)));
        accesses.forEach(access => {
          setConfig(getPath(path, access.prop), access.action);
        });
      }
    }
    Object.keys(obj)
      .forEach((prop) => {
        visitor(prop, obj[prop]);
      });
    return accesses;
  }
  children(configurationAccess);
  configurationAccess = newConfig;
  console.log(configurationAccess);
}

export function setHasAccessStrategy(accessTest: HasAccessStrategy) {
  hasAccessStrategy = accessTest;
}

export function can(path: string): Observable<boolean> {
  try {
    // const pathObject = getPathObject(path);
    // const access = group
    //   ? mergeChildrenActions(pathObject, action)
    //   : pathObject[action];
    const access = configurationAccess[path];
    if (!!access) {
      return testAccess(Array.from(access));
    }
    console.error(`Undefined ${path}`);
    return of(false);
  } catch (e) {
    console.error(e);
    return of(false);
  }
}

export function canExpression(accessExpression: string | Array<string>, group = false): Observable<boolean> {
  const access = Array.isArray(accessExpression)
    ? accessExpression
    : [accessExpression];
  return from(access)
    .pipe(
      mergeMap(a => can(a)),
      reduce((acc, value) => acc || value, false)
    );
}

function getPathObject(path: string) {
  return path.split(PATH_SEPARATOR)
    .reduce(({ currentPath, object }, prop) => {
      if (prop in object) {
        return { currentPath: `${currentPath}${prop}.`, object: object[prop] };
      }
      throw new Error(`${prop} is not defined inside ${currentPath} in your access configuration`);
    }, { currentPath: 'ROOT', object: configurationAccess })
    .object;
}

function mergeChildrenActions(path, action) {
  return Object.values(path)
    .filter(item => action in item)
    .map(item => item[action])
    .reduce((all, one) => [...all, one], []);
}

function testAccessReducer(
  access: Array<AccessType>,
  op: Operator,
  predicate: (a: boolean, v: boolean) => boolean,
  init: boolean
): Observable<boolean> {
  return from(access as Array<AccessType>)
    .pipe(
      mergeMap(currentAccess => testAccess(currentAccess, op)),
      reduce(predicate, init)
    );
}

function testAccess(access: AccessType | Array<AccessType>, op = Operator.OR): Observable<boolean> {
  return Array.isArray(access)
    ? (op === Operator.AND)
      ? testAccessReducer(access, op, (acc, value) => acc && value, true)
      : testAccessReducer(access, op, (acc, value) => acc || value, false)
    : typeof access === 'string'
      ? hasAccessStrategy(access)
      : testAccess(access.list, access.operator);
}
