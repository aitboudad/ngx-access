import { of, from, Observable } from 'rxjs';
import { map, reduce, mergeMap } from 'rxjs/operators';

export type AccessName = string;

export type HasAccessStrategy = (accessName: AccessName) => Observable<boolean>;

interface Access {
  operator: Operator;
  list: Array<AccessName>;
}

type AccessType = AccessName | Access;

enum Operator {
  AND = 'AND',
  OR = 'OR'
}

const DEFAULT_ACTION = 'read';
const PATH_SEPARATOR = '.';
const ACCESS_SEPARATOR = ':';

let configurationAccess = null;
let hasAccessStrategy: HasAccessStrategy;

export function setConfigurationAccess(config) {
  configurationAccess = config;
}

export function setHasAccessStrategy(accessTest: HasAccessStrategy) {
  hasAccessStrategy = accessTest;
}

export function can(path: string, action: string, group = false): Observable<boolean> {
  try {
    const pathObject = getPathObject(path);
    const access = group
      ? mergeChildrenActions(pathObject, action)
      : pathObject[action];
    return testAccess(access);
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
      map(a => a.split(ACCESS_SEPARATOR)),
      mergeMap(a => can(a[0], a[1] || DEFAULT_ACTION, group)),
      reduce((acc, value) => acc || value, false)
    );
}

function getPathObject(path: string) {
  return path.split(PATH_SEPARATOR)
    .reduce((o, i) => {
      if (i in o) {
        return o[i];
      }
      throw new Error(`${i} undefined inside ${path}`);
    }, configurationAccess);
}

function mergeChildrenActions(path, action) {
  return Object.values(path)
    .filter(item => action in item)
    .map(item => item[action])
    .reduce((all, one) => [...all, one], []);
}

function testAccessReducer(access, op, acc, init) {
  return from(access as Array<AccessType>).pipe(
    mergeMap(currentAccess => testAccess(currentAccess, op)),
    reduce(acc, init)
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
