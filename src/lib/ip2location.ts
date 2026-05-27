interface Row {
  start: number;
  end: number;
  countryCode: string;
  country: string;
  region: string;
  city: string;
}

interface QueryOptions {
  where: string;
  mode: string;
  mergeWhere: string;
  sortSize: string;
  limit: number;
}

let normalize = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const MACRO_REGION_DEFINITIONS = [
  { key: 'oceania', labels: ['oceania'], countries: ['AU', 'NZ', 'FJ', 'PG', 'NC'] },
  { key: 'east_asia', labels: ['asia oriental', 'east asia'], countries: ['CN', 'JP', 'KR', 'KP', 'TW', 'HK', 'MO', 'MN'] },
  { key: 'southeast_asia', labels: ['sudeste asiatico', 'southeast asia'], countries: ['ID', 'MY', 'PH', 'SG', 'TH', 'VN', 'KH', 'LA', 'MM', 'BN', 'TL'] },
  { key: 'south_asia', labels: ['asia meridional', 'south asia'], countries: ['IN', 'PK', 'BD', 'LK', 'NP', 'BT', 'MV', 'AF'] },
  { key: 'central_asia', labels: ['asia central', 'central asia'], countries: ['KZ', 'UZ', 'TM', 'KG', 'TJ'] },
  { key: 'middle_east', labels: ['oriente medio', 'middle east'], countries: ['SA', 'AE', 'QA', 'KW', 'BH', 'OM', 'IR', 'IQ', 'IL', 'JO', 'LB', 'SY', 'YE', 'TR'] },
  { key: 'europe', labels: ['europa', 'europe'], countries: ['PT', 'ES', 'FR', 'DE', 'IT', 'NL', 'BE', 'CH', 'AT', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'GR', 'SE', 'NO', 'FI', 'DK', 'IE', 'GB', 'UA', 'RU'] },
  { key: 'latin_america', labels: ['america latina', 'latin america'], countries: ['BR', 'AR', 'CL', 'UY', 'PY', 'BO', 'PE', 'CO', 'VE', 'EC', 'MX', 'GT', 'HN', 'SV', 'NI', 'CR', 'PA', 'CU', 'DO', 'HT'] },
  { key: 'north_america', labels: ['america do norte', 'north america'], countries: ['US', 'CA', 'MX'] },
  { key: 'north_africa', labels: ['africa norte', 'north africa'], countries: ['MA', 'DZ', 'TN', 'LY', 'EG', 'SD'] },
  { key: 'southern_africa', labels: ['africa sul', 'southern africa'], countries: ['ZA', 'NA', 'BW', 'ZW', 'MZ', 'LS', 'SZ'] },
];

const MACRO_REGIONS: { [key: string]: string[] } = MACRO_REGION_DEFINITIONS.reduce((macros, macro) => {
  macro.labels.forEach(label => {
    macros[normalize(label)] = macro.countries;
  });

  return macros;
}, {});

export let getMacroRegions = (locale: string = 'en'): any[] => {
  let usePortuguese = /^pt/i.test(locale);

  return MACRO_REGION_DEFINITIONS.map(macro => ({
    value: macro.labels[usePortuguese ? 0 : 1] || macro.labels[0],
    countries: macro.countries,
  }));
};

const FIELDS = ['country_code', 'country', 'region', 'city', 'macro', 'any'];

let intToIP = (value: number): string => {
  return (value >>> 24) + '.' + ((value >> 16) & 255) + '.' + ((value >> 8) & 255) + '.' + (value & 255);
};

let parseCSVLine = (line: string): string[] => {
  let fields: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    let ch = line[i];

    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  fields.push(current);

  return fields;
};

let parseRows = (csvText: string): Row[] => {
  return csvText
    .split(/\r?\n/)
    .map(line => parseCSVLine(line))
    .filter(fields => fields.length >= 6 && !isNaN(Number(fields[0])) && !isNaN(Number(fields[1])))
    .map(fields => ({
      start: Number(fields[0]),
      end: Number(fields[1]),
      countryCode: fields[2],
      country: fields[3],
      region: fields[4],
      city: fields[5],
    }));
};

let rowValue = (row: Row, field: string): string => {
  if (field === 'country_code') return row.countryCode;
  if (field === 'country') return row.country;
  if (field === 'region') return row.region;
  if (field === 'city') return row.city;
  return '';
};

