import { queryIP2LocationCSV } from '../src/lib/ip2location';

const csv = [
  '0,9,BR,Brazil,Sao Paulo,Sao Paulo',
  '10,19,AR,Argentina,Buenos Aires,Buenos Aires',
  '20,29,US,United States,California,Los Angeles',
  '30,39,UY,Uruguay,Montevideo,Montevideo',
].join('\n');

const query = (where: string): string[] => {
  return queryIP2LocationCSV(csv, {
    where,
    mode: 'listar_blocos_corresponde',
    mergeWhere: '',
    sortSize: 'desc',
    limit: 0,
  });
};

describe('IP2Location SQL-like filters', () => {
  test('supports SQL-style NOT IN', () => {
    expect(query('country NOT IN (Brazil, Argentina)')).toEqual(['0.0.0.20-0.0.0.39']);
  });

  test('keeps AND precedence above OR', () => {
    expect(query('country = Brazil OR country = Argentina AND region = California')).toEqual([
      '0.0.0.0-0.0.0.9',
    ]);
  });

  test('supports parentheses to override precedence', () => {
    expect(query('(country = Brazil OR country = Argentina) AND region = Buenos Aires')).toEqual([
      '0.0.0.10-0.0.0.19',
    ]);
  });

  test('supports English macro aliases', () => {
    expect(query('macro = latin america')).toEqual(['0.0.0.0-0.0.0.19', '0.0.0.30-0.0.0.39']);
  });
});
