const psl = require('psl');
const CIDR = require('cidr-js');

const cidr = new CIDR();
const REGEX_HTTP = new RegExp('^https?:', 'i');
const LINK = document.createElement('a');

let deepMerge = (target: object, source: object) => {
  Object.entries(source).forEach(([key, value]) => {
    if (value && typeof value === 'object') {
      deepMerge((target[key] = target[key] || {}), value);
      return;
    }
    target[key] = value;
  });

  return target;
};

let determineRequestType = (source: string, destination: string): string => {
  if (!source) return 'none';

  LINK.href = source;
  let s = psl.parse(LINK.hostname);
  LINK.href = destination;
  let d = psl.parse(LINK.hostname);

  if (s.domain != d.domain) {
    return 'cross-site';
  } else {
    if (s.subdomain === d.subdomain) {
      return 'same-origin';
    }

    return 'same-site';
  }
};

let findWhitelistRule = (rules: any, host: string, url: string): any => {
  for (var i = 0; i < rules.length; i++) {
    for (var j = 0; j < rules[i].sites.length; j++) {
      let whitelistURL = new URL((REGEX_HTTP.test(rules[i].sites[j].domain) ? '' : 'http://') + rules[i].sites[j].domain);

      if (host.includes(whitelistURL.host.replace(/^(www\.)/, ''))) {
        if (!rules[i].sites[j].pattern || (rules[i].sites[j].pattern && new RegExp(rules[i].sites[j].pattern).test(url))) {
          return {
            id: rules[i].id,
            siteIndex: j,
            name: rules[i].name,
            lang: rules[i].lang,
            pattern: rules[i].sites[j],
            profile: rules[i].profile,
            options: rules[i].options,
            spoofIP: rules[i].spoofIP,
          };
        }
      }
    }
  }

  return null;
};

let generateByte = (): number => {
  let octet: number = Math.floor(Math.random() * 256);
  return octet === 10 || octet === 172 || octet === 192 ? generateByte() : octet;
};

let generateIP = (): string => {
  return `${generateByte()}.${generateByte()}.${generateByte()}.${generateByte()}`;
};

let getIPRange = (ipRange: string): string => {
  let range: any = cidr.range(ipRange);

  if (range === null) {
    return ipRange;
  }

  return `${range.start}-${range.end}`;
};

let ipInRange = (ip: string, range: string): boolean => {
  if (range.length === 1) {
    return ip === range[0];
  } else {
    let ipToCompare: number = ipToInt(ip);
    let ipRangeFrom: number = ipToInt(range[0]);
    let ipRangeTo: number = ipToInt(range[1]);

    return ipRangeFrom <= ipToCompare && ipToCompare <= ipRangeTo;
  }
};

let ipToInt = (ip: string): number => {
  return (
    ip.split('.').reduce(function(ipInt: number, octet: string) {
      return (ipInt << 8) + parseInt(octet, 10);
    }, 0) >>> 0
  );
};

let ipToString = (ip: number): string => {
  return (ip >>> 24) + '.' + ((ip >> 16) & 255) + '.' + ((ip >> 8) & 255) + '.' + (ip & 255);
};

let parseIPRange = (range: string): number[] | null => {
  let parts: string[] = range.split('-').map(part => part.trim());

  if (parts.length === 1 && isValidIP(parts[0])) {
    let ip: number = ipToInt(parts[0]);
    return [ip, ip];
  }

  if (parts.length === 2 && validateIPRange(parts[0], parts[1])) {
    return [ipToInt(parts[0]), ipToInt(parts[1])];
  }

  return null;
};

let normalizeRanges = (ranges: number[][]): number[][] => {
  let sortedRanges: number[][] = ranges.sort((a, b) => a[0] - b[0]);
  let normalizedRanges: number[][] = [];

  for (let i = 0; i < sortedRanges.length; i++) {
    let lastRange = normalizedRanges[normalizedRanges.length - 1];

    if (lastRange && sortedRanges[i][0] <= lastRange[1] + 1) {
      lastRange[1] = Math.max(lastRange[1], sortedRanges[i][1]);
    } else {
      normalizedRanges.push(sortedRanges[i].slice());
    }
  }

  return normalizedRanges;
};

let removeExcludedRanges = (ranges: number[][], excludedRanges: number[][]): number[][] => {
  let availableRanges: number[][] = normalizeRanges(ranges);
  let normalizedExcludedRanges: number[][] = normalizeRanges(excludedRanges);

  for (let i = 0; i < normalizedExcludedRanges.length; i++) {
    let nextRanges: number[][] = [];

    for (let j = 0; j < availableRanges.length; j++) {
      let range = availableRanges[j];
      let excluded = normalizedExcludedRanges[i];

      if (excluded[1] < range[0] || excluded[0] > range[1]) {
        nextRanges.push(range);
      } else {
        if (excluded[0] > range[0]) {
          nextRanges.push([range[0], excluded[0] - 1]);
        }

        if (excluded[1] < range[1]) {
          nextRanges.push([excluded[1] + 1, range[1]]);
        }
      }
    }

    availableRanges = nextRanges;
  }

  return availableRanges;
};

let generateIPFromRanges = (ranges: string[], excludedRanges: string[] = []): string => {
  let parsedRanges: number[][] = ranges.map(parseIPRange).filter(range => range !== null) as number[][];
  let parsedExcludedRanges: number[][] = excludedRanges.map(parseIPRange).filter(range => range !== null) as number[][];
  let availableRanges: number[][] = removeExcludedRanges(parsedRanges, parsedExcludedRanges);
  let total: number = availableRanges.reduce((sum, range) => sum + range[1] - range[0] + 1, 0);

  if (total < 1) {
    return '';
  }

  let offset: number = Math.floor(Math.random() * total);

  for (let i = 0; i < availableRanges.length; i++) {
    let rangeSize: number = availableRanges[i][1] - availableRanges[i][0] + 1;

    if (offset < rangeSize) {
      return ipToString(availableRanges[i][0] + offset);
    }

    offset -= rangeSize;
  }

  return '';
};

let isInternalIP = (host: string): boolean => {
  return (
    /^localhost$|^127(?:\.[0-9]+){0,2}\.[0-9]+$|^(?:0*\:)*?:?0*1$/.test(host) ||
    /(^192\.168\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])$)|(^172\.([1][6-9]|[2][0-9]|[3][0-1])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])$)|(^10\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])$)/.test(
      host
    )
  );
};

let isValidURL = (url: string): boolean => {
  try {
    if (!/^https?:\/\//i.test(url)) {
      url = 'http://' + url;
    }
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
};

let isValidIP = (ip: string): boolean => {
  return /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
    ip
  );
};

let parseURL = (url: string): any => {
  let u = new URL(url);
  let uParsed = psl.parse(u.hostname);

  return {
    base: u.hostname
      .split('.')
      .splice(-2)
      .join('.'),
    domain: uParsed.domain,
    hostname: u.hostname,
    origin: u.origin,
    pathname: u.pathname,
  };
};

let validateIPRange = (from: string, to: string): boolean => {
  return isValidIP(from) && isValidIP(to) && ipToInt(from) <= ipToInt(to);
};

export default {
  deepMerge,
  determineRequestType,
  findWhitelistRule,
  generateIP,
  generateIPFromRanges,
  getIPRange,
  ipInRange,
  ipToInt,
  ipToString,
  isInternalIP,
  isValidIP,
  isValidURL,
  parseURL,
  validateIPRange,
};