let matchAny = (row: Row, value: string): boolean => {
  if (MACRO_REGIONS[value]) {
    return MACRO_REGIONS[value].includes(row.countryCode.toUpperCase());
  }

  return [row.countryCode, row.country, row.region, row.city].map(normalize).includes(value);
};

let matchCondition = (row: Row, field: string, operator: string, value: string): boolean => {
  let result: boolean;

  if (field === 'macro') {
    result = !!MACRO_REGIONS[value] && MACRO_REGIONS[value].includes(row.countryCode.toUpperCase());
  } else if (field === 'any') {
    result = matchAny(row, value);
  } else {
    result = normalize(rowValue(row, field)) === value;
  }

  return operator === '!=' || operator === '<>' ? !result : result;
};

let tokenize = (expr: string): string[] => {
  let tokenRe = /\s+|\(|\)|,|<>|!=|=|\bAND\b|\bOR\b|\bNOT\b|\bIN\b|"[^"]*"|'[^']*'|[^\s(),=!'<>]+/gi;
  let tokens: string[] = [];
  let match: RegExpExecArray;

  while ((match = tokenRe.exec(expr)) !== null) {
    let value = match[0];
    if (/^\s+$/.test(value)) continue;
    if ((value[0] === '"' && value[value.length - 1] === '"') || (value[0] === "'" && value[value.length - 1] === "'")) {
      value = value.slice(1, -1);
    }
    tokens.push(value);
  }

  return tokens;
};

class Parser {
  private tokens: string[];
  private pos: number = 0;

  constructor(tokens: string[]) {
    this.tokens = tokens;
  }

  private peek(): string {
    return this.pos >= this.tokens.length ? null : this.tokens[this.pos];
  }

  private consume(): string {
    return this.tokens[this.pos++];
  }

  private accept(value: string): boolean {
    let token = this.peek();
    if (token !== null && token.toUpperCase() === value) {
      this.consume();
      return true;
    }
    return false;
  }

  public parse(): any {
    let node = this.parseOr();
    if (this.peek() !== null) throw new Error(`Unexpected token: ${this.peek()}`);
    return node;
  }

  private parseOr(): any {
    let node = this.parseAnd();
    while (this.accept('OR')) node = ['OR', node, this.parseAnd()];
    return node;
  }

  private parseAnd(): any {
    let node = this.parseNot();
    while (this.accept('AND')) node = ['AND', node, this.parseNot()];
    return node;
  }

  private parseNot(): any {
    if (this.accept('NOT')) return ['NOT', this.parseNot()];
    return this.parsePrimary();
  }

  private parsePrimary(): any {
    if (this.accept('(')) {
      let node = this.parseOr();
      if (!this.accept(')')) throw new Error("Expected ')'.");
      return node;
    }

    return this.parseCondition();
  }

  private parseCondition(): any {
    let field = this.consume();
    let operator = this.consume();

    if (!field || !operator) throw new Error('Incomplete condition.');

    field = normalize(field);
    if (!FIELDS.includes(field)) throw new Error(`Invalid field: ${field}`);

    let normalizedOperator = operator.toUpperCase();
    let negatedIn = normalizedOperator === 'NOT' && this.accept('IN');

    if (normalizedOperator === 'IN' || negatedIn) {
      if (!this.accept('(')) throw new Error("Expected '(' after IN.");
      let values: string[] = [];
      let current: string[] = [];

      while (this.peek() !== null) {
        let token = this.consume();
        if (token === ')') {
          if (current.length) values.push(normalize(current.join(' ')));
          break;
        } else if (token === ',') {
          values.push(normalize(current.join(' ')));
          current = [];
        } else {
          current.push(token);
        }
      }

      if (!values.length) throw new Error('Empty IN list.');
      let node = ['IN', field, values];
      return negatedIn ? ['NOT', node] : node;
    }

    if (!['=', '!=', '<>'].includes(operator)) throw new Error(`Invalid operator after ${field}.`);

    let valueParts: string[] = [];
    while (this.peek() !== null && !['AND', 'OR'].includes(this.peek().toUpperCase()) && this.peek() !== ')') {
      valueParts.push(this.consume());
    }

    if (!valueParts.length) throw new Error(`Missing value after ${field} ${operator}.`);

    return ['COND', field, operator, normalize(valueParts.join(' '))];
  }
}

let parseWhere = (expr: string): any => {
  let tokens = tokenize(expr);
  if (!tokens.length) throw new Error('Empty filter.');
  return new Parser(tokens).parse();
};

