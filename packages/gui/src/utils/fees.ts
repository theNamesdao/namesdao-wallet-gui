export const MIN_FEE_MOJO_STR = '1';
export const MIN_FEE_XCH = '0.000000000001'; // 1 mojo in XCH units

export function clampMinFeeMojo(mojos: string): string {
  // Treat empty or all-zero string as zero
  if (!mojos || /^0+$/.test(mojos)) {
    return MIN_FEE_MOJO_STR;
  }
  return mojos;
}
