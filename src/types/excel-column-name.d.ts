declare module "excel-column-name" {
  export function intToExcelCol(n: number): string;
  export function excelColToInt(name: string): number;
}
