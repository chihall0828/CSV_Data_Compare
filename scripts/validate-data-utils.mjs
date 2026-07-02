import {
  formatTimestamp,
  parseDateLike,
  toNumber
} from "../src/dataUtils.js";

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertDate(value, expected, message) {
  const timestamp = parseDateLike(value);
  assert(timestamp !== null, `${message}: expected a timestamp`);
  if (timestamp !== null) {
    assert(formatTimestamp(timestamp) === expected, `${message}: expected ${expected}, got ${formatTimestamp(timestamp)}`);
  }
}

assertDate("2026-07-02", "2026-07-02 00:00:00", "date-only hyphen format");
assertDate("2026/07/02 03:04:05", "2026-07-02 03:04:05", "slash date-time format");
assertDate("2024-02-29", "2024-02-29 00:00:00", "valid leap day");

assert(parseDateLike("2026-02-30") === null, "invalid calendar day should not roll over");
assert(parseDateLike("2026-13-01") === null, "invalid month should not roll over");
assert(parseDateLike("2026-07-02 24:00:00") === null, "invalid hour should not roll over");
assert(parseDateLike("2026-07-02 23:60:00") === null, "invalid minute should not roll over");
assert(parseDateLike("2026-07-02 23:59:60") === null, "invalid second should not roll over");

assert(toNumber("1,234.5") === 1234.5, "thousands separators should parse");
assert(toNumber("NaN") === null, "NaN token should be missing");
assert(toNumber("12abc") === null, "mixed numeric text should not parse");

if (failures.length === 0) {
  console.log(JSON.stringify({ status: "ok" }));
} else {
  console.error(JSON.stringify({ status: "fail", failures }));
  process.exit(1);
}
