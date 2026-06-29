import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve("public", "test-samples");
fs.mkdirSync(outDir, { recursive: true });

function writeCsv(name, rows) {
  fs.writeFileSync(path.join(outDir, name), rows.join("\n"), "utf8");
}

writeCsv("missing-values.csv", [
  "epoch,E_m,N_m,U_m,error",
  "1,0.01,-0.02,0.05,0.06",
  "2,0.02,,0.04,0.05",
  "3,NaN,-0.01,,0.04",
  "4,0.03,0.00,0.03,",
  "5,0.02,0.01,0.02,0.03"
]);

writeCsv("non-numeric-mixed.csv", [
  "time,KF_E_m,KF_N_m,KF_U_m,status",
  "2026-06-01 09:00:00,0.01,-0.02,0.04,ok",
  "2026-06-01 09:00:01,not_ready,-0.01,0.03,warn",
  "2026-06-01 09:00:02,0.03,text,0.02,warn",
  "2026-06-01 09:00:03,0.02,0.00,NaN,ok",
  "2026-06-01 09:00:04,0.01,0.01,0.01,ok"
]);

writeCsv("no-enu-columns.csv", [
  "method,valid_epoch_count,RMS_EN_m,final_EN_error_m",
  "KF_corrected,440,0.75,0.96",
  "KF_no_bias,440,1.56,2.41",
  "Single,440,0.47,0.28"
]);

writeCsv("semicolon-delimiter.csv", [
  "epoch;fix_E_rov_m;fix_N_rov_m;fix_U_rov_m",
  "1;0.01;-0.02;0.03",
  "2;0.02;-0.01;0.02",
  "3;0.03;0.00;0.01"
]);

writeCsv("duplicate-headers.csv", [
  "epoch,E_m,E_m,N_m,U_m",
  "1,0.01,0.011,-0.01,0.04",
  "2,0.02,0.021,-0.02,0.03"
]);

writeCsv("日本語ファイル名.csv", [
  "時刻,E方向,N方向,U方向",
  "2026/06/01/09/00/00,0.01,-0.02,0.04",
  "2026/06/01/09/00/01,0.02,-0.01,0.03",
  "2026/06/01/09/00/02,0.03,0.00,0.02"
]);

const large = ["epoch,KF_E_m,KF_N_m,KF_U_m"];
for (let i = 1; i <= 6000; i += 1) {
  const e = Math.sin(i / 100) * 0.4;
  const n = Math.cos(i / 120) * 0.35;
  const u = Math.sin(i / 80) * 0.2;
  large.push(`${i},${e.toFixed(6)},${n.toFixed(6)},${u.toFixed(6)}`);
}
writeCsv("large-sample.csv", large);

console.log(`Generated test samples in ${outDir}`);