let compilePredicate = (node: any): Function => {
  let kind = node[0];

  if (kind === 'COND') {
    return (row: Row) => matchCondition(row, node[1], node[2], node[3]);
  }

  if (kind === 'IN') {
    return (row: Row) => node[2].some(value => matchCondition(row, node[1], '=', value));
  }

  if (kind === 'AND') {
    let left = compilePredicate(node[1]);
    let right = compilePredicate(node[2]);
    return (row: Row) => left(row) && right(row);
  }

  if (kind === 'OR') {
    let left = compilePredicate(node[1]);
    let right = compilePredicate(node[2]);
    return (row: Row) => left(row) || right(row);
  }

  if (kind === 'NOT') {
    let predicate = compilePredicate(node[1]);
    return (row: Row) => !predicate(row);
  }

  throw new Error(`Invalid node: ${kind}`);
};

let copyRow = (row: Row): Row => {
  return {
    start: row.start,
    end: row.end,
    countryCode: row.countryCode,
    country: row.country,
    region: row.region,
    city: row.city,
  };
};

let mergeRowIntoBlock = (block: Row, row: Row): void => {
  block.end = row.end;
};

let candidateBlocks = (rows: Row[], predicate: Function, wantMatch: boolean): Row[] => {
  let blocks: Row[] = [];
  let current: Row = null;

  for (let i = 0; i < rows.length; i++) {
    if (predicate(rows[i]) !== wantMatch) {
      if (current !== null) {
        blocks.push(current);
        current = null;
      }
      continue;
    }

    if (current === null) {
      current = copyRow(rows[i]);
    } else if (rows[i].start === current.end + 1) {
      mergeRowIntoBlock(current, rows[i]);
    } else {
      blocks.push(current);
      current = copyRow(rows[i]);
    }
  }

  if (current !== null) blocks.push(current);
  return blocks;
};

let tolerantBlocks = (rows: Row[], predicate: Function, bridgePredicate: Function, wantMatch: boolean): Row[] => {
  let blocks: Row[] = [];
  let current: Row = null;
  let bridge: Row = null;

  for (let i = 0; i < rows.length; i++) {
    let matched = predicate(rows[i]);

    if (matched === wantMatch) {
      if (current === null) {
        current = copyRow(rows[i]);
        bridge = null;
      } else if (bridge !== null && bridge.start === current.end + 1 && rows[i].start === bridge.end + 1) {
        mergeRowIntoBlock(current, bridge);
        mergeRowIntoBlock(current, rows[i]);
        bridge = null;
      } else if (rows[i].start === current.end + 1) {
        mergeRowIntoBlock(current, rows[i]);
      } else {
        blocks.push(current);
        current = copyRow(rows[i]);
        bridge = null;
      }
      continue;
    }

    if (current === null) continue;

    if (!bridgePredicate(rows[i])) {
      blocks.push(current);
      current = null;
      bridge = null;
    } else if (rows[i].start === current.end + 1 || (bridge !== null && rows[i].start === bridge.end + 1)) {
      if (bridge === null) bridge = copyRow(rows[i]);
      else mergeRowIntoBlock(bridge, rows[i]);
    } else {
      blocks.push(current);
      current = null;
      bridge = null;
    }
  }

  if (current !== null) blocks.push(current);
  return blocks;
};

let sortAndLimitBlocks = (blocks: Row[], sortSize: string, limit: number): Row[] => {
  blocks.sort((a, b) => {
    let diff = a.end - a.start - (b.end - b.start);
    return sortSize === 'asc' ? diff : -diff;
  });

  return limit > 0 ? blocks.slice(0, limit) : blocks;
};

export let queryIP2LocationCSV = (csvText: string, options: QueryOptions): string[] => {
  let rows = parseRows(csvText);
  let predicate = compilePredicate(parseWhere(options.where));
  let mode = options.mode;
  let wantMatch = mode.indexOf('nao') === -1;
  let blocks: Row[];

  if (options.mergeWhere.trim()) {
    blocks = tolerantBlocks(rows, predicate, compilePredicate(parseWhere(options.mergeWhere)), wantMatch);
  } else {
    blocks = candidateBlocks(rows, predicate, wantMatch);
  }

  if (mode.indexOf('maior') > -1 || mode.indexOf('menor') > -1) {
    blocks = sortAndLimitBlocks(blocks, mode.indexOf('menor') > -1 ? 'asc' : 'desc', 1);
  } else {
    blocks = sortAndLimitBlocks(blocks, options.sortSize, options.limit);
  }

  return blocks.map(row => `${intToIP(row.start)}-${intToIP(row.end)}`);
};
