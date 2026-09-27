'use strict';
function decimalParts(value) { if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) return null; const [whole, fraction = ''] = value.split('.'); return { coefficient: BigInt(`${whole}${fraction}`), scale: fraction.length }; }
function formatDecimal(coefficient, scale) { const raw = coefficient.toString(10).padStart(scale + 1, '0'); const whole = scale ? raw.slice(0, -scale) : raw; const fraction = scale ? raw.slice(-scale).replace(/0+$/, '') : ''; return fraction ? `${whole}.${fraction}` : whole; }
function normalizeDecimal(value) { const parsed = decimalParts(value); return parsed ? formatDecimal(parsed.coefficient, parsed.scale) : null; }
function toScaled18(value) { const parsed = decimalParts(value); return !parsed || parsed.scale > 18 ? null : parsed.coefficient * (10n ** BigInt(18 - parsed.scale)); }
function multiplyDecimals(left, right) { const a = decimalParts(left); const b = decimalParts(right); return a && b ? formatDecimal(a.coefficient * b.coefficient, a.scale + b.scale) : null; }
module.exports = { decimalParts, formatDecimal, multiplyDecimals, normalizeDecimal, toScaled18 };
